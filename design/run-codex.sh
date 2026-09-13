#!/usr/bin/env sh
# Usage: design/run-codex.sh <round> [resume]
# Runs Codex (gpt-6-astra, xhigh reasoning, read-only) on design/round-<N>-prompt.md
# and writes the final message to design/round-<N>-codex.md.
set -u
n="$1"; mode="${2:-new}"
cd "$(dirname "$0")/.." || exit 1
prompt="design/round-$n-prompt.md"
out="design/round-$n-codex.md"
log="design/round-$n-log.txt"
if [ "$mode" = "resume" ]; then
  codex exec resume --last -m gpt-6-astra -c model_reasoning_effort="xhigh" -o "$out" - < "$prompt" > "$log" 2>&1
else
  codex exec -m gpt-6-astra -c model_reasoning_effort="xhigh" -s read-only --skip-git-repo-check -o "$out" - < "$prompt" > "$log" 2>&1
fi
echo "exit=$?" >> "$log"
