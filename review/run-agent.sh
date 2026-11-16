#!/usr/bin/env bash
# Run the project-reviewer agent on ONE submission with DeepSeek V4.1 Flash 1017 via OpenRouter.
#
#   review/run-agent.sh <submission_id> [out_dir]      (default out_dir: review/assessments)
#
# Read-only toward NEAR: the agent definition forbids writes, and this script gives it no NEAR
# credentials. On a machine that holds keys (the Mac Mini holds nearhunt.near's), run it inside a
# container or as a user that cannot read ~/.near-credentials (AGENTS.md §2) — the agent reads
# untrusted repositories and must never be able to reach a signing key.
#
# OPENROUTER_API_KEY must be set, except in a cloud session whose proxy injects it (then any
# placeholder works). The model can be overridden with REVIEW_MODEL.
set -euo pipefail

id="${1:?usage: review/run-agent.sh <submission_id> [out_dir]}"
[[ "$id" =~ ^[0-9a-f-]{36}$ ]] || { echo "not a submission id: $id" >&2; exit 2; }
out_dir="${2:-review/assessments}"
model="${REVIEW_MODEL:-deepseek/deepseek-v4.1-flash-1017}"
root="$(cd "$(dirname "$0")/.." && pwd)"
logs="$root/review/logs"
mkdir -p "$root/$out_dir" "$logs"

prompt="You are the project-reviewer agent. Read .claude/agents/project-reviewer.md and review/RUBRIC.md in full and follow them exactly. Your submission_id is: $id. Write your assessment to $out_dir/$id.md (this overrides the default path in the agent file) and write nothing else. Never write to NEAR."

cd "$root"
ANTHROPIC_BASE_URL="https://openrouter.ai/api" \
ANTHROPIC_AUTH_TOKEN="${OPENROUTER_API_KEY:-proxy-injected}" \
ANTHROPIC_API_KEY="" \
ANTHROPIC_MODEL="$model" \
ANTHROPIC_DEFAULT_HAIKU_MODEL="$model" \
CLAUDE_CODE_SUBAGENT_MODEL="$model" \
timeout 1800 claude -p "$prompt" \
  --allowedTools "Bash" "Read" "Write" "Grep" "Glob" \
  --max-turns 80 \
  --output-format json \
  >"$logs/$id.json" 2>"$logs/$id.err" || echo "agent exited non-zero for $id (see $logs/$id.err)" >&2

python3 - "$logs/$id.json" "$root/$out_dir/$id.md" <<'EOF'
import json, os, sys
log, out = sys.argv[1], sys.argv[2]
try:
    d = json.load(open(log))
except Exception:
    print(f"{os.path.basename(out)[:36]} | NO RESULT (log unreadable)"); sys.exit(0)
u = d.get("usage") or {}
# OpenRouter price for deepseek-v4.1-flash-1017, off-peak: $0.15/M input, $0.003/M cache read, $0.60/M output
cost = (u.get("input_tokens", 0) * 0.15 + u.get("cache_read_input_tokens", 0) * 0.003 + u.get("output_tokens", 0) * 0.60) / 1e6
print(f"{os.path.basename(out)[:36]} | written={os.path.exists(out)} | turns={d.get('num_turns')} | "
      f"in={u.get('input_tokens')} cached={u.get('cache_read_input_tokens')} out={u.get('output_tokens')} | ~${cost:.3f} off-peak")
EOF
