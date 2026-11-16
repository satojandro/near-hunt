#!/usr/bin/env bash
# Review every listed project that has no assessment yet, N at a time (default 30), then load the graph.
#   OPENROUTER_API_KEY=... NEO4J_PASSWORD=... review/run-all.sh [parallel] [out_dir]
# Resumable: a project with an existing assessment file is skipped, so re-running continues.
set -euo pipefail
cd "$(dirname "$0")/.."
par="${1:-30}"; out="${2:-review/assessments}"
mkdir -p "$out"
curl -sf "https://nearhunt.xyz/api/projects?limit=100" >/dev/null || { echo "NEAR Hunt API unreachable" >&2; exit 1; }
node -e '
  let ids = [], cursor = null;
  (async () => { do {
    const u = new URL("https://nearhunt.xyz/api/projects"); u.searchParams.set("limit","100"); if (cursor) u.searchParams.set("cursor", cursor);
    const d = await (await fetch(u)).json(); ids.push(...d.items.map(p => String(p.id).replace(/^nearhackathon-2026:/, ""))); cursor = d.next_cursor;
  } while (cursor); console.log(ids.join("\n")); })();' \
  | while read -r id; do [ -f "$out/$id.md" ] || echo "$id"; done > review/logs/todo.txt
echo "to review: $(wc -l < review/logs/todo.txt) (parallel $par)"
xargs -P "$par" -I{} review/run-agent.sh {} "$out" < review/logs/todo.txt | tee -a review/logs/run-all.log
(cd review && node graph/load.mjs projects && node graph/load.mjs assessments "${out#review/}" && node graph/load.mjs embed && node graph/load.mjs link)
