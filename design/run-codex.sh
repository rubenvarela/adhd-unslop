#!/usr/bin/env sh
# Usage: design/run-codex.sh <round> [resume]
# Runs a Codex adversarial review, read-only, on design/round-<N>-prompt.md and
# writes the final message to design/round-<N>-codex.md and the log to
# design/round-<N>-log.txt.
#
# Defaults, set in AGENTS.md: gpt-5.6-terra at high effort. Override with
# CODEX_MODEL and CODEX_EFFORT. Use xhigh only when the user asks for it.
# The run stops before it starts when Codex plan usage is at or above
# CODEX_USAGE_MAX percent (default 80), and prints usage when it ends.
set -u
n="$1"; mode="${2:-new}"
cd "$(dirname "$0")/.." || exit 1
model="${CODEX_MODEL:-gpt-5.6-terra}"
effort="${CODEX_EFFORT:-high}"
prompt="design/round-$n-prompt.md"
out="design/round-$n-codex.md"
log="design/round-$n-log.txt"

node tools/codex-usage.mjs --gate --max "${CODEX_USAGE_MAX:-80}" || exit 3

# Keep this repo's always-on rules out of the reviewer's context.
export ADHD_UNSLOP_ALWAYS=0
if [ "$mode" = "resume" ]; then
  codex exec resume --last -m "$model" -c model_reasoning_effort="$effort" -o "$out" - < "$prompt" > "$log" 2>&1
else
  codex exec -m "$model" -c model_reasoning_effort="$effort" -s read-only --skip-git-repo-check -o "$out" - < "$prompt" > "$log" 2>&1
fi
status=$?
echo "exit=$status" >> "$log"
node tools/codex-usage.mjs
exit $status
