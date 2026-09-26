# Decisions

Each entry records what was decided, why, the evidence, and when to revisit
it. Evidence names the CLI versions tested, because plugin behavior changes
between releases. Re-test before relying on an entry after an upgrade.

Tested versions unless an entry says otherwise: Claude Code 2.1.283,
Codex CLI 0.154.0 and 0.157.1, and the `openai/codex` main branch source as
of 2026-09-26.

Entry numbers are stable ids. A retired entry keeps its number and says
what replaced it.

History:

- `PLAN.md` holds the v0.1.0 design and its five Codex review rounds
  (`round-1` to `round-5`).
- `RESTRUCTURE.md` holds the 0.2.0 split into several plugins.
- `STRUCTURE-v2.md` holds the 0.3.0 restructure, accepted after Codex
  review rounds 6 to 9. Its research and test runs are in `research/`,
  indexed by `research/00-synthesis.md`.
- This file supersedes all three where they disagree.

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
rewrites either upstream skill. The vendored mirrors ship the upstream
`SKILL.md` byte for byte, and `adhd-unslop` ships the upstream bodies with
only the frontmatter removed.

- Why: upstream updates stay mechanical. An earlier hand-merged attempt,
  `unslop-final`, rewrote ADHD's examples and lost the reply shape.
- Enforced by: `tests/build.test.mjs`, which compares the files byte for
  byte.

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

### D4. One marketplace; adhd-unslop is self-contained

The repo is a Claude Code and Codex marketplace with three plugins.
`adhd-unslop` ships everything it needs: a skill that embeds the overlay
and both upstream texts, the always-on hook, and a doctor skill. `au-i-have-adhd` and `au-unslop` are optional standalone mirrors.

- Why: in 0.2.x `adhd-unslop` depended on the two mirrors. That failed in
  practice (D16), Codex has no dependencies (D15), and no repo out of 25
  that ship for both runtimes uses plugin `dependencies`. Repos that share
  text between plugins copy it at build time and check the copies
  (`research/03`). The user's requirements still hold: the text comes only
  from our own pinned copies, and i-have-adhd stays available as its own
  plugin.
- Cost: the skill carries its own copy of each upstream text, generated
  from the same `upstream/` files as the mirrors and the hook chunks, and
  checked by `build.mjs --check`.
- A new plugin reuses an upstream by embedding it with a `{{upstream
  <name>}}` template line and listing it in `upstreams` in
  `tools/plugins.json` (D11).
- History: 0.2.0 chose dependencies over an earlier proposal to copy the
  texts. 0.3.0 reverses that, per `STRUCTURE-v2.md` P1.

### D5. Vendor into our marketplace, never depend on a third party

The upstream text lives in `upstream/`, pinned by commit and sha256 in
`tools/upstream.json`, and ships in our own plugins.

- Why: a third-party marketplace needs its own install step, and we cannot
  validate what it ships.
- We are the only repo of the seven that vendor third-party skills that
  pins each file by commit and hash (`research/04`).
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
  included. In Codex a typed `$dep:dep` found both copies and reported the
  clash. Two different plugin names with the same skill name, such as
  `a:shared` and `b:shared`, both list and both run by full name
  (`research/08` L6).
- The user chose `au-` "for now".

### D7. Vendored mirrors keep the upstream frontmatter

The mirrors ship the upstream `SKILL.md` unchanged. The build generates
`agents/openai.yaml` so Codex matches Claude Code: `allow_implicit_invocation:
false` when the upstream sets `disable-model-invocation: true`, `true`
otherwise. Neither upstream skill folder has its own `openai.yaml`.

- Result: i-have-adhd stays user-only and unslop stays model-invocable, as
  upstream ships them. Typed invocation works in both runtimes.
- History: 0.2.x rewrote the frontmatter so `adhd-unslop` could load the
  mirrors through the Skill tool. Nothing loads them now.

### D8. The composed skill runs only when asked

`adhd-unslop` keeps `disable-model-invocation: true` and
`allow_implicit_invocation: false`. It runs on explicit invocation or
through the always-on hook. The doctor skill has the same settings.

