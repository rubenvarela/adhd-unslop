# Vendoring, upstream sync, per-host generation, drift checks, and doctors

This note studies seven public repos that ship skills to both Claude Code
and Codex. It answers six questions about vendoring, upstream sync,
per-host generation, drift checks, and doctor commands. It then compares
each answer with `design/DECISIONS.md`. The research ran on 2026-09-26.

Each repo was shallow-cloned into the session scratchpad under
`scratchpad/repos/<name>`. No install script was run, and nothing under
`~/.claude` or `~/.codex` was read or changed. Paths below are relative to
each clone. Our own paths are relative to this repo.

## Repos studied

| Repo | Clone name | Commit | Commit date |
| --- | --- | --- | --- |
| nyldn/claude-octopus | `claude-octopus` | `99157b3` | 2026-09-25 |
| garrytan/gstack | `gstack` | `2a113ae` | 2026-09-25 |
| stripe/ai | `ai` | `d547667` | 2026-09-26 |
| sickn33/agentic-awesome-skills | `agentic-awesome-skills` | `c6c0677` | 2026-09-26 |
| affaan-m/everything-claude-code (ECC) | `everything-claude-code` | `e482e57` | 2026-09-24 |
| Yeachan-Heo/oh-my-codex (OMX) | `oh-my-codex` | `cdc24a7` | 2026-09-21 |
| Yeachan-Heo/oh-my-claudecode (OMC) | `oh-my-claudecode` | `9fd35ec` | 2026-09-22 |

## 1. Vendoring

### claude-octopus

claude-octopus vendors one third-party skill as plain files in
`vendors/ui-ux-pro-max-skill/`. The directory carries a manifest,
`vendors/ui-ux-pro-max-skill/VENDOR.json`, with these fields:

```json
{
  "name": "ui-ux-pro-max-skill",
  "upstream": "https://github.com/nextlevelbuilder/ui-ux-pro-max-skill",
  "tag": "v2.15.0",
  "retrieved": "2026-09-04",
  "license": "MIT",
  "subset": ["src/ui-ux-pro-max/data/", "src/ui-ux-pro-max/scripts/core.py", "...", "LICENSE", "README.md", "CLAUDE.md"],
  "notes": "Vendored as plain files (#253). ..."
}
```

- The pin is a release tag. There is no commit and no file hash.
- `subset` lists the upstream paths that were copied. The notes say
  "upstream development tests and maintenance tooling are intentionally
  excluded."
- The notes hold the refresh procedure: "download the release tarball,
  replace only the subset paths listed here, update this manifest, run
  scripts/check-vendor-updates.sh." Updates are manual.
- The notes also say why the tag wins over upstream's own version fields:
  "Upstream's plugin.json/skill.json version fields lag its git tags
  (semantic-release); the tag above is the canonical vendored version."

`scripts/check-vendor-updates.sh` runs five checks. Its header lists them:

1. "VENDOR.json manifest present and parseable for each vendor"
2. "Required files exist in each vendor (entry points, data)"
3. "No new external dependencies introduced (Python stdlib only for
   ui-ux-pro-max)"
4. "Upstream has a newer release tag". The header marks this check as
   informational, and the script never updates anything.
5. "Feature compatibility with main codebase (path references still valid)"

Check 2 fails when the vendored `LICENSE` is missing, with the message
"LICENSE file missing (required for redistribution)". Check 3 parses every
`import` line in the vendored Python and fails on any module outside a
stdlib allowlist. Check 5 greps two first-party files for the exact
vendored path, then runs a smoke search through the vendored script.

Nothing protects the vendored files from hand edits. The check tests
presence and imports, not content.

`.github/dependabot.yml` still has a `gitsubmodule` entry commented "Git
submodules (vendors/)", although `VENDOR.json` says the vendor moved to
plain files in #253. The entry is stale.

For adapted methods, as opposed to vendored files, the repo keeps a
separate `THIRD_PARTY_NOTICES.md`. It names a source commit
(`mattpocock/skills` at `3cca18b3...`), ships the license text in
`licenses/mattpocock-skills-MIT.txt`, and maps each upstream method to a
local skill. It states: "They do not synchronize automatically with the
upstream repository."

### gstack

gstack vendors no skills. Its `NOTICE.md` covers Apache-2.0 material that
it rewrote. The notice lists derived files and one unmodified copy:
"`test/fixtures/impeccable-antipatterns.json`:
`crates/live/assets/antipatterns.json` at commit 87d8f6d6 (engine-v0.1.3),
wrapped in a `_source` provenance object." The license text lives in
`licenses/Apache-2.0.txt`. The notice says "Rewriting is not an exemption"
and requires that "each derived file carries a notice that it was
changed."

### stripe/ai

stripe/ai syncs its skills from a first-party web source, not a git repo.
`scripts/sync.js` reads `https://docs.stripe.com/.well-known/skills/index.json`,
then fetches each listed file.

- There is no pin. Every run takes whatever the index serves.
- `OMIT_FILES = new Set(["metadata.yaml"])` drops one file type.
  `PRESERVE_FILES` keeps `README.md` and `.gitkeep` when the script wipes
  an output directory.
- Protection is social plus CI. `providers/README.md` says "Do not edit
  skill files in provider directories manually" and "Any manual changes
  will be overwritten."
- `.github/workflows/guard-skills.yml` runs on any PR that touches the
  synced paths. It posts a "request changes" review that begins "This PR
  modifies files that are automatically synced from a centrally maintained
  copy".
- `.gitattributes` marks the copies as generated so GitHub collapses them
  in diffs: `providers/*/plugin/skills/*/SKILL.md linguist-generated`.

