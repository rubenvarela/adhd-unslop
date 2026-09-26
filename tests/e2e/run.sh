#!/usr/bin/env bash
# Install this marketplace into throwaway Claude Code and Codex homes and check
# the behavior with the real CLIs. Your own ~/.claude and ~/.codex are not
# touched, except that ~/.codex/auth.json is copied into each throwaway Codex
# home for the run. Every throwaway home, with its auth.json copy and Codex
# shell_snapshots, is deleted on exit. Logs, transcripts, and rollouts stay in
# the printed logs folder.
#
# Needs both CLIs signed in, and node and git, so CI does not run it. Uses the
# working tree, including uncommitted changes. Run `node tools/build.mjs`
# first, so plugins/ is current.
#
#   tests/e2e/run.sh            run everything
#   tests/e2e/run.sh claude     fresh install in Claude Code
#   tests/e2e/run.sh codex      fresh install in Codex
#   tests/e2e/run.sh migrate    upgrade from 0.2.2 in both runtimes
#
# By default the marketplace is a copy of the working tree. To install from
# GitHub instead, which exercises the real clone and cache paths:
#
#   E2E_REPO=rubenvarela/adhd-unslop E2E_REF=main tests/e2e/run.sh
#
# migrate always serves a local git marketplace over smart HTTP on 127.0.0.1.
# Its main branch starts at 0.2.2 (commit fc308bd) and then moves to the
# working tree, or to E2E_REF of E2E_REPO when that is set.
#
# PASS and FAIL lines are checks. INFO lines record platform behavior that is
# kept on purpose or outside this repo's control, and never fail the run.
#
# CLAUDE_BIN and CODEX_BIN pick other CLI binaries, for example a newer Codex:
#
#   CODEX_BIN=/path/to/node_modules/.bin/codex tests/e2e/run.sh codex
#
# Every Codex model turn uses CODEX_MODEL (default gpt-5.6-luna) at
# CODEX_EFFORT (default low), to save usage. The checks read what arrived in
# context from the rollouts, so the model barely matters.
#
# Before each Codex model run after the first, tools/codex-usage.mjs reads
# the plan usage that the last run recorded. At CODEX_USAGE_MAX percent
# (default 80) of the 5-hour or weekly window, the script prints a SKIP line
# with the reset time and stops the Codex steps of that mode. It then exits
# 3 unless a check failed, which exits 1.

# Codex skill names such as $adhd-unslop:adhd-unslop are literal prompt text.
# shellcheck disable=SC2016
set -u
# The physical path: tools/codex-usage.mjs runs nothing when started
# through a symlinked path.
repo=$(cd "$(dirname "$0")/../.." && pwd -P)
here=$repo/tests/e2e
only=${1:-all}
case $only in
  all | claude | codex | migrate) ;;
  *) echo "usage: $0 [claude|codex|migrate]"; exit 2 ;;
esac

claude_bin=${CLAUDE_BIN:-claude}
codex_bin=${CODEX_BIN:-codex}
codex_model=${CODEX_MODEL:-gpt-5.6-luna}
codex_effort=${CODEX_EFFORT:-low}
usage_tool=$repo/tools/codex-usage.mjs
usage_max=${CODEX_USAGE_MAX:-80}
real_home=$HOME
# The commit that shipped adhd-unslop 0.2.2, the version migrate upgrades from.
migrate_from=fc308bd
# Hook trust keys of 0.2.2: three chunk handlers, then the dependency check.
old_hook_keys=(0:0 0:1 0:2 1:0)
# The three chunk handlers keep their keys, so their trust carries over.
new_hook_keys=(0:0 0:1 0:2)

# Drop the calling session's variables, so a run from inside Claude Code or
# Codex behaves like one from a fresh terminal. Auth variables stay.
for v in $(compgen -e); do
  case $v in
    CLAUDE_CODE_USE_* | CLAUDE_CODE_OAUTH_TOKEN) ;;
    CLAUDECODE | CLAUDE_CODE_* | CLAUDE_PID | CLAUDE_EFFORT | CLAUDE_PLUGIN_* | CLAUDE_CONFIG_DIR | CLAUDE_SKILL_DIR) unset "$v" ;;
    CODEX_HOME | CODEX_COMPANION_* | CODEX_THREAD_ID | PLUGIN_ROOT | AI_AGENT | ADHD_UNSLOP_*) unset "$v" ;;
  esac
done

