# Manifests and Codex loading

This note covers the smallest manifest layout that works in both Claude Code and Codex, and what Codex needs to load a plugin. It draws on seven public repos, the Codex source, and runs of the real CLIs in throwaway homes.

## Sources and versions

- Codex source: `openai/codex` main at `b334d5b3f` (2026-09-26 15:48 UTC), a shallow clone, so no file history.
- CLIs used for runs: Codex CLI 0.154.0 and Claude Code 2.1.283. Every run used a temp `HOME`, `CODEX_HOME`, and `CLAUDE_CONFIG_DIR` under the scratchpad. Nothing touched `~/.claude` or `~/.codex`.
- Repos, shallow clones at these commits:

| Repo | Commit |
| --- | --- |
| trailofbits/skills | `0cc1c73` |
| cloudflare/skills | `626547c` |
| addyosmani/agent-skills | `2686b62` |
| cathrynlavery/diagram-design | `dc1ace4` |
| android/skills | `42dc227` |
| hashicorp/agent-skills | `516354c` |
| AvdLee/SwiftUI-Agent-Skill | `b24e68a` |

Two sources of Codex rules exist, and this note keeps them apart:

- The runtime loader in `codex-rs/core-plugins/src` and `codex-rs/ext/skills/src`. This decides what the Codex CLI loads.
- The OpenAI ingestion contract, used for the OpenAI plugin directory and ChatGPT workspace imports. It appears in `codex-rs/skills/src/assets/samples/plugin-creator/scripts/validate_plugin.py` and in the submission-errors docs that trailofbits cites. The file says "The validator mirrors the workspace plugin ingestion schema". It is much stricter than the runtime.

## Question 1: the files each repo ships

Two layouts are in use:

- Claude only (trailofbits). Codex reads the Claude files.
- Native files for each runtime (hashicorp, diagram-design, cloudflare, addyosmani, android).

AvdLee ships native manifests but no Codex marketplace, because it distributes through the OpenAI plugin directory.

### trailofbits/skills

- Claude Code: `.claude-plugin/marketplace.json`, with string sources such as `"source": "./plugins/audit-context-building"` plus `version`, `description`, and `author`. Also `plugins/<name>/.claude-plugin/plugin.json`, with `name`, `version`, `description`, and `author`, and components at default paths: `skills/`, `hooks/hooks.json`, and `.mcp.json`.
- Codex: the same files. There is no `.agents/` and no `.codex-plugin/`. `AGENTS.md:40` says "Codex supports `.claude-plugin/marketplace.json` and `plugins/<name>/.claude-plugin/plugin.json` directly, so do not add duplicate Codex-only sidecar metadata." `AGENTS.md:45` says the sidecars "drift out of sync with the canonical metadata, which is why the last set was removed in #173."
- The ban is enforced. `.github/scripts/validate_plugin_metadata.py:70-75` lists `FORBIDDEN_SIDECAR_PATHS = (".codex", ".opencode", ".agents")` and `FORBIDDEN_PLUGIN_SIDECARS = (".codex-plugin", ".opencode-plugin")`.
- Decorative for the CLIs: `skills/<skill>/agents/openai.yaml`, in 74 of 85 skills. The README says they exist for ChatGPT workspace imports: "Skills that include `agents/openai.yaml` also need `interface.display_name` and `interface.short_description`". Only `review-walkthrough` sets `policy.allow_implicit_invocation: false`, and that skill also has `disable-model-invocation: true`. That pairing matches our D8.
- Hooks use `${CLAUDE_PLUGIN_ROOT:-.}` in `plugins/gh-cli/hooks/hooks.json`, and Codex sets that variable too.

### cloudflare/skills

A single plugin at the repo root.

