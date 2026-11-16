#!/usr/bin/env node
/**
 * Load the NEAR Hunt review graph into Neo4j. Every command is idempotent (MERGE), so re-running
 * after more assessments land only adds or updates.
 *
 *   node graph/load.mjs schema                 constraints + full-text + vector index
 *   node graph/load.mjs projects               every listed project from nearhunt.xyz (read-only API)
 *   node graph/load.mjs assessments <dir>      parse review/<dir>/*.md front matter into the graph
 *   node graph/load.mjs embed                  OpenRouter embeddings for projects whose text changed
 *   node graph/load.mjs link [k]               derive SIMILAR_PITCH (top k, default 5) and SAME_NAME
 *   node graph/load.mjs note <id|*> "<text>"   record the owner's feedback, verbatim
 *   node graph/load.mjs query "<cypher>"       run a read query, print JSON rows
 *
 * Env: NEO4J_URI (bolt://localhost:7687), NEO4J_USER (neo4j), NEO4J_PASSWORD,
 *      OPENROUTER_API_KEY (embed only; a placeholder works where a proxy injects it),
 *      EMBED_MODEL (openai/text-embedding-3-small).
 *
 * Nothing here writes to NEAR. Project data is read from the public NEAR Hunt API, which serves
 * rows written by nearhunt.near only (AGENTS.md §3).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import neo4j from 'neo4j-driver';
import YAML from 'yaml';

const here = path.dirname(fileURLToPath(import.meta.url));
const reviewDir = path.resolve(here, '..');
const API = process.env.NEARHUNT_API || 'https://nearhunt.xyz/api/projects';
const EMBED_MODEL = process.env.EMBED_MODEL || 'openai/text-embedding-3-small';

const driver = neo4j.driver(
  process.env.NEO4J_URI || 'bolt://localhost:7687',
  neo4j.auth.basic(process.env.NEO4J_USER || 'neo4j', process.env.NEO4J_PASSWORD || ''),
);

async function run(cypher, params = {}) {
  const res = await driver.executeQuery(cypher, params, { database: process.env.NEO4J_DATABASE || 'neo4j' });
  return res.records.map((r) => r.toObject());
}

/** https://github.com/Owner/Repo(.git)(/tree/...) -> https://github.com/owner/repo ; GitHub names are case-insensitive. */
export function repoKey(url) {
  if (typeof url !== 'string') return null;
  const m = url.trim().match(/^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+)/i);
  if (!m) return null;
  return `https://github.com/${m[1].toLowerCase()}/${m[2].replace(/\.git$/i, '').toLowerCase()}`;
}
/** "AgentGuard: x" / "AGENTGUARD | y" / "Agent Guard — z" -> "agentguard"; hyphens inside a name are kept ("near-doctor" -> "neardoctor"). */
export const nameKey = (s) => String(s || '').toLowerCase().split(/\s*[:|]\s*|\s+[—–-]\s+/)[0].replace(/[^a-z0-9]+/g, '');
const list = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]).map((x) => (typeof x === 'string' ? x.trim() : x)).filter((x) => x !== '' && x != null);
const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const bareId = (id) => String(id).replace(/^nearhackathon-2026:/, '');