### agentic-awesome-skills

`tools/scripts/sync_microsoft_skills.py` imports every skill from
`microsoft/skills`. It runs by hand through `npm run sync:microsoft`. No
workflow calls it.

- It clones upstream `HEAD` with `git clone --depth 1`. There is no pin.
- It records provenance in `docs/sources/microsoft-skills-attribution.json`
  with `source`, `repository`, `license`, `synced_skills`, `structure`, and
  a `skills` list of `flat_name`, `original_path`, and `source`.
- It copies the upstream `LICENSE` to `docs/sources/LICENSE-MICROSOFT`.
- It uses the previous attribution file to delete what the last sync
  wrote, so it never deletes a local skill it did not create.
- If a Microsoft skill name matches an existing local skill, it renames
  the import to `<name>-ms` instead of overwriting.
- It skips symlinks and any file whose resolved path leaves the clone.

`docs/sources/sources.md` is a hand-kept table of source, license, and
notes for every adopted skill. `tools/scripts/detect_drift.py` keeps a
normalized sha256 per skill in `data/drift-baseline.json` and reports
content drift against it. It strips `date_added:` and `author:` lines
before hashing "to prevent false positives on metadata-only edits."

### ECC, OMX, and OMC

None of the three vendors third-party skills.

- OMX keeps a first-party content lock, `omx-capabilities.lock.json`, with
  a sha256 per file and a digest per surface. `npm run
  verify:capabilities-lock` checks it.
- OMC protects generated files with a base-owned allowlist, described in
  section 4.

### How ours compares

Our vendoring is the strictest of the seven. We pin a commit and a sha256
for each vendored file in `tools/upstream.json`. `sync.mjs` refuses a
body with runtime dependencies or a removed cited item. claude-octopus
pins a tag with no hashes. stripe/ai and agentic-awesome-skills track
upstream `HEAD` with no pin at all. No other repo checks the upstream text
against the rules its own overlay depends on.

## 2. Upstream sync automation

| Repo | Trigger | Output | Failure report |
| --- | --- | --- | --- |
| stripe/ai | Daily cron `0 0 * * *` plus `workflow_dispatch` | Direct commit and push to `main` | The job fails. No issue or PR. |
| claude-octopus | Nightly `test.yml` schedule `0 2 * * *` plus dispatch | None. It only reports. | The `vendor-freshness` job fails with exit 2 when an update exists. |
| agentic-awesome-skills | Weekly cron `0 7 * * 1` (`repo-hygiene.yml`) | PR, then auto-merge after required checks | The job fails. |
| gstack, ECC, OMX, OMC | No upstream skill sync | Not applicable | Not applicable |

The search for this table was `grep -l 'cron\|schedule:'` over every
workflow in the seven clones. The scheduled workflows in gstack
(`evals-periodic.yml`, `osv-scanner.yml`, `ci-image.yml`), ECC
(`maintenance.yml`, `supply-chain-watch.yml`, `monthly-metrics.yml`), and
OMC (`cleanup.yml`, `stale.yml`) do not sync skills. OMX has no scheduled
workflow.

### stripe/ai commits straight to main

`.github/workflows/sync-skills.yml` runs `node scripts/sync.js`, stages the
skill paths and every version file, and exits when `git diff --staged
--quiet` passes. Otherwise it commits as `stripe-ai-sync[bot]` with the
message `sync skills` and pushes to `main`. The push uses a GitHub App
token from `actions/create-github-app-token`, with secrets
`GH_APP_STRIPE_AI_SYNC_CLIENT_ID` and `GH_APP_STRIPE_AI_SYNC_PEM`. A push
made with an App token triggers other workflows, which `GITHUB_TOKEN`
pushes do not.

`scripts/sync.js` raises versions itself. It bumps the minor version when
a skill was added or deleted and the patch version when a skill only
changed. It bumps all eight version files together. On any fetch error it
exits 1 and prints "skills will not be updated. Try triggering the
workflow manually." Nobody gets an issue.

### claude-octopus reports freshness nightly

The `vendor-freshness` job in `.github/workflows/test.yml` is commented
"Nightly/manual only, not a PR gate." It runs
`./scripts/check-vendor-updates.sh --ci`, which exits 2 when upstream has a
newer release tag and 1 when the vendored copy is unhealthy. A person then
refreshes by hand.

### agentic-awesome-skills uses a PR and merges it itself

`.github/workflows/repo-hygiene.yml` regenerates derived files on `main`
and opens a PR with `peter-evans/create-pull-request` on branch
`automation/canonical-repo-state`, using `GITHUB_TOKEN`. That is our
setup. It then runs `tools/scripts/merge_canonical_sync_pr.cjs`.

That script handles the problem that D18 records. A PR opened with
`GITHUB_TOKEN` gets a `pull_request` run stuck at `action_required`.
`ensurePullRequestChecksStarted` finds the PR's run and, when it is
`completed` with conclusion `action_required`, calls
`POST repos/{repo}/actions/runs/{id}/rerun`. It then waits for the required
checks, checks that `main` did not move, and squash-merges with the head
SHA pinned. The workflow grants `actions: write`.

Before it opens the PR, the job runs a step named "Reject stale
canonical-sync publication". That step exits unless `GITHUB_SHA` still
equals `origin/main`.

## 3. Per-host generation