### D9. The adhd-unslop skill embeds the upstream texts

The skill's body, after a one-line generated comment, is the always-on
bundle byte for byte: the overlay sections, the i-have-adhd block, the
unslop block, and the final check. It reads no files.

- Why: a first 0.3.0 build had the skill read the texts from `references/`
  files next to it. Claude Code denied both reads in `-p` mode, because the
  files sit outside the working directory, and an interactive session would
  ask for permission each time. Codex skipped the reads in 7 of 8 runs with
  a short prompt (`research/11`). Rules that must always apply cannot
  depend on a permission rule or on the model choosing to read a file.
  `references/` suits optional detail. These texts are the rules.
- Rejected: `allowed-tools: Read` in the frontmatter. It lets Claude Code
  read without asking but pre-approves every Read while the skill is active,
  and does nothing for Codex.
- Embedding contract: a `{{upstream <name>}}` template line becomes the
  BEGIN line, the upstream body with its frontmatter removed and a final
  newline, and the END line. The hook chunks carry the same bytes.
- Size: about 21,800 bytes. Codex does not cut it. Codex cuts at 8,000 bytes
  only for a plugin with a root `plugin.json` that uses the agent-plugins
  `$schema` (`research/07` C1). The end-to-end check confirms the whole
  skill arrives in both runtimes.
- A user who invokes the skill while always-on already delivered the bundle
  gets a second, identical copy of the rules. It adds no rules, but invoking
  re-enables both modes, as the lifecycle rules say, so a mode the user had
  stopped comes back. A hook reload keeps the known mode states.
- Compaction limit: without always-on, Claude Code 2.1.283 re-attaches an
  invoked skill after `/compact` cut to 20,000 characters, which drops the
  last unslop rules and the final check, and after `--resume` then
  `/compact` it re-attaches nothing (`research/11`). The always-on hook
  injects the whole bundle again on `compact`, so the README points long,
  compacting sessions at always-on. Shrinking the skill would fix only the
  first case and would cut settled overlay text. A unit test reports the
  size against the 20,000-character budget.
- History: 0.2.x loaded the mirrors through the Skill tool. 0.1.0 embedded
  the texts, as 0.3.0 does again.

### D10. Every file under plugins/ is generated

Hand-written sources live in `src/<plugin>/` and `upstream/`. Marketplace
entries point at `./plugins/<name>`. `build.mjs --check` fails on a stale or
missing file, and on any file under `plugins/`, `.claude-plugin/`, or
`.agents/plugins/` that the build does not write. Only `build.mjs --prune`
deletes such files.

- Why generated: with `"source": "./"`, Codex copied the whole repo,
  including `.git`, `design/`, and `tests/`, into its plugin cache. Codex
  install copies only the plugin's own directory and skips symlinks, so
  plugins cannot share files through `../` or links.
- Why the stray check: before 0.3.0 a leftover file under `plugins/`
  shipped and passed CI (`research/04`, `research/05`). claude-octopus and
  gstack check for strays too.
- Why no automatic delete: a normal build must not remove files a person
  put there by mistake. The review in round 6 required an explicit flag.

### D11. One config file for plugins

`tools/plugins.json` lists every plugin: name, version, kind (`vendored`
or `authored`), descriptions, keywords, the Codex `interface`, and for an
authored plugin its skills, each skill's embedded `upstreams`, and the
always-on chunk list. `tools/build.mjs` generates both marketplace files, every
manifest, each plugin's `README.md`, `NOTICE.md`, and `LICENSES/`, and all
skill files from it.

- An authored plugin's skill folders in `src/<plugin>/skills/` are copied.
  A `SKILL.md.tmpl` is rendered. Its syntax is two line directives:
  `{{include <path under src/<plugin>/>}}` inserts a file, and
  `{{upstream <name>}}` inserts a pinned upstream block. The build fails
  when a template's upstream directives and its `upstreams` list disagree.
  gstack renders skills from templates the same way.
- Adding a plugin: add its entry, write `src/<name>/skills/<skill>/`, embed
  any upstream with `{{upstream <name>}}`, list it in `upstreams`, build,
  and test. The steps are in `AGENTS.md`.