/** Split an assessment into front matter (parsed leniently) and body sections. */
export function parseAssessment(text) {
  const m = text.match(/^﻿?---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) return { meta: null, body: text, error: 'no front matter' };
  let meta = null;
  let error = null;
  try {
    meta = YAML.parse(m[1], { strict: false, uniqueKeys: false }) || {};
  } catch (e) {
    error = `front matter: ${e.message.split('\n')[0]}`;
  }
  const body = m[2];
  const verdict = (body.match(/##\s*Verdict\s*\n+([\s\S]*?)(?=\n##\s|\s*$)/i) || [])[1]?.trim() || null;
  return { meta, body, verdict, error };
}

async function cmdSchema() {
  const stmts = fs.readFileSync(path.join(here, 'schema.cypher'), 'utf8')
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
    .split(';').map((s) => s.trim()).filter(Boolean);
  for (const s of stmts) await run(s);
  console.log(`schema: ${stmts.length} statements applied`);
}

async function cmdProjects() {
  const rows = [];
  let cursor = null;
  for (let page = 0; page < 100; page++) {
    const url = new URL(API);
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', cursor);
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    const d = await res.json();
    rows.push(...d.items);
    cursor = d.next_cursor;
    if (!cursor) break;
  }
  const items = rows.map((p) => ({
    id: bareId(p.id || p.submission_id),
    name: p.name || p.project_name || null,
    name_key: nameKey(p.name || p.project_name),
    description: p.description || null,
    demo_url: p.demo_url || null,
    onchain_repo_url: p.repository_url || null,
    onchain_repo_key: repoKey(p.repository_url),
    tracks: list(p.tracks),
    votes: num(p.votes),
    comments: num(p.comments),
  }));
  await run(
    `UNWIND $items AS it
     MERGE (p:Project {id: it.id})
     SET p += it {.name, .name_key, .description, .demo_url, .onchain_repo_url, .onchain_repo_key, .tracks, .votes, .comments},
         p.listed = true, p.synced_at = datetime()
     WITH p, it UNWIND it.tracks AS t
     MERGE (tr:Track {id: t}) MERGE (p)-[:IN_TRACK]->(tr)`,
    { items },
  );
  console.log(`projects: ${items.length} synced from ${API}`);
}

async function cmdAssessments(dirArg) {
  const dir = path.resolve(reviewDir, dirArg || 'assessments');
  const files = fs.readdirSync(dir).filter((f) => /^[0-9a-f-]{36}\.md$/.test(f));
  let ok = 0;
  const problems = [];
  for (const f of files) {
    const id = f.slice(0, 36);
    const { meta, verdict, error } = parseAssessment(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (!meta) {
      problems.push(`${id}: ${error}`);
      await run(`MERGE (p:Project {id:$id}) SET p.reviewed = false, p.assessment_error = $error, p.assessment_file = $file`,
        { id, error, file: path.relative(reviewDir, path.join(dir, f)) });
      continue;
    }
    const scores = meta.scores && typeof meta.scores === 'object' ? meta.scores : {};
    const elig = meta.eligibility && typeof meta.eligibility === 'object' ? meta.eligibility : {};
    const bw = meta.build_window && typeof meta.build_window === 'object' ? meta.build_window : {};
    const team = meta.team && typeof meta.team === 'object' ? meta.team : {};
    const props = {
      reviewed: true,
      assessment_file: path.relative(reviewDir, path.join(dir, f)),
      assessment_error: error,
      reviewed_at: meta.reviewed_at ? String(meta.reviewed_at) : null,
      repo_status: meta.repo_status ?? null,
      demo_status: meta.demo_status ?? null,
      network: meta.network ?? null,
      near_integration: meta.near_integration ?? null,
      originality: meta.originality ?? null,
      completeness: num(meta.completeness),
      technical_depth: num(meta.technical_depth),
      preliminary_score: num(meta.preliminary_score),
      best_track: meta.best_track ?? null,
      verdict,
      red_flags: list(meta.red_flags).map(String),
      claims_found: num(meta.claims_verified?.found),
      claims_partial: num(meta.claims_verified?.partial),
      claims_not_found: num(meta.claims_verified?.not_found),
    };
    for (const [k, v] of Object.entries(scores)) props[`score_${k}`] = num(v);
    for (const [k, v] of Object.entries(elig)) props[`eligibility_${k}`] = v == null ? null : String(v);
    if (!props.name && meta.name) props.name = String(meta.name);

    const repo = repoKey(meta.repo_url);
    const rejected = list(meta.repo_candidates_rejected)
      .map((r) => (typeof r === 'string' ? { url: repoKey(r), why: null } : { url: repoKey(r?.url), why: r?.why ?? null }))
      .filter((r) => r.url && r.url !== repo);
    const contracts = list(meta.contracts).map((c) => (typeof c === 'string' ? { account: c } : c))
      .filter((c) => c?.account).map((c) => ({ id: String(c.account), network: c.network ?? null, deployed: c.deployed ?? null }));

    await run(
      `MERGE (p:Project {id:$id})
       SET p += $props, p.name = coalesce(p.name, $name), p.name_key = coalesce(p.name_key, $name_key)
       WITH p
       OPTIONAL MATCH (p)-[old:HAS_REPO|REJECTED_REPO|TEAM|DEPLOYS|USES|TAGGED|RELATED]->() DELETE old
       WITH DISTINCT p
       CALL (p) { WITH p WHERE $repo IS NOT NULL
         MERGE (r:Repo {url:$repo}) SET r += $repoProps MERGE (p)-[:HAS_REPO]->(r)
         MERGE (u:GitHubUser {login:$repoOwner}) MERGE (r)-[:OWNED_BY]->(u) }
       CALL (p) { UNWIND $others AS o MERGE (r:Repo {url:o}) MERGE (p)-[x:HAS_REPO]->(r) SET x.role = 'other' }
       CALL (p) { UNWIND $rejected AS rj MERGE (r:Repo {url:rj.url}) MERGE (p)-[x:REJECTED_REPO]->(r) SET x.why = rj.why }
       CALL (p) { UNWIND $gh AS login MERGE (u:GitHubUser {login:login}) MERGE (p)-[:TEAM]->(u) }
       CALL (p) { UNWIND $x AS h MERGE (a:XAccount {handle:h}) MERGE (p)-[:TEAM]->(a) }
       CALL (p) { UNWIND $contracts AS c MERGE (a:NearAccount {id:c.id}) SET a.network = coalesce(c.network, a.network), a.deployed = coalesce(c.deployed, a.deployed) MERGE (p)-[:DEPLOYS]->(a) }
       CALL (p) { UNWIND $tech AS t MERGE (n:Tech {name:t}) MERGE (p)-[:USES]->(n) }
       CALL (p) { UNWIND $tags AS t MERGE (n:Tag {name:t}) MERGE (p)-[:TAGGED]->(n) }
       CALL (p) { UNWIND $related AS h MATCH (q:Project) WHERE q <> p AND (q.id = h OR q.name_key = h OR q.id STARTS WITH h)
                  MERGE (p)-[x:RELATED]->(q) SET x.hint = h }
       RETURN p.id`,
      {
        id, props, name: meta.name ? String(meta.name) : null, name_key: nameKey(meta.name),
        repo,
        repoOwner: repo ? repo.split('/')[3] : null,
        repoProps: { commit: meta.repo_commit ?? null, first_commit: bw.first_commit ? String(bw.first_commit) : null,
          last_commit: bw.last_commit ? String(bw.last_commit) : null, commits: num(bw.commits), authors: num(bw.authors) },
        rejected,
        others: list(meta.repos_other).map(repoKey).concat(repoKey(meta.repo_submitted)).filter((u) => u && u !== repo),
        gh: list(team.github).map((s) => String(s).replace(/^@/, '').toLowerCase()),
        x: list(team.x).map((s) => String(s).replace(/^@/, '').toLowerCase()),
        contracts,
        tech: list(meta.near_tech).concat(list(meta.stack)).map((s) => String(s).toLowerCase()),
        tags: list(meta.tags).map((s) => String(s).toLowerCase()),
        related: list(meta.related_hint).map((h) => {
          const s = String(h);
          const uuid = s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\b[0-9a-f]{8}\b/);
          return uuid ? uuid[0] : nameKey(s);
        }).filter(Boolean),
      },
    );
    ok++;
  }
  console.log(`assessments: ${ok}/${files.length} loaded from ${path.relative(reviewDir, dir)}${problems.length ? `; unparsed: ${problems.join('; ')}` : ''}`);
}

async function cmdEmbed() {
  const rows = await run(
    `MATCH (p:Project) RETURN p.id AS id, p.name AS name, p.description AS description, p.verdict AS verdict, p.embedding_hash AS hash`,
  );
  const todo = rows.map((r) => {
    const text = [r.name, r.description, r.verdict].filter(Boolean).join('\n\n').slice(0, 6000);
    return { id: r.id, text, hash: crypto.createHash('sha256').update(`${EMBED_MODEL}\n${text}`).digest('hex').slice(0, 16), old: r.hash };
  }).filter((r) => r.text && r.hash !== r.old);
  let tokens = 0;
  let cost = 0;
  for (let i = 0; i < todo.length; i += 100) {
    const batch = todo.slice(i, i + 100);
    const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENROUTER_API_KEY || 'proxy-injected'}` },
      body: JSON.stringify({ model: EMBED_MODEL, input: batch.map((b) => b.text) }),
    });
    if (!res.ok) throw new Error(`embeddings HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const d = await res.json();
    tokens += d.usage?.total_tokens || 0;
    cost += d.usage?.cost || 0;
    const items = d.data.map((e) => ({ id: batch[e.index].id, hash: batch[e.index].hash, embedding: e.embedding }));
    await run(`UNWIND $items AS it MATCH (p:Project {id: it.id}) CALL db.create.setNodeVectorProperty(p, 'embedding', it.embedding) SET p.embedding_hash = it.hash`, { items });
  }
  console.log(`embed: ${todo.length} projects embedded with ${EMBED_MODEL} (${tokens} tokens, $${cost.toFixed(4)}); ${rows.length - todo.length} unchanged`);
}

async function cmdLink(kArg) {
  const k = Number(kArg) || 5;
  await run(`MATCH ()-[s:SIMILAR_PITCH|SAME_NAME]->() DELETE s`);
  const [sim] = await run(
    `MATCH (p:Project) WHERE p.embedding IS NOT NULL
     CALL db.index.vector.queryNodes('project_embedding', $k1, p.embedding) YIELD node, score
     WITH p, node, score WHERE node <> p
     MERGE (p)-[s:SIMILAR_PITCH]-(node) ON CREATE SET s.score = score
     RETURN count(*) AS n`,
    { k1: neo4j.int(k + 1) },
  );
  const [same] = await run(
    `MATCH (p:Project), (q:Project) WHERE p.name_key = q.name_key AND p.name_key <> '' AND p.id < q.id
     MERGE (p)-[:SAME_NAME]->(q) RETURN count(*) AS n`,
  );
  console.log(`link: ${sim.n} SIMILAR_PITCH edges (top ${k}), ${same.n} SAME_NAME edges`);
}

async function cmdNote(id, text) {
  if (!id || !text) throw new Error('usage: note <submission_id|*> "<text>"');
  const noteId = crypto.randomUUID();
  await run(
    `CREATE (n:Note {id:$noteId, text:$text, at:datetime(), scope: CASE WHEN $id = '*' THEN 'rubric' ELSE 'project' END})
     WITH n CALL (n) { WITH n WHERE $id <> '*' MATCH (p:Project {id:$id}) MERGE (n)-[:ABOUT]->(p) }
     RETURN n.id`,
    { noteId, text, id },
  );
  console.log(`note ${noteId} saved${id === '*' ? ' (rubric-wide)' : ` about ${id}`}`);
}

async function cmdQuery(cypher) {
  const rows = await run(cypher);
  console.log(JSON.stringify(rows, (_, v) => (neo4j.isInt(v) ? v.toNumber() : Array.isArray(v) && v.length > 50 && typeof v[0] === 'number' ? `[${v.length} floats]` : v), 2));
}

const [cmd, ...args] = process.argv.slice(2);
const cmds = { schema: cmdSchema, projects: cmdProjects, assessments: cmdAssessments, embed: cmdEmbed, link: cmdLink, note: cmdNote, query: cmdQuery };
if (!cmds[cmd]) {
  console.error(`commands: ${Object.keys(cmds).join(', ')}`);
  process.exit(2);
}
try {
  await cmds[cmd](...args);
} catch (e) {
  console.error(`${cmd} failed: ${e.message}`);
  process.exitCode = 1;
} finally {
  await driver.close();
}
