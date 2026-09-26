# Research 06: what the official docs recommend

Status: research, 2026-09-26. This file compares the repo with the official
Claude Code and Codex documentation. It changes nothing else in the repo.

Versions checked: Claude Code 2.1.283, Codex CLI 0.154.0 (installed), and
Codex CLI 0.157.1 (installed from npm into a scratch directory). The Claude
Code docs were fetched as Markdown from code.claude.com on 2026-09-26. The
Codex docs were fetched as Markdown from learn.chatgpt.com and
developers.openai.com on the same day. Every CLI run used a throwaway home:
`CLAUDE_CONFIG_DIR=<scratch>` for Claude Code and `HOME=<scratch>
CODEX_HOME=<scratch>/.codex` for Codex, with no credentials in either.

Decisions cited as D1 to D21 are in `design/DECISIONS.md`. The always-on
proposal is `design/idea1.md`.

## Sources

Claude Code, index at https://code.claude.com/docs/llms.txt:

- Manifest reference: https://code.claude.com/docs/en/plugins/manifest-reference.md
- Marketplace reference: https://code.claude.com/docs/en/plugins/marketplace-reference.md
- Create a marketplace: https://code.claude.com/docs/en/plugins/create-marketplace.md
- Host and maintain a marketplace: https://code.claude.com/docs/en/plugins/host-marketplace.md
- Publish a plugin: https://code.claude.com/docs/en/plugins/publish.md
- Plugin dependencies: https://code.claude.com/docs/en/plugins/dependencies.md
- Plugin loading reference: https://code.claude.com/docs/en/plugins/loading.md
- Plugin commands reference: https://code.claude.com/docs/en/plugins/cli-reference.md
- Add components: https://code.claude.com/docs/en/plugins/components.md
- Install and manage: https://code.claude.com/docs/en/plugins/install.md
- Measure plugin cost: https://code.claude.com/docs/en/plugins/measure.md
- Troubleshooting: https://code.claude.com/docs/en/plugins/troubleshooting.md
- Skills: https://code.claude.com/docs/en/skills.md
- Hooks reference: https://code.claude.com/docs/en/hooks.md
- Hooks guide: https://code.claude.com/docs/en/hooks-guide.md
- Output styles: https://code.claude.com/docs/en/output-styles.md
- Context window: https://code.claude.com/docs/en/context-window.md
- Memory and AGENTS.md: https://code.claude.com/docs/en/memory.md
- Settings reference: https://code.claude.com/docs/en/settings-reference.md

Codex and shared specs:

- Package your plugin: https://developers.openai.com/plugins/build/plugins.md
- Plugins (user guide): https://learn.chatgpt.com/docs/plugins.md
- Hooks: https://learn.chatgpt.com/docs/hooks.md
- Build skills: https://learn.chatgpt.com/docs/build-skills.md
- Config reference: https://learn.chatgpt.com/docs/config-file/config-reference.md
- AGENTS.md: https://learn.chatgpt.com/docs/agent-configuration/agents-md.md
- Plugin-creator skill reference, `openai/codex` main:
  https://github.com/openai/codex/blob/main/codex-rs/skills/src/assets/samples/plugin-creator/references/plugin-json-spec.md
  and `installing-and-updating.md` and `scripts/validate_plugin.py` in the
  same directory
- Codex release notes: https://github.com/openai/codex/releases
- Agent Skills spec: https://agentskills.io/specification.md
- Agent Plugins spec and schema: https://agent-plugins.org/llms.txt and
  https://agent-plugins.org/schemas/1.0.0/plugin.schema.json

`developers.openai.com/codex/plugins` redirects to
`learn.chatgpt.com/docs/plugins`, and `developers.openai.com/codex/skills`
redirects to `learn.chatgpt.com/docs/build-skills`. The URL
`developers.openai.com/codex/plugins/marketplaces` returns 404. Marketplace
guidance lives on the "Package your plugin" page.

## Findings that overturn repo documents

In this section and the next, a bare file name such as `hooks.md` means the
Claude Code page unless it says Codex. The Codex hooks page is
https://learn.chatgpt.com/docs/hooks.md.

1. The 10,000-character hook cap is documented in Claude Code.
   https://code.claude.com/docs/en/hooks.md#json-output: "A hook's `additionalContext`, `systemMessage`, and
   `initialUserMessage` strings, and its plain stdout, are capped at 10,000
   characters". It adds: "Claude Code measures each string on its own, even
   when several hooks run for the same event", and "this cap has no setting
   or environment variable to raise it." An oversized value is saved to a
   file and replaced by "the file path and a preview of up to the first
   2,000 characters". This answers the open question in idea1 and confirms
   D12.
2. A plugin can activate its own output style.
   https://code.claude.com/docs/en/output-styles.md#frontmatter lists a
   frontmatter field `force-for-plugin`: "Plugin output styles only. Set to
   `true` to apply this style automatically whenever the plugin is enabled,
   without requiring users to select it. Overrides the user's `outputStyle`
   setting." idea1 says "A plugin cannot set it." That is wrong.
3. Output style persistence through compaction is documented, not inferred.
   https://code.claude.com/docs/en/context-window.md#what-survives-compaction,
   table "What survives compaction": "System prompt and
   output style: Both still apply." The same table says "Context that hooks
   added earlier: Summarized with the rest of the conversation", and
   SessionStart hooks that match `compact` run again and add their output.
   https://code.claude.com/docs/en/output-styles.md#how-output-styles-work:
   "Claude Code sends the active style's instructions with
   every request."