### D22. Manifests follow the documented minimum

- Both native manifests stay for each plugin. Codex falls back to the
  Claude files and still loads skills and hooks, but loses the `interface`
  text, and `interface` in a Claude manifest fails `claude plugin validate
  --strict` (`research/02`). hashicorp uses the same two-file layout.
- Claude Code marketplace entries carry no `version`. The docs say not to
  set it in both places, and install, listing, and update all use
  `plugin.json` (`research/08` L3).
- The Codex marketplace keeps `policy.products: ["CODEX"]`. Dropping it
  would publish the plugins to ChatGPT and Atlas too.
- The Codex manifest names `"hooks": "./hooks/hooks.json"` when the plugin
  ships hooks, as every repo that ships Codex plugin hooks does. Trust
  survives the explicit path (`research/07` C3).
- Claude Code manifests carry `homepage`, `repository`, and `keywords`.
- No root `plugin.json` with the agent-plugins `$schema`. Codex would read
  it first and cut skills at 8,000 bytes.

## Hooks

### D12. The always-on hook embeds both texts, in three chunks

The hook prints the overlay and both upstream bodies from files inside
`adhd-unslop`, split across three handlers.

- Why embedded: a hook cannot count on another plugin, and the always-on
  path must not depend on the model reading files first.
- Why chunked: Claude Code saves a hook value over 10,000 characters to a
  file and shows the model only a path and the first 2,000 characters
  (`research/08` L5). The cap is documented at
  code.claude.com/docs/en/hooks.md#json-output and cannot be raised. The
  text is about 21,500 characters. Codex allows 2,500 tokens per handler by
  default, counted as ceil(chars / 4), and cuts the middle of anything
  longer (`research/07` C6). Each handler sets `additionalContextLimit:
  5000`, because the built chunks with non-ASCII text were not tested
  against the default.
- Each chunk carries a bundle id, the first 12 hex characters of the text's
  sha256. The header states that a bundle is complete only when all three
  chunks with that id are present, each with its END line. Claude Code
  delivers the chunks in the order the handlers finish, and Codex in the
  declared order (`research/09`).
- The header is worded as statements of fact. The Claude Code docs warn
  that imperative hook text can trigger prompt-injection defenses.
- We are the only repo of 25 that chunks. The others inject under about
  8,000 characters from one handler (`research/01`).

### D13. Only adhd-unslop has an always-on hook

A plugin that reuses i-have-adhd must not add its own always-on hook.

- Why: two hooks would inject the ADHD rules twice, possibly from different
  pins.

### D14. Always-on is opt-in

Either `~/.claude/.adhd-unslop-always` or `~/.codex/.adhd-unslop-always`,
or the same name under `CLAUDE_CONFIG_DIR` or `CODEX_HOME`, turns it on in
both runtimes. `ADHD_UNSLOP_ALWAYS` overrides the flags for one process:

- `0`, `false`, or `off`, in any case: off, even with a flag.
- `1`, `true`, or `on`: on, without a flag.
- Unset or empty: the flag files decide.
- Any other value counts as unset, and the doctor reports it.

Without opt-in the hook prints nothing. A broken install prints one JSON
`systemMessage` and no context. The hook never blocks session start.

- Why the switch: CI and scripted runs need a way off without deleting a
  user's flag file (planning-with-files issue #195, `research/01`).

### D23. The launcher decides what to do on resume

The matcher is `startup|resume|clear|compact`. On `resume` the launcher
prints nothing in Claude Code and injects in Codex. It tells them apart by
`PLUGIN_ROOT`, which Codex sets for plugin hooks and Claude Code never does
(`research/10`). When it cannot tell, it injects. It reads `source` from the
SessionStart payload on stdin with a one-second timeout, and injects when
stdin is missing or unreadable.

- Claude Code keeps the earlier injection in a resumed session, so a
  `resume` match added a second copy of about 24,000 characters on every
  resume (`research/08` L1). `/compact`, `/clear`, and auto-compaction each
  leave exactly one copy (`research/09`).
