# Decisions

Each entry records what was decided, why, the evidence, and when to revisit
it. Evidence names the CLI versions tested, because plugin behavior changes
between releases. Re-test before relying on an entry after an upgrade.

Tested versions unless an entry says otherwise: Claude Code 2.1.283,
Codex CLI 0.154.0, and the `openai/codex` main branch source as of
2026-09-26.

History: `PLAN.md` holds the v0.1.0 design and its five Codex review
rounds (`round-*`). `RESTRUCTURE.md` holds the 2026-09-26 split into
several plugins, with every test run. This file supersedes both where
they disagree.

## Behavior

### D1. Tie-breaker by surface

On a conflict, i-have-adhd wins in a direct reply to the user and unslop
wins in all other writing. Rules that do not conflict apply everywhere.

- Why: the user fixed this requirement on 2026-09-12. Replies need the ADHD
  shape. Files, commits, and PR text need unslop's prose rules.
- Where: `src/adhd-unslop/overlay/10-precedence.md`, with the outcome
  table for each known interaction.

### D2. Upstream text stays verbatim

The overlay adds scope, precedence, lifecycle, and a final check. It never
rewrites either upstream skill. Vendored copies change only frontmatter.

- Why: upstream updates stay mechanical. An earlier hand-merged attempt,
  `unslop-final`, rewrote ADHD's examples and lost the reply shape.
- Enforced by: `tests/build.test.mjs`, which compares bodies byte for byte.

### D3. Citations by number are the contract with upstream

The overlay cites upstream items as "ADHD rule N", "ADHD exception N",
"ADHD check N", "unslop rule N", and "unslop process N". `sync.mjs`
refuses an upstream change that removes a cited item.

- Why: a removed item makes the overlay point at nothing, and nobody
  notices.
- Evidence: on 2026-09-26 upstream unslop removed process step 3, the
  self-audit. The final check cited "process 1 to 3". The original gate
  checked only rules and let the change through. The gate now covers all
  five labels, and the final check cites "unslop process 1 and 2".
- Where: `CITATION_KINDS` in `tools/sync.mjs`.

## Packaging

### D4. One marketplace, one plugin per skill

The repo is a Claude Code and Codex marketplace. `au-i-have-adhd` and
`au-unslop` are vendored plugins. `adhd-unslop` holds the overlay and loads
the other two.

- Why: the user wants other plugins, starting with a planned
  `presentation`, to reuse i-have-adhd without copying it.
- This reverses `PLAN.md`, which rejected separately loaded skills for
  token cost. The cost is real. Explicit invocation now reads three files,
  and the total context is the same or larger. The composed `SKILL.md`
  went from about 22,000 to about 10,000 characters.
- Rejected: one plugin with three skills, which works in both runtimes but
  cannot be a dependency of another plugin. Also rejected: copying
  i-have-adhd into each consuming plugin's `references/`, which duplicates
  it per consumer.

### D5. Vendor into our marketplace, never depend on a third party

The upstream text lives in `upstream/`, pinned by commit and sha256 in
`tools/upstream.json`, and ships in our own `au-` plugins.

- Why: a third-party marketplace needs its own install step, and we cannot
  validate what it ships.
- Rejected: `git-subdir` sources pointing at the upstream repos. The
  i-have-adhd repo root is a whole plugin with its own always-on hook, and
  `plugins/pstack` holds more than 40 skills. We would ship their hooks and
  skills, and lose the pin and citation checks.

### D6. Vendored plugins carry the `au-` prefix

Plugin names are `au-i-have-adhd` and `au-unslop`. Skill names stay
`i-have-adhd` and `unslop`.

- Why: a skill's name is `plugin:skill`, with no marketplace in it. A user
  with the upstream i-have-adhd plugin installed would have two skills
  named `i-have-adhd:i-have-adhd`.
- Evidence: Claude Code uses whichever same-name plugin was installed
  first, tested in both orders, 3 of 3 runs each, typed invocation
  included. If the upstream copy wins, its `disable-model-invocation:
  true` makes the Skill tool refuse it and adhd-unslop runs without the
  ADHD rules. In Codex a typed `$dep:dep` found both copies and reported
  the clash.
- The user chose `au-` "for now".

### D7. Vendored skills are invocable by the user and the model

The build drops `disable-model-invocation` and sets
`allow_implicit_invocation: true`. A narrow description keeps the model
from picking them on its own.

- Why: the user wants a typed invocation honored. Another skill must also
  be able to load them.
- Evidence: `disable-model-invocation: true` makes the Claude Code Skill
  tool refuse the load. `user-invocable: false` hides a skill from the
  slash menu and still lets the Skill tool load it. The user rejected it
  because it blocks typed invocation. In Codex,
  `allow_implicit_invocation: false` removes the skill from the model's
  skill list, so the model has no path to read. A narrow description
  kept both runtimes from loading the skill for an unrelated question, 3 of
  3 runs each, plus the e2e checks.

### D8. The composed skill runs only when asked