4. The plugin output style directory is `output-styles/`, not
   `outputStyles/`.
   https://code.claude.com/docs/en/plugins/manifest-reference.md#standard-layout:
   "Output styles | `output-styles/`". `outputStyles` is the manifest key,
   and setting it replaces the folder scan.
   https://code.claude.com/docs/en/plugins/components.md#themes-and-output-styles
   says a plugin style appears in
   `/output-style` "as `<plugin>:<name>`", which answers another idea1 open
   question.
5. Codex installs a plugin that config enables, when a Git marketplace is
   upgraded. https://learn.chatgpt.com/docs/config-file/config-reference.md
   says of `plugins.<plugin>.enabled`:
   "Marketplace refresh can install or refresh configured plugins even when
   disabled." Tested on 0.154.0 and 0.157.1: a fresh home, `codex plugin
   marketplace add rubenvarela/adhd-unslop --ref main`, then a hand-added
   `[plugins."au-unslop@adhd-unslop"] enabled = true`, then `codex plugin
   marketplace upgrade adhd-unslop`. After the upgrade,
   `plugins/cache/adhd-unslop/au-unslop/0.1.1/` existed and `codex plugin
   list` showed it "installed, enabled". The DECISIONS platform-facts row
   says the same config entry "does not load it". That row holds only
   without an upgrade. The test used user-level `config.toml` only.
   Untested: project `.codex/config.toml`, whether session start triggers
   the same refresh, and whether a local marketplace behaves the same.
6. SessionStart has a `fork` source in Claude Code.
   https://code.claude.com/docs/en/hooks.md#sessionstart lists matcher
   `fork` for "A new session forked from an existing one: `--fork-session`
   with `--resume` or `--continue`, the `/fork` background copy, or
   `/branch`", and notes "Before v2.1.214, forked sessions reported source
   `"resume"`." Neither of our matchers, `startup|resume|clear|compact` and
   `startup|resume`, includes `fork`. Codex 0.155.0 release notes list
   "#44349 Distinguish forked sessions in session-start hooks", so Codex may
   have the same split. The Codex hooks page still lists only `startup`,
   `resume`, `clear`, and `compact`. This is a likely gap, not a verdict.
7. Where SessionStart context lands is documented.
   https://code.claude.com/docs/en/hooks.md#add-context-for-claude: "Claude
   Code wraps the string in a system reminder and inserts it
   into the conversation at the point where the hook fired", which for
   SessionStart is "at the start of the conversation, before the first
   prompt". idea1 says the docs do not say.

## 1. Recommended layout and fields

### Claude Code plugin

- Location: "Save the manifest at `.claude-plugin/plugin.json` under the
  plugin root. Put every other plugin file at the plugin root, not inside
  `.claude-plugin/`." (manifest-reference.md)
- The manifest is optional: "Without it, Claude Code loads the components it
  finds in the standard layout."
- Required: "`name` is the only required key." Name rules: "no spaces, `@`,
  `:`, path separators, control characters, or bidirectional-formatting
  characters; use kebab-case."
- Optional fields: `$schema`, `displayName`, `version`, `description`,
  `author` (with required `name`), `homepage`, `repository`, `license`,
  `keywords`, `metadata`, `defaultEnabled`, `dependencies`, `settings`,
  `userConfig`, `channels`, and the component keys `skills`, `commands`,
  `agents`, `hooks`, `mcpServers`, `lspServers`, `outputStyles`,
  `workflows`, `experimental`.
- Unknown top-level fields are stripped, and `claude plugin validate`
  reports each one as a warning.
- Component paths "must start with `./`" and must stay inside the plugin
  root.
- Default locations: `skills/`, `commands/`, `agents/`, `hooks/hooks.json`,
  `.mcp.json`, `.lsp.json`, `output-styles/`, `workflows/`, `themes/`,
  `monitors/monitors.json`, `bin/`, `settings.json`.
- How keys combine with defaults: `skills` adds to `skills/`. `hooks`,
  `mcpServers`, and `lspServers` merge with their default file. `commands`,
  `agents`, `outputStyles`, `workflows`, and themes replace their default
  folder.
- "A `CLAUDE.md` at the plugin root isn't loaded as context". Instructions
  belong in a skill.

### Claude Code marketplace

- Location: `.claude-plugin/marketplace.json`. "The directory that contains
  `.claude-plugin/` is called the marketplace root, and every relative
  plugin source resolves from it". (marketplace-reference.md)
- Required top level: "`name`, `owner`, and `plugins` are required."
  `description` is optional, but validate warns when it is missing.
- Required per entry: "`name` and `source` are required." An entry also
  accepts every `plugin.json` field.
- Relative sources "Must start with `./`". A path with `..` fails
  validation.
- `strict` defaults to `true`, meaning `plugin.json` is the authority and
  entry component fields are appended. With `strict: false`, an entry that
  also declares components fails to load.
- Reserved names include the official Anthropic names, `inline`, `builtin`,
  `skills-dir`, `synced`, `npm`, `github`, and names that impersonate an
  official marketplace. `adhd-unslop` is not reserved.

Stated best practices:

- Keep the entry name and the manifest name the same. create-marketplace.md:
  "When the two names differ and someone installs by the manifest name,
  Claude Code reports `Plugin "<manifest-name>" not found in marketplace
  "<marketplace>"`. Keep the two names the same."
- Treat the name as permanent. publish.md: "Choose a kebab-case name such as
  `deploy-helper`, because `claude plugin validate` warns on other forms, and
  treat it as permanent. Set `displayName` in `plugin.json` for the label
  users see." A rename needs a `renames` map in `marketplace.json`.
- Fill in the metadata. publish.md: "Set `description`, `author`,
  `homepage`, and `repository` in `plugin.json`, and add a `README.md` at the
  plugin root."
- Validate strictly in CI. publish.md: "keep `--strict`, which also fails the
  run with exit code 1 on warnings such as an unknown manifest field or a
  missing `version`."
- One plugin per directory under `plugins/`, with relative sources, is the
  pattern the create-marketplace walkthrough uses: `"source":
  "./plugins/my-first-plugin"`. `metadata.pluginRoot` allows bare names
  instead, on v2.1.239 or later.
- Symlinks between plugins in one marketplace are supported for git-hosted
  marketplaces. host-marketplace.md: a link "Elsewhere within the same
  marketplace" is dereferenced into the cache, which "lets a meta-plugin's
  `skills/` directory link to skills defined by other plugins". For a plugin
  installed from a local path, only links inside the plugin survive. D10
  rejected links for Codex, where they are skipped, so the decision stands.

### Codex plugin

- The current recommended manifest is a portable root `plugin.json` that
  declares the Agent Plugins schema. plugins/build/plugins.md: "For a
  portable Agent Plugins package, add `plugin.json` at the plugin root and
  declare the Agent Plugins schema." "Existing `.codex-plugin/plugin.json`
  files remain supported as a compatibility fallback." "OpenAI also accepts
  legacy and Claude-compatible manifests, but new packages should use this
  format."
- OpenAI-specific settings (`interface`, `apps`, `hooks`) go under
  `extensions.com.openai` in the root manifest. "When
  `extensions.com.openai` is an object, it replaces the entire
  `.codex-plugin/plugin.json` overlay as the source of OpenAI-specific
  settings; the two aren't merged."
- The Agent Plugins schema is closed. Its only top-level fields are
  `$schema`, `name`, `version`, `description`, `author`, `homepage`,
  `repository`, `license`, `keywords`, and `extensions`. `$schema` and `name`
  are required. Name: 1 to 64 characters of `a-z`, `0-9`, `-`, `.`, no `--`.
  There is no `dependencies` field. (agent-plugins.org)
- The `@plugin-creator` scaffold still writes `.codex-plugin/plugin.json`.
  Its reference lists `name`, `version`, `description`, `author`,
  `homepage`, `repository`, `license`, `keywords`, `skills`, `hooks`,
  `mcpServers`, `apps`, and `interface`.
- Name: "Use a stable plugin `name` in kebab-case. Plugin hosts use it as the
  plugin identifier and component namespace."
- Hook paths "start with `./`, resolve relative to the plugin root, and stay
  inside the plugin root."

### Codex marketplace

- Location: `$REPO_ROOT/.agents/plugins/marketplace.json` for a repo, or
  `~/.agents/plugins/marketplace.json` for a person. The desktop app also
  reads "a legacy-compatible marketplace at
  `$REPO_ROOT/.claude-plugin/marketplace.json`". With both files present in
  our repo, the 0.154.0 CLI used `.agents/plugins/marketplace.json`.
- Fields: top-level `name`, optional `interface.displayName`, and
  `plugins[]`. Each entry has `name`, `source`, `policy`, and `category`.
- "Always include `policy.installation`, `policy.authentication`, and
  `category` on each plugin entry." `installation` takes `AVAILABLE`,
  `INSTALLED_BY_DEFAULT`, or `NOT_AVAILABLE`. `authentication` takes
  `ON_INSTALL` or `ON_USE`.
- Sources: "Keep `source.path` relative to the marketplace root, start it
  with `./`, and keep it inside that root." A local source may be an object
  `{ "source": "local", "path": "./plugins/x" }` or a plain string. Git
  sources use `url` or `git-subdir` with `ref` or `sha`. npm sources exist.
- "If Codex can't resolve a marketplace entry's source, it skips that plugin
  entry instead of failing the whole marketplace."
- The plugin-creator reference adds: "`products` (`array` of `string`,
  optional): Product override for this plugin entry. Omit it unless product
  gating is explicitly requested." and "Treat `policy.products` as an
  override and omit it unless explicitly requested."

## 2. Versioning and updates

### Claude Code

- Version resolution, loading.md: "1. The `version` field in the plugin's
  manifest comes first 2. Then the `version` field in the plugin's
  marketplace entry 3. When neither is set, the version comes from the
  source type". For a relative path inside a git-hosted marketplace with no
  version, the version is "The commit SHA of the installed directory".
- Update detection: "`claude plugin update` and background auto-update
  compute the version again and skip the plugin when it matches what
  `installed_plugins.json` records." The version also names the cache
  directory.
- A pinned version holds users back: "a manifest that pins `"version":
  "1.0.0"` keeps every user on the cached copy until its author changes the
  string, however many commits they push."
- Do not set the version twice. host-marketplace.md: "Don't set `version` in
  both `plugin.json` and the marketplace entry. If you do, Claude Code uses
  the `plugin.json` value without warning, and `claude plugin validate`
  reports the mismatch". Validate warns only when the two differ.
- A local-directory marketplace loads plugins in place, "whatever its version
  string says". This matches D21.
- Old versions: "Claude Code writes an `.orphaned_at` marker into the previous
  version directory. It removes that directory in a background cleanup 14
  days later". This explains the old versions idea1 saw in the cache.
- Auto-update is off for third-party marketplaces. install.md: "Off by
  default: every other marketplace, including the community marketplace,
  third-party marketplaces, and local development marketplaces."
  host-marketplace.md: "`marketplace.json` has no field to turn it on." A
  user turns it on in `/plugin` under Marketplaces, or an admin sets
  `"autoUpdate": true` on the `extraKnownMarketplaces` entry.
- Auto-update runs after the first message, "a random delay of up to ten
  minutes", and the new version loads on the next launch or after
  `/reload-plugins`.

Dependencies (dependencies.md):

- Forms: `"name"`, `"name@marketplace"`, or `{ "name", "version",
  "marketplace" }`. "Bare names resolve against this plugin's own
  marketplace."
- Without a constraint, "a dependency moves to each new release its
  marketplace publishes the next time users update."
- A constraint is a semver range, and "The dependency installs at the highest
  git tag that satisfies this range". Tags are `<plugin-name>--v<version>`.
  For a relative-path plugin, the marketplace maintainer creates the tags.
- With no satisfying tag and a relative-path source, "the install uses the
  marketplace's current copy instead, and the constraint is checked when the
  plugin loads. If that copy is outside the range, the dependent plugin stays
  disabled".
- Operations that install a missing declared dependency: `claude plugin
  install`, `/reload-plugins`, auto-update of the dependent plugin's
  marketplace, re-running `claude plugin install`, and `claude plugin
  marketplace add`.
- After a manual update that adds a dependency: "run `claude plugin update
  backend-standard` in a shell, then `/reload-plugins` in an open session to
  install the newly added dependencies." cli-reference.md says the reload
  summary appends "`(+ N dependencies: <names>) resolved`".
- With auto-update on, "the next auto-update moves the bundle to the new
  version and installs any dependencies it adds."
- `claude plugin prune` removes orphaned auto-installed dependencies.
  `claude plugin uninstall --prune` does it in one step.

`claude plugin tag` (cli-reference.md and `--help`): creates an annotated
tag `<name>--v<version>`, "checks that the plugin's `plugin.json` and any
marketplace entry that lists it agree on the version", requires a clean tree,
and refuses an existing tag. publish.md: "Tag the release in git when other
plugins declare a version range on yours, because those ranges resolve
against tags. Otherwise you don't need a tag." A dry run on our repo:

```
Plugin:  adhd-unslop
Version: 0.2.2 (from plugin.json)
Marketplace entry: plugins[2] in .../.claude-plugin/marketplace.json (version: 0.2.2)
Tag:     adhd-unslop--v0.2.2
```

### Codex

- The cache path is `~/.codex/plugins/cache/$MARKETPLACE_NAME/$PLUGIN_NAME/$VERSION/`.
  The build page says "For local plugins, `$VERSION` is `local`". The CLI
  disagrees: on 0.154.0 and 0.157.1, a local marketplace installed to
  `.../adhd-unslop/0.2.2/`, `.../au-i-have-adhd/0.1.0/`, and
  `.../au-unslop/0.1.1/`. The page describes the desktop app, so the two may
  differ by surface.
- The plugin-creator update flow uses the version as the cache key. It
  rewrites a local plugin's version to `<base>+codex.<cachebuster>` and then
  runs `codex plugin add <plugin>@<marketplace>` again. It says "Do not keep
  incrementing numeric version components just to trigger reinstall
  behavior." That flow is for local iteration. Released versions still need a
  real bump, as D17 does.
- `codex plugin marketplace upgrade` refreshes Git marketplace snapshots.
  Combined with the config note in finding 5, upgrade can also install or
  refresh configured plugins.
- Codex has no plugin dependencies in the docs, the config reference, or the
  Agent Plugins schema. This confirms D15.
- `plugins.<plugin>.enabled` can live in a trusted project's
  `.codex/config.toml`. "Codex loads project `.codex/config.toml` only for
  trusted projects."
- No auto-update setting for plugins appears in the config reference.

## 3. Skills

### Claude Code frontmatter (skills.md)

- "All fields are optional. Only `description` is recommended". Unknown
  fields are ignored without an error.
- `name` "Defaults to the directory name." In a plugin, "`name` sets the last
  segment of the command and the plugin prefix stays in place." The bare
  name also works "unless another command already uses that name."
- `description` and `when_to_use` are "truncated at 1,536 characters in the
  skill listing". The cap is set by `skillListingMaxDescChars`.
- `disable-model-invocation: true`: "Only you can invoke the skill." "If
  Claude tries anyway, Claude Code blocks the call". The description is not
  in context. This matches D7 and D8.
- `user-invocable: false`: "Claude Code hides it from the `/` menu and
  doesn't run it when you type `/name`." Claude can still invoke it. This
  matches D7.
- `license` and `compatibility` are accepted from the Agent Skills spec, and
  "Claude Code accepts the field but doesn't act on it."
- `metadata` is a "Free-form YAML map". Claude Code drops a value that is not
  a map.
- Other fields: `when_to_use`, `argument-hint`, `arguments`, `allowed-tools`,
  `disallowed-tools`, `model`, `effort`, `context`, `agent`, `background`,
  `hooks`, `paths`, `shell`.
- Skill bodies after compaction: "Claude Code re-attaches the most recent
  invocation of each skill after the summary, keeping the first 5,000 tokens
  of each. Re-attached skills share a combined budget of 25,000 tokens."
  `claude plugin details` estimates our bodies at about 3.2k, 2.4k, and 2.2k
  tokens, so all three fit.
- "Keep `SKILL.md` under 500 lines." Ours are 141, 134, and 63 body lines.
- "Plugin skills are not affected by `skillOverrides`. Manage those through
  `/plugin` instead."

### Codex (build-skills.md and config reference)

- "The `SKILL.md` file must include `name` and `description`."
- Skill list budget: "at most 2% of the model's context window, or 8,000
  characters when the context window is unknown." `skills.max_context_tokens`
  sets it, capped at 10,000 tokens. "Codex shortens skill descriptions
  first."
- `agents/openai.yaml` fields: `interface.display_name`,
  `short_description`, `icon_small`, `icon_large`, `brand_color`,
  `default_prompt`, `policy.allow_implicit_invocation`, and
  `dependencies.tools`.
- "`allow_implicit_invocation` (default: `true`): When `false`, Codex won't
  implicitly invoke the skill based on user prompt; explicit `$skill`
  invocation still works."
- "If two skills share the same `name`, Codex doesn't merge them; both can
  appear in skill selectors." D20 observed that with two same-name plugin
  skills, neither loaded. The docs and the observation disagree.
- "Codex supports symlinked skill folders and follows the symlink target".
  This covers skill directories, not plugin installs.
- The docs never state the `$plugin:skill` syntax. They say only that the
  plugin name is the "component namespace". `$adhd-unslop:adhd-unslop` is
  verified in this repo (D20) and nowhere else.

### Agent Skills spec (agentskills.io)

- `name`: required, 1 to 64 characters, lowercase letters, digits, and
  hyphens, no leading, trailing, or doubled hyphen, and it "Must match the
  parent directory name".
- `description`: required, 1 to 1,024 characters.
- Optional: `license`, `compatibility` (up to 500 characters), `metadata` ("a
  map from string keys to string values"), and `allowed-tools`.
- Body: "< 5000 tokens recommended". Validation tool: `skills-ref validate
  ./my-skill`.
- Claude Code notes that claude.ai uploads accept only the six spec fields.
  Our `disable-model-invocation` would fail an upload there, but it is fine
  for Claude Code plugins.

Our frontmatter against these rules: all three names match their directories.
Descriptions are 293, 208, and 183 characters, under every cap. `metadata`
values are strings. `unslop/SKILL.md` has no `license` field, although its
directory ships a LICENSE file. The spec allows the field, so adding it would
be harmless.

### Skills loading other skills

Neither runtime documents one skill loading another. Claude Code documents
the Skill tool and states that `disable-model-invocation: true` blocks it,
which is why D7 drops that flag from the vendored skills. Codex documents
only typed `$` mentions and implicit matching. D9, where the Codex model reads
the `SKILL.md` path from its skill list, rests on observed behavior only.

## 4. Hooks

### Claude Code

- Plugin hooks live in `hooks/hooks.json` "under a top-level `"hooks"` key,
  in the same shape as the `hooks` object in `settings.json`". A manifest
  `hooks` key merges with that file.
- "A plugin's hooks don't wait for one of the plugin's skills or commands to
  be used." They fire from session load.
- SessionStart: "keep these hooks fast. Only `type: "command"` and `type:
  "mcp_tool"` hooks are supported." Matchers: `startup`, `resume`, `clear`,
  `compact`, `fork`.
- Output: plain stdout becomes context for SessionStart. JSON
  `hookSpecificOutput.additionalContext` does the same. `systemMessage` is a
  "Warning message shown to the user". SessionStart also accepts
  `initialUserMessage`, `sessionTitle`, `watchPaths`, and `reloadSkills`.
- Cap: 10,000 characters per string, measured per string, with no way to
  raise it. See finding 1.
- Multiple hooks: "All matching hooks run in parallel." "When several hooks
  return `additionalContext` for the same event, Claude receives all of the
  values."
- Framing: "Write the text as factual statements rather than imperative
  system instructions." "Text framed as out-of-band system commands can
  trigger Claude's prompt-injection defenses, which causes Claude to surface
  the text to you instead of treating it as context."
- Static text: "For instructions that never change, prefer CLAUDE.md." A
  plugin cannot ship a CLAUDE.md that loads, so the nearest plugin mechanism
  is an output style.
- Resume: "`SessionStart` hooks run again on resume with `source` set to
  `"resume"`, or `"fork"` if you added `--fork-session`, so they can refresh
  their context." For mid-session events, resume replays the saved text. The
  docs do not say whether the original SessionStart text is also replayed.
- Exec form: "Set `args` whenever the hook references a path placeholder".
  Our commands read `CLAUDE_PLUGIN_ROOT` inside `node -e`, so no placeholder
  sits on the command line. The Codex docs do not document `args`, so the
  current form is the portable one.
- Trust: plugin hooks run with no per-hook approval. `allowManagedHooksOnly`
  in managed settings blocks plugin hooks except those from force-enabled
  plugins.
- The `Setup` event fires only with `--init-only`, `--init`, or
  `--maintenance`: "It doesn't fire on normal startup." It is not an install
  hook, so idea1's statement that neither runtime has an install-time hook
  stands.

### Codex

- Discovery: "By default, Codex looks for `hooks/hooks.json` inside the plugin
  root. A plugin manifest can override that default with a `hooks` entry".
  "If a manifest defines `hooks`, Codex uses those manifest entries instead of
  the default `hooks/hooks.json`." (hooks.md)
- Trust: "Before a non-managed hook can run, Codex requires you to review and
  trust the exact hook definition. Codex records trust against the hook's
  current hash, so new or changed hooks are marked for review and skipped
  until trusted." "Installing or enabling a plugin doesn't automatically
  trust its hooks". `/hooks` reviews them. `--dangerously-bypass-hook-trust`
  skips the check for one run.
- Environment: `PLUGIN_ROOT` and `PLUGIN_DATA`, plus `CLAUDE_PLUGIN_ROOT` and
  `CLAUDE_PLUGIN_DATA` "for compatibility with existing plugin hooks."
- SessionStart sources: `startup`, `resume`, `clear`, `compact`. "Plain text
  on `stdout` is added as extra developer context." JSON
  `hookSpecificOutput.additionalContext` is "added as extra developer
  context". After a compaction, matching hooks "run before the next model
  request", even mid-turn.
- Concurrency: "Multiple matching command hooks for the same event are
  launched concurrently".
- Output cap, "Large hook output": "By default, Codex limits each
  model-visible hook-output message to roughly 2,500 tokens." Oversized text
  is saved under `<temp_dir>/hook_outputs/<session_id>/` with "a
  head-and-tail preview". `additionalContextLimit` on the handler changes the
  threshold, with `0` meaning no limit. "Codex evaluates each matching handler
  independently." The page warns: "Keep hook and plugin context concise.
  Context from multiple hooks and plugins adds up and can degrade model
  performance. Raising `additionalContextLimit` increases that risk."
- `systemMessage` is "Surfaced as a warning in the UI or event stream".
- `allow_managed_hooks_only = true` in requirements skips plugin hooks.
- Handler types: "`command` and `mcp_tool` handlers are supported. `prompt`
  and `agent` handlers are parsed but skipped."

### Where the manifest `hooks` key disagrees

Three sources describe a manifest `hooks` key three ways:

- The Claude Code manifest reference says it merges with `hooks/hooks.json`.
- The Codex hooks page and build page say it replaces the default file.
- The Codex plugin-creator reference says "`skills`, `hooks`, and
  string-valued `mcpServers` are supplemented on top of default component
  discovery; they do not replace defaults."

Keeping hooks only in `hooks/hooks.json`, with no `hooks` key in either
manifest, avoids all three behaviors. That is what the repo does now.

## 5. Validation tools

### Claude Code: `claude plugin validate`

- Takes a marketplace root, a plugin directory, a manifest file, or a
  `skills`, `agents`, or `commands` directory. Flags: `--strict` (warnings
  fail) and `--json`. Exit codes: 0 pass, 1 fail, 2 validator error.
- From a marketplace root, "Claude Code doesn't open the plugins' skill,
  agent, command, or hook files. To find errors in those files, validate each
  plugin directory".
- It needed no login. A throwaway `CLAUDE_CONFIG_DIR` with no credentials
  worked. It still wrote `policy-limits.json` and `remote-settings.json`
  there, so it may reach the network.
- Other checks: `claude plugin details <name>` (component inventory and token
  estimate, works with `--plugin-dir`), `claude plugin tag --dry-run`, and
  `claude plugin eval` (graded eval cases, new in the week 37 release notes,
  which runs real sessions and needs a signed-in CLI).

### Codex

- No `plugin validate` command exists in 0.154.0 or 0.157.1. `codex plugin
  validate` returns "unrecognized subcommand".
- The practical check is `codex plugin marketplace add <path>`, then `codex
  plugin list --marketplace <name> --json --available`, then `codex plugin
  add <plugin>@<marketplace>`. All three worked in a throwaway home with no
  `auth.json`.
- The `@plugin-creator` skill ships `scripts/validate_plugin.py`. Its
  reference says it "mirrors the workspace plugin ingestion schema", which is
  the check for publishing to a ChatGPT workspace. It is not a runtime check.
  The runtime installed all three of our plugins without complaint.
- The Agent Skills spec offers `skills-ref validate`. It was not run.

## 6. Where our generated files depart from the docs

### Validation runs

`claude plugin validate`, with and without `--strict`, in a throwaway
`CLAUDE_CONFIG_DIR`:

| Target | Default | `--strict` |
| --- | --- | --- |
| Repo root (marketplace) | Validation passed, exit 0 | Validation passed, exit 0 |
| `plugins/adhd-unslop` | Validation passed, exit 0 | Validation passed, exit 0 |
| `plugins/au-i-have-adhd` | Validation passed, exit 0 | Validation passed, exit 0 |
| `plugins/au-unslop` | Validation passed, exit 0 | Validation passed, exit 0 |

`--json` showed empty `errors`, `warnings`, and `notes` for every target.

Probes on a scratch copy, to learn what the validator checks:

| Change | Result |
| --- | --- |
| Unknown key `bogusKey` on a hook handler | No warning. So the Codex-only `additionalContextLimit` passes silently. |
| Unknown event `NotAnEvent` in `hooks.json` | Warning: "unknown hook event; entry ignored at runtime". Passes. |
| Broken JSON in `hooks.json` | Error. The message says that at runtime this breaks the entire plugin load. |
| Entry `version` 0.2.9, `plugin.json` 0.2.2 | Warning on `plugins[2].version`. The message says `plugin.json` wins and the entry version is ignored. |
| Unparseable YAML in a `SKILL.md` | Error: the skill would load with empty metadata. One malformed sample passed, so the YAML check is lenient. |

`claude plugin details` with `--plugin-dir`:

| Plugin | Always-on | On invoke |
| --- | --- | --- |
| `adhd-unslop` | about 140 tokens | about 3.2k tokens |
| `au-i-have-adhd` | about 119 tokens | about 2.4k tokens |
| `au-unslop` | about 92 tokens | about 2.2k tokens |

The hook row reads "harness-only" with no model context cost. The estimate
leaves out the roughly 6,000 tokens the always-on hook injects when the flag
is set. It also counts about 140 always-on tokens for `adhd-unslop`, although
skills.md says a `disable-model-invocation: true` skill's description is not
in context.

Codex, 0.154.0 and 0.157.1, throwaway home, no `auth.json`: `marketplace
add` of a copy of the repo succeeded, `plugin list --json --available`
listed all three plugins with versions 0.1.0, 0.1.1, and 0.2.2, and `plugin
add` installed each one.

The Codex plugin-creator `validate_plugin.py`, fetched from `openai/codex`
main, reported:

- `adhd-unslop`: "skill `adhd-unslop` frontmatter field
  `disable-model-invocation` must be false".
- `au-i-have-adhd` and `au-unslop`: "plugin.json field `interface.defaultPrompt`
  or `interface.default_prompt` is required".

These matter only for workspace or public submission, not for CLI or desktop
installs from our marketplace.

### Departures

| Item | What the docs say | What we generate | Weight |
| --- | --- | --- | --- |
| Version in both places | host-marketplace.md: "Don't set `version` in both `plugin.json` and the marketplace entry." | `.claude-plugin/marketplace.json` sets `version` on every entry, equal to `plugin.json`. | Low. The build keeps them equal and `claude plugin tag` checks agreement. It still goes against the stated guidance. |
| SessionStart `fork` | Claude Code has a `fork` source since v2.1.214. | Matchers `startup\|resume\|clear\|compact` and `startup\|resume`. | Medium if a fork needs the rules again. Needs a test. |
| Imperative hook text | hooks.md prefers "factual statements rather than imperative system instructions". | The chunks carry imperative rules and a header that tells the model how to apply them. | Medium. No prompt-injection refusal has been observed. |
| `policy.products: ["CODEX"]` | The plugin-creator reference says to omit it "unless product gating is explicitly requested." | Set on every Codex entry. | Low. It may hide the plugins from ChatGPT desktop surfaces, which may be intended. |
| Publish metadata | publish.md asks for `homepage`, `repository`, and a plugin-root `README.md`. | None of the three plugins has them. `keywords` appears only in the Codex manifests. | Low. |
| Codex manifest format | The build page recommends a root `plugin.json` with `$schema`, with `.codex-plugin/plugin.json` as a fallback. | `.codex-plugin/plugin.json` only. | Low for now. The fallback is supported, and migrating has open questions. See below. |
| `interface.defaultPrompt` on the `au-` plugins | Required by the workspace ingestion validator. | Missing. | Only for submission. |
| `additionalContextLimit` in shared `hooks.json` | Documented by Codex. Not a Claude Code field. | Present on the three chunk handlers. | None. Claude Code ignores it, and validate does not flag it. |

Things the docs confirm we do right:

- Relative `./plugins/<name>` sources, one plugin per directory, and entry
  names equal to manifest names in both runtimes.
- Kebab-case names that are not reserved.
- Hooks only in `hooks/hooks.json`, with no manifest `hooks` key.
- `policy.installation`, `policy.authentication`, and `category` on every
  Codex entry, plus `interface.displayName` on the Codex marketplace.
- Bare-name dependencies, which "resolve against this plugin's own
  marketplace".
- Separate Claude Code and Codex marketplace files. A single shared file would
  need Codex-only `policy` keys, which Claude Code reports as unknown fields
  and which `--strict` would fail.
- `CLAUDE_PLUGIN_ROOT` with a `PLUGIN_ROOT` fallback in the hook launcher.
- `AGENTS.md` with no `CLAUDE.md`. memory.md: Claude Code reads `AGENTS.md`
  when there is "no `CLAUDE.md` or `CLAUDE.local.md` in your working
  directory or above it", on v2.1.277 or later.

### The Codex root `plugin.json` is not a safe migration yet

- The Agent Plugins schema is closed and has no `dependencies`, so the Claude
  Code dependency list cannot live there. Claude Code keeps its own
  `.claude-plugin/plugin.json` either way.
- The Claude Code docs do not mention a root `plugin.json`. It is untested
  whether Claude Code ignores it.
- It is untested whether Codex 0.154.0 honors a root `plugin.json` over
  `.codex-plugin/plugin.json`.
- With a root manifest, Codex "always discover[s] skills in `skills/`", and
  an `extensions.com.openai` object replaces the whole `.codex-plugin`
  overlay. The generator would need to move `interface` into the root file.

## Other documentation conflicts

- Codex cache version: the build page says `local` for local plugins. The CLI
  uses the manifest version.
- Codex same-name skills: the docs say both appear. D20 saw neither load.
- Claude Code dependency repair: D16 says re-running `claude plugin install`
  added one missing dependency per run. dependencies.md says
  `/reload-plugins` installs missing dependencies and reloads.
- Marketplace entry version: marketplace-reference.md says validate "warns"
  when both are set. host-marketplace.md and the probe show it warns only on
  a mismatch.

## Implications for adhd-unslop

1. D12's 10,000-character cap is now a cited fact. Cite
   https://code.claude.com/docs/en/hooks.md#json-output in DECISIONS and drop
   the "re-check" note in idea1. The Codex cap is at
   https://learn.chatgpt.com/docs/hooks.md#large-hook-output.
2. Rewrite idea1's option D. A plugin can force its style with
   `force-for-plugin: true`, the directory is `output-styles/`, the picker
   name is `adhd-unslop:<name>`, and persistence after compaction is
   documented. `force-for-plugin` also overrides the user's own
   `outputStyle` and ignores D14's opt-in flag. A separate always-on plugin
   whose enabled state is the switch would keep opt-in. That is a design
   choice for the user, not a doc finding.
3. The docs point static, always-on instructions at CLAUDE.md or an output
   style, not at SessionStart context, and warn that imperative hook text can
   trigger prompt-injection defenses. Both points favor option D for Claude
   Code. If the hook stays, consider wording the chunk headers as statements
   of fact.
4. Consider adding `fork` to the always-on matcher in Claude Code, and in
   Codex once 0.155.0 or later confirms a `fork` source. Test first, because a
   fork may already carry the earlier injection.
5. Consider dropping `version` from the Claude Code marketplace entries.
   `plugin.json` wins anyway. `claude plugin tag` works without the entry
   version. Two costs: `claude plugin list --json --available` shows an
   entry's version only "when it declares one", and `tests/build.test.mjs`
   asserts `c.version` on each entry, so the test changes too.
6. The README update steps for Claude Code can get simpler. Per the docs,
   enabling auto-update for the `adhd-unslop` marketplace moves the bundle
   and installs new dependencies, and `/reload-plugins` repairs missing
   dependencies after a manual update. Both need tests before the README
   changes.
7. Version constraints could expose mismatched pins in Claude Code. A range
   on the `au-` dependencies is checked at load time even without tags, and
   an out-of-range copy leaves `adhd-unslop` disabled with a clear message.
   An exact `=` range also freezes the dependency against auto-update.
8. Codex can pre-install siblings from config. A user `config.toml` that
   lists `[plugins."...@adhd-unslop"]` entries for a Git marketplace,
   followed by `codex plugin marketplace upgrade`, installs them. That was
   tested with one entry. It is a documented alternative to three `codex
   plugin add` commands. It is not a dependency system and still needs the
   user's action (D15). Project `.codex/config.toml` is a claim to test, and
   it loads only in trusted projects.
9. Keep `.codex-plugin/plugin.json` for now. Revisit the root `plugin.json`
   after the tests below.
10. Add `homepage` and `repository` to both manifests and a short `README.md`
    in each plugin directory, per publish.md. Add `keywords` to the Claude
    Code manifests. `tools/plugins.json` would carry the values.
11. Decide whether `policy.products: ["CODEX"]` is intended. The reference
    says to omit it unless gating is wanted.
12. CI could add `claude plugin validate --strict` for the root and each
    plugin directory. It passes today and needs no login, but offline
    behavior is untested.
13. The `au-` prefix is provisional (D6). A later plugin rename can use the
    `renames` map. Nothing documents a marketplace rename, so D19 stands.

## Claims to test

Run each in a throwaway home, from a directory away from any marketplace copy
(D21).

1. Claude Code `fork`: after `claude --resume <id> --fork-session`, do the
   rules survive without a `fork` matcher, and does a `fork` matcher inject a
   second copy?
2. Claude Code `resume`: does a resumed session hold the original SessionStart
   text as well as the new injection? Count bundle markers in context.
3. Codex fork: on 0.157.1, what `source` does a forked session send to
   SessionStart, and does `startup|resume|clear|compact` match it?
4. Claude Code output style with `force-for-plugin: true` in
   `output-styles/`: it applies without `/output-style`, it survives
   `/compact`, and `keep-coding-instructions: true` keeps the coding
   instructions.
5. Claude Code `/reload-plugins` after `claude plugin update adhd-unslop`
   installs every missing `au-` dependency in one run, as dependencies.md
   says.
6. With auto-update on for the `adhd-unslop` marketplace, a new
   `adhd-unslop` version also updates the `au-` dependencies.
7. A version range such as `{ "name": "au-unslop", "version": "~0.1.1" }`
   with no git tags installs the marketplace copy and disables `adhd-unslop`
   when that copy is out of range.
8. Codex `marketplace upgrade` refreshes an installed plugin to a new version
   without `codex plugin add`, per the config reference.
9. Codex installs config-enabled plugins from a local marketplace, from a
   trusted project's `.codex/config.toml`, and at session start, not only
   from user config on `marketplace upgrade`.
10. Codex honors a root `plugin.json` with `$schema` and
    `extensions.com.openai` on 0.154.0 and 0.157.1, and Claude Code ignores
    that file.
11. Codex with two same-name plugin skills on 0.157.1: do both appear, as the
    docs say, or does neither load, as D20 saw?
12. `policy.products: ["CODEX"]` hides the plugins from the ChatGPT desktop
    app, and removing it changes nothing in the CLI.
13. `claude plugin validate --strict` passes in CI with no network.
14. The always-on chunks, worded as factual statements, keep the same
    behavior in the T1 and T2 checks from `design/BEHAVIOR.md`.