| Repo | Copies | Frontmatter for Codex | Body changes for Codex |
| --- | --- | --- | --- |
| claude-octopus | One generated copy, shipped to both hosts | `name`, `description`, `disable-model-invocation` | Host preamble, tool-name rewrites, optional contract block |
| gstack | One per host; only the Claude copy is committed | Allowlist of `name`, `description` | Path rewrites, suppressed sections, boundary line |
| stripe/ai | Six byte-identical copies | Unchanged | None |
| agentic-awesome-skills | Two byte-identical copies, filtered per host | Unchanged | None |
| ECC (plugin) | Shared `skills/` for both manifests | Unchanged | Separate hooks file per host |
| ECC (`.agents/skills`) | A separate 39-skill Codex subset, not the plugin | Allowlist of `allowed-tools`, `description`, `license`, `metadata`, `name` | None found |
| OMX | Mirror of `skills/` into `plugins/oh-my-codex/skills` | Unchanged | None |
| Ours | One copy for both hosts, plus `agents/openai.yaml` | Description replaced, `disable-model-invocation` dropped | None |

### claude-octopus

`scripts/build-codex-skills.sh` turns `.claude/skills/*` into `skills/*`.
Both manifests then point at the generated tree.
`.codex-plugin/plugin.json` has `"skills": "./skills/"`, and
`.claude-plugin/plugin.json` lists 63 paths such as
`"./skills/skill-doctor"`. The Claude manifest therefore points at the
Codex-adapted text. Whether Claude Code sessions then see the Codex
preamble is claim 10. The source `.claude/skills/` tree is what developers
load inside the repo.

Frontmatter rules, from the script header and `write_skill`:

- `name` is sanitized to `a-zA-Z0-9_-` and truncated to 64 characters.
- `description` is truncated to 1024 characters with a `...` suffix.
- `disable-model-invocation` is kept when present. Every other key is
  dropped. The `skill-doctor` diff shows `effort` and a multi-line
  `trigger` block removed.
- `agents/openai.yaml` gets `interface.display_name`, a
  `short_description` capped at 64 characters, and `policy:
  allow_implicit_invocation: false` when the source has
  `disable-model-invocation: true`.

Body rules:

- A host preamble goes at the top. It starts `> **Host: Codex CLI**` and
  says the skill "was designed for Claude Code and adapted for Codex."
- `sed` rewrites tool names: `Bash tool` becomes `native shell command
  tool`, `Agent tool` and `Task tool` become `host subagent tool`, and
  `TodoWrite` becomes `task plan tool`. It also rewrites some model names
  and `codex exec` flags.
- If the source frontmatter says `execution_mode: enforced` and the body
  has no enforcement section, the script adds an "Execution Contract"
  block.
- A shared file, `skills/blocks/codex-host-adapter.md`, maps the rewritten
  wording to Codex tools.
- `PRESERVED_SKILL_DIRS=(blocks octopus-starter-pack skill-council)` lists
  hand-kept directories that regeneration must not delete. Its comment
  warns that without the list "a plain regeneration silently deletes it."

The generator has a bug. `extract_body` skips every line equal to `---`
after the frontmatter, so it also drops Markdown horizontal rules from the
body. `diff .claude/skills/skill-doctor/SKILL.md
skills/skill-doctor/SKILL.md` shows the losses as `32d24 < ---`, `48d39 <
---`, and six more. This is the kind of silent body change that our D2
byte-for-byte test exists to catch.

### gstack

gstack keeps one template per skill, `<skill>/SKILL.md.tmpl`, 104 in all.
`scripts/gen-skill-docs.ts` renders it once per host from typed configs in
`hosts/*.ts`, validated by `scripts/host-config.ts`.

- `hosts/claude.ts` uses `mode: 'denylist'` and strips `sensitive`,
  `voice-triggers`, `interactive`, and `benefits-from`. Its comment says
  stripping "trims the always-on frontmatter catalog every session loads."
- `hosts/codex.ts` uses `mode: 'allowlist'` with `keepFields: ['name',
  'description']`, `descriptionLimit: 1024`, and
  `descriptionLimitBehavior: 'error'`. It fails the build rather than
  truncating.
- Codex path rewrites include `~/.claude/skills/gstack` to `$GSTACK_ROOT`,
  `.claude/skills` to `.agents/skills`, and `CLAUDE.md` to `AGENTS.md`.
- `suppressedResolvers` blanks template sections that make no sense on
  Codex.
- `boundaryInstruction` tells Codex not to read `~/.claude/` or
  `.claude/skills/`.
- `generateOpenAIYaml` in `scripts/gen-skill-docs.ts` writes
  `display_name`, `short_description` capped at 120 characters,
  `default_prompt`, and `allow_implicit_invocation: true`.
- Every render starts with a header comment that begins
  `<!-- AUTO-GENERATED from {{SOURCE}}` and ends `do not edit directly -->`.
  The prune step deletes an old render directory only when its `SKILL.md`
  contains that header, and logs "not a gstack render (no generated
  banner)" otherwise.
- The generator prints a per-host token budget table.
- `scripts/gen-agents-digest.ts` builds a rules digest capped at
  `DIGEST_BYTE_BUDGET = 2048` for hosts with no install arm.
  `host-config.ts` says setup "must never write or overwrite a user's own
  AGENTS.md." The user copies the digest in by hand.

Only the Claude output is committed. `.gitignore` excludes `.agents/` and
`.factory/`, and `./setup --host codex` generates the Codex tree at install
time. Setup installs Codex skills under `~/.codex/skills`, not through a
Codex plugin marketplace.

### stripe/ai