`adhd-unslop` keeps `disable-model-invocation: true` and
`allow_implicit_invocation: false`. It runs on explicit invocation or
through the always-on hook.

### D9. How adhd-unslop loads the vendored skills

Claude Code calls the Skill tool with `au-i-have-adhd:i-have-adhd` and
`au-unslop:unslop`. Codex reads the `SKILL.md` path its skill list gives
and must not search the disk. The step is skipped when the always-on hook
already delivered the texts.

- Why: Codex injects only mentions the user types. A `$name` inside a
  skill is plain text, but the model follows it and reads the listed path.
- Evidence: without the "do not search" line, the Codex model ran `rg`
  over the filesystem and read stale copies of an uninstalled plugin.
  That happened twice and produced false passes.
- Where: `src/adhd-unslop/overlay/05-load.md`.

### D10. `plugins/` holds only shipped files

Hand-written sources live in `src/` and `upstream/`. Marketplace entries
point at `./plugins/<name>`.

- Why: with `"source": "./"`, Codex copied the whole repo, including
  `.git`, `design/`, and `tests/`, into its plugin cache.
- Codex install copies only the plugin's own directory and skips symlinks,
  so plugins cannot share files through `../` or links.

### D11. One config file for plugins

`tools/plugins.json` lists every plugin with its version, kind,
dependencies, and descriptions. `tools/build.mjs` generates both
marketplace files and every manifest from it.

- Why: two runtimes times three plugins is eight manifest files that must
  agree. Generation plus `build.mjs --check` in CI keeps them in step.

## Hooks

### D12. The always-on hook embeds both texts, in three chunks

The hook does not load the vendored plugins. It prints the overlay and both
upstream bodies from files inside `adhd-unslop`, split across three
handlers.

- Why embedded: a hook cannot count on a sibling plugin. Codex has no
  dependencies, and the sibling's version directory is unknown.
- Why chunked: Claude Code caps each hook value at 10,000 characters, and
  the text is about 21,500. Codex caps a handler at about 2,500 tokens by
  default, so each handler sets `additionalContextLimit: 5000`.
- Each chunk carries a bundle id, the first 12 hex characters of the text's
  sha256, and tells the model to apply the bundle only once all three
  chunks arrive. Handlers run concurrently, and any one can fail or be
  untrusted.

### D13. Only adhd-unslop has an always-on hook

A plugin that reuses `au-i-have-adhd` must not add its own always-on hook,
or check the adhd-unslop flag and skip.

- Why: two hooks would inject the ADHD rules twice, possibly from different
  pins.

### D14. Always-on is opt-in by flag file

Either `~/.claude/.adhd-unslop-always` or `~/.codex/.adhd-unslop-always`,
or the same name under `CLAUDE_CONFIG_DIR` or `CODEX_HOME`, turns it on in
both runtimes. Without a flag the hook prints nothing. A broken install
prints one JSON `systemMessage` and no context. The hook never blocks
session start.

## Dependencies

### D15. Claude Code dependencies, Codex warning

`adhd-unslop` declares `"dependencies": ["au-i-have-adhd", "au-unslop"]`
as bare names. Claude Code installs them with it. Codex ignores the field,
so a SessionStart hook warns when a sibling is missing and prints the
install command. It never installs.

- Why warn only: the user decided on 2026-09-26. A hook that runs `codex
  plugin add` changes the user's config without asking. It worked in
  testing, including in the same session.
- Why bare names: all plugins come from one marketplace checkout, so
  versions always match, and bare names need no `<plugin>--v<version>` git
  tags.
- The warning goes out as `systemMessage` for the TUIs and as
  `additionalContext` for the model, because `codex exec` does not print
  hook system messages.
- The hook finds siblings at `<root>/../../<name>`, the cache layout, or
  `<root>/../<name>`, a checkout of this repo.

### D16. Updates do not cascade

Users update each plugin. Installs from before 0.2.0 must install both
`au-` plugins by name.

- Evidence: `claude plugin update` of a plugin leaves its dependencies at
  their old versions. Updating 0.1.0 to 0.2.0 did not install the newly
  declared dependencies, and `claude plugin list` showed an error.
  Re-running `claude plugin install adhd-unslop` added one missing
  dependency per run. In Codex, running `codex plugin add` again installs
  the newer version.

## Versions and upstream updates

### D17. Per-plugin versions, raised by the bump

Each plugin has its own version in `tools/plugins.json`. A bump raises the
patch version of every plugin that ships the changed upstream text, once
per run. The vendored copy and `adhd-unslop`, whose hook embeds both texts,
both count.

- Why: installed copies update only when the version changes.
- A hand edit that changes shipped text needs a hand version bump too.

### D18. Daily bump PR, issue on failure

`.github/workflows/upstream-bump.yml` runs `sync.mjs --latest` daily. It
opens or updates one PR on branch `upstream-bump`, or opens an issue when a
bump fails its checks. A person reviews each PR for new conflicts before
merging.

- Why a PR: an upstream change can add a conflict the outcome table does
  not cover.
