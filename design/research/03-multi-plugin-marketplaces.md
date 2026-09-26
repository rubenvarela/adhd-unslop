# Research 03: multi-plugin marketplaces

Date: 2026-09-26. Theme: multi-plugin marketplaces, generation, versioning,
and how a contributor adds a plugin. Six repos that ship to both Claude
Code and Codex were read from shallow clones. No install script was run.
The only commands run against our repo were `claude plugin validate
--strict` with a throwaway `CLAUDE_CONFIG_DIR`, and reads of `openai/codex`
source through `gh`.

| Repo | Clone | Plugins | Codex surface |
| --- | --- | --- | --- |
| wshobson/agents | `d6de37e712e0`, 2026-09-26 | 94 (92 local, 2 `git-subdir`) | `.agents/plugins/marketplace.json`, `plugins/*/.codex-plugin/plugin.json` |
| hashicorp/agent-skills | `516354c484b4`, 2026-09-24 | 2 | same shape as wshobson |
| expo/skills | `efa52f0a9d21`, 2026-09-24 | 2 active, 3 Claude aliases | same shape, plus Cursor and Grok |
| sickn33/agentic-awesome-skills | `c6c067778fc8`, 2026-09-26 | 60 directories | same shape, bundle plugins renamed `aasb-*` for Codex |
| EveryInc/compound-engineering-plugin | `a763b392c3c0`, 2026-09-25 | 1, at the repo root | `.codex-plugin/plugin.json` at root, `source.path: "./"` |
| alirezarezvani/claude-skills | `19392f7a0826`, 2026-08-26 | 99 Claude plugins | one root `.codex-plugin/plugin.json` over a symlink tree, no Codex marketplace |

Paths below are relative to each repo's root unless they start with our
repo's layout (`tools/`, `plugins/adhd-unslop/`, `design/`).

## Top findings

1. None of the six repos uses the `dependencies` field. A search of every
   `plugin.json` and both marketplace files found zero uses. They reuse
   content by copying it and checking the copies for drift, or by putting
   everything in one plugin.
2. Codex truncates a skill body at 8,000 bytes, not 8,192, and only on
   some paths. The constant is `MAX_SKILL_PROMPT_BYTES: usize = 8_000` in
   `codex-rs/ext/skills/src/render.rs`. Our composed `SKILL.md` is 9,976
   bytes. Source reading says our plugins take the path that does not
   truncate, but one code path truncates every selected skill. This needs
   a test.
3. expo enforces "raise the version when shipped files change" in CI by
   diffing against `origin/main`. Our rule is written in `AGENTS.md` and
   D17 but nothing checks it for hand edits.
4. Only sickn33 generates whole plugins from one data file,
   `data/editorial-bundles.json`. wshobson hand-writes each Claude
   `plugin.json` and the Claude marketplace, and generates only the Codex
   manifests from them. Our `tools/build.mjs` reads `tools/plugins.json`
   but only knows two kinds, and the composed kind is hard-wired to
   `adhd-unslop`.
5. The trend in the smaller repos is fewer plugins, not more. hashicorp
   replaced six plugin IDs with two product bundles. compound-engineering
   removed its second plugin, `coding-tutor`. expo says to keep new skills
   in the one `expo` plugin "unless there is a clear distribution reason".

## 1. Layout, source of truth, and generated files

### wshobson/agents

- Each plugin is `plugins/<name>/` with `.claude-plugin/plugin.json`,
  `agents/`, `commands/`, and `skills/<n>/SKILL.md` (`ARCHITECTURE.md`,
  "Component overview").
- The source of truth is the hand-written Claude side: each
  `plugins/<name>/.claude-plugin/plugin.json` and
  `.claude-plugin/marketplace.json`. `CONTRIBUTING.md` step 3 says "Update
  `.claude-plugin/marketplace.json` with your entry."
