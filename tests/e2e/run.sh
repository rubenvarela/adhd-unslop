#!/usr/bin/env bash
# Install this marketplace into throwaway Claude Code and Codex homes and check
# the behavior with the real CLIs. Your own ~/.claude and ~/.codex are not
# touched, except that ~/.codex/auth.json is copied into the throwaway Codex
# home for the run and deleted on exit.
#
# Needs both CLIs signed in, so CI does not run it. Uses the working tree,
# including uncommitted changes.
#
#   tests/e2e/run.sh            run both runtimes
#   tests/e2e/run.sh claude     run one runtime
#   tests/e2e/run.sh codex
#
# By default the marketplace is a copy of the working tree. To install from
# GitHub instead, which exercises the real clone and cache paths:
#
#   E2E_REPO=rubenvarela/adhd-unslop E2E_REF=main tests/e2e/run.sh

set -u
repo=$(cd "$(dirname "$0")/../.." && pwd)
only=${1:-all}
work=$(mktemp -d "${TMPDIR:-/tmp}/adhd-unslop-e2e.XXXXXX")
# Keep the model's working directory away from the marketplace copy, so a
# file search cannot find an uninstalled plugin there.
cwd=$(mktemp -d "${TMPDIR:-/tmp}/adhd-unslop-cwd.XXXXXX")
# Delete both throwaway homes on exit, so no later run or model search finds
# their plugin copies. The logs stay in $work.
trap 'rm -f "$work/codex/.codex/auth.json"; rm -rf "$cwd" "$work/codex" "$work/claude" "$work/mkt"' EXIT

pass=0
fail=0
result() { if [ "$2" = ok ]; then echo "PASS  $1"; pass=$((pass + 1)); else echo "FAIL  $1"; fail=$((fail + 1)); fi; }
expect() { local name=$1 pattern=$2 file=$3; if grep -Eq -- "$pattern" "$file"; then result "$name" ok; else result "$name" no; echo "      expected /$pattern/ in $file"; fi; }
refuse() { local name=$1 pattern=$2 file=$3; if grep -Eq -- "$pattern" "$file"; then result "$name" no; echo "      unexpected /$pattern/ in $file"; else result "$name" ok; fi; }

if [ -n "${E2E_REPO:-}" ]; then
  ref=${E2E_REF:-main}
  claude_source="$E2E_REPO#$ref"
  codex_source=("$E2E_REPO" --ref "$ref")
  echo "marketplace: $E2E_REPO at $ref"
else
  # Copy the working tree, minus ignored files, into a fresh git repo.
  mkt="$work/mkt"
  mkdir -p "$mkt"
  (cd "$repo" && git ls-files -co --exclude-standard -z | xargs -0 tar cf -) | (cd "$mkt" && tar xf -)
  (cd "$mkt" && git init -q && git add -A && git -c user.name=e2e -c user.email=e2e@example.invalid commit -qm e2e)
  claude_source=$mkt
  codex_source=("$mkt")
  echo "marketplace copy: $mkt"
fi
echo "logs: $work"

run_claude() {
  export CLAUDE_CONFIG_DIR="$work/claude"
  mkdir -p "$CLAUDE_CONFIG_DIR"
  local log="$work/claude-install.log"
  claude plugin marketplace add "$claude_source" >"$log" 2>&1
  claude plugin install adhd-unslop@adhd-unslop >>"$log" 2>&1
  claude plugin list >>"$log" 2>&1
  expect "claude: install brings both dependencies" "\+ 2 dependencies" "$log"
  expect "claude: au-i-have-adhd installed" "au-i-have-adhd@adhd-unslop" "$log"
  expect "claude: au-unslop installed" "au-unslop@adhd-unslop" "$log"

  log="$work/claude-invoke.log"
  (cd "$cwd" && claude -p --output-format stream-json --verbose '/adhd-unslop:adhd-unslop Reply with the single word READY.' </dev/null >"$log" 2>&1)
  expect "claude: skill loads au-i-have-adhd:i-have-adhd" '"skill":"au-i-have-adhd:i-have-adhd"' "$log"
  expect "claude: skill loads au-unslop:unslop" '"skill":"au-unslop:unslop"' "$log"

  log="$work/claude-typed.log"
  (cd "$cwd" && claude -p --output-format stream-json --verbose '/au-unslop:unslop Reply with the number of the rule about em dashes, digits only.' </dev/null >"$log" 2>&1)
  expect "claude: typed /au-unslop:unslop works" '"result":"13' "$log"

  log="$work/claude-unprompted.log"
  (cd "$cwd" && claude -p --output-format stream-json --verbose 'What is 17 times 3? Digits only.' </dev/null >"$log" 2>&1)
  refuse "claude: unprompted question loads no au- skill" '"skill":"au-' "$log"
  unset CLAUDE_CONFIG_DIR
}