work=$(mktemp -d "${TMPDIR:-/tmp}/adhd-unslop-e2e.XXXXXX")
# Keep the model's working directory away from the marketplace copies, so a
# file search cannot find an uninstalled plugin there.
cwd=$(mktemp -d "${TMPDIR:-/tmp}/adhd-unslop-cwd.XXXXXX")
homes=$work/homes
server_pid=
cleanup() {
  if [ -n "$server_pid" ]; then kill "$server_pid" 2>/dev/null; fi
  # Delete the secrets first, then every throwaway home and marketplace copy,
  # so no later run or model search finds their plugin copies.
  find "$homes" \( -name auth.json -o -name 'logs_*.sqlite*' \) -exec rm -f {} + 2>/dev/null
  find "$homes" -type d -name shell_snapshots -prune -exec rm -rf {} + 2>/dev/null
  rm -rf "$cwd" "$homes" "$work/mkt" "$work/migrate"
}
trap cleanup EXIT
trap 'exit 130' INT TERM HUP

pass=0
fail=0
result() { if [ "$2" = ok ]; then echo "PASS  $1"; pass=$((pass + 1)); else echo "FAIL  $1"; fail=$((fail + 1)); fi; }
expect() { local name=$1 pattern=$2 file=$3; if grep -Eq -- "$pattern" "$file" 2>/dev/null; then result "$name" ok; else result "$name" no; echo "      expected /$pattern/ in $file"; fi; }
refuse() { local name=$1 pattern=$2 file=$3; if [ ! -f "$file" ]; then result "$name" no; echo "      missing $file"; elif grep -Eq -- "$pattern" "$file"; then result "$name" no; echo "      unexpected /$pattern/ in $file"; else result "$name" ok; fi; }
# check NAME COMMAND...: PASS when COMMAND exits 0. Its output explains a FAIL.
check() {
  local name=$1 out
  shift
  if out=$("$@" 2>&1); then result "$name" ok; else result "$name" no; printf '%s\n' "$out" | sed 's/^/      /'; fi
}
# info NAME COMMAND...: an INFO line for platform behavior that is recorded,
# not gated. It shows yes when COMMAND exits 0, no otherwise, and its output.
info() {
  local name=$1 out answer=no
  shift
  if out=$("$@" 2>&1); then answer=yes; fi
  echo "INFO  $name: $answer"
  if [ -n "$out" ]; then printf '%s\n' "$out" | sed 's/^/      /'; fi
}
inspect() { node "$here/inspect.mjs" "$@"; }

# Plugin list helpers. FILE holds "id version [path]" lines from inspect plugins.
has_plugin() {
  local file=$1 id=$2 version=${3:-}
  if awk -v id="$id" -v v="$version" '$1 == id && (v == "" || $2 == v) { found = 1 } END { exit !found }' "$file"; then return 0; fi
  echo "expected $id${version:+ $version}; installed: $(awk '{ printf "%s %s; ", $1, $2 }' "$file")"
  return 1
}
lacks_plugin() {
  local file=$1 id=$2
  if awk -v id="$id" '$1 == id { found = 1 } END { exit found }' "$file"; then return 0; fi
  echo "unexpected $id; installed: $(awk '{ printf "%s %s; ", $1, $2 }' "$file")"
  return 1
}
only_plugins() {
  local file=$1 got want
  shift
  got=$(awk '$1 ~ /@adhd-unslop$/ { print $1 }' "$file" | sort | tr '\n' ' ')
  want=$(printf '%s\n' "$@" | sort | tr '\n' ' ')
  [ "$got" = "$want" ] && return 0
  echo "installed from this marketplace: ${got:-nothing}; expected: $want"
  return 1
}
only_entries() {
  local dir=$1 got want
  shift
  got=$(find "$dir" -mindepth 1 -maxdepth 1 -exec basename {} \; 2>/dev/null | sort | tr '\n' ' ')
  want=$(printf '%s\n' "$@" | sort | tr '\n' ' ')
  [ "$got" = "$want" ] && return 0
  echo "$dir holds: ${got:-nothing}; expected: $want"
  return 1
}
exit_ok() { [ "$1" -eq 0 ] && return 0; cat "$2"; return 1; }
keys_for() { local plugin=$1 k out=; shift; for k in "$@"; do out="$out $plugin:hooks/hooks.json:session_start:$k"; done; echo "$out"; }