- `tools/generate.py` and `tools/adapters/codex.py` generate the Codex
  files: `.agents/plugins/marketplace.json` and
  `plugins/*/.codex-plugin/plugin.json`. The adapter reads name, version,
  and description from the Claude `plugin.json`
  (`_codex_plugin_manifest`, `tools/adapters/codex.py` lines 509 to 540).
- Generated registries are committed. Transformed skill trees are not.
  `ARCHITECTURE.md` invariant 1: "small native-install registries
  (`.agents/plugins/marketplace.json`, `plugins/*/.codex-plugin/plugin.json`,
  `.cursor-plugin/`, `.cursor/rules/`) are committed". The `.gitignore`
  comment says the rest "stay gitignored and are rebuilt locally".
- `CLAUDE.md` is a symlink to `AGENTS.md`.

### hashicorp/agent-skills

- Two plugins, `plugins/terraform/` and `plugins/packer/`, each with
  `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, and `skills/`.
- Nothing is generated. Every manifest is hand-written, and
  `scripts/validate-structure.sh` checks that they agree.
- `SKILLS.md` is a hand-kept catalog that the validator checks row by row
  against disk.
- Claude marketplace entries set `"strict": false`
  (`.claude-plugin/marketplace.json`).

### expo/skills

- One shared plugin at `plugins/expo/` with four manifests:
  `.claude-plugin/`, `.codex-plugin/`, `.cursor-plugin/`, `.grok-plugin/`.
  `plugins/expo-experiments/` is an incubator whose skills "graduate to the
  expo plugin when stable" (its `plugin.json` description).
- All manifests are hand-written. `AGENTS.md` step 7 uses a script only to
  write the version into all four.
- The Claude marketplace keeps three deprecated aliases,
  `expo-app-design`, `upgrading-expo`, and `expo-deployment`, all with
  `"source": "./plugins/expo"`. `AGENTS.md` says Codex and Cursor
  marketplaces "expose only the active `expo` plugin because their
  marketplace entries must match the plugin manifest name".
- One skill is vendored from another repo. `scripts/sync-animate-expo.ts`
  mirrors `skills/animate-expo` from `emilkowalski/skills` and has a
  `--check` mode (`CONTRIBUTING.md`, "Syncing `expo-animation`").

### sickn33/agentic-awesome-skills

- Canonical skills live in `skills/<id>/SKILL.md` (2,376 directories).
  Plugins under `plugins/` are generated mirrors (`AGENTS.md` line 5:
  "Mirrored plugin distributions live under `plugins/`").
- `data/editorial-bundles.json` is the source for bundles. Each entry has
  `id`, `name`, and a list of skill IDs.
  `tools/scripts/sync_editorial_bundles.py` builds, per bundle, a
  directory with `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`,
  a portable root `plugin.json`, and a copy of each listed skill. It also
  writes both marketplace files.
- The generator rewrites skill frontmatter. For example, `risk: critical`
  becomes `metadata: aas-risk: critical` in the mirror
  (`_portable_skill_markdown`).
- Generated files are committed: 16,259 tracked files under `plugins/`.
  `tools/config/generated-files.json` lists derived paths, including
  `.agents/plugins/`, `.claude-plugin/marketplace.json`, and `plugins/`.
- Community PRs change only sources. `AGENTS.md`: "Source PRs should avoid
  generated registry artifacts; CI enforces this source-only contract." A
  protected "canonical-sync PR owns generated state".

### EveryInc/compound-engineering-plugin

- The repo root is the plugin. `.claude-plugin/marketplace.json` has
  `"source": "./"` and `.agents/plugins/marketplace.json` has
  `"path": "./"`. Skills are in `skills/`.
- Manifests for about ten hosts sit at the root: `.claude-plugin/`,
  `.codex-plugin/`, `.cursor-plugin/`, `.grok-plugin/`, `.kimi-plugin/`,
  and others. They are hand-written, and `bun run release:validate` checks
  and syncs their metadata.
- `src/converters/` holds a converter CLI, but its own docs say it is not
  the install path. `docs/solutions/integrations/native-plugin-install-strategy.md`:
  "The Bun converter stays repo tooling for development, compatibility
  fixtures, and legacy cleanup; it is not the user-facing installer."
- `CLAUDE.md` is a symlink to `AGENTS.md`. `AGENTS.md` says a regular-file
  root `CLAUDE.md` "makes `claude plugin validate --strict` fail because
  this checkout is also the plugin root".

### alirezarezvani/claude-skills

- Each domain folder, such as `marketing-skill/`, is a Claude plugin with
  `.claude-plugin/plugin.json` and `skills/`. There are 99 marketplace
  entries.
- Codex gets one root plugin. `.codex-plugin/plugin.json` sets
  `"skills": "./.codex/skills/"`, and `.codex/skills/` holds 374 relative
  symlinks built by `scripts/sync-codex-skills.py`. A workflow,
  `.github/workflows/sync-codex-skills.yml`, commits them on push.
- There is no `.agents/plugins/marketplace.json`. Codex users install by
  script or by copying (`INSTALLATION.md`, Codex section).
- Provenance that Claude Code would reject in `plugin.json` goes into a
  sibling `.claude-plugin/authoring-notes.json` (`scripts/check_plugin_json.py`
  docstring).

## 2. Versioning

| Repo | Where versions live | How they change | Tags | Changelog |
| --- | --- | --- | --- | --- |
| wshobson | Each `plugin.json` and each Claude marketplace entry, per plugin. `metadata.version` 1.7.1 for the marketplace. | By hand. The Codex copy is generated. | None | None |
| hashicorp | Each `plugin.json` and marketplace entry (1.0.0). Skills carry `metadata.version` in frontmatter. | By hand | `v1.0.0` only | Root `CHANGELOG.md` with an Unreleased section |
| expo | One `plugin.json` per host: four for `plugins/expo`, three for `plugins/expo-experiments`, which has no Grok manifest. Marketplace entries carry no version. | `bun scripts/check-plugin-version-bump.ts --set-version <v>`, gated in CI | None | None |
| sickn33 | One global version, `package.json` 18.6.0, stamped into every manifest and marketplace entry by the generator | `npm run release:prepare` and `release:publish` (`tools/scripts/release_workflow.js`) | `v<version>` | Keep a Changelog, root `CHANGELOG.md` |
| compound-engineering | Plugin 3.29.0 in every host manifest. Marketplace 1.0.3 in `metadata.version`. | release-please from conventional PR titles. `AGENTS.md`: "do not hand-bump release-owned versions". | `<component>-v<version>`, such as `compound-engineering-v3.29.0` and `marketplace-v1.0.3` | GitHub Releases. Root `CHANGELOG.md` is a pointer. |
| alirezarezvani | Each `plugin.json` and marketplace entry. Seven distinct values across 99 plugins. | By hand, maintainers after merge | `v<version>`, global | Root `CHANGELOG.md` |

Details worth keeping:

- expo's check is the closest fit to our D17. `scripts/check-plugin-version-bump.ts`
  lists "versioned paths", reads `git diff --name-only origin/main...HEAD`,
  and when any versioned path changed it requires all four manifests to
  match and to be greater than the version on `origin/main`. Its usage
  text: "when any versioned Expo plugin file changes, the Claude, Codex,
  Cursor, and Grok plugin manifests must all be bumped together to the same
  version, and that version must be greater than the one on the base ref."
  The CI job checks out with `fetch-depth: 0` (`.github/workflows/check.yml`).
- expo's list of versioned paths is hard-coded to `plugins/expo/`. A second
  plugin such as `expo-experiments` is not covered. That is the same gap a
  hard-coded list would have in our repo.
- compound-engineering maps file prefixes to release components in
  `src/release/components.ts` (`FILE_COMPONENT_MAP`). release-please writes
  the version into every host manifest through `extra-files` in
  `.github/release-please-config.json`.
- compound-engineering validates the marketplace version separately from
  the plugin version. `scripts/release/validate.ts` reads
  `.github/.release-please-manifest.json` from `origin/main`.
- No repo uses the `<plugin>--v<version>` tag form. compound-engineering's
  release-please form uses a single hyphen. D15 chose bare dependency names
  so that no tags are needed. Nothing here argues against that.

## 3. How a contributor adds a plugin

- wshobson, `CONTRIBUTING.md`, "Adding a plugin": six steps. Create
  `plugins/<name>/` with `.claude-plugin/plugin.json`, add components,
  "Update `.claude-plugin/marketplace.json` with your entry", keep names
  lowercase with no `__`, run `make generate-all`, then `make validate`
  and `make garden`. `docs/authoring.md` holds the frontmatter rules. There
  is no scaffold script.
- hashicorp: contributions are internal only (`CONTRIBUTING.md`).
  `scripts/validate-structure.sh` hard-codes `EXPECTED_BUNDLES=$'packer\nterraform'`
  and "expected exactly 20 canonical Skills". Adding a plugin or skill
  fails CI until the validator, `SKILLS.md`, and `CODEOWNERS` change in the
  same PR.
- expo: the guide covers skills, not plugins. `AGENTS.md` step 8: "Keep the
  skill under the existing `expo` plugin unless there is a clear
  distribution reason to create a new plugin." New skills are scaffolded
  with the `skill-creator` skill (`CONTRIBUTING.md` section 1).
- sickn33: add an entry to `data/editorial-bundles.json`, then run
  `npm run bundles:sync`. The generator creates the plugin directory, all
  manifests, and both marketplace entries. `docs/SKILL_TEMPLATE.md` and
  `docs/contributors/skill-template.md` are templates for skills.
- compound-engineering: one plugin, so new plugins are out of scope. New
  skills need maintainer approval in an issue first (`CONTRIBUTING.md`).
  A new skill needs a `docs/guides/<skill-name>.md` page and a count bump
  in `tests/release-metadata.test.ts`.
- alirezarezvani: contributors add a skill folder only.
  `CONTRIBUTING.md`, "After Your PR is Merged": maintainers update
  "domain plugin.json counts" and "marketplace.json".

The pattern that scales is sickn33's: one data file names each plugin and
its contents, and the generator writes the whole plugin. wshobson
generates only the Codex side, so a contributor still writes the Claude
manifest and marketplace entry by hand. The pattern that fails
loudly is hashicorp's: a validator that states the exact expected set.

## 4. Shared content between plugins

No repo declares a dependency between plugins. Each one picks one of three
approaches.

1. Copy, then check that the copies agree.
   - wshobson copies shared agents into every plugin that offers them.
     `tools/doc_gardener.py`, `check_agent_divergence`: "Plugins are
     installed individually, so a shared agent is genuinely copied into
     each plugin that offers it. A verbatim copy is therefore expected and
     is not reported at all." Diverged copies raise
     `AGENT_BODY_DIVERGENT`. Intended variants go in
     `INTENTIONAL_AGENT_VARIANTS`, and a stale entry raises
     `STALE_AGENT_VARIANT`.
   - alirezarezvani publishes some skills twice, bundled and standalone.
     `scripts/sync_skill_bundles.py` copies them, and
     `scripts/check_dual_publish.py` fails CI on any difference.
   - sickn33 copies each canonical skill into every bundle that lists it
     and asserts the mirrors match (`_assert_skill_mirror_matches` in
     `tools/scripts/sync_editorial_bundles.py`).
2. Put everything in one plugin. hashicorp, expo, and compound-engineering
   do this.
3. Tell the user in prose. alirezarezvani's `c-level-skills` description
   says to "install the separate companion c-level-agents plugin for the
   persona layer". Nothing enforces it.

sickn33 also runs a per-skill portability check,
`tools/scripts/plugin_compatibility.py`. It marks a skill `blocked` for a
runtime when a link leaves the skill directory
(`escaped_local_reference`), a link target is missing, the text names an
absolute host path, or it names another runtime's home directory, such as
`~/.claude` in a skill shipped to Codex (`target_specific_home_path`). This
is close to the check in our `sync.mjs` that refuses upstream bodies that
reference files we do not ship.

## 5. Validation

### What each repo checks

- wshobson, `tools/validate_generated.py` (`validate_codex`): every
  generated Codex `SKILL.md` has frontmatter, `name` equals its directory,
  and `description` is not empty. A file over `8 * 1024` bytes is an
  error. `AGENTS.md` over 150 lines is a warning.
- wshobson, `tools/doc_gardener.py`: stale generated files, context files
  over their line caps, dead links, `SKILL_OVER_CODEX_CAP`, marketplace
  entries with no directory (`MARKETPLACE_ORPHAN`), directories with no
  entry (`MARKETPLACE_MISSING`), stale counts in `README.md` and
  `AGENTS.md`, and diverged agent copies. `CONTRIBUTING.md` notes that main
  "carries ten `SKILL_OVER_CODEX_CAP` warnings".
- wshobson, `.github/workflows/validate.yml`: runs `make generate-all`,
  then fails if `git status --porcelain` is not empty. It also checks that
  each marketplace `source` resolves to a directory with a `plugin.json`,
  and that each `git-subdir` entry has an `https://github.com/*.git` URL,
  a normalized relative path, and an optional 40-character `sha`.