- Claude Code: `.claude-plugin/marketplace.json` with `"source": "./"`, and `.claude-plugin/plugin.json` with `"mcpServers": "./.mcp.json"`. Also `skills/` and `.mcp.json`.
- Codex: `.agents/plugins/marketplace.json`, whose entry uses `"source": {"source": "url", "url": "https://github.com/cloudflare/skills.git"}`. Codex therefore installs from a fresh clone, not from the marketplace checkout.
- Codex also finds a root `plugin.json` with `"$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"`. Codex checks that file before `.codex-plugin/plugin.json` (see question 2), so it loads cloudflare as an Agent Plugin. `.codex-plugin/plugin.json` then acts as an overlay that supplies only `interface`, `hooks`, and `apps`. MCP comes from `mcp.json`, without the dot, because the Agent Plugin path forces `./mcp.json`.
- Also shipped: `.cursor-plugin/`.
- SKILL.md frontmatter uses `name` and `description` only. No `agents/openai.yaml`.

### addyosmani/agent-skills

A single plugin at the repo root.

- Claude Code: `.claude-plugin/marketplace.json` with `"source": {"source": "github", "repo": "addyosmani/agent-skills"}`, and `.claude-plugin/plugin.json` with `commands`, `"skills": "./skills"`, and `experimental.evals`.
- Codex: `.agents/plugins/marketplace.json` with `"source": {"source": "local", "path": "./"}`, and `.codex-plugin/plugin.json` with `"skills": "./skills/"` and `interface`.
- The `.agents` file is required here. Codex does not support a `github` source object and skips such entries (question 2).
- The root `plugin.json` has no `$schema`. `docs/copilot-cli-setup.md:40` says it is for Copilot CLI. Codex ignores it.
- `scripts/validate-versions.js` keeps the version equal across five files: `plugin.json`, `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, and `.agents/plugins/marketplace.json`.
- CI (`.github/workflows/test-plugin-install.yml`) runs `claude plugin validate .` and a real `claude plugin install`. It has no Codex check.

### cathrynlavery/diagram-design

- Claude Code: `.claude-plugin/marketplace.json`, whose entry has only `"name"` and `"source": "./"`. Also `.claude-plugin/plugin.json`, `skills/diagram-design/`, and `commands/`.
- Codex: `.agents/plugins/marketplace.json` (local `./`, `policy`, `category`) and `.codex-plugin/plugin.json` (same identity, plus `skills` and `interface`).
- Also shipped: `.factory-plugin/`.
- `docs/adr/0008-native-host-manifests-share-one-plugin-root.md` states the rule: "Claude, Codex, and Factory each receive the smallest native manifest and marketplace metadata their host needs." It also says "The package verifier rejects drift". `scripts/verify-plugin-package.py` enforces that.
- `docs/adr/0009-versions-are-bumped-on-main-after-merge.md` moves version bumps to a workflow on `main`, because bumping in every PR "put every other open PR into merge conflict".
- CI runs `npx --yes @anthropic-ai/claude-code@2.1.229 plugin validate . --strict`, a pinned version in strict mode.

### android/skills

- Claude Code: `.claude-plugin/marketplace.json` has one entry with `"source": "./"`, `"strict": false`, and an explicit `skills` list of 25 paths. There is no `.claude-plugin/plugin.json`. Skills live in topic folders such as `performance/r8-analyzer/`, not in `skills/`.
- Codex: `.agents/plugins/marketplace.json` (`"source": "url"`, `"ref": "main"`) and `.codex-plugin/plugin.json`. That manifest lists `skills` as an array of objects such as `{"source": {"path": "./camera/camerax"}}`.
- The Codex CLI rejects that shape. A local copy with the source switched to `./` loaded 0 skills, and Codex 0.154.0 logged "ignoring skills: expected a string or string array; found array". The object form may target the OpenAI directory rather than the CLI. This conflicts with the brief's assumption that these repos are correct, so it is listed under claims to test.

### hashicorp/agent-skills

This repo is the closest match to ours: several plugins under `plugins/`, with both native files for each.

- Claude Code: `.claude-plugin/marketplace.json`, with entries like `"source": "./plugins/terraform"`, `version`, `category`, and `"strict": false`. Also `plugins/<name>/.claude-plugin/plugin.json` with `"skills": "./skills/"`.
- Codex: `.agents/plugins/marketplace.json` (local path, `policy`, `"category": "Developer Tools"`) and `plugins/<name>/.codex-plugin/plugin.json`. That file has the same fields plus `interface`, with `defaultPrompt` given as a single string.
- One skill has `agents/openai.yaml` with `display_name`, `short_description`, and `default_prompt`.
- CI checks structure and links only.

### AvdLee/SwiftUI-Agent-Skill

- Claude Code: `.claude-plugin/marketplace.json` (`"source": "./"`, plus `tags` and `category`) and `.claude-plugin/plugin.json` (`"skills": ["./skills/swiftui-expert-skill"]`).
- Codex: the README's "Option B" installs from the OpenAI plugin directory. The repo has no `.agents/plugins/marketplace.json`. Its `.agents/` holds only a maintainer skill.
- For the Codex loader, the root `plugin.json` (agent-plugins `$schema`) comes first and `.codex-plugin/plugin.json` supplies the interface overlay. If someone adds the repo as a Codex marketplace, Codex reads `.claude-plugin/marketplace.json`.
- The root `agents/openai.yaml`, with `name`, `version`, and `skills`, is not a file the Codex skill loader reads. The loader reads only `<skill>/agents/openai.yaml`.
- The root `swiftui-expert-skill` is a symlink to `skills/swiftui-expert-skill`.

### Summary: required and decorative, for the Codex CLI

| File or field | Codex CLI runtime | Notes |
| --- | --- | --- |
| One marketplace file at a supported path | Required | The first match wins (question 2) |
| One discoverable `plugin.json` per plugin | Required, unless the entry carries fallback fields | `.claude-plugin/plugin.json` is enough |
| `name` matching the marketplace entry | Required at install | `store.rs:318` |
| Non-blank `version` | Needed for updates | A missing version installs into a `local` directory |
| `skills/`, `hooks/hooks.json`, `.mcp.json` | Found by default | No manifest field needed |
| `.codex-plugin/plugin.json` when `.claude-plugin/plugin.json` exists | Decorative | Adds only `interface` |
| `interface` block | Decorative | Shown in plugin lists and the TUI |
| Marketplace `policy` | Decorative when it states defaults | Defaults are `AVAILABLE`, `ON_INSTALL`, and no product limit |
| `agents/openai.yaml` `interface` | Decorative | Skill display name and short description |
| `agents/openai.yaml` `policy.allow_implicit_invocation` | Functional | Hides the skill from the model (our D7 and D8) |

## Question 2: what the Codex source does

### Marketplace files

`codex-rs/core-plugins/src/marketplace.rs:20-25`:

```rust
const MARKETPLACE_MANIFEST_RELATIVE_PATHS: &[&str] = &[
    ".agents/plugins/marketplace.json",
    ".agents/plugins/api_marketplace.json",
    ".claude-plugin/marketplace.json",
    ".cursor-plugin/marketplace.json",
];
```

`find_marketplace_manifest_path` (`marketplace.rs:324-334`) returns the first file that exists. The test `list_marketplaces_prefers_first_supported_manifest_layout` (`marketplace_tests.rs:1121`) puts both files in one repo and asserts one marketplace, the `.agents` one. When both files exist, Codex never reads `.claude-plugin/marketplace.json`.

Fields Codex reads from a marketplace (`marketplace.rs:969-1044`):

- Top level: `name` and `plugins`, both required, plus `interface.displayName`, which is optional. Claude's `owner`, `metadata`, `description`, and `$schema` are ignored.
- Each entry: `name` and `source`, both required, plus `policy` and `category`. Every other field is kept as `manifest_fields` for the fallback described below.
- `source` may be a string path, or an object tagged `local`, `url`, `git-subdir`, or `npm`. Anything else, such as Claude's `{"source": "github", ...}`, is `Unsupported`. The entry is dropped with "skipping marketplace plugin with unsupported source" (`marketplace.rs:575`).
- A local path must start with `./` (`marketplace.rs:676`). Only Cursor marketplaces may omit the prefix. `"./"` means the marketplace root.

### Plugin manifests

`codex-rs/exec-server-protocol/src/protocol.rs:49-53`:

```rust
pub const DISCOVERABLE_PLUGIN_MANIFEST_PATHS: &[&str] = &[
    ".codex-plugin/plugin.json",
    ".claude-plugin/plugin.json",
    ".cursor-plugin/plugin.json",
];
```

`find_plugin_manifest_path` (`codex-rs/utils/plugins/src/plugin_namespace.rs:43-80`) checks a root `plugin.json` first. It uses that file only when its `$schema` is an agent-plugins.org URI, and then it falls through the list above in order. A manifest that is a symlink is rejected, because `symlink_metadata` does not report it as a file.

`.codex-plugin/plugin.json` and `.claude-plugin/plugin.json` go through the same "legacy" parser (`codex-rs/core-plugins/src/manifest.rs:280-410`).

- The struct has no `deny_unknown_fields`, so Claude-only keys such as `dependencies`, `commands`, and `author` are ignored.
- Codex reads `name`, `version`, `description`, `keywords`, `skills`, `mcpServers`, `apps`, `hooks`, and `interface` from either file. The test `plugin_manifest_uses_alternate_discoverable_path` (`manifest.rs:873`) reads `interface.displayName` from a `.claude-plugin/plugin.json`.
- An empty `name` falls back to the plugin directory name (`manifest.rs:309-312`).

What Codex requires of a manifest:

- It must parse as JSON.
- At install, the name must match the marketplace entry. `store.rs:318` fails with "plugin.json name `{plugin_name}` does not match marketplace plugin name".
- A missing `version` becomes `DEFAULT_PLUGIN_VERSION`, which is `"local"` (`codex-rs/core-plugin-common/src/installed.rs:10`, used at `store.rs:431`). A blank version is an error (`store.rs:516`).
- Path fields must start with `./` and must not contain `..` (`manifest.rs:620-672`).

### Default component paths

`codex-rs/core-plugins/src/loader.rs:67-70` defines `skills`, `hooks/hooks.json`, `.mcp.json`, and `.app.json`.

- Skills: when the manifest's `skills` list is empty, Codex uses `skills/` if it exists (`loader.rs:1084-1107`). A manifest `skills` value replaces the default. It does not add to it. `plugin-creator/references/plugin-json-spec.md` says the reverse ("supplemented on top of default component discovery"), and the code wins.
- Skill discovery: legacy manifests scan recursively, up to depth 6 (`ext/skills/src/loader/mod.rs:30`). Agent Plugin manifests scan direct children only.
- Hooks: when the manifest has no `hooks` field, Codex reads `hooks/hooks.json` (`loader.rs:1186-1245`). The field can hold a path, a list of paths, an inline object, or a list of inline objects.

### `strict: false` and the entry fallback

Codex never reads `strict`. It lands in `manifest_fields` like any other extra key, and the test at `marketplace_tests.rs:704` asserts that it is copied into the fallback JSON.

- The fallback manifest is built from the entry: `name`, `category`, all extra fields, and an `interface` derived from `displayName`, `author.name` (as `developerName`), and `homepage` (as `websiteUrl`) (`marketplace.rs:1063-1136`).
- The fallback is used only when the plugin directory has no discoverable manifest (`marketplace.rs:527-534`, `manager.rs:2657-2670`). `store.rs:411` says: "A real plugin manifest always wins. The fallback only fills the gap for marketplace sources that cannot be changed in place". At install, Codex writes the fallback to `.codex-plugin/plugin.json` in the cache copy.
- So a Claude `strict: false` entry with component fields works in Codex only when the plugin has no `plugin.json`. hashicorp sets `strict: false`, but Codex reads hashicorp's `.agents/plugins/marketplace.json` first and never parses its Claude entries. The on-disk manifest rule would matter there only if `.agents/` were removed.

### Policy

Policy comes only from the marketplace entry. The defaults (`marketplace.rs:166-184`) are `installation: AVAILABLE` and `authentication: ON_INSTALL`, with `products` unset.

- A Claude marketplace entry has no `policy`, so it gets these defaults.
- `products: ["CODEX"]` passes for CLI, Exec, VSCode, and MCP sessions, which all map to `Product::Codex` (`codex-rs/protocol/src/protocol.rs:2994-3003`). It blocks ChatGPT and Atlas.
- The check applies only when a plugin is admitted. `manager.rs:671-676` says: "Product restrictions are enforced at marketplace admission time ... runtime plugin loading trusts the contents of that CODEX_HOME and does not re-filter configured plugins by product". Subagent threads therefore keep the plugin.
- `plugin-creator/SKILL.md` says: "Add `policy.products` only when the user explicitly asks for that override."

### What Codex loses without `.codex-plugin`

I ran `codex app-server` with `plugin/list` and `plugin/read` against two copies of this repo. The first copy is unchanged. The second has `.agents/` and every `plugins/*/.codex-plugin/` removed. The dump script was a temporary file in the session scratchpad. It sends the same RPC sequence described in question 3 and prints each plugin's skills, hooks, and interface.

| Item | With both native files | Claude files only |
| --- | --- | --- |
| Marketplace file read | `.agents/plugins/marketplace.json` | `.claude-plugin/marketplace.json` |
| Marketplace `interface.displayName` | "ADHD Unslop" | none |
| Plugins and `localVersion` | 3: 0.1.0, 0.1.1, 0.2.2 | same |
| Skills | `au-i-have-adhd:i-have-adhd`, `au-unslop:unslop`, `adhd-unslop:adhd-unslop` | same |
| Skill interface from `openai.yaml` | present | same |
| Hooks | 4 `sessionStart`, keys `adhd-unslop@adhd-unslop:hooks/hooks.json:session_start:0:0` to `1:0` | same keys |
| Install and auth policy | `AVAILABLE`, `ON_INSTALL` | same |
| Plugin `interface` | displayName, descriptions, developerName, capabilities, defaultPrompt, brandColor | all null |
| Category | "Productivity" | "productivity", from the Claude entry |

The second copy removed both sidecars at once, so the losses have two causes:

- The marketplace `displayName` and the capitalized category disappear because `.agents/` is gone.
- The plugin `interface` disappears because `.codex-plugin/` is gone. Removing only `.codex-plugin/` would lose only that.

A third copy moved the Codex `interface` into `.claude-plugin/plugin.json` and added `interface.displayName` to `.claude-plugin/marketplace.json`. Codex then showed the full interface and the marketplace display name. Claude Code 2.1.283 `plugin validate --strict` failed on both files with "interface: Unknown field 'interface'. Claude Code ignores it at load time." Validation without `--strict` passes. One merged manifest therefore costs strict validation in Claude Code. This likely explains why the dual-native repos keep a separate `.codex-plugin/plugin.json`.

### The Agent Plugins root manifest

A root `plugin.json` with the agent-plugins.org `$schema` changes how Codex loads the plugin (`core-plugins/src/agent_plugin_manifest.rs`).

- It takes precedence over `.codex-plugin/plugin.json`.
- `skills` is forced to `./skills` and `mcpServers` to `./mcp.json`.
- `interface.category` defaults to "Other".
- Skill discovery becomes direct children only.
- `.codex-plugin/plugin.json` is read only as an overlay for `interface`, `hooks`, `apps`, and the onboarding skill.
- The default version is `1.0.0` (`store.rs:29`).
- For Agent Plugins, `load_plugin_apps` returns no apps and commands are not migrated (`loader.rs:1133-1137`).

cloudflare and AvdLee use this format.

## Question 3: trailofbits' Codex loadability check

File: `trailofbits_skills/.github/scripts/check_codex_loadability.py`.

- It reads `.claude-plugin/marketplace.json` for the marketplace name and plugin names.
- It creates a temp dir holding `home/` and `codex-home/`, and writes `codex-home/config.toml` with `[features] plugins = true` and `plugin_hooks = true`.
- Environment: `HOME` and `USERPROFILE` point at the temp home, plus `CODEX_HOME`, `CODEX_APP_SERVER_DISABLE_MANAGED_CONFIG=1`, and `RUST_LOG=warn`.
- Command: `codex app-server --listen stdio:// --enable plugins --enable plugin_hooks`, with the repo as working directory. It speaks JSON-RPC as one JSON object per line on stdin and stdout.
- Calls, in order:
  1. `initialize` with `clientInfo` and `capabilities: {experimentalApi: true, requestAttestation: false, optOutNotificationMethods: []}`
  2. The `initialized` notification
  3. `plugin/list` with `{"cwds": [repo], "marketplaceKinds": ["local"]}`
  4. For each plugin, `plugin/read` with `{"marketplacePath", "remoteMarketplaceName": null, "pluginName"}`
- Assertions:
  - There are no `marketplaceLoadErrors`.
  - The marketplace is listed.
  - Every plugin is listed.
  - For each plugin, the count of loaded skills equals the count of `SKILL.md` files under `plugins/<name>/skills`.
  - For each plugin, the MCP server names match `.mcp.json`.
- It installs nothing, makes no model call, and needs no auth. No API key or `auth.json` exists in the temp home.
- `.github/workflows/validate.yml` runs it on `ubuntu-latest` with no secrets. Codex is installed with `npm install --global --prefix "$RUNNER_TEMP/codex-cli" "@openai/codex@${CODEX_CLI_VERSION}"`, with `CODEX_CLI_VERSION: "0.146.0"` pinned.
- The same workflow runs `check_claude_loadability.py`, which also runs without auth. It runs these commands:
  - `claude plugin validate --strict` on the marketplace and on each plugin
  - `claude plugin marketplace add <repo>`
  - `claude plugin list --available --json`
  - `claude plugin install` for each plugin
  - `claude plugin list --json`, checking each plugin's `errors` and MCP servers

  It installs `@anthropic-ai/claude-code@latest`, unpinned by choice. The workflow comment says a stale pin "drifts until the version CI proves against is one no user runs".

I ran the unmodified script with local Codex 0.154.0, first against the Claude-only copy of this repo and then against the unchanged copy. Both runs printed "loaded marketplace adhd-unslop with 3 plugins, 3 skills, and 0 MCP servers" and "All Codex loadability checks passed". Both runs had `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` unset, and the temp home had no `auth.json`. The detailed dump also ran with the keys unset and found the same 3 skills and 4 hooks.

The same check works in GitHub Actions for us.

- `plugin/read` returns more than trailofbits asserts, as the `PluginDetail` struct in `codex-rs/app-server-protocol/src/protocol/v2/plugin.rs:757-771` shows:
  - `skills[].name`, `skills[].interface`, and `skills[].enabled`
  - `hooks[]`, with `key` and `eventName`
  - `summary.localVersion` and `summary.interface`
  - `mcpServers`
- Our version could assert the three full skill names, the four `sessionStart` handlers, and the versions from `tools/plugins.json`.
- The app-server also has `plugin/install` (`app-server-protocol/src/protocol/common.rs:1022`), which could test the copy into the cache. I did not run it.

## Question 4: skill frontmatter both runtimes accept

Codex runtime, from `codex-rs/skills/src/parser.rs`:

- It reads only `name`, `description`, and `metadata.short-description`. All other keys are ignored, including `license`, `allowed-tools`, `disable-model-invocation`, and `metadata.tags`.
- `name` is optional and defaults to the directory name. After whitespace collapses, it may be at most 64 characters. The qualified `plugin:skill` name may be at most 129 (`ext/skills/src/loader/mod.rs:22-23`).
- `description` is required and must not be empty. The parser sets no length cap, and the test `preserves_overlong_descriptions_and_short_descriptions` keeps a 1,025 character description.
- A repair pass retries YAML that fails because of unquoted colons (`parser.rs:53`: "Some third-party skills use prose like `description: Build for AWS: ECS`"). Quote anyway, because trailofbits notes that the Claude side drops every field when the YAML fails to parse (`trailofbits_skills/AGENTS.md:283-287`).

Codex `agents/openai.yaml` (`ext/skills/src/loader/metadata.rs`, `skills/src/interface.rs`):

- Keys: `interface` (`display_name` up to 64 characters, `short_description` up to 1,024, `icon_small`, `icon_large`, `brand_color`, `default_prompt`), `dependencies.tools`, and `policy` (`allow_implicit_invocation`, `products`).
- It fails open. A missing or invalid file is logged and skipped, and the skill still loads.

Claude Code:

- Keys seen across the repos: `name`, `description`, `allowed-tools`, `argument-hint`, `disable-model-invocation`, `effort`, `license`, and `metadata`.
- On 2.1.283, `claude plugin validate --strict` passes for our marketplace file and all three plugins, with the API keys unset and a fresh config dir. Its output names only the manifest ("Validating plugin manifest"), so I did not confirm that it checks SKILL.md frontmatter.
- I did not read a Claude source for length limits and state none here.

The OpenAI ingestion contract (`plugin-creator/scripts/validate_plugin.py`) adds rules that the CLI does not enforce:

- Top-level manifest keys are limited to `id`, `name`, `version`, `description`, `skills`, `apps`, `mcpServers`, `interface`, `author`, `homepage`, `repository`, `license`, and `keywords`. `hooks` is rejected.
- `interface` needs `displayName`, `shortDescription`, `longDescription`, `developerName`, `category`, `capabilities`, and `defaultPrompt`.
- `version` must be strict semver.
- A skill fails with "frontmatter field `disable-model-invocation` must be false" when it sets it to true.
- In `openai.yaml`, `policy` may hold only `allow_implicit_invocation`.

These rules matter only for directory or workspace submission.

## Question 5: what contradicts or improves on our design

- Our layout matches hashicorp's: `plugins/<name>/` with both native manifests, and both marketplace files with local `./plugins/<name>` paths. diagram-design and cloudflare use the same two-manifest approach for a single root plugin.
- trailofbits dropped its sidecars because they drifted. We generate every manifest from `tools/plugins.json` and check it with `build.mjs --check` (D11), so that reason does not apply to us. diagram-design handles drift the same way, with a verifier.
- Codex never reads our `.claude-plugin/marketplace.json` while `.agents/plugins/marketplace.json` exists. Its lowercase `category` and its `version` fields affect only Claude Code.
- `policy.products: ["CODEX"]` in our `.agents` file has one effect: it hides the plugins from ChatGPT and Atlas. `installation` and `authentication` state the defaults. plugin-creator says to always write those two and to add `products` only when asked.
- `"skills": "./skills/"` in our `.codex-plugin` files repeats the default and is harmless. If it ever pointed elsewhere, it would replace `skills/` instead of adding to it.
- D21 says CI cannot use the real CLIs because they need sign-in. That holds for the model-driven e2e checks. Loading checks in both CLIs need no sign-in, as trailofbits shows and the local run confirmed.
- trailofbits and diagram-design both enforce version bumps in CI. trailofbits compares against the PR base, and diagram-design bumps on `main` after merge. AGENTS.md states our rule ("Raise the version ... for every plugin whose shipped text changes"), but no check enforces it for hand edits.
- `adhd-unslop`'s `disable-model-invocation: true` fails the OpenAI ingestion validator. It matters only if we submit to the OpenAI directory or a ChatGPT workspace. The CLI ignores the key.
- Never symlink `.codex-plugin/plugin.json` to the Claude manifest to save a file. Codex rejects symlinked manifests (`plugin_namespace.rs:66-76`), and D10 already records that install skips symlinks.
- trailofbits (`review-walkthrough`) and hashicorp (`provider-docs`) write bare `$skill` names in `default_prompt`. D20 found that a bare name does not match a plugin skill. Those strings are UI text, and they support D20's choice of `$adhd-unslop:adhd-unslop`.

## Implications for adhd-unslop

1. Keep both native manifests, generated. This is the proven layout for a multi-plugin marketplace (hashicorp), and generation removes the drift problem that trailofbits reported.
2. A Claude-only layout would also work in Codex 0.154.0. It keeps the skills, hooks, versions, and hook keys. It costs the plugin `interface` in Codex, and moving `interface` into the Claude files breaks `claude plugin validate --strict`. Consider it only if file count matters more than the Codex listing text.
3. Add a CI job that loads the plugins in both CLIs with no sign-in:
   - Codex: `codex app-server` with `plugin/list` and `plugin/read` in a temp home. Assert the three full skill names, the four `sessionStart` hooks, and each `localVersion` against `tools/plugins.json`.
   - Claude Code: `claude plugin validate --strict` on the marketplace and each plugin, then `marketplace add`, `install`, and `plugin list --json` with no `errors`.
   - Pin the Codex version as trailofbits does, and record both versions in the log.
4. Add a version-increment check against the PR base for each plugin whose shipped files changed, modeled on trailofbits' `--base-ref`.
5. Drop `policy.products` from the generated `.agents` file unless hiding the plugins from ChatGPT and Atlas is intended. Keep `installation` and `authentication`.
6. Keep `agents/openai.yaml`. Its `policy.allow_implicit_invocation` is functional for D7 and D8, and its `interface` fields show in `plugin/read`.
7. Do not add a root `plugin.json` with the agent-plugins `$schema`. It would override `.codex-plugin/plugin.json` and switch skill discovery, category, and version defaults.
8. Keep SKILL.md frontmatter to `name` and a quoted `description`, plus Claude flags. Codex ignores the flags.

## Claims to test

1. Codex hook trust survives a switch from `.codex-plugin/plugin.json` to `.claude-plugin/plugin.json`. `plugin/read` showed identical hook keys. The platform facts table in `design/DECISIONS.md` says trust is keyed by plugin id, handler position, and a hash of the handler.
2. `codex plugin marketplace add <owner/repo> --ref <branch>` and `codex plugin add`, on a Claude-only marketplace in a throwaway home, install into `plugins/cache/<mkt>/<plugin>/<version>/` with the right version directory.
3. The app-server `plugin/install` and `plugin/installed` RPCs work without auth for a local marketplace, so CI can test the copy into the cache.
4. `codex app-server` runs on `ubuntu-latest` in GitHub Actions with only temp homes and no secrets, and a startup sync of the curated marketplace does not fail the job.
5. `claude plugin marketplace add`, `install`, and `list --json` run without auth on `ubuntu-latest`, as trailofbits' workflow implies.
6. android/skills loads 0 skills from a real `codex plugin marketplace add android/skills`, not only from the local copy tested here. Also check whether the OpenAI directory accepts the object-array `skills` shape.
7. Claude Code behavior for a `strict: false` entry whose plugin also has a `plugin.json` that declares components, as hashicorp does.
8. Claude Code limits on skill `name` and `description` length, since Codex caps only `name`.
9. Codex shows the plugin with `products` removed from the `.agents` entries, with no change to the CLI or exec listing.