# Tree helpers.
copy_tree() {
  # Copy a checkout's tracked and untracked files, minus ignored and deleted ones.
  (cd "$1" && git ls-files -co --exclude-standard -z | while IFS= read -r -d '' f; do
    if [ -e "$f" ] || [ -L "$f" ]; then printf '%s\0' "$f"; fi
  done | xargs -0 tar cf -) | (cd "$2" && tar xf -)
}
commit_all() { git -C "$1" add -A && git -C "$1" -c user.name=e2e -c user.email=e2e@example.invalid commit -qm "$2"; }
json_field() { node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log(d[process.argv[1]])' "$1"; }
bundle_from_manifest() { node -e 'console.log(JSON.parse(require("fs").readFileSync(0,"utf8")).compositeSha256.slice(0,12))'; }

# Claude Code helpers. Each run gets its own config dir. CODEX_HOME points at
# a missing folder, so a flag file in your real ~/.codex cannot turn
# always-on on.
claude_home=
new_claude_home() { claude_home=$homes/$1; mkdir -p "$claude_home"; }
cl() { CLAUDE_CONFIG_DIR=$claude_home CODEX_HOME=$claude_home/no-codex "$claude_bin" "$@" </dev/null; }
# clp LOG ARGS...: one print-mode turn from $cwd, as stream-json with hook events.
clp() {
  local log=$1
  shift
  (cd "$cwd" && CLAUDE_CONFIG_DIR=$claude_home CODEX_HOME=$claude_home/no-codex \
    "$claude_bin" -p --output-format stream-json --verbose --include-hook-events "$@" </dev/null >"$log" 2>&1)
}
# clturns LOG PROMPT...: several turns in one print-mode process from $cwd.
clturns() {
  local log=$1
  shift
  (cd "$cwd" && CLAUDE_CONFIG_DIR=$claude_home CODEX_HOME=$claude_home/no-codex \
    node "$here/claude-turns.mjs" "$claude_bin" "$log" "$@" </dev/null >/dev/null 2>&1)
}
claude_session() { inspect session "$1" 2>/dev/null; }
claude_transcript() { find "$claude_home/projects" -name "$1.jsonl" 2>/dev/null | head -n 1; }
claude_plugins() { cl plugin list --json >"$1.json" 2>"$1.err"; inspect plugins claude "$1.json" >"$1"; }

# Codex helpers. HOME and CODEX_HOME point at the throwaway home, so neither
# ~/.claude nor ~/.codex flag files count. API keys are unset, so Codex
# cannot write them into shell_snapshots.
codex_home=
new_codex_home() {
  codex_home=$homes/$1
  mkdir -p "$codex_home/.codex"
  cp "$real_home/.codex/auth.json" "$codex_home/.codex/auth.json"
}
cx_env() { env -u ANTHROPIC_API_KEY -u OPENAI_API_KEY -u CODEX_API_KEY HOME="$codex_home" CODEX_HOME="$codex_home/.codex" "$@"; }
cxc() { cx_env "$codex_bin" "$@" </dev/null; }
# cxe LOG ARGS...: one codex exec turn from $cwd.
cxe() {
  local log=$1
  shift
  (cd "$cwd" && cx_env "$codex_bin" exec --skip-git-repo-check -s read-only \
    -m "$codex_model" -c "model_reasoning_effort=\"$codex_effort\"" "$@" </dev/null >"$log" 2>&1)
}
codex_session() { sed -n 's/^session id: //p' "$1" | head -n 1; }
codex_rollout() { find "$codex_home/.codex/sessions" -name "rollout-*-$1.jsonl" 2>/dev/null | head -n 1; }
codex_plugins() { cxc plugin list --json >"$1.json" 2>"$1.err"; inspect plugins codex "$1.json" >"$1"; }
codex_hooks() { cx_env node "$here/codex-hooks.mjs" "$codex_bin" "$cwd" "$@"; }

# model_step NAME: call before each Codex model run. After the first run it
# reads the plan usage from the home of the last run, and at the limit it
# prints one SKIP line and returns 1, so the caller stops its Codex steps.
usage_home=
codex_skipped=
model_step() {
  local out rc
  [ -z "$codex_skipped" ] || return 1
  if [ -n "$usage_home" ] && [ -f "$usage_tool" ]; then
    out=$(CODEX_HOME=$usage_home node "$usage_tool" --gate --max "$usage_max" 2>&1)
    rc=$?
    if [ "$rc" -eq 3 ]; then
      codex_skipped=1
      echo "SKIP  $1 and the Codex steps after it: $(printf '%s\n' "$out" | tail -n 1)"
      return 1
    fi
  fi
  usage_home=$codex_home/.codex
}
codex_usage() {
  if [ -n "$usage_home" ] && [ -f "$usage_tool" ]; then CODEX_HOME=$usage_home node "$usage_tool" 2>&1 | tail -n 1; fi
}

same_claude_session() {
  local log=$1 sid=$2 transcript=$3 prompt=$4 got
  got=$(claude_session "$log")
  [ "$got" = "$sid" ] || { echo "resumed session is ${got:-missing}, expected $sid"; return 1; }
  grep -Fq "$prompt" "$transcript" || { echo "transcript $transcript lacks the resumed prompt"; return 1; }
}
same_codex_session() {
  local log=$1 sid=$2 rollout=$3 prompt=$4 got
  got=$(codex_session "$log")
  [ "$got" = "$sid" ] || { echo "resumed session is ${got:-missing}, expected $sid"; return 1; }
  grep -Fq "$prompt" "$rollout" || { echo "rollout $rollout lacks the resumed prompt"; return 1; }
}

echo "logs: $work"
echo "claude: $("$claude_bin" --version 2>&1 | head -n 1)"
echo "codex: $("$codex_bin" --version 2>&1 </dev/null | head -n 1), model $codex_model at $codex_effort effort"

# Marketplace for the fresh-install runs. In local mode the expected versions
# and bundle id come from the copy; in GitHub mode from the installed copy.
source_ready=
mkt=
setup_source() {
  [ -n "$source_ready" ] && return
  source_ready=1
  if [ -n "${E2E_REPO:-}" ]; then
    ref=${E2E_REF:-main}
    claude_source="$E2E_REPO#$ref"
    codex_source=("$E2E_REPO" --ref "$ref")
    echo "marketplace: $E2E_REPO at $ref"
  else
    mkt=$work/mkt
    mkdir -p "$mkt"
    copy_tree "$repo" "$mkt"
    git -c init.defaultBranch=main init -q "$mkt"
    commit_all "$mkt" e2e
    claude_source=$mkt
    codex_source=("$mkt")
    echo "marketplace copy: $mkt"
  fi
}
want_version() { [ -n "$mkt" ] && json_field version <"$mkt/plugins/$1/.claude-plugin/plugin.json"; }
# The last line of the skill, which is the last line of the final check.
want_final_line() {
  local file
  if [ -n "$mkt" ]; then file=$mkt/src/adhd-unslop/overlay/90-final-check.md; else file=$1/skills/adhd-unslop/SKILL.md; fi
  awk 'NF { last = $0 } END { print last }' "$file" 2>/dev/null
}
want_bundle() {
  local root=$1
  if [ -n "$mkt" ]; then root=$mkt/plugins/adhd-unslop; fi
  bundle_from_manifest <"$root/hooks/chunks/manifest.json" 2>/dev/null
}

run_claude() {
  setup_source
  new_claude_home claude
  local log=$work/claude-install.log sid transcript bundle root final
  cl plugin marketplace add "$claude_source" >"$log" 2>&1
  cl plugin install adhd-unslop@adhd-unslop >>"$log" 2>&1
  claude_plugins "$work/claude-plugins-1.txt"
  check "claude: installing adhd-unslop installs only adhd-unslop" only_plugins "$work/claude-plugins-1.txt" adhd-unslop@adhd-unslop
  check "claude: adhd-unslop has the expected version" has_plugin "$work/claude-plugins-1.txt" adhd-unslop@adhd-unslop "$(want_version adhd-unslop)"
  refuse "claude: install reports no dependencies" "dependenc" "$log"
  root=$(awk '$1 == "adhd-unslop@adhd-unslop" { print $3 }' "$work/claude-plugins-1.txt")
  bundle=$(want_bundle "$root")
  final=$(want_final_line "$root")
  echo "      bundle id: ${bundle:-unknown}; final check line: ${final:-unknown}"

  # Always-on is off: no flag file and ADHD_UNSLOP_ALWAYS unset.
  log=$work/claude-invoke.log
  clp "$log" '/adhd-unslop:adhd-unslop Reply with the single word READY.'
  sid=$(claude_session "$log")
  transcript=$(claude_transcript "$sid")
  [ -n "$transcript" ] && cp "$transcript" "$work/claude-invoke.transcript.jsonl"
  expect "claude: /adhd-unslop:adhd-unslop answers" '"result":"READY' "$log"
  check "claude: always-on off injects no chunk" inspect bundle claude "$transcript" "$bundle" none
  check "claude: skill text arrives with both upstream texts and the final check line" \
    inspect skill-arrived claude "$transcript" "$root/skills/adhd-unslop/SKILL.md" "$final"
  check "claude: skill body arrives whole" \
    inspect skill-arrived claude "$transcript" "$root/skills/adhd-unslop/SKILL.md" "$final" whole

  # The clean case: only adhd-unslop is installed.
  log=$work/claude-unprompted.log
  clp "$log" 'What is 17 times 3? Digits only.'
  expect "claude: unprompted question answers" '"result":"51' "$log"
  check "claude: unprompted question loads no skill" inspect no-skill "$log"

  # Platform behavior, recorded as INFO: what an invoked skill keeps after
  # compaction. The skill is larger than the 20,000-character re-attach budget.
  log=$work/claude-compact-same.log
  clturns "$log" '/adhd-unslop:adhd-unslop Reply with the single word READY.' '/compact'
  transcript=$(claude_transcript "$(claude_session "$log")")
  [ -n "$transcript" ] && cp "$transcript" "$work/claude-compact-same.transcript.jsonl"
  info "claude: after /compact in the same process, the skill keeps its final check line" \
    inspect compacted "$transcript" adhd-unslop:adhd-unslop "$final"
  log=$work/claude-compact-resume.log
  clp "$log" --resume "$sid" '/compact'
  transcript=$(claude_transcript "$sid")
  [ -n "$transcript" ] && cp "$transcript" "$work/claude-compact-resume.transcript.jsonl"
  info "claude: after --resume then /compact, the skill keeps its final check line" \
    inspect compacted "$transcript" adhd-unslop:adhd-unslop "$final"

  log=$work/claude-install.log
  cl plugin install au-i-have-adhd@adhd-unslop >>"$log" 2>&1
  cl plugin install au-unslop@adhd-unslop >>"$log" 2>&1
  claude_plugins "$work/claude-plugins-2.txt"
  check "claude: au-i-have-adhd installs by name" has_plugin "$work/claude-plugins-2.txt" au-i-have-adhd@adhd-unslop "$(want_version au-i-have-adhd)"
  check "claude: au-unslop installs by name" has_plugin "$work/claude-plugins-2.txt" au-unslop@adhd-unslop "$(want_version au-unslop)"

  log=$work/claude-typed-adhd.log
  clp "$log" '/au-i-have-adhd:i-have-adhd Reply with the number of the rule that caps list length, digits only.'
  expect "claude: typed /au-i-have-adhd:i-have-adhd works" '"result":"9[^0-9]' "$log"

  log=$work/claude-typed-unslop.log
  clp "$log" '/au-unslop:unslop Reply with the number of the rule about em dashes, digits only.'
  expect "claude: typed /au-unslop:unslop works" '"result":"13[^0-9]' "$log"

  touch "$claude_home/.adhd-unslop-always"
  log=$work/claude-always-on.log
  clp "$log" 'Reply with the single word OK.'
  sid=$(claude_session "$log")
  transcript=$(claude_transcript "$sid")
  [ -n "$transcript" ] && cp "$transcript" "$work/claude-always-on.transcript.jsonl"
  check "claude: always-on delivers one complete bundle at startup" inspect bundle claude "$transcript" "$bundle" exact

  log=$work/claude-resume.log
  clp "$log" --resume "$sid" 'Reply with the single word AGAIN.'
  check "claude: --resume continues the same session" same_claude_session "$log" "$sid" "$transcript" 'Reply with the single word AGAIN.'
  expect "claude: resume fires SessionStart with source resume" '"hook_name":"SessionStart:resume"' "$log"
  [ -n "$transcript" ] && cp "$transcript" "$work/claude-resume.transcript.jsonl"
  check "claude: resumed transcript holds exactly one copy of each chunk" inspect bundle claude "$transcript" "$bundle" exact

  # Always-on through compaction: /compact in the same process.
  log=$work/claude-compact-always-on.log
  clturns "$log" 'Reply with the single word OK.' '/compact'
  transcript=$(claude_transcript "$(claude_session "$log")")
  [ -n "$transcript" ] && cp "$transcript" "$work/claude-compact-always-on.transcript.jsonl"
  expect "claude: /compact fires SessionStart with source compact" '"hook_name":"SessionStart:compact"' "$log"
  check "claude: after /compact, the context holds exactly one complete bundle" \
    inspect bundle claude "$transcript" "$bundle" exact after-compact
}

run_codex() {
  setup_source
  new_codex_home codex
  local log=$work/codex-install.log sid rollout bundle version root final
  cxc plugin marketplace add "${codex_source[@]}" >"$log" 2>&1
  cxc plugin add adhd-unslop@adhd-unslop >>"$log" 2>&1
  codex_plugins "$work/codex-plugins-1.txt"
  check "codex: installing adhd-unslop installs only adhd-unslop" only_plugins "$work/codex-plugins-1.txt" adhd-unslop@adhd-unslop
  check "codex: adhd-unslop has the expected version" has_plugin "$work/codex-plugins-1.txt" adhd-unslop@adhd-unslop "$(want_version adhd-unslop)"
  check "codex: plugin cache holds only adhd-unslop" only_entries "$codex_home/.codex/plugins/cache/adhd-unslop" adhd-unslop
  version=$(awk '$1 == "adhd-unslop@adhd-unslop" { print $2 }' "$work/codex-plugins-1.txt")
  root=$codex_home/.codex/plugins/cache/adhd-unslop/adhd-unslop/$version
  bundle=$(want_bundle "$root")
  final=$(want_final_line "$root")
  echo "      bundle id: ${bundle:-unknown}; final check line: ${final:-unknown}"

  # Always-on is off: no flag file, and the hooks are not trusted yet.
  log=$work/codex-invoke.log
  model_step 'codex: $adhd-unslop:adhd-unslop' || return
  cxe "$log" -o "$work/codex-invoke.txt" '$adhd-unslop:adhd-unslop Reply with the single word READY.'
  sid=$(codex_session "$log")
  rollout=$(codex_rollout "$sid")
  [ -n "$rollout" ] && cp "$rollout" "$work/codex-invoke.rollout.jsonl"
  expect "codex: \$adhd-unslop:adhd-unslop answers" 'READY' "$work/codex-invoke.txt"
  check "codex: always-on off injects no chunk" inspect bundle codex "$rollout" "$bundle" none
  check "codex: skill text arrives with both upstream texts and the final check line" \
    inspect skill-arrived codex "$rollout" "$root/skills/adhd-unslop/SKILL.md" "$final"
  check "codex: skill body arrives whole, not cut" \
    inspect skill-arrived codex "$rollout" "$root/skills/adhd-unslop/SKILL.md" "$final" whole

  # The clean case: only adhd-unslop is installed.
  log=$work/codex-unprompted.log
  model_step 'codex: unprompted question' || return
  cxe "$log" -o "$work/codex-unprompted.txt" 'What is 17 times 3? Digits only.'
  rollout=$(codex_rollout "$(codex_session "$log")")
  expect "codex: unprompted question answers" '^51' "$work/codex-unprompted.txt"
  refuse "codex: unprompted question reads no skill file" 'SKILL\.md' "$log"
  refuse "codex: unprompted question injects no plugin skill" '<name>(adhd-unslop|au-i-have-adhd|au-unslop):' "$rollout"

  log=$work/codex-install.log
  cxc plugin add au-i-have-adhd@adhd-unslop >>"$log" 2>&1
  cxc plugin add au-unslop@adhd-unslop >>"$log" 2>&1
  codex_plugins "$work/codex-plugins-2.txt"
  check "codex: au-i-have-adhd installs by name" has_plugin "$work/codex-plugins-2.txt" au-i-have-adhd@adhd-unslop "$(want_version au-i-have-adhd)"
  check "codex: au-unslop installs by name" has_plugin "$work/codex-plugins-2.txt" au-unslop@adhd-unslop "$(want_version au-unslop)"

  log=$work/codex-typed-adhd.log
  model_step 'codex: typed $au-i-have-adhd:i-have-adhd' || return
  cxe "$log" -o "$work/codex-typed-adhd.txt" '$au-i-have-adhd:i-have-adhd Reply with the number of the rule that caps list length, digits only.'
  expect "codex: typed \$au-i-have-adhd:i-have-adhd works" '^9([^0-9]|$)' "$work/codex-typed-adhd.txt"

  log=$work/codex-typed-unslop.log
  model_step 'codex: typed $au-unslop:unslop' || return
  cxe "$log" -o "$work/codex-typed-unslop.txt" '$au-unslop:unslop Reply with the number of the rule about em dashes, digits only.'
  expect "codex: typed \$au-unslop:unslop works" '^13([^0-9]|$)' "$work/codex-typed-unslop.txt"

  # With the mirrors installed. au-unslop keeps upstream's model-invocable
  # "Must always apply" skill on purpose, so its auto-load is INFO.
  log=$work/codex-unprompted-mirrors.log
  model_step 'codex: unprompted question with the mirrors' || return
  cxe "$log" -o "$work/codex-unprompted-mirrors.txt" 'What is 17 times 3? Digits only.'
  expect "codex: unprompted question with the mirrors answers" '^51' "$work/codex-unprompted-mirrors.txt"
  refuse "codex: with the mirrors, the unprompted question loads no adhd-unslop or au-i-have-adhd skill" \
    'cache/adhd-unslop/(adhd-unslop|au-i-have-adhd)/[^ ]*SKILL\.md' "$log"
  info "codex: with the mirrors, the unprompted question auto-loads au-unslop:unslop" \
    grep -Eo 'au-unslop/[^ ]*/SKILL\.md' "$log"

  touch "$codex_home/.codex/.adhd-unslop-always"
  log=$work/codex-always-on.log
  model_step 'codex: always-on startup' || return
  cxe "$log" --dangerously-bypass-hook-trust -o "$work/codex-always-on.txt" 'Reply with the single word OK.'
  sid=$(codex_session "$log")
  rollout=$(codex_rollout "$sid")
  [ -n "$rollout" ] && cp "$rollout" "$work/codex-always-on.rollout.jsonl"
  check "codex: always-on delivers one complete bundle at startup" inspect bundle codex "$rollout" "$bundle" exact

  log=$work/codex-resume.log
  model_step 'codex: exec resume' || return
  cxe "$log" --dangerously-bypass-hook-trust resume --last 'Reply with the single word AGAIN.'
  check "codex: exec resume --last continues the same session" same_codex_session "$log" "$sid" "$rollout" 'Reply with the single word AGAIN.'
  [ -n "$rollout" ] && cp "$rollout" "$work/codex-resume.rollout.jsonl"
  check "codex: resumed rollout holds at least one copy of each chunk" inspect bundle codex "$rollout" "$bundle" atleast

  # Always-on through compaction. codex exec cannot compact on request, so
  # app-server runs a turn, thread/compact/start (what the TUI's /compact
  # sends), and one more turn, which fires the queued compact source.
  # App-server has no bypass flag, so the hooks need recorded trust.
  local rc out
  codex_hooks trust adhd-unslop@adhd-unslop >>"$work/codex-install.log" 2>&1
  log=$work/codex-compact.log
  model_step 'codex: app-server compaction' || return
  out=$(cx_env env CODEX_MODEL="$codex_model" CODEX_EFFORT="$codex_effort" node "$here/codex-thread.mjs" "$codex_bin" "$cwd" "$log" \
    'turn:Reply with the single word OK.' compact 'turn:Reply with the single word AGAIN.' 2>&1)
  rc=$?
  printf '%s\n' "$out" >"$work/codex-compact.out"
  rollout=$(sed -n 's/^rollout //p' "$work/codex-compact.out")
  [ -n "$rollout" ] || rollout=$(codex_rollout "$(sed -n 's/^thread //p' "$work/codex-compact.out")")
  [ -n "$rollout" ] && cp "$rollout" "$work/codex-compact.rollout.jsonl"
  check "codex: app-server runs a turn, a compaction, and another turn" exit_ok "$rc" "$work/codex-compact.out"
  check "codex: after thread compaction, the context holds exactly one complete bundle" \
    inspect bundle codex "$rollout" "$bundle" exact after-compact
}

# A local git marketplace whose main branch starts at 0.2.2 and moves to the
# tree under test. Both runtimes reset main to 0.2.2 before they install.
setup_migrate() {
  local src=$work/migrate/src srv=$work/migrate/srv next=$work/migrate/next port
  mkdir -p "$src" "$srv" "$next"
  git -C "$repo" archive "$migrate_from" | tar xf - -C "$src" || return 1
  git -c init.defaultBranch=main init -q "$src"
  commit_all "$src" "adhd-unslop 0.2.2 ($migrate_from)"
  old_commit=$(git -C "$src" rev-parse HEAD)
  if [ -n "${E2E_REPO:-}" ]; then
    git clone -q --depth 1 --branch "${E2E_REF:-main}" "https://github.com/$E2E_REPO.git" "$work/migrate/gh" || return 1
    copy_tree "$work/migrate/gh" "$next"
  else
    copy_tree "$repo" "$next"
  fi
  git -C "$src" rm -rqf .
  (cd "$next" && tar cf - .) | (cd "$src" && tar xf -)
  commit_all "$src" "tree under test"
  new_commit=$(git -C "$src" rev-parse HEAD)
  git clone -q --bare "$src" "$srv/adhd-unslop.git"
  bare=$srv/adhd-unslop.git
  old_version=$(git -C "$src" show "$old_commit:plugins/adhd-unslop/.claude-plugin/plugin.json" | json_field version)
  new_version=$(git -C "$src" show "$new_commit:plugins/adhd-unslop/.claude-plugin/plugin.json" | json_field version)
  new_mirror_version=$(git -C "$src" show "$new_commit:plugins/au-unslop/.claude-plugin/plugin.json" | json_field version)
  new_bundle=$(git -C "$src" show "$new_commit:plugins/adhd-unslop/hooks/chunks/manifest.json" | bundle_from_manifest)

  node "$here/githttp.mjs" "$srv" >"$work/githttp.log" 2>&1 &
  server_pid=$!
  for _ in $(seq 1 100); do
    grep -q '^listening' "$work/githttp.log" 2>/dev/null && break
    sleep 0.1
  done
  port=$(awk '/^listening/ { print $2 }' "$work/githttp.log")
  [ -n "$port" ] || return 1
  migrate_url=http://127.0.0.1:$port/adhd-unslop.git
  echo "migrate marketplace: $migrate_url, $old_version at ${old_commit:0:7} then $new_version at ${new_commit:0:7} (bundle $new_bundle)"
}
move_main() { git --git-dir="$bare" update-ref refs/heads/main "$1"; }

migrate_claude() {
  move_main "$old_commit"
  new_claude_home claude-migrate
  local log=$work/migrate-claude.log sid transcript
  cl plugin marketplace add "$migrate_url" >"$log" 2>&1
  cl plugin install adhd-unslop@adhd-unslop >>"$log" 2>&1
  cl plugin install au-unslop@adhd-unslop >>"$log" 2>&1
  touch "$claude_home/.adhd-unslop-always"
  claude_plugins "$work/migrate-claude-before.txt"
  check "migrate claude: $old_version installs" has_plugin "$work/migrate-claude-before.txt" adhd-unslop@adhd-unslop "$old_version"
  check "migrate claude: $old_version pulls in au-i-have-adhd as a dependency" has_plugin "$work/migrate-claude-before.txt" au-i-have-adhd@adhd-unslop
  check "migrate claude: au-unslop is installed" has_plugin "$work/migrate-claude-before.txt" au-unslop@adhd-unslop

  move_main "$new_commit"
  {
    echo "== marketplace update"
    cl plugin marketplace update adhd-unslop
    echo "== plugin update"
    cl plugin update adhd-unslop@adhd-unslop
    echo "== prune"
    cl plugin prune -y
    echo "== update the kept mirror"
    cl plugin update au-unslop@adhd-unslop
  } >>"$log" 2>&1
  claude_plugins "$work/migrate-claude-after.txt"
  check "migrate claude: adhd-unslop updates to $new_version" has_plugin "$work/migrate-claude-after.txt" adhd-unslop@adhd-unslop "$new_version"
  check "migrate claude: prune removes au-i-have-adhd" lacks_plugin "$work/migrate-claude-after.txt" au-i-have-adhd@adhd-unslop
  check "migrate claude: au-unslop installed by name stays and updates to $new_mirror_version" has_plugin "$work/migrate-claude-after.txt" au-unslop@adhd-unslop "$new_mirror_version"

  log=$work/migrate-claude-session.log
  clp "$log" 'Reply with the single word OK.'
  sid=$(claude_session "$log")
  transcript=$(claude_transcript "$sid")
  [ -n "$transcript" ] && cp "$transcript" "$work/migrate-claude-session.transcript.jsonl"
  expect "migrate claude: new session answers" '"result":"OK' "$log"
  check "migrate claude: a new session gets one complete $new_version bundle" inspect bundle claude "$transcript" "$new_bundle" exact
}

migrate_codex() {
  move_main "$old_commit"
  new_codex_home codex-migrate
  local log=$work/migrate-codex.log sid rollout written
  cxc plugin marketplace add "$migrate_url" >"$log" 2>&1
  cxc plugin add adhd-unslop@adhd-unslop >>"$log" 2>&1
  cxc plugin add au-unslop@adhd-unslop >>"$log" 2>&1
  touch "$codex_home/.codex/.adhd-unslop-always"
  codex_plugins "$work/migrate-codex-before.txt"
  check "migrate codex: $old_version installs" has_plugin "$work/migrate-codex-before.txt" adhd-unslop@adhd-unslop "$old_version"
  check "migrate codex: au-unslop is installed" has_plugin "$work/migrate-codex-before.txt" au-unslop@adhd-unslop

  # Record trust for every 0.2.2 handler, as the /hooks review would.
  written=$(codex_hooks trust adhd-unslop@adhd-unslop 2>>"$log")
  echo "      trusted $written handlers"
  codex_hooks list >"$work/migrate-codex-hooks-before.jsonl" 2>>"$log"
  # shellcheck disable=SC2046
  check "migrate codex: hooks/list reports every $old_version handler trusted" \
    inspect hooks-trusted "$work/migrate-codex-hooks-before.jsonl" adhd-unslop@adhd-unslop "$old_version" $(keys_for adhd-unslop@adhd-unslop "${old_hook_keys[@]}")

  move_main "$new_commit"
  {
    echo "== marketplace upgrade"
    cxc plugin marketplace upgrade adhd-unslop
    echo "== plugin add"
    cxc plugin add adhd-unslop@adhd-unslop
  } >>"$log" 2>&1
  codex_plugins "$work/migrate-codex-after.txt"
  check "migrate codex: adhd-unslop updates to $new_version" has_plugin "$work/migrate-codex-after.txt" adhd-unslop@adhd-unslop "$new_version"
  check "migrate codex: au-unslop stays installed" has_plugin "$work/migrate-codex-after.txt" au-unslop@adhd-unslop
  codex_hooks list >"$work/migrate-codex-hooks-after.jsonl" 2>>"$log"
  # shellcheck disable=SC2046
  check "migrate codex: the three chunk handlers stay trusted with no review" \
    inspect hooks-trusted "$work/migrate-codex-hooks-after.jsonl" adhd-unslop@adhd-unslop "$new_version" $(keys_for adhd-unslop@adhd-unslop "${new_hook_keys[@]}")

  # No --dangerously-bypass-hook-trust: only the recorded trust lets the hooks run.
  log=$work/migrate-codex-session.log
  model_step 'migrate codex: new session' || return
  cxe "$log" -o "$work/migrate-codex-session.txt" 'Reply with the single word OK.'
  sid=$(codex_session "$log")
  rollout=$(codex_rollout "$sid")
  [ -n "$rollout" ] && cp "$rollout" "$work/migrate-codex-session.rollout.jsonl"
  expect "migrate codex: new session answers" 'OK' "$work/migrate-codex-session.txt"
  check "migrate codex: exec without the bypass flag gets one complete $new_version bundle" inspect bundle codex "$rollout" "$new_bundle" exact
}

run_migrate() {
  if ! setup_migrate; then
    result "migrate: local git marketplace starts" no
    echo "      see $work/githttp.log"
    return
  fi
  migrate_claude
  migrate_codex
}

case $only in
  all) run_claude; run_codex; codex_usage; run_migrate; codex_usage ;;
  claude) run_claude ;;
  codex) run_codex; codex_usage ;;
  migrate) run_migrate; codex_usage ;;
esac

echo "$pass passed, $fail failed${codex_skipped:+, Codex steps skipped at the usage limit}"
[ "$fail" -eq 0 ] || exit 1
[ -z "$codex_skipped" ] || exit 3