`scripts/sync.js` writes each fetched file unchanged to `skills/` and five
provider directories: `providers/{claude,codex,cursor,grok,agent-plugins}/plugin/skills`.
`diff -r providers/claude/plugin/skills providers/codex/plugin/skills`
differs only by a `.gitkeep`. Each host keeps its own version line:
`providers/codex/plugin/.codex-plugin/plugin.json` is at `5.8.0` and
`providers/claude/plugin/.claude-plugin/plugin.json` is at `0.11.0`. The
sync bumps them all at once.

The Codex marketplace sits at `.codex-plugin/marketplace.json` in the repo
root and uses a `git-subdir` source pointing at `providers/codex/plugin`.

### agentic-awesome-skills

`plugins/agentic-awesome-skills` (Codex) and
`plugins/agentic-awesome-skills-claude` (Claude) hold byte-identical
copies. `diff -r skills/007 plugins/agentic-awesome-skills/skills/007`
shows no difference. The two sets differ in size, 2286 for Codex and 2311
for Claude, because `tools/scripts/plugin_compatibility.py` blocks some
skills per host. Its reasons are:

- `absolute_host_path`: a `/Users/` path in the skill
- `escaped_local_reference` and `broken_local_reference`: a relative link
  that leaves the skill or points at nothing
- `target_specific_home_path`: `~/.claude` blocks the skill for Codex, and
  `~/.codex` blocks it for Claude
- a runtime file such as `package.json` without a valid `plugin.setup`
  block of type `manual` with a docs file

This is close to our `dependencyHits` in `tools/sync.mjs`, which refuses
relative links and `references/`, `scripts/`, or `agents/` paths.

### ECC

ECC ships one `skills/` directory to both manifests. It keeps a separate
Codex subset of 39 skills in `.agents/skills`. `tests/ci/codex-skill-surface.test.js`
limits that subset's frontmatter to `allowed-tools`, `description`,
`license`, `metadata`, and `name`.

ECC ships two hooks files, `hooks/hooks.json` for Claude Code and
`hooks/codex-hooks.json` for Codex. `.codex-plugin/plugin.json` points at
the second with `"hooks": "./hooks/codex-hooks.json"`.
`scripts/ci/check-hooks-schema-keys.js` gives the reason: "Claude Code
validates a plugin's hooks.json against its own schema at load time and
prints 'unknown keys ... ignored' for anything else." Its allowed handler
keys are:

- Claude Code: `type`, `command`, `timeout`, `statusMessage`, `async`,
  `url`, `headers`, `allowedEnvVars`, `prompt`, `model`
- Codex: `type`, `command`, `timeout`

ECC's Codex marketplace, `.agents/plugins/marketplace.json`, uses
`"source": {"source": "local", "path": "./"}`. D10 records that this
layout makes Codex copy the whole repo into its cache.

ECC reads Claude Code plugin settings in hooks.
`.claude-plugin/plugin.json` declares `userConfig` keys `hooks_enabled`
and `hook_profile`. `scripts/lib/hook-flags.js` reads
`CLAUDE_PLUGIN_OPTION_HOOKS_ENABLED`, with `ECC_HOOKS_ENABLED` taking
precedence. `scripts/lib/claude-scope-migration.js` installs with `plugin
install <id> --config hooks_enabled=<bool>`.

### OMX and OMC

`oh-my-codex/src/scripts/sync-plugin-mirror.ts` mirrors `skills/` into
`plugins/oh-my-codex/skills` with no content changes. `diff -r
skills/doctor plugins/oh-my-codex/skills/doctor` shows none.

OMC has a context trick. `oh-my-claudecode/commands/omc-doctor.md` has
`description: ""` and only tells the model to read
`skills/omc-doctor/SKILL.md`. Its text says it "keeps
`/oh-my-claudecode:omc-doctor` available without loading the full
`omc-doctor` skill description in every Claude Code session."

## 4. Drift checks

| Repo | Command | What it compares | Where it runs |
| --- | --- | --- | --- |
| claude-octopus | `scripts/build-codex-skills.sh --check` | Fresh build in a temp dir against `skills/`, with `diff -rq` | `test.yml`, job `portability-lint` |
| claude-octopus | `scripts/sync-marketplace.sh --check` | Marketplace description against `plugin.json` counts | `test.yml`, ubuntu and macOS matrix |
| claude-octopus | `scripts/check-vendor-updates.sh --local` or `--ci` | Vendor health, then upstream tag | Nightly only |
| gstack | `bun run gen:skill-docs --host all`, then `git diff --exit-code` and a stray-file check | Tracked Claude renders | `skill-docs.yml` on PRs and pushes to main |
| gstack | `bun run skill:check` | Frontmatter validity and host path leaks | Local and tests |
| stripe/ai | None | Not applicable | `guard-skills.yml` blocks human edits instead |
| agentic-awesome-skills | Source-only PR rule, then byte-for-byte reproduction | Derived files against a regeneration from `main` | `ci.yml` |
| ECC | `scripts/ci/validate-*.js`, `check-hooks-schema-keys.js` | Schemas and key sets | `reusable-validate.yml` |
| OMX | `npm run verify:generated` | Plugin mirror, capability lock, prompt fragments, catalog docs | `npm test` and `prepack` |
| OMC | `generated-artifact-authorization.yml` | Generated files against a base-owned allowlist | `pull_request_target` |
| Ours | `node tools/sync.mjs --check`, `node tools/build.mjs --check` | Pinned hashes; expected generated files | `daily-build.yml` on every push and PR |

Notes on the checks:

