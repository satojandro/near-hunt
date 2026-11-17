#!/usr/bin/env node
/**
 * AI Judge Reader ingestion for near-hunt (2,453+ submissions).
 * Usage:
 *   node scripts/judge-ingest.mjs --limit 50 --dry-run
 *   node scripts/judge-ingest.mjs --limit 100
 *   node scripts/judge-ingest.mjs --all
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();

function loadEnvLocal() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

function getGitHubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execSync('gh auth token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function parseArgs(argv) {
  const args = { limit: 50, dryRun: false, force: false, concurrency: 5 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--limit' && argv[i + 1]) args.limit = Number(argv[++i]);
    if (argv[i] === '--all') args.limit = Infinity;
    if (argv[i] === '--dry-run') args.dryRun = true;
    if (argv[i] === '--force') args.force = true;
    if (argv[i] === '--concurrency' && argv[i + 1]) args.concurrency = Number(argv[++i]);
  }
  return args;
}

function loadNameAndTrackMaps() {
  const names = new Map();
  const tracks = new Map();
  const snapPath = path.join(ROOT, 'data/submissions-snapshot.json');
  if (fs.existsSync(snapPath)) {
    const snap = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
    for (const p of snap.projects || []) {
      if (p.project_name) names.set(p.id, p.project_name);
      if (p.tracks) tracks.set(p.id, p.tracks);
    }
  }
  const linksPath = path.join(ROOT, 'data/enrichment/links.json');
  if (fs.existsSync(linksPath)) {
    const links = JSON.parse(fs.readFileSync(linksPath, 'utf8'));
    for (const r of links.rows || []) {
      if (r.name && !names.has(r.submission_id)) names.set(r.submission_id, r.name);
    }
  }
  return { names, tracks };
}

function loadProposalProjects(existingIds, { limit, force }) {
  const { names, tracks } = loadNameAndTrackMaps();
  const propPath = path.join(ROOT, 'data/enrichment/proposal.json');
  const prop = JSON.parse(fs.readFileSync(propPath, 'utf8'));
  const projects = [];

  for (const r of prop.results || []) {
    if (!force && existingIds.has(r.submission_id)) continue;
    const rawRepo = r.repository_url || '';
    const match = rawRepo.match(/^https:\/\/github\.com\/([^/]+)\/([^/#?]+)/i);

    projects.push({
      id: r.submission_id,
      name: names.get(r.submission_id) || (match ? match[2] : `@${r.author || r.submission_id.slice(0, 8)}`),
      author: r.author || null,
      description: r.description || '',
      tracks: tracks.get(r.submission_id) || [],
      links: (r.links || []).map((l) => `${l.url} (${l.check?.verdict || 'unchecked'})`),
      hasMedia: (r.media || []).length > 0,
      repoUrl: match ? `https://github.com/${match[1]}/${match[2].replace(/\.git$/, '')}` : rawRepo || null,
      owner: match ? match[1] : null,
      repo: match ? match[2].replace(/\.git$/, '') : null,
      repoVerified: Boolean(r.repository_verified),
    });
    if (projects.length >= limit) break;
  }
  return projects;
}

async function fetchExistingIds() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return new Set();
  const res = await fetch(`${url}/rest/v1/project_evaluations?select=project_id`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return new Set();
  const rows = await res.json();
  return new Set(rows.map((r) => r.project_id));
}

async function fetchGitHubContext(owner, repo, ghToken) {
  if (!owner || !repo) return { ok: false, status: 'no-github-repo', readme: '', files: [] };
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'near-hunt-ai-judge',
  };
  if (ghToken) headers.Authorization = `Bearer ${ghToken}`;

  const metaRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
  if (!metaRes.ok) {
    return { ok: false, status: metaRes.status, readme: '', files: [] };
  }
  const meta = await metaRes.json();

  const [readmeRes, contentsRes] = await Promise.all([
    fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, { headers }),
    fetch(`https://api.github.com/repos/${owner}/${repo}/contents`, { headers }),
  ]);

  let readme = '';
  if (readmeRes.ok) {
    const rj = await readmeRes.json();
    if (rj.content) {
      readme = Buffer.from(rj.content, 'base64').toString('utf8').slice(0, 6000);
    }
  }

  let files = [];
  if (contentsRes.ok) {
    const cj = await contentsRes.json();
    if (Array.isArray(cj)) files = cj.map((f) => `${f.type === 'dir' ? 'dir' : 'file'}: ${f.name}`);
  }

  return {
    ok: true,
    language: meta.language,
    isFork: meta.fork,
    files,
    readme,
  };
}

function buildPrompt(project, gh) {
  return `You are an expert technical judge for the NEAR Hackathon (nearhackathon.com).
Evaluate this project strictly from the evidence below. Do not invent features not backed by the repo files or README.

PROJECT:
- id: ${project.id}
- name: ${project.name}
- author: ${project.author || 'unknown'}
- submitted_tracks: ${JSON.stringify(project.tracks)}
- x_description: ${project.description}
- links: ${JSON.stringify(project.links)}
- has_media: ${project.hasMedia}
- repo_url: ${project.repoUrl || 'none'} (verified=${project.repoVerified})

GITHUB REPO:
- ok: ${gh.ok}
- primary_language: ${gh.language || 'unknown'}
- is_fork: ${Boolean(gh.isFork)}
- top_level_files: ${JSON.stringify(gh.files)}
- readme_excerpt:
${gh.readme || '(no README found)'}

Return ONLY valid JSON matching this exact structure:
{
  "best_fit_track": "one of: Unstoppable DeFi | Investment Thesis | Privacy & Private AI | Autonomous Business | AI Swarms | AI Security & Defense | Agent Economy | Real-World Money | Games With Real Economies | NFTs That Do Something | Memecoins With Mechanics | Social Money | Open Innovation",
  "near_primitives": ["NEAR Intents", "Chain Signatures", "NEAR AI Cloud", "NEAR Contracts", "OutLayer TEE", "NEAR Mainnet", "NEAR Testnet"],
  "primitive_integration_depth": "Core architecture | Meaningful feature | Cosmetic / wallet-only | None",
  "tech_stack": ["..."],
  "gate_pass": true,
  "gate_failure_reason": null,
  "rubric": {
    "functional_execution": { "score": 1, "weight": 0.30, "evidence": "..." },
    "near_primitive_depth": { "score": 1, "weight": 0.25, "evidence": "..." },
    "originality_and_track_fit": { "score": 1, "weight": 0.20, "evidence": "..." },
    "ux_and_real_world_utility": { "score": 1, "weight": 0.15, "evidence": "..." },
    "docs_and_demo_clarity": { "score": 1, "weight": 0.10, "evidence": "..." }
  },
  "judge_notes": {
    "one_line_thesis": "...",
    "standout_approach": "...",
    "where_it_fell_short": "...",
    "comment_hook": "..."
  },
  "judge_memo": "Write a candid, human-grade 2-3 paragraph critique as if you are a hackathon judge talking to the builder outside the venue. Cover what you actually saw in the repo/demo, the exact variables that pushed the score up or down, and what was weak, risky, or missing.",
  "similarity_cluster": "short 3-6 word cluster label",
  "embedding_text": "3-4 sentence normalized summary of problem, NEAR primitives, and execution."
}`;
}

async function scoreAndEmbedWithGemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  const genRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      }),
    }
  );
  if (!genRes.ok) throw new Error(`Gemini generateContent ${genRes.status}: ${await genRes.text()}`);
  const genJson = await genRes.json();
  const scorecard = JSON.parse(genJson.candidates[0].content.parts[0].text);

  const embRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/gemini-embedding-001',
        content: { parts: [{ text: scorecard.embedding_text }] },
        outputDimensionality: 1536,
      }),
    }
  );
  if (!embRes.ok) throw new Error(`Gemini embedContent ${embRes.status}: ${await embRes.text()}`);
  const embJson = await embRes.json();
  return { scorecard, embedding: embJson.embedding.values };
}

async function upsertSupabase(row) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${url}/rest/v1/project_evaluations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Supabase upsert ${res.status}: ${await res.text()}`);
}

function computeWeightedScore(rubric) {
  const entries = Object.values(rubric || {});
  const total = entries.reduce((acc, item) => acc + (item.score || 0) * (item.weight || 0), 0);
  return Number(total.toFixed(2));
}

async function main() {
  loadEnvLocal();
  const args = parseArgs(process.argv.slice(2));
  const ghToken = getGitHubToken();
  const existingIds = await fetchExistingIds();
  const projects = loadProposalProjects(existingIds, args);

  console.log(`Existing in Supabase: ${existingIds.size} | Queued from proposal.json: ${projects.length} (dryRun=${args.dryRun})`);

  if (!args.dryRun && !process.env.GEMINI_API_KEY) {
    console.error('Missing GEMINI_API_KEY in .env.local. Re-run with --dry-run or add GEMINI_API_KEY.');
    process.exit(1);
  }

  for (let i = 0; i < projects.length; i += args.concurrency) {
    const chunk = projects.slice(i, i + args.concurrency);
    await Promise.all(
      chunk.map(async (p) => {
        try {
          const gh = await fetchGitHubContext(p.owner, p.repo, ghToken);
          if (args.dryRun) {
            console.log(`[${p.name}] repo=${p.repoUrl || 'none'} gh.ok=${gh.ok} files=${gh.files.length}`);
            return;
          }
          const { scorecard, embedding } = await scoreAndEmbedWithGemini(buildPrompt(p, gh));
          const weighted = computeWeightedScore(scorecard.rubric);
          await upsertSupabase({
            project_id: p.id,
            name: p.name,
            submitted_track: p.tracks[0] || null,
            best_fit_track: scorecard.best_fit_track,
            gate_pass: Boolean(scorecard.gate_pass),
            primitive_integration_depth: scorecard.primitive_integration_depth,
            near_primitives: scorecard.near_primitives || [],
            tech_stack: scorecard.tech_stack || [],
            similarity_cluster: scorecard.similarity_cluster,
            weighted_score: weighted,
            judge_memo: scorecard.judge_memo || null,
            scorecard,
            embedding,
          });
          console.log(`Saved: ${p.name} | ${scorecard.best_fit_track} | ${weighted} | gate=${scorecard.gate_pass}`);
        } catch (err) {
          console.error(`Failed ${p.name} (${p.id}):`, err.message);
        }
      })
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