- Codex duplicates on resume too (`research/07` C4), but it can also lose
  the copy. Codex fires `compact` only when the next turn starts, so a user
  who compacts and quits before sending a message resumes with no copy
  (`research/09`). A duplicate costs tokens. A missing copy silently turns
  always-on off. Codex keeps injecting on resume.
- A forked Claude Code session sends `source: "fork"` and carries the
  parent's copy, so `fork` needs no match.
- The hook definitions did not change, so Codex trust recorded for 0.2.2
  stays valid (D24).
- Claude Code edge case: turning always-on on during a session and then
  resuming it gives no copy until the next startup, `/clear`, or
  compaction. The README says to start a new session.

### D24. The chunk handlers are frozen

The three chunk handlers keep the exact fields and positions users trusted
in 0.2.2. `tests/hook.test.mjs` compares them with
`tests/fixtures/trusted-session-start-group.json`.

- Why: Codex keys hook trust by plugin, hooks file path, event, group, and
  handler index, and checks a hash of every handler field. A version bump,
  an explicit `hooks` path, or a manifest move keeps trust. Renaming the
  hooks file or changing any handler field, including adding or removing
  `additionalContextLimit`, loses it (`research/07` C3).
- Behavior changes belong in the launcher script, whose content is not part
  of the hash. Removing the 0.2.x dependency group, which came after the
  chunk group, shifted nothing.
- To change a handler anyway, update the fixture on purpose and tell Codex
  users to review the hooks in `/hooks` once.

### D25. No output style, no per-session mode tracker, no subagent injection

- Output style: a plugin can force one with `force-for-plugin: true`, with
  no size cap and persistence through compaction (`research/08` L8). It
  overrides the user's own `outputStyle` whenever the plugin is enabled,
  which bypasses the opt-in flag. No repo of the 25 ships one, and Codex
  would still need the hook. Revisit if Claude Code adds an opt-in style
  that composes with the user's style.
- Mode tracker: caveman stores mode state per session so compaction cannot
  turn a mode back on. It needs a `UserPromptSubmit` hook on every prompt
  in both runtimes, with its own Codex trust entry, to fix a rare case that
  a repeated stop command also fixes.
- Subagent injection: `SubagentStart` would add the bundle to every
  subagent, with no stated need.

## Dependencies

### D15. Retired in 0.3.0: Claude Code dependencies and the Codex warning

0.2.x declared the mirrors as Claude Code `dependencies` and shipped a
SessionStart hook that warned Codex users about a missing mirror. D4
replaced both. What was learned still holds:

- Codex has no plugin dependencies. The manifest has no field, `openai.yaml`
  `dependencies.tools` acts only on `mcp` entries, and
  `INSTALLED_BY_DEFAULT` installs nothing from a local or git marketplace.
- A hook can run `codex plugin add` to install a missing plugin. The user
  chose not to, because it changes their config without asking.
- `codex exec` does not print a hook's `systemMessage`.

### D16. Updates do not cascade

Each plugin updates on its own. `claude plugin update` of a plugin leaves
its dependencies at their old versions. Updating 0.1.0 to 0.2.0 did not
install newly declared dependencies, and a repeated `claude plugin install`
added one missing dependency per run. In Codex, running `codex plugin add`
again installs the newer version.

Upgrade from 0.2.x to 0.3.0, as the README states:

- Claude Code: `claude plugin marketplace update adhd-unslop`, then
  `claude plugin update adhd-unslop@adhd-unslop`, then optionally `claude
  plugin prune` to remove the mirrors that 0.2.x installed as dependencies.
  A mirror the user installed by name stays.
- Codex: `codex plugin marketplace upgrade adhd-unslop`, then `codex plugin
  add adhd-unslop@adhd-unslop`. Hook trust carries over (D24). Remove a
  mirror with `codex plugin remove` only if it was installed for
  `adhd-unslop` alone.
- `tests/e2e/run.sh migrate` checks both paths from 0.2.2.

## Versions and upstream updates

### D17. Per-plugin versions, raised by the bump, enforced in CI