run_codex() {
  local home="$work/codex"
  mkdir -p "$home/.codex"
  cp "$HOME/.codex/auth.json" "$home/.codex/auth.json"
  local log="$work/codex-install.log"
  HOME=$home CODEX_HOME=$home/.codex codex plugin marketplace add "${codex_source[@]}" </dev/null >"$log" 2>&1
  HOME=$home CODEX_HOME=$home/.codex codex plugin add adhd-unslop@adhd-unslop </dev/null >>"$log" 2>&1
  cx() { (cd "$cwd" && HOME=$home CODEX_HOME=$home/.codex codex exec --skip-git-repo-check -s read-only "$@" </dev/null 2>&1); }

  log="$work/codex-missing.log"
  cx --enable hooks --dangerously-bypass-hook-trust -o "$work/codex-missing.txt" 'Which adhd-unslop plugins, if any, are missing? Name them and give the install command, or reply NONE.' >"$log"
  expect "codex: hook tells the model which plugin is missing" "au-i-have-adhd" "$work/codex-missing.txt"
  expect "codex: model relays the codex install command" "codex plugin add au-(i-have-adhd|unslop)@adhd-unslop" "$work/codex-missing.txt"

  log="$work/codex-missing-skill.log"
  cx -o "$work/codex-missing-skill.txt" '$adhd-unslop:adhd-unslop Load what this skill needs, then list any skill you could not load, or reply NONE.' >"$log"
  expect "codex: skill fallback names the missing plugin without hooks" "au-i-have-adhd|au-unslop" "$work/codex-missing-skill.txt"

  HOME=$home CODEX_HOME=$home/.codex codex plugin add au-i-have-adhd@adhd-unslop </dev/null >>"$work/codex-install.log" 2>&1
  HOME=$home CODEX_HOME=$home/.codex codex plugin add au-unslop@adhd-unslop </dev/null >>"$work/codex-install.log" 2>&1

  log="$work/codex-invoke.log"
  cx --enable hooks --dangerously-bypass-hook-trust '$adhd-unslop:adhd-unslop Reply with the single word READY.' >"$log"
  refuse "codex: hook is silent once both are installed" "adhd-unslop needs" "$log"
  expect "codex: skill reads au-i-have-adhd SKILL.md" "au-i-have-adhd/[^ ]*/skills/i-have-adhd/SKILL.md" "$log"
  expect "codex: skill reads au-unslop SKILL.md" "au-unslop/[^ ]*/skills/unslop/SKILL.md" "$log"

  log="$work/codex-typed.log"
  cx -o "$work/codex-typed.txt" '$au-unslop:unslop Reply with the number of the rule about em dashes, digits only.' >"$log"
  expect "codex: typed \$au-unslop:unslop works" "^13" "$work/codex-typed.txt"

  log="$work/codex-unprompted.log"
  cx 'What is 17 times 3? Digits only.' >"$log"
  refuse "codex: unprompted question reads no au- skill" "au-(i-have-adhd|unslop)/[^ ]*/SKILL.md" "$log"
}

case $only in
  all) run_claude; run_codex ;;
  claude) run_claude ;;
  codex) run_codex ;;
  *) echo "usage: $0 [claude|codex]"; exit 2 ;;
esac

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