- hashicorp, `scripts/validate-structure.sh`: both marketplaces list the
  same exact plugin set, each `source` is `./plugins/<product>`, each
  manifest `name` matches its directory and sets `"skills": "./skills/"`,
  required metadata is present, and the Codex manifest has every
  `interface` field. Skill `name` equals its directory, and
  `metadata.lifecycle-status` is one of four values. Every skill has a
  `SKILLS.md` row and a `CODEOWNERS` line. Removed plugin IDs may appear
  only in `README.md` and `CHANGELOG.md`.
- expo, `scripts/check-skill-limits.ts`: `MAX_DESCRIPTION = 1024`
  characters, `MAX_BODY_LINES = 500`, naming prefixes, a required feedback
  block, catalog sync, and Codex metadata. Plus the version check in
  section 2 and `scripts/check-overview-routing.ts`. `AGENTS.md` lists
  `claude plugin validate .` and `claude plugin validate ./plugins/expo`
  as manual checks. CI does not run them.
- sickn33: `plugin-compat:check` and `bundles:check` run in
  `.github/workflows/pages.yml`. `tools/config/validation-budget.json` sets
  `"maxWarnings": 0`, so a new warning fails the build.
- compound-engineering: `bun run plugin:validate` runs
  `claude plugin validate --strict` on `.claude-plugin/marketplace.json`
  and on `.claude-plugin/plugin.json` as two calls. `AGENTS.md` says not to
  use `claude plugin validate .` because it "resolves this repo as a
  marketplace only" and "skips plugin-root checks". CI installs a pinned
  `@anthropic-ai/claude-code@${{ env.CLAUDE_CODE_VERSION }}`
  (`.github/workflows/ci.yml`). `release:validate` checks that every host
  manifest exists, carries the root plugin version, points at existing
  assets, and lists the same plugin IDs as the Claude catalog.
  `tests/codex-skill-prompt-budget.test.ts` holds each `SKILL.md` under
  8,000 bytes with a shrinking `OVER_BUDGET` list.