Each plugin has its own version in `tools/plugins.json`. `sync.mjs` raises
the patch version of every plugin that ships the changed upstream text,
once per run: its mirror, any plugin whose skills embed it, and any plugin
whose always-on chunks carry it. A future `presentation` plugin that embeds
i-have-adhd gets a new version whenever i-have-adhd changes.

- Why: installed copies update only when the version changes. A text
  change without a version bump reports "already at the latest version"
  in Claude Code (`research/08`).
- Enforced by: `tools/version-gate.mjs` in `verify.yml`. On a pull request
  it fails when the pull request changed files under `plugins/<name>/`,
  measured from the merge base, and that plugin's version is not greater
  than on the tip of the base branch. Comparing with the tip also catches a
  version that another merged pull request already used. The pattern comes
  from expo.

### D18. Daily bump PR, issue on failure

`.github/workflows/upstream-bump.yml` runs daily. It checks the pins with
`sync.mjs --verify-remote`, which refetches each pinned file and compares
its hash, then runs `sync.mjs --latest`. It opens or updates one PR on
branch `upstream-bump`, or opens one issue when a pin does not match
upstream or a bump fails its checks. A person reviews each PR for new
conflicts before merging.

- Why a PR: an upstream change can add a conflict the outcome table does
  not cover.
- It uses the default `GITHUB_TOKEN`, with no extra secret. A PR opened
  with that token does not trigger other workflows, so the job starts
  `verify.yml` with `gh workflow run --ref upstream-bump`. That run reports
  as a check on the PR's head commit, verified on PR #2. The PR's own
  `pull_request` run shows `action_required` until someone approves it.
- Needs the repository setting "Allow GitHub Actions to create and approve
  pull requests", turned on 2026-09-26.
- `--latest` asks for the newest commit that touched each pinned file, and
  skips an upstream when that commit changed none of them.

### D19. The marketplace name stays `adhd-unslop` for now

- Why: renaming changes every install id, such as `adhd-unslop@adhd-unslop`.
  Revisit when `presentation` or another unrelated plugin arrives. A
  plugin rename could use Claude Code's `renames` map. Nothing documents a
  marketplace rename.

## Codex specifics

### D20. Invoke Codex skills by full name, never symlink

Users type `$adhd-unslop:adhd-unslop`. The README gives no
`~/.agents/skills` symlink route, and the doctor warns about one.

- Why: Codex names a symlinked skill after the plugin that contains its
  target, so a link into this repo became a second
  `adhd-unslop:adhd-unslop`. With two skills of one name, Codex injects
  neither. That caused the 2026-09-12 finding that plugin skills were
  missing from `codex exec`. The finding was wrong: plugin skills do load.
  A bare `$adhd-unslop` does not match a plugin skill.
- The README no longer offers a `~/.codex/AGENTS.md` fallback. It named a
  skill that Codex hides from the model, and hooks are the supported
  always-on path.

## Diagnostics

### D26. A user-only doctor skill

`adhd-unslop:doctor` runs `scripts/doctor.mjs` from its own folder. It
prints OK, WARN, or FAIL lines, each with its fix, and changes nothing. It
reports the runtime and plugin root, the installed version, the optional
mirrors, the always-on flags and switch, the chunk hashes and sizes, the
Codex hooks feature, the installed hook definitions, and a
`~/.agents/skills` name clash.

- Why: silent hooks make a broken install look the same as always-on being
  off. ECC, gstack, claude-octopus, planning-with-files, oh-my-codex, and
  oh-my-claudecode ship doctors (`research/04`).
- It never reports a missing mirror as a problem, because the mirrors are
  optional.
- It does not parse Codex trust records, whose layout is undocumented. It
  tells Codex users to confirm trust in `/hooks`.

## Testing and CI

### D21. End-to-end tests run the real CLIs in throwaway homes

`tests/e2e/run.sh` installs the marketplace into temporary Claude Code
and Codex homes and drives the models. By default it uses a copy of the
working tree. With `E2E_REPO` and `E2E_REF` it installs from GitHub.
`migrate` mode serves 0.2.2 and the working tree from a local `git
http-backend` and checks the upgrade in both runtimes.

