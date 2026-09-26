# Working in this repo

This repo is a Claude Code and Codex plugin marketplace. `adhd-unslop`
combines the i-have-adhd and unslop skills with one tie-breaker and ships
everything it needs. `au-i-have-adhd` and `au-unslop` are optional pinned
mirrors of the two upstream skills. Read `design/DECISIONS.md` before
changing structure. It records why each part is the way it is and the
platform behavior already verified, so nothing needs researching again.

There is no `CLAUDE.md`. Claude Code reads `AGENTS.md` when no `CLAUDE.md`
exists, so this one file serves both CLIs. Adding a `CLAUDE.md` would hide
this file from Claude Code.

## Edit sources, never generated files

- Edit `src/`, `tools/plugins.json`, and `tools/upstream.json`. Every file
  under `plugins/`, and both marketplace files, is generated.
- Run `node tools/build.mjs`, then `node --test tests/*.test.mjs`. CI fails
  on a stale generated file and on any stray file under `plugins/`,
  `.claude-plugin/`, or `.agents/plugins/`. `node tools/build.mjs --prune`
  deletes strays.
- Change upstream text only through `node tools/sync.mjs --bump <name>
  <commit>` or the daily workflow. Never edit `upstream/` by hand.

## Rules that are easy to break

- Raise the version in `tools/plugins.json` for every plugin whose shipped
  files change. Installed copies update only on a version change, and the
  version gate in CI fails a pull request that skips it. An overlay edit
  changes `adhd-unslop`.
- Do not change the three chunk handlers in `src/adhd-unslop/hooks/hooks.json`.
  Codex hashes every handler field for hook trust, so any change sends every
  Codex user back to `/hooks`. `tests/hook.test.mjs` compares them with
  `tests/fixtures/trusted-session-start-group.json`. Put behavior changes in
  `always-on.mjs` or `lib.mjs` instead. If a handler must change, update the
  fixture on purpose and say so in the release notes.
- Cite upstream items only as "ADHD rule N", "ADHD exception N", "ADHD
  check N", "unslop rule N", or "unslop process N". `sync.mjs` checks these
  labels against upstream. Other wording escapes the check.
- Keep overlay prose to unslop's rules. `tests/overlay.test.mjs` checks for
  em dashes, curly quotes, title-case headings, and rule 7 words.
- Hooks must exit 0 on every path and never block session start.
- No plugin `dependencies`. A plugin that needs an upstream text embeds it
  with a `{{upstream <name>}}` line in its skill template and lists it in
  `upstreams` in `tools/plugins.json` (DECISIONS D4, D9). Never make a skill
  read rule text from a file: Claude Code prompts for the read and Codex
  often skips it.
- Only `adhd-unslop` has an always-on hook. A second one would inject the
  ADHD rules twice.
- Codex skill names are `$plugin:skill`, such as
  `$adhd-unslop:adhd-unslop`. A bare name does not match. Never suggest a
  `~/.agents/skills` symlink, because it creates a duplicate name that
  Codex refuses to load.

## Adding a plugin

1. Add an entry to `tools/plugins.json`: name, version, `"kind":
   "authored"`, category, descriptions, keywords, `codexInterface`, and
   `skills`, with `upstreams` for any upstream a skill embeds.
2. Write `src/<plugin>/skills/<skill>/SKILL.md`, or a `SKILL.md.tmpl` whose
   `{{include <path>}}` lines pull files from `src/<plugin>/` and whose
   `{{upstream <name>}}` lines embed pinned upstream text, plus
   `agents/openai.yaml` for its Codex policy.
3. Run the build and the tests, then `node tools/load-check.mjs`.

## Testing with the real CLIs

- `node tools/load-check.mjs` installs the marketplace into throwaway
  Claude Code and Codex homes with no keys and checks what loads. CI runs
  it with the versions pinned in `tools/cli-versions.json`, and daily
  against the latest releases.
- Run `tests/e2e/run.sh` before merging a change to skills, hooks, or
  manifests. It drives the models, so it needs signed-in CLIs.
  `tests/e2e/run.sh migrate` checks the upgrade from 0.2.2.
  `E2E_REPO=<owner/repo> E2E_REF=<branch>` installs from GitHub, which
  tests the real cache paths.
- For any ad hoc test, use a throwaway home: `CLAUDE_CONFIG_DIR=<dir>` for
  Claude Code, and `HOME=<dir> CODEX_HOME=<dir>/.codex` for Codex, with a
  copy of `~/.codex/auth.json` that you delete afterwards. Delete the whole
  Codex home when done: Codex writes the shell environment, API keys
  included, into `$CODEX_HOME/shell_snapshots/`.
- Run the model from a directory away from any marketplace copy. The Codex
  model searches the filesystem and will read stray plugin copies, which
  gives false passes.
- `codex exec` waits on stdin in a non-TTY shell. Always redirect
  `</dev/null`. `codex review` takes no custom prompt, so use `codex exec`.
- `--dangerously-bypass-hook-trust` is for throwaway homes only.

## Codex usage

Codex model runs bill to the user's ChatGPT plan, which has a 5-hour and a
weekly limit. Keep to these defaults unless the user says otherwise:

- Adversarial reviews: `design/run-codex.sh <round>`, which runs
  `gpt-5.6-terra` at `high` effort. Use `xhigh` only when the user asks.
  One xhigh round used up to 240,000 tokens.
- Tests and other scripted `codex exec` calls: `gpt-5.6-luna` at `low`
  effort. The e2e checks read what arrived in the rollout, so model quality
  barely matters. `tests/e2e/run.sh` takes `CODEX_MODEL` and `CODEX_EFFORT`.
- Keyless Codex steps, such as `marketplace add`, `plugin add`, and
  `app-server` `plugin/list`, `plugin/read`, and `hooks/list`, cost nothing.
- Before a model run, check `node tools/codex-usage.mjs --gate`. It reads
  the newest session log and exits 3 at 80% of either window.
  `design/run-codex.sh` and `tests/e2e/run.sh` run this check themselves,
  and both take `CODEX_USAGE_MAX` to change the 80. At 80% of the
  5-hour window, pause Codex model runs until the reset it prints and keep
  working on everything else. At 80% of the weekly window, stop and ask the
  user.
- Never switch Codex to another auth, such as `OPENAI_API_KEY`, without the
  user's yes. It bills a different account.

## Changes and releases

- Work on a branch and open a PR. `verify.yml` runs the unit tests,
  `build.mjs --check`, the version gate, the keyless load check, and
  workflow linting.
- For a design change, write the proposal under `design/` and run Codex
  adversarial review rounds with `design/run-codex.sh <N>`, which reads
  `design/round-N-prompt.md` and writes `round-N-codex.md`, until the
  verdict is CONSENSUS, up to 25 rounds. Review the implementation the same
  way before merging. Record the result in `design/DECISIONS.md`.
- Review each `upstream-bump` PR for new conflicts between the two skills.
  Record any new conflict in the outcome table in
  `src/adhd-unslop/overlay/10-precedence.md`.
- After a merge, installed copies update per plugin. The README lists the
  commands for each runtime.