- alirezarezvani, `scripts/check_plugin_json.py`: `plugin.json` may have
  exactly eight keys. Its docstring says "Claude Code's manifest validator
  rejects the whole plugin.json on ANY unrecognized key (issue #954)" and
  that Claude Code 2.1.145 rejects a `skills` path without a leading `./`.
  `scripts/derive_counters.py --check` fails on stale headline counts.

### Size caps, checked against Codex source

Read from `openai/codex` main on 2026-09-26. The last commit to
`codex-rs/ext/skills/src/render.rs` was `e72da2b53805`.

| Constant | Value | File | What it bounds |
| --- | --- | --- | --- |
| `MAX_SKILL_PROMPT_BYTES` | 8,000 bytes | `codex-rs/ext/skills/src/render.rs` | The injected body of a selected skill, cut at a character boundary, keeping the start |
| `DEFAULT_SKILL_METADATA_CHAR_BUDGET` | 8,000 | same | The whole skills listing, not any body |
| `MAX_CATALOG_SKILL_DESCRIPTION_CHARS` | 1,024 | same | One description in the listing, cut with `...` |
| `DEFAULT_PROJECT_DOC_MAX_BYTES` | `32 * 1024` | `codex-rs/config/src/config_toml.rs` | `AGENTS.md` content, set by `project_doc_max_bytes` |

Where the 8,000-byte body cut applies:

- `codex-rs/ext/skills/src/host_prompt.rs`, `load_skill_prompts`, cuts
  only when `is_agent_plugin_skill(skill)` is true.
- A skill counts as an agent-plugin skill when its plugin's manifest is a
  root `plugin.json` whose `$schema` starts with
  `https://agent-plugins.org/schemas/`
  (`find_plugin_manifest_path` in `codex-rs/utils/plugins/src/plugin_namespace.rs`,
  and `load_plugin_manifest_with_format` in `codex-rs/core-plugins/src/manifest.rs`).
  Our plugins have no root `plugin.json`, so they load as the legacy
  format.
- `codex-rs/ext/skills/src/extension.rs` line 489 cuts every selected
  entry with no such condition. I did not trace when this extension path
  is active in the CLI.
- compound-engineering hit the first path in practice.
  `docs/solutions/integrations/agent-plugins-schema-is-a-host-routing-switch.md`
  records "Codex >= 0.147 warns" that a skill "exceeded the main prompt
  context limit and was truncated", after it added the agent-plugins
  `$schema` to its root `plugin.json`. Removing the `$schema` fixed it.
- The warning text is "Skill `<name>` exceeded the main prompt context
  limit and was truncated." compound-engineering reports that the model
  "proceeded on the truncated prompt" instead of reading the file again.
- sickn33 bundle plugins ship a root `plugin.json` with the agent-plugins
  `$schema`. On Codex those bundles would take the cutting path.
- wshobson states the cap as 8 KB, uses `8 * 1024`, and says in
  `tools/adapters/codex.py` that "skills above Codex's 8 KB injection cap
  are truncated by Codex at load". The source shows the cap is conditional
  and is 8,000 bytes.

Our sizes: `plugins/adhd-unslop/skills/adhd-unslop/SKILL.md` is 9,976
bytes, `au-i-have-adhd` is 7,142, and `au-unslop` is 6,120. `AGENTS.md` is
3,424 bytes. If the composed skill were cut at 8,000 bytes, the loss would
be the last 1,976 bytes. The build joins intro, load, precedence,
lifecycle, and final check in that order (`compose()` in `tools/build.mjs`),
so the final check and the end of the lifecycle section would go.

### Our manifests pass strict validation

With Claude Code 2.1.283 and a throwaway `CLAUDE_CONFIG_DIR`, `claude
plugin validate --strict` passed on `.claude-plugin/marketplace.json`,
`plugins/adhd-unslop`, `plugins/au-i-have-adhd`, and `plugins/au-unslop`.
Our CI runs `sync.mjs --check`, `build.mjs --check`, and the unit tests
(`.github/workflows/daily-build.yml`), but not this validator.

## 6. Where these repos contradict or improve on our design

### Contradictions

- Plugin dependencies. We rely on `dependencies` (D15). None of the six
  does. That does not show the field is wrong. It does mean no popular repo
  has tested it for us, and D16 already records that updates do not follow
  dependencies.
- Codex hooks. expo's `AGENTS.md` says "Codex and Cursor cannot host
  plugin hooks (verified against their sources; don't re-investigate)".
  Our D12 to D15 record Codex plugin hooks running after trust in
  `/hooks`, tested on Codex 0.154.0. Our evidence is newer and was tested
  directly, so it stands. Expect contributors who read expo to doubt it.
- Repo-root plugin source. D10 rejects `"source": "./"` because Codex
  copied `.git`, `design/`, and `tests/` into its cache.
  compound-engineering ships exactly that layout. They accept the cost of
  a large cache copy. D10 stays right for a multi-plugin repo.
- Symlinks. D10 records that Codex install skips symlinks.
  alirezarezvani's Codex `skills` path is a symlink tree, but it has no
  Codex marketplace and installs by copying, so it never exercises the
  plugin install path.

### Improvements we can adopt

- A CI version gate like expo's, computed per plugin from generated
  output. `build.mjs` already knows which files belong to each plugin.
- A strict validator step in CI like compound-engineering's, with a
  pinned Claude Code version. Validate the marketplace file and each
  plugin directory by path, not `validate .`.
- A size gate on each shipped `SKILL.md`, with the 8,000-byte figure and
  the Codex file it comes from in the test. compound-engineering's test
  comment is a good model: it names the source constant and says which
  host bound it does not cover.
- A data-driven plugin list like sickn33's, where adding a plugin means
  adding an entry and running the build.
- A deprecated alias entry like expo's, if we ever rename a plugin, for
  example to drop the `au-` prefix. Only the Claude marketplace can hold
  aliases. The Codex marketplace name must match the manifest name.

## Implications for adhd-unslop

1. The Codex 8,000-byte cut is not a confirmed bug, but it is the item
   with the largest cost if it is real. Source reading says our
   legacy-format plugins skip the cut in `host_prompt.rs`, but
   `extension.rs` cuts without that condition. Until a test settles it,
   treat 9,976 bytes as a risk. Two cheap fixes exist either way. Move the
   final check above the lifecycle section, since cuts keep the start of
   the file. Or bring the composed body under 8,000 bytes, for example by
   moving the outcome table in `10-precedence.md` to a `references/` file.
   Add a test that fails when any shipped `SKILL.md` exceeds 8,000 bytes,
   citing `codex-rs/ext/skills/src/render.rs`. The passing runs in D21 do
   not settle this: `tests/e2e/run.sh` never checks for text from
   `90-final-check.md` or the end of `20-lifecycle.md`, so it would pass
   whether or not Codex cut the file.
2. `tools/build.mjs` cannot build a `presentation` plugin today.
   `expectedFiles()` writes manifests for every entry but writes skill
   files only for `kind: "vendored"`. The composed skill, hook chunks, and
   `hooks/dependencies.json` are hard-wired to `COMPOSED = "adhd-unslop"`.
   If `presentation` is added to `tools/plugins.json` as the README
   describes, the build writes two manifests and no skill, and
   `build.mjs --check` still passes. Fix this before the plugin arrives:
   - Give each plugin entry a `src/<name>/` source directory, or add a
     kind such as `"authored"` whose skill files are copied from
     `src/<name>/skills/`.
   - Add a test that every plugin in `tools/plugins.json` ships at least
     one `SKILL.md`, and that every `dependencies` entry names a plugin in
     the same file.
   - Consider hashicorp's approach too: a test that states the exact
     plugin list, so an unplanned change fails loudly.
3. The missing-plugin warning does not extend to new plugins.
   `plugins/adhd-unslop/hooks/check-deps.mjs` and its generated
   `dependencies.json` live only in `adhd-unslop`. A Codex user of
   `presentation` who lacks `au-i-have-adhd` gets no warning. D13 forbids a
   second always-on hook, not a second dependency check. Today
   `check-deps.mjs` and `lib.mjs` are hand-written inside
   `plugins/adhd-unslop/hooks/`. Move them to a shared source, such as
   `src/hooks/`, and have `build.mjs` copy them, with a `hooks.json` that
   holds only the check handler, into every plugin that declares
   `dependencies`. Codex install copies only the plugin's own directory
   (D10), so each plugin needs its own copy. Codex runs it
   only after the user trusts it in `/hooks`, as today. A check hook
   injects no rules, so it does not conflict with D13.
4. Enforce D17 in CI. Port expo's check: for each plugin, if any file
   under `plugins/<name>/` differs from `origin/main`, its version in
   `tools/plugins.json` must be greater than on `origin/main`. Set
   `fetch-depth: 0` in the verify workflow. This covers hand edits to the
   overlay, which the bump script does not.
5. Add `claude plugin validate --strict` to CI with a pinned CLI version,
   run on `.claude-plugin/marketplace.json` and on each `plugins/<name>`.
   It passes today. The pin keeps a schema change in a new Claude Code
   release from failing CI without notice.
6. Keep `dependencies`, but record in `DECISIONS.md` that none of the six
   repos uses it, and that copy plus a drift check is the common
   alternative. If Claude Code dependency installs cause more trouble than
   D16 already lists, that alternative is ready. `build.mjs` could copy
   `au-i-have-adhd`'s skill into `presentation`, and a test could require
   the copies to match byte for byte, as `check_dual_publish.py` does. D4
   rejected copying for duplication, but a build-time copy with a check
   costs little.
7. Generated files stay committed. Every repo that installs from a git
   marketplace commits its registries and manifests. wshobson and
   compound-engineering fail CI on drift, as we do. sickn33 goes further
   and keeps generated files out of contributor PRs. That suits a large
   community repo more than ours.
8. Keep `CLAUDE.md` absent. Three repos make `CLAUDE.md` a symlink to
   `AGENTS.md`. Our plugins live under `plugins/`, so the plugin-root
   concern that compound-engineering records does not apply, and no
   change is needed.

## Claims to test

1. Codex 0.154.0 injects the full 9,976-byte `adhd-unslop` `SKILL.md` on
   a typed `$adhd-unslop:adhd-unslop`. Test it by extending
   `tests/e2e/run.sh`, which already does the setup AGENTS.md and D21
   require: a throwaway home, the marketplace add, `codex plugin add`, a
   copied `auth.json`, a working directory away from any marketplace copy,
   and `</dev/null`. Add one assertion to its Codex run. Search the rollout
   files under the throwaway `$CODEX_HOME/sessions/` for the last line of
   `90-final-check.md`, and fail if the text "exceeded the main prompt
   context limit" appears. The check then stays in the suite.
2. The cutting path in `codex-rs/ext/skills/src/extension.rs` is not
   active in the Codex CLI by default. Find what installs the skills
   extension and whether a flag enables it.
3. Claude Code, after auto-compaction, re-attaches each invoked skill with
   only its first 5,000 tokens, within a 25,000-token combined budget.
   This is compound-engineering's reading of code.claude.com/docs/en/skills
   (`tests/codex-skill-prompt-budget.test.ts` comment). Our explicit
   invocation loads three skills of about 2,500, 1,800, and 1,500 tokens,
   so each fits. Confirm the numbers and whether the order kept is by
   recency.
4. Claude Code rejects a `plugin.json` that has any unrecognized key
   (alirezarezvani, issue #954). Our generated manifests have only known
   keys. Test whether the `--strict` validator and the installer agree.
5. A Claude marketplace entry that omits `version` falls back to the
   `plugin.json` version (expo's entries omit it). If so, `build.mjs` could
   drop `version` from marketplace entries and keep one copy per plugin.
6. `"strict": false` on a marketplace entry, as hashicorp uses, changes
   nothing when the plugin also has a `plugin.json`. Test before relying on
   it.
7. A deprecated alias entry in the Claude marketplace, pointing at the
   same `./plugins/<name>` directory, installs and updates cleanly next to
   the real entry (expo's pattern). Test before any plugin rename.
8. A per-plugin version gate based on `git diff origin/main` works in the
   `upstream-bump` workflow, where `sync.mjs` already raises versions, and
   does not double-count a bump.