- Why a git source for real paths: `claude plugin install` from a local
  directory writes a cache copy but reports that the plugin loads in place
  from that directory, so a local run may read the source instead of the
  cache. A git source takes the same path as a user's install. Claude Code
  takes `owner/repo#ref`, Codex takes `owner/repo --ref <ref>`, and Claude
  Code rejects `file://` URLs.
- The model's working directory sits away from the marketplace copy, and
  the homes are deleted on exit. Stray copies on disk caused two false
  passes.
- Codex needs a copy of `~/.codex/auth.json` in the throwaway home, deleted
  on exit, and `</dev/null` on every `codex exec`. Codex also writes the
  shell environment, API keys included, into
  `$CODEX_HOME/shell_snapshots/`, so the throwaway home must be deleted.
- It needs signed-in CLIs, so it runs locally. Run it before merging a
  change to skills, hooks, or manifests.

### D27. Keyless load checks in CI, with pinned CLIs

`verify.yml` runs on pull requests, pushes to `main`, and manual dispatch:

- `checks`: `sync.mjs --check`, `build.mjs --check`, unit tests, and on
  pull requests the version gate (D17).
- `load`: installs pinned Claude Code and Codex versions and runs
  `tools/load-check.mjs` in throwaway homes with no keys. It validates every
  manifest with `claude plugin validate --strict`, installs `adhd-unslop`
  alone in both CLIs and asserts that nothing else installs, installs the
  mirrors by name, and reads the Codex catalog through `codex app-server`
  (`plugin/list`, `plugin/read`, `hooks/list`).
- `workflows`: actionlint and zizmor.

- Why: both CLIs load plugins with no sign-in (`research/02`, `research/05`).
  trailofbits proved the pattern. Only the model-driven checks need keys.
- Why pinned: a CLI release that breaks plugin loading would otherwise turn
  every open PR red with no commit here to explain it.

### D28. A daily drift check against the latest CLIs

`cli-drift.yml` runs the same load check daily against the latest Claude
Code and Codex releases. On failure it opens or updates one issue. On a pass
with newer releases it opens or updates one PR, on branch `cli-pins`, that
raises the pins in `tools/cli-versions.json`, and starts `verify.yml` on it.

- Why: the platform facts below go stale with CLI releases. The drift job
  is the re-check, and the pins PR keeps CI current without a person
  watching for releases. caveman uses the same pinned-plus-drift model.
- Why a JSON file: `GITHUB_TOKEN` cannot push a change to a workflow file,
  so the pins cannot live in `verify.yml`.
- The latest CLIs run in a job with a read-only token. The jobs that open
  the issue or the PR run no CLI, so a bad CLI release never runs with
  write access.
- Before merging a pins PR, re-test the platform facts it could change and
  update the tested versions at the top of this file.

### D29. Workflow hygiene

- Actions are pinned by commit SHA with a version comment. Dependabot
  updates them weekly with a seven-day cooldown, in one grouped PR. The
  actionlint image and the zizmor version are pinned in `verify.yml` and
  raised by hand.
- `.gitattributes` sets LF line endings, keeps `upstream/` byte for byte,
  and marks generated files as generated.
- No Markdown lint: upstream text must stay verbatim (D2).

## Platform facts

Verified on the versions at the top of this file. Re-check after upgrades,
or when `cli-drift.yml` fails.

