# Working in this repo

This repo is a Claude Code and Codex plugin marketplace. `adhd-unslop`
combines two vendored skills, `au-i-have-adhd` and `au-unslop`, with one
tie-breaker. Read `design/DECISIONS.md` before changing structure. It
records why each part is the way it is and the platform behavior already
verified, so nothing needs researching again.

There is no `CLAUDE.md`. Claude Code reads `AGENTS.md` when no `CLAUDE.md`
exists, so this one file serves both CLIs. Adding a `CLAUDE.md` would hide
this file from Claude Code.

## Edit sources, never generated files

- Edit `src/adhd-unslop/overlay/*.md`, `tools/plugins.json`,
  `tools/upstream.json`, and the hand-written files in
  `plugins/adhd-unslop/hooks/`, which are `hooks.json` and the `.mjs`
  files.
- Everything else under `plugins/`, and both marketplace files, is
  generated. Run `node tools/build.mjs`, then `node --test tests/*.test.mjs`.
  CI fails on stale output.
- Change upstream text only through `node tools/sync.mjs --bump <name>
  <commit>` or the daily workflow. Never edit `upstream/` or a vendored
  `SKILL.md` body by hand.

## Rules that are easy to break

- Raise the version in `tools/plugins.json` for every plugin whose shipped
  text changes. Installed copies update only on a version change. An
  overlay edit changes `adhd-unslop`.
- Cite upstream items only as "ADHD rule N", "ADHD exception N", "ADHD
  check N", "unslop rule N", or "unslop process N". `sync.mjs` checks these
  labels against upstream. Other wording escapes the check.
- Keep overlay prose to unslop's rules. `tests/overlay.test.mjs` checks for
  em dashes, curly quotes, title-case headings, and rule 7 words.
- Hooks must exit 0 on every path and never block session start.
- A new plugin that uses i-have-adhd lists `"dependencies":
  ["au-i-have-adhd"]` in `tools/plugins.json` and loads
  `au-i-have-adhd:i-have-adhd` the way `05-load.md` does. It gets no
  always-on hook of its own, because two hooks would inject the rules
  twice.
- Codex skill names are `$plugin:skill`, such as
  `$adhd-unslop:adhd-unslop`. A bare name does not match. Never suggest a
  `~/.agents/skills` symlink, because it creates a duplicate name that
  Codex refuses to load.

## Testing with the real CLIs

- Run `tests/e2e/run.sh` before merging a change to skills, hooks, or
  manifests. `E2E_REPO=<owner/repo> E2E_REF=<branch>` installs from GitHub,
  which tests the real cache paths.
- For any ad hoc test, use a throwaway home: `CLAUDE_CONFIG_DIR=<dir>` for
  Claude Code, and `HOME=<dir> CODEX_HOME=<dir>/.codex` for Codex, with a
  copy of `~/.codex/auth.json` that you delete afterwards.
- Run the model from a directory away from any marketplace copy. The Codex
  model searches the filesystem and will read stray plugin copies, which
  gives false passes.
- `codex exec` waits on stdin in a non-TTY shell. Always redirect
  `</dev/null`. `codex review` takes no custom prompt, so use `codex exec`.
- `--dangerously-bypass-hook-trust` is for throwaway homes only.

## Changes and releases

- Work on a branch and open a PR. The verify workflow runs unit tests and
  `build.mjs --check`.
- Review each `upstream-bump` PR for new conflicts between the two skills.
  Record any new conflict in the outcome table in
  `src/adhd-unslop/overlay/10-precedence.md`.
- After a merge, installed copies update per plugin. The README lists the
  commands for each runtime.
