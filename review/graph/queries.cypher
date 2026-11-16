// Saved questions for the review graph. Paste into the Neo4j Browser (http://localhost:7474) or run
//   node graph/load.mjs query "<one statement>"

// 1. Same repository on chain for more than one project (the brief: each repo is submitted once).
MATCH (p:Project) WHERE p.onchain_repo_key IS NOT NULL
WITH p.onchain_repo_key AS repo, collect(p.name) AS names WHERE size(names) > 1
RETURN repo, size(names) AS n, names ORDER BY n DESC;

// 2. Correction list: the reviewer's repository differs from the one on chain (owner approves each fix).
MATCH (p:Project)-[:HAS_REPO]->(r:Repo)
WHERE p.onchain_repo_key IS NULL OR p.onchain_repo_key <> r.url
RETURN p.id, p.name, p.onchain_repo_url AS onchain, r.url AS reviewer_found ORDER BY p.name;

// 3. Q-015: one person, at most 2 projects. GitHub logins and X handles across reviewed projects.
MATCH (who)<-[:TEAM|OWNED_BY*1..2]-(p:Project)
WHERE who:GitHubUser OR who:XAccount
WITH who, collect(DISTINCT p.name) AS projects WHERE size(projects) > 1
RETURN labels(who)[0] AS kind, coalesce(who.login, who.handle) AS id, size(projects) AS n, projects ORDER BY n DESC;

// 4. Same name, different projects? (Bridle-style.) Groups to send to a connector agent.
MATCH (p:Project) WHERE p.name_key <> ''
WITH p.name_key AS k, collect({id: p.id, name: p.name, repo: p.onchain_repo_key}) AS group WHERE size(group) > 1
RETURN k, size(group) AS n, group ORDER BY n DESC;

// 5. Nearest pitches to one project (semantic neighbours).
MATCH (p:Project {id: $id})-[s:SIMILAR_PITCH]-(q:Project)
RETURN q.id, q.name, round(s.score * 1000) / 1000 AS score, q.preliminary_score ORDER BY score DESC;

// 6. Free-text search over name, description and verdict.
CALL db.index.fulltext.queryNodes('project_text', 'chain signatures AND payroll') YIELD node, score
RETURN node.name, node.preliminary_score, score ORDER BY score DESC LIMIT 20;

// 7. Shortlist: reviewed, eligible, NEAR load-bearing, best preliminary scores.
MATCH (p:Project) WHERE p.reviewed AND p.near_integration IN ['core', 'meaningful']
  AND NOT any(k IN keys(p) WHERE k STARTS WITH 'eligibility_' AND p[k] = 'fail')
RETURN p.name, p.best_track, p.preliminary_score, p.verdict ORDER BY p.preliminary_score DESC LIMIT 50;

// 8. Contracts deployed by more than one project.
MATCH (a:NearAccount)<-[:DEPLOYS]-(p:Project)
WITH a, collect(p.name) AS projects WHERE size(projects) > 1 RETURN a.id, a.network, projects;

// 9. The owner's notes, newest first.
MATCH (n:Note) OPTIONAL MATCH (n)-[:ABOUT]->(p:Project)
RETURN n.at, n.scope, p.name, n.text ORDER BY n.at DESC;