| Fact | Claude Code | Codex |
| --- | --- | --- |
| Skill name | `plugin:skill` | `plugin:skill`. A bare name does not match a plugin skill. |
| Plugin dependencies | `dependencies` in `plugin.json`, auto-installed. `claude plugin prune` removes orphans. Not used here since 0.3.0. | None |
| Marketplace files read | `.claude-plugin/marketplace.json` | `.agents/plugins/marketplace.json` first, then `.claude-plugin/marketplace.json` |
| Plugin manifest read | `.claude-plugin/plugin.json` | `.codex-plugin/plugin.json` first, then `.claude-plugin/plugin.json`; a root `plugin.json` with the agent-plugins `$schema` wins over both |
| Marketplace entry `version` | Ignored when `plugin.json` has one; `--strict` fails on a mismatch | Not used |
| Config-only install | Not tested | `[plugins."x@mkt"] enabled = true` does nothing alone, but `codex plugin marketplace upgrade` then installs it from a git marketplace |
| Plugin cache | `~/.claude/plugins/cache/<mkt>/<plugin>/<version>/`; old versions stay | `$CODEX_HOME/plugins/cache/<mkt>/<plugin>/<version>/`; only the installed version |
| Local directory marketplace | `install` writes a cache copy, which `installPath` names, and reports that the plugin loads in place from the source directory, so edits there show at the next session | Copies into the cache |
| Git marketplace copy | Cloned by `marketplace add` | Cloned in full to `$CODEX_HOME/.tmp/marketplaces/<name>/` |
| Hook environment | `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`, never `PLUGIN_ROOT` | `PLUGIN_ROOT`, `PLUGIN_DATA`, `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`, `CODEX_HOME` |
| SessionStart payload | `session_id`, `transcript_path`, `source` | `session_id`, `transcript_path`, `source` |
| SessionStart sources | `startup`, `resume`, `clear`, `compact`, `fork` | `startup`, `resume`, `clear`, `compact`; `codex exec` reaches `compact` only through auto-compaction and never `clear` |
| Resume | Keeps the earlier injection; a `resume` match adds a copy | Keeps the earlier injection; a `resume` match adds a copy; after compact then quit, resume has none |
| Hook output cap | 10,000 characters per value; longer goes to a file with a 2,000-character preview | 2,500 tokens per handler by default, ceil(chars / 4); longer is cut in the middle and saved to a file; raised by `additionalContextLimit` |
| Hook output shapes | Plain text or JSON `hookSpecificOutput.additionalContext` | Plain text or JSON `additionalContext`; `systemMessage` never reaches the model; an unknown key fails the handler |
| Chunk order | Order the handlers finish | Declared order |
| Hook trust | None needed | Trust in `/hooks`, stored as `[hooks.state."<plugin>@<mkt>:<hooks path>:session_start:<group>:<index>"] trusted_hash`. It follows the hooks file path and handler position and hashes every handler field. `app-server` `hooks/list` reports keys, hashes, and trust. |
| Hooks feature | Always on | `hooks` is stable and on by default; `plugin_hooks` is removed |
| Unknown hook key | `additionalContextLimit` accepted, no warning | Supported |
| Variables in `SKILL.md` | `${CLAUDE_SKILL_DIR}` resolves to the versioned cache path; also `${CLAUDE_PROJECT_DIR}`, `${CLAUDE_SESSION_ID}`, `${CLAUDE_EFFORT}` | None; the model resolves relative paths against the skill's directory |
| Skill flags | `disable-model-invocation: true` blocks the Skill tool. `user-invocable: false` hides it from the slash menu only. | `allow_implicit_invocation: false` in `agents/openai.yaml` hides the skill and its path from the model. A typed mention still works. |
| Skill size | No cut seen | No cut for `.codex-plugin` or Claude-only plugins; 8,000 bytes for a root `plugin.json` plugin |
| Output styles | `output-styles/` in a plugin; `force-for-plugin: true` applies it with nothing selected and overrides the user's choice; no size cap | None |
| Keyless commands | `claude plugin validate --strict`, `marketplace add`, `install`, `list --json` | `codex plugin marketplace add`, `codex plugin add`, `codex app-server` with `plugin/list`, `plugin/read`, `hooks/list` |
| Other useful commands | `claude plugin tag`, `claude plugin marketplace update <name>`, `claude plugin prune` | `codex plugin marketplace upgrade <name>`, `codex features list`, `codex debug prompt-input`, `codex exec --dangerously-bypass-hook-trust` for throwaway homes |

Codex CLI habits:

- `codex exec` from a non-TTY shell waits on stdin forever. Redirect
  `</dev/null`.
- `codex review --base <branch>` rejects a custom prompt and `-m`. Use
  `codex exec` with `-c` or `-m`.
- Codex writes the shell environment into `$CODEX_HOME/shell_snapshots/`.