- It uses the default `GITHUB_TOKEN`, with no extra secret. A PR opened
  with that token does not trigger other workflows, so the job starts the
  verify workflow with `gh workflow run --ref upstream-bump`. That run
  reports as a check on the PR's head commit, verified on PR #2. The
  PR's own `pull_request` run shows `action_required` until someone
  approves it in the Actions tab.
- Needs the repository setting "Allow GitHub Actions to create and approve
  pull requests". It was turned on 2026-09-26.
- `--latest` asks for the newest commit that touched each pinned file, and
  skips an upstream when that commit changed none of them.

### D19. The marketplace name stays `adhd-unslop` for now

- Why: renaming changes every install id, such as `adhd-unslop@adhd-unslop`.
  Revisit when `presentation` or another unrelated plugin arrives.

## Codex specifics

### D20. Invoke Codex skills by full name, never symlink

Users type `$adhd-unslop:adhd-unslop`. The README no longer suggests a
`~/.agents/skills` symlink.

- Why: Codex names a symlinked skill after the plugin that contains its
  target, so a link into this repo became a second
  `adhd-unslop:adhd-unslop`. With two skills of one name, Codex injects
  neither. That caused the 2026-09-12 finding that plugin skills were
  missing from `codex exec`. The finding was wrong: plugin skills do load.
  A bare `$adhd-unslop` does not match a plugin skill.

## Testing

### D21. End-to-end tests run the real CLIs in throwaway homes

`tests/e2e/run.sh` installs the marketplace into temporary Claude Code
and Codex homes. By default it uses a copy of the working tree. With
`E2E_REPO` and `E2E_REF` it installs from GitHub.

- Why the GitHub mode: a local-directory Claude Code marketplace loads
  plugins in place instead of copying them to the cache, so only a git
  source tests the real paths. Claude Code takes `owner/repo#ref`. Codex
  takes `owner/repo --ref <ref>`. Claude Code rejects `file://` URLs.
- The model's working directory sits away from the marketplace copy, and
  the homes are deleted on exit. Stray copies on disk caused two false
  passes.
- Codex needs a copy of `~/.codex/auth.json` in the throwaway home, deleted
  on exit, and `</dev/null` on every `codex exec`.
- It needs signed-in CLIs, so CI runs only the unit tests. Run it before
  merging a change to skills, hooks, or manifests.

## Platform facts

Verified on the versions at the top of this file. Re-check after upgrades.

| Fact | Claude Code | Codex |
| --- | --- | --- |
| Skill name | `plugin:skill` | `plugin:skill`. A bare name does not match a plugin skill. |
| Plugin dependencies | `dependencies` in `plugin.json`, auto-installed. `claude plugin prune` removes orphans. | None. `openai.yaml` `dependencies.tools` acts only on `mcp` entries. |
| `INSTALLED_BY_DEFAULT` policy | Not applicable | Installs nothing from a local or git marketplace. The source uses it for admin-assigned remote plugins. |
| Enabling a plugin in config without installing it | Not tested | `[plugins."x@mkt"] enabled = true` does not load it |
| Plugin cache | `~/.claude/plugins/cache/<mkt>/<plugin>/<version>/` | `$CODEX_HOME/plugins/cache/<mkt>/<plugin>/<version>/` |
| Marketplace copy | A local path loads plugins in place | A git marketplace is cloned in full to `$CODEX_HOME/.tmp/marketplaces/<name>/` |
| Hook environment | `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA` | `PLUGIN_ROOT` and `CLAUDE_PLUGIN_ROOT`, `PLUGIN_DATA` and `CLAUDE_PLUGIN_DATA` |
| Hook output cap | 10,000 characters per value | About 2,500 tokens per handler, raised by `additionalContextLimit` |
| Hook trust | None needed | Trust in `/hooks`, keyed by plugin id and handler position and checked against a hash of the handler. It survived 0.2.0 to 0.2.1 with `hooks.json` unchanged. |
| Hook `systemMessage` | Shown to the user | Shown in the TUI, not printed by `codex exec` |
| Variables in `SKILL.md` | `${CLAUDE_SKILL_DIR}`, `${CLAUDE_PROJECT_DIR}`, `${CLAUDE_SESSION_ID}`, `${CLAUDE_EFFORT}` | The model resolves relative paths against the skill's directory |
| Skill flags | `disable-model-invocation: true` blocks the Skill tool. `user-invocable: false` hides it from the slash menu only. | `allow_implicit_invocation: false` hides the skill and its path from the model. A typed mention still works. |
| Useful commands | `claude plugin validate <path>`, `claude plugin tag`, `claude plugin marketplace update <name>` | `codex plugin marketplace upgrade <name>`, `codex debug prompt-input`, `codex exec --dangerously-bypass-hook-trust` for throwaway homes |

Codex CLI habits:

- `codex exec` from a non-TTY shell waits on stdin forever. Redirect
  `</dev/null`.
- `codex review --base <branch>` rejects a custom prompt and `-m`. Use
  `codex exec` with `-c` or `-m`.