- claude-octopus's `--check` builds into a temp directory and runs `diff
  -rq` against the committed tree. `diff -rq` reports files that exist on
  only one side, so the check catches orphans as well as stale files.
- gstack documents a hole in its own check. `skill-docs.yml` says the nine
  gitignored host outputs "are NOT byte-freshness checked", because "`git
  diff` on ignored untracked paths is always empty." It adds a separate
  step because "git diff misses NEW untracked files."
- gstack's `externalHostPathLeaks` in `test/helpers/skill-parser.ts` flags
  any line outside a bash block that still contains `.claude/skills`.
- agentic-awesome-skills inverts the model. PRs must hold sources only.
  `ci.yml` fails with "Pull requests must stay source-only. Remove derived
  files and let main regenerate them after merge." The bot PR must then be
  "byte-for-byte reproducible from main."
- OMC checks out the base branch in sparse mode, with only
  `.github/generated-artifact-authorizations.json` and its verifier, and
  runs the verifier from that trusted copy.

Our `build.mjs --check` has a gap that claude-octopus does not.
`staleFiles()` in `tools/build.mjs` walks only `expectedFiles()`. It
reports a file that is missing or different, but not a file under
`plugins/` that the build no longer writes. `writeAll()` never deletes.
`tests/build.test.mjs` checks that `plugins/` holds exactly the plugin
directories in `tools/plugins.json`, but it does not look at files inside
them. An orphan such as `plugins/au-unslop/skills/unslop/references/old.md`
would ship and pass CI.

## 5. Doctor and health

| Repo | Form | Report | Fixes |
| --- | --- | --- | --- |
| claude-octopus | Skill `skill-doctor` running a bash library | pass, info, warn, fail; JSON option | Only after the user confirms each one |
| gstack | No install doctor. `/health` is a code-quality dashboard. | Score from 0 to 10 | Never. "HARD GATE: Do NOT fix any issues." |
| ECC | Scripts `doctor.js`, `repair.js`, `codex/check-plugin-cache.js`, `codex/check-codex-global-state.sh` | OK, WARNING, ERROR; JSON option | `repair.js` applies a plan |
| OMX | Skill `doctor` plus CLI `omx doctor` | pass, warn, fail; table for the skill | `--force`, with `--dry-run --force` to preview |
| OMC | Skill `omc-doctor` plus a stub command | OK, WARN, CRITICAL table | Only after the user confirms |

### claude-octopus

`.claude/skills/skill-doctor/SKILL.md` has `disable-model-invocation: true`.
It resolves the plugin root from `CLAUDE_PLUGIN_ROOT`, then
`CODEX_PLUGIN_ROOT`, a stable link, the `octopus` binary, and finally a
`find` under `~/.claude/plugins`. It then runs `orchestrate.sh doctor
--verbose`, which calls `scripts/lib/doctor.sh`. The skill names 15
categories, each also runnable alone:

providers, companions, auth, config, updates, state, smoke, hooks,
scheduler, skills, conflicts, agents, recurrence, cache, installation.

The checks that matter for a plugin marketplace:

- **Plugin validation** (`doctor_check_plugin_validation`) runs `claude
  plugin validate --strict <root>` when `--help` lists `--strict`, with a
  timeout, and reports info when `claude` is missing.
- **Updates** (`doctor_check_updates` with
  `scripts/lib/plugin-update.sh`) compare four versions: the loaded
  `plugin.json`, the installed entry in
  `~/.claude/plugins/installed_plugins.json` keyed `octo@nyldn-plugins`,
  the catalog in `~/.claude/plugins/marketplaces/nyldn-plugins/.claude-plugin/marketplace.json`,
  and the newest directory under `~/.claude/plugins/cache/nyldn-plugins/octo`.
  It reads `autoUpdate` from `~/.claude/plugins/known_marketplaces.json`.
  It warns "Installed Octopus vX is newer than this loaded session" and
  says to run `/reload-plugins`.
- For Codex, the same code reads `$CODEX_HOME/plugins/installed_plugins.json`.
  No other repo reads that file for Codex, and OMX reads `config.toml`
  instead. See "Claims to test".
- **Hooks** (`doctor_check_hooks`) checks that `hooks/hooks.json` is valid
  JSON and that every `command` script exists and is executable after it
  resolves `${CLAUDE_PLUGIN_ROOT}`.
- **Skills** (`doctor_check_skills`) checks that every path in
  `plugin.json` `skills` and `commands` exists.
- **Conflicts** (`doctor_check_conflicts`) warns when named plugins exist
  under `~/.claude/plugins`, and lists companion plugins found in the
  Claude or Codex cache.
- **Cache** (`doctor_check_cache`) warns when cached versions exceed a
  keep window (`OCTOPUS_CACHE_KEEP`, default 2).
- **Installation** (`doctor_check_installation`) checks a stable root
  link and recorded install metadata.

Nothing checks Codex hook trust.

Reporting: `doctor_output_human` hides passing checks unless `--verbose`
is set. It always prints the detail line for warn and fail, because that
line "contains the actionable fix." `--json` emits `schema_version`,
`summary` with `passed`, `warnings`, `failures`, and `exit_code`, and
`results`. A fail exits 1. A usage error exits 2.

Fixing: Step 5 of the skill says that for fixable issues "you MUST use
AskUserQuestion to offer fixes." Repairs go through `repair --dry-run`,
then `repair --apply` only "after the user authorizes that exact repair."
Config repairs "must use a validated sibling temporary file and atomic
rename."

### gstack

`health/SKILL.md.tmpl` scores the user's project with its own type
checker, linter, and tests. It is not an install check. The only doctor
script, `scripts/sandbox-doctor.sh`, prepares a cloud sandbox for gstack's
own test suite.

### ECC

`scripts/doctor.js` works from install-state files that ECC's own
installer writes. Its issue codes, from `analyzeRecord` in
`scripts/lib/install-lifecycle.js`, are:

- errors: `invalid-install-state`, `missing-target-root`,
  `unsafe-managed-destination`, `unsafe-repair-source`,
  `invalid-claude-settings`, `missing-managed-files`,
  `missing-source-files`, `resolution-unavailable`
- warnings: `legacy-antigravity-layout`, `legacy-opencode-layout`,
  `target-root-mismatch`, `install-state-path-mismatch`,
  `drifted-managed-files`, `unverified-managed-operations`,
  `manifest-version-mismatch`, `repo-version-mismatch`, `resolution-drift`

`process.exitCode = hasIssues ? 1 : 0`, so warnings also exit 1.

`scripts/codex/check-plugin-cache.js` checks the installed Codex plugin
cache. It opens `$CODEX_HOME/plugins/cache/<marketplace>/<plugin>/<version>/.codex-plugin/plugin.json`
and checks that `skills`, `mcpServers`, `interface.composerIcon`, and
`interface.logo` resolve inside the cache. It fails any path that escapes
the cache. When the manifest is missing, it lists the versions that do
exist. On failure it prints: "codex plugin list only confirms marketplace
registration; it is not proof of runtime skill loading."

`scripts/codex/check-codex-global-state.sh` greps `config.toml` and
`AGENTS.md` for expected ECC entries and prints `[OK]`, `[WARN]`, or
`[FAIL]` per check.

### OMX

`skills/doctor/SKILL.md` runs `omx doctor`, implemented in
`src/cli/doctor.ts` (4294 lines). Its check names include:

AGENTS.md, Codex CLI, Config, Credential provenance, Legacy skill roots,
MCP Servers, Native hooks, Native hook runtime mirrors, Node.js, Plugin
versions, Prompts, Repo artifact ownership, Skills, State dir.

The checks that matter for a marketplace:

- **Marketplace registration** (`checkPluginMarketplaceRegistration`)
  parses `config.toml` and reads `[marketplaces.<name>]` `source_type` and
  `source`, and `[plugins."<plugin>@<marketplace>"]` `enabled`. It warns
  "Codex plugin ... is not enabled" when `enabled` is not `true`.
- **Plugin versions** (`checkPluginVersionDiagnostics`) checks that the
  cache directory version equals the packaged manifest version. It notes
  that "Codex may keep current-session plugin skill metadata until a new
  Codex session starts."
- **Plugin-scoped hooks** (`checkPluginScopedNativeHooks`) checks that the
  cached manifest points hooks at `./hooks/hooks.json` and that the cached
  hook files match the packaged ones. It then runs a hook smoke test from
  the cache.
- **Legacy skill roots** (`checkLegacySkillRootOverlap`) warns when
  `~/.agents/skills` and the canonical root share skill names: "Codex
  Enable/Disable Skills may show duplicates until ~/.agents/skills is
  cleaned up."
- **Hook feature flag**: `src/config/codex-feature-flags.ts` says "Current
  Codex CLI releases expose lifecycle hooks as `[features].hooks`. Older
  releases used `[features].codex_hooks`." It parses `codex features list`
  and treats `plugin_hooks` as folded into `hooks` once its stage is
  `removed`.

OMX also documents how Codex stores hook trust. `src/config/codex-hooks.ts`
writes `[hooks.state."<key>"]` tables in `config.toml` with a
`trusted_hash` and an optional `enabled`. For a user hooks file the key is
`<hooksPath>:<event>:<groupIndex>:<handlerIndex>`. The hash is
`sha256:` plus the sha256 of a canonical JSON object with `event_name`, an
optional `matcher`, and one handler with `type`, `command`, `timeout`,
`async`, and `statusMessage`. `additionalContextLimit` is not part of it.

Reporting and fixing: the skill's report is a table of OK, WARN, INFO, or
CRITICAL rows under "HEALTHY" or "ISSUES FOUND". The CLI sets
`process.exitCode = 1` when any check fails. Remediation runs "after user
confirmation and confirming each target is OMX-owned." The recovery hint
is `codex plugin remove oh-my-codex@oh-my-codex-local --json`, followed by
setup again.

### OMC

`skills/omc-doctor/SKILL.md` lists seven steps:

1. Plugin version: newest directory under
   `${CLAUDE_CONFIG_DIR:-~/.claude}/plugins/cache/omc/oh-my-claudecode`
   against `npm view`. None is CRITICAL, older is WARN, several is WARN.
2. Legacy hooks in `settings.json`, at user and project level. Found is
   CRITICAL, because they cause duplicates.
3. Legacy bash hook scripts in `~/.claude/hooks/`. Found is WARN.
4. `CLAUDE.md` markers: `<!-- OMC:START -->` and an `OMC:VERSION` marker
   compared with the cached plugin version.
5. Runtime prerequisites: `node --version` and a write probe in the config
   directory.
6. Stale cache: more than one cached version is WARN.
7. Legacy curl-installed agents, commands, and skills. It flags only names
   that match a published list and says not to flag the user's own files.

The skill asks "Would you like me to fix these issues automatically?"
before any fix. `src/cli/commands/doctor-conflicts.ts` treats the plugin
as active when `CLAUDE_PLUGIN_ROOT` is set, or when `settings.json`
`enabledPlugins` has an `oh-my-claudecode` entry.

## 6. Contradictions and improvements

1. **Hook keys.** ECC's key sets put `statusMessage` in the Claude set
   only and leave `additionalContextLimit` out of both. Our single
   `plugins/adhd-unslop/hooks/hooks.json` uses both keys on the same
   handlers. D12 has direct evidence for Codex, where
   `additionalContextLimit` works. OMX's own reimplementation of the Codex
   trust hash, written for a user `hooks.json`, includes `statusMessage`.
   That suggests Codex reads the key, against ECC's Codex list, but it is
   not proof. See claim 2. The other open question is whether Claude Code
   warns about `additionalContextLimit`.
2. **Codex hook feature flag.** OMX shows that Codex gates hooks behind
   `[features].hooks`, formerly `codex_hooks`. DECISIONS never mentions a
   feature flag. If it is on by default in 0.154.0, nothing changes. If
   not, the README's trust steps are incomplete.
3. **Trust storage.** DECISIONS says Codex trust is "keyed by plugin id and
   handler position and checked against a hash of the handler." OMX shows
   where it lives and what the hash covers. A doctor can read it.
4. **Codex marketplace path.** stripe/ai uses `.codex-plugin/marketplace.json`
   at the repo root. ECC, OMX, agentic-awesome-skills, and we use
   `.agents/plugins/marketplace.json`. Both may be accepted.
5. **`~/.agents/skills` overlap.** OMX says overlapping trees show
   duplicates. D20 says two skills with one name make Codex load neither.
   The claims can both hold. OMX describes the skills list UI, and D20
   describes a plugin-named skill in the model's context.
6. **`short_description` limit.** claude-octopus caps it at 64 characters,
   and gstack at 120. Ours are 32 to 57 characters, so they fit either
   cap.
7. **The `action_required` PR run.** agentic-awesome-skills reruns the PR's
   own run through the REST API. D18 instead starts a separate
   `workflow_dispatch` run and leaves the PR's run waiting for approval.
   The rerun makes the PR's own check go green.
8. **Direct push versus PR.** stripe/ai pushes straight to main with a
   GitHub App token. That avoids the `GITHUB_TOKEN` trigger problem but
   needs two secrets and skips review. D18 wants human review for new
   conflicts, so the PR stays. The App token is the fallback if the rerun
   fails.
9. **Orphan files.** claude-octopus's `diff -rq` and gstack's stray-file
   step catch files the build no longer writes. Ours does not.
10. **Line endings.** gstack's `.gitattributes` forces `eol=lf` on `.md`,
    `.tmpl`, and YAML files because Windows CRLF checkouts break
    `^---\n` frontmatter regexes. We have no `.gitattributes`. Our sha256
    pins, `rewriteFrontmatter`, and `stripFrontmatter` all assume LF.
11. **Generated markers.** stripe/ai marks copies `linguist-generated`, and
    gstack stamps a banner and prunes only stamped directories. Our
    composed skill has `GENERATED_NOTE`. Our vendored `SKILL.md` files
    carry no marker, because D2 keeps the body verbatim. A YAML comment in
    the frontmatter, which D2 allows us to change, would carry one.
12. **Edit guard.** stripe/ai blocks human edits to synced files with a
    review bot. Our `build.mjs --check` already fails a hand edit under
    `plugins/`. A hand edit to `upstream/` that also updates the sha256 in
    `tools/upstream.json` passes `sync.mjs --check`, because nothing
    refetches the pinned commit.
13. **Plugin settings in place of the flag file.** ECC uses Claude Code
    `userConfig` and reads `CLAUDE_PLUGIN_OPTION_*` in hooks. That could
    replace the flag file on Claude Code. Codex has no equivalent that we
    know of, and D14 wants either flag to work in both runtimes, so this is
    a Claude-only option.
14. **One copy versus per-host rewrites.** claude-octopus points its Claude
    manifest at its Codex-adapted text. gstack keeps them apart. Our
    skills are pure instructions with no tool names or host paths, so one
    verbatim copy plus `agents/openai.yaml` is enough. This supports D2
    and D7.
15. **Doctor exit codes.** AGENTS.md says hooks must exit 0. A doctor the
    user runs is not a hook. claude-octopus, ECC, and OMX all exit 1 on
    failure, which lets CI and scripts use the result.
16. **Doctor fixes.** Every doctor that fixes things asks first. That
    matches D15, which rejects a hook that installs without asking.
17. **Context cost of a doctor skill.** OMC's empty-description command
    stub keeps `/omc-doctor` typeable without adding a skill description to
    every session.
18. **Freshness is not a PR gate.** claude-octopus runs vendor freshness
    nightly and keeps it out of PR checks. Our split is the same:
    `upstream-bump.yml` checks upstream, and `daily-build.yml` verifies.

## Implications for adhd-unslop

1. Keep the vendoring model. It is the strictest seen. Consider adding
   `license` and `retrieved` fields to each entry in `tools/upstream.json`,
   as `VENDOR.json` has, and generating `NOTICE.md` from them.
2. Add orphan detection to `build.mjs --check`. Walk `plugins/`,
   `.claude-plugin/`, and `.agents/plugins/`, and fail on any file that is
   neither in `expectedFiles()` nor in a short hand-written allowlist:
   `plugins/adhd-unslop/hooks/hooks.json` and
   `plugins/adhd-unslop/hooks/*.mjs`. Have `writeAll()` delete orphans it
   finds.
3. Add `sync.mjs --verify-remote`. It refetches each pinned file at its
   pinned commit and compares the sha256. Run it in the daily bump
   workflow, not on every push, because it needs the network. It closes
   the hand-edit gap in item 12 of section 6.
4. Try the agentic-awesome-skills rerun in `upstream-bump.yml`. After the
   PR step, find the PR's `pull_request` run with
   `gh api repos/{repo}/actions/runs?head_sha=<sha>` and, if it is
   `action_required`, call `.../runs/{id}/rerun`. Keep the
   `workflow_dispatch` run until the rerun is proven. Record the result in
   D18.
5. Add `.gitattributes` with `* text=auto eol=lf`, plus `-text` or
   `eol=lf` on `upstream/**`. Mark `plugins/**`, both marketplace files,
   and `plugins/adhd-unslop/hooks/chunks/**` as `linguist-generated`, and
   exclude the hand-written hook files from that rule.
6. Add a doctor as a Node script shipped in `adhd-unslop`, such as
   `plugins/adhd-unslop/hooks/doctor.mjs`, that the user runs with `node`.
   Expose it through a skill only with `disable-model-invocation: true`,
   or through an empty-description command stub like OMC's. Proposed
   checks, each printed as OK, WARN, or FAIL with the fix command:
   - runtime and plugin root from `CLAUDE_PLUGIN_ROOT` or `PLUGIN_ROOT`
   - Claude Code: each of the three plugins in
     `~/.claude/plugins/installed_plugins.json` and under
     `~/.claude/plugins/cache/adhd-unslop/<plugin>/<version>/`, with
     versions compared against the marketplace catalog. Warn on skew
     between the three, since D16 says updates do not cascade.
   - Codex: `[plugins."<plugin>@adhd-unslop"] enabled = true` in
     `config.toml`, the cache directory per plugin, and `[features].hooks`
   - Codex hook trust: a `[hooks.state]` entry for each adhd-unslop handler
     whose `trusted_hash` matches the hash of the installed `hooks.json`.
     This check depends on claim 3, because OMX documents the key format
     only for a user hooks file, not a plugin one.
   - the upstream `i-have-adhd` or `pstack` plugin installed next to ours,
     the D6 clash
   - a `~/.agents/skills` link into this repo, the D20 failure
   - flag files in either home (D14), and whether hooks can deliver them
   - the `~/.codex/AGENTS.md` fallback line present while hooks are
     trusted, which would deliver the rules twice
   - chunk hashes against `hooks/chunks/manifest.json`, reusing the
     launcher's check

   The doctor prints fixes and never applies them without a yes from the
   user. It may exit 1 on FAIL because it is not a hook. The hooks keep
   their exit-0 rule.
7. Extend `dependencyHits` with agentic-awesome-skills'
   `target_specific_home_path` and `absolute_host_path` reasons. An
   upstream body that mentions `~/.claude` or `/Users/` would then fail the
   bump.
8. Settle the hook key question with the tests below. If Claude Code warns
   about `additionalContextLimit`, move Codex handlers to a separate
   `hooks/codex-hooks.json` named in the Codex manifest, as ECC does. That
   changes the handler file path, so users would have to trust the hooks
   again in `/hooks`. Record the cost in DECISIONS first.
9. Add a test that each `short_description` is 64 characters or fewer, the
   strictest cap seen.

## Claims to test

1. Claude Code 2.1.283 loads `plugins/adhd-unslop/hooks/hooks.json` with
   `additionalContextLimit` and prints no unknown-key warning. Test with
   `claude plugin validate plugins/adhd-unslop`, then start a throwaway
   session with `--debug` and read the hook load log.
2. Codex 0.154.0 includes `statusMessage` in the handler trust hash, so
   editing a status message forces a new trust. Test in a throwaway home:
   trust, edit one `statusMessage`, restart, and check `/hooks`.
3. Codex stores plugin hook trust as `[hooks.state."<key>"] trusted_hash =
   "sha256:..."` in `config.toml`. Record the key format for a plugin hook.
   Test by trusting in a throwaway home and reading `config.toml`.
4. `codex features list` on 0.154.0 shows `hooks` enabled by default, and
   `plugin_hooks` as `removed` or absent.
5. Claude Code records installs in `~/.claude/plugins/installed_plugins.json`
   under `<plugin>@<marketplace>` with a version, and `known_marketplaces.json`
   holds `autoUpdate`. Test in a throwaway `CLAUDE_CONFIG_DIR`.
6. Codex keeps no `installed_plugins.json`, and `config.toml` is the only
   install record. claude-octopus's Codex branch assumes the file exists.
7. With `actions: write`, `GITHUB_TOKEN` can rerun the `upstream-bump` PR's
   `action_required` run through `POST /actions/runs/{id}/rerun`, and the
   rerun reports on the PR.
8. `codex plugin marketplace add` accepts a repo whose only Codex
   marketplace file is `.codex-plugin/marketplace.json`, as stripe/ai
   ships.
9. `claude plugin install <id> --config key=value` exists in 2.1.283, and
   hooks see the value as `CLAUDE_PLUGIN_OPTION_<KEY>`.
10. Claude Code sessions with claude-octopus installed receive the "Host:
    Codex CLI" preamble, because its Claude manifest lists the generated
    `./skills/` tree.
11. A file added under `plugins/au-unslop/` that the build does not write
    passes `node tools/build.mjs --check` and `node --test tests/*.test.mjs`
    today. The code says so. Confirm on a scratch branch.
12. A clone with `core.autocrlf=true` fails `node tools/sync.mjs --check`
    and `node tools/build.mjs --check`.
13. Codex truncates or rejects an `agents/openai.yaml` `short_description`
    longer than 64 characters.
14. With a `~/.agents/skills` tree that shares a skill name with a plugin
    skill, the Codex skills list shows both entries, per OMX, while the
    model gets neither, per D20.
