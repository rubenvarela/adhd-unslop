# Research synthesis: how the ecosystem structures dual-runtime plugins

Date: 2026-09-26. This file indexes the research in this folder, lists what
it taught us, and records how each insight fed the restructure proposal in
`design/STRUCTURE-v2.md`.

## Method

1. Two search agents found 25 public repos that ship one source for both
   Claude Code and Codex. They checked each repo's file tree and manifests
   through the GitHub API.
2. Six research agents cloned the repos into a scratch directory and read
   them by theme. Each wrote one file here, with an "Implications" and a
   "Claims to test" section.
3. Two test agents checked the claims that could change the structure with
   the real CLIs, in throwaway homes. Versions: Claude Code 2.1.283, Codex
   0.154.0 and 0.157.1.
4. The proposal went to a Codex session for adversarial review, recorded as
   `design/round-6-*` onward.

The working assumption, set by the user, was that these repos know what
they are doing and that their patterns are stable.

## Files

| File | Theme | Repos studied |
| --- | --- | --- |
| `01-always-on-and-hooks.md` | Always-on injection, hooks shared by both CLIs | superpowers, ponytail, caveman, ECC, planning-with-files, claude-mem |
| `02-manifests-and-codex-loading.md` | Minimal manifests, what Codex reads | trailofbits, cloudflare, addyosmani, diagram-design, android, hashicorp, SwiftUI-Agent-Skill, Codex source |
| `03-multi-plugin-marketplaces.md` | Multi-plugin layout, generation, versioning, extending | wshobson, hashicorp, expo, agentic-awesome-skills, compound-engineering, alirezarezvani |
| `04-vendoring-sync-doctor.md` | Vendoring, upstream sync, drift checks, doctor tools | claude-octopus, gstack, stripe/ai, agentic-awesome-skills, ECC, oh-my-codex, oh-my-claudecode |
| `05-ci-and-automation.md` | GitHub Actions and repo hygiene | 18 repos with workflows |
| `06-official-docs.md` | What the Claude Code and Codex docs recommend | code.claude.com, learn.chatgpt.com, developers.openai.com |
| `07-tests-codex.md` | Real-CLI tests of Codex claims | fixtures in throwaway homes |
| `08-tests-claude.md` | Real-CLI tests of Claude Code claims | fixtures in throwaway homes |
| `09-tests-clear-compact.md` | `clear` and `compact` in both runtimes | fixtures, TUI driving |
| `10-tests-hook-env.md` | Hook environment and payload per runtime | fixture plugin |
| `11-tests-e2e.md` | End to end on the first 0.3.0 build | `tests/e2e/run.sh` |

## Insights

### Structure

- The proven multi-plugin layout is `plugins/<name>/` with both native
  manifests inside each plugin, plus one marketplace file per runtime at the
  root. hashicorp, expo, and wshobson use it. So do we.
- No repo out of 25 uses plugin `dependencies`. Repos that share content
  between plugins copy it at build time and check the copies for drift, or
  merge the plugins. hashicorp went from six plugins to two, and
  compound-engineering dropped its second plugin.
- Every repo that installs from a git marketplace commits its generated
  files. wshobson and compound-engineering fail CI on drift, as we do.
- Our build cannot yet add a new authored plugin. `tools/build.mjs` writes
  skill files only for vendored plugins and for the hard-coded
  `adhd-unslop`.
- `build.mjs --check` misses orphans. A stray file under `plugins/` ships
  and passes CI. claude-octopus and gstack both check for stray files.

### Codex loading

- Codex prefers `.agents/plugins/marketplace.json` and
  `.codex-plugin/plugin.json`. Without them it falls back to the Claude
  files and still loads skills, hooks, and versions. The Codex files add
  only display metadata, such as `interface`.
- `interface` in a Claude manifest fails `claude plugin validate --strict`,
  so the display metadata needs the Codex file.
- `policy.products: ["CODEX"]` hides a plugin from ChatGPT and Atlas. The
  reference says to omit it unless that gating is wanted.
- Codex loads a plugin's `hooks/hooks.json` by a hardcoded fallback when
  the manifest has no `hooks` key. Every repo that ships a Codex plugin
  hook names the file explicitly.
- A root `plugin.json` with the agent-plugins `$schema` would take
  priority over `.codex-plugin/plugin.json` in Codex and change skill
  discovery. No repo relies on it for dual support yet.

### Always-on context

- Always-on SessionStart injection is common: superpowers, ponytail,
  caveman, ECC, and planning-with-files.
- We are the only repo that splits the text into chunks or uses
  `additionalContextLimit`. The others inject under about 8,000 characters
  from one handler.
- superpowers dropped `resume` from its matcher, because a resumed
  transcript already holds the injected context.
- caveman stores mode state per session, so compaction does not turn a
  mode back on. That is the known limitation in our README.
- The Claude Code docs point static always-on instructions at `CLAUDE.md`
  or an output style, and warn that imperative hook text can trigger
  prompt-injection defenses.
- A plugin can force its own output style with `force-for-plugin: true` in
  `output-styles/`. No repo in the 25 ships one.

### CI and automation

- Both CLIs can be load-tested in CI with no secrets. trailofbits drives
  `codex app-server` with `initialize`, `plugin/list`, and `plugin/read`,
  and runs `claude plugin validate --strict`, `marketplace add`, `install`,
  and `list --json`. Both passed on our repo with no keys set.
- expo checks that a plugin's version rose whenever its shipped files
  changed. Nothing enforces our D17 for hand edits.
- caveman pins the CLI versions in CI and runs a separate scheduled job
  against the latest releases, which opens an issue on failure.
- Nine of 17 repos pin actions by commit SHA. Several use Dependabot for
  GitHub Actions. trailofbits and gstack run actionlint and zizmor on their
  workflows.

### Vendoring and doctors

- We are the only repo that pins each vendored file by commit and sha256.
  claude-octopus pins a release tag with no hashes, and stripe/ai and
  agentic-awesome-skills track upstream HEAD.
- Doctor or health commands are common: ECC, gstack, claude-octopus,
  planning-with-files, oh-my-codex, and oh-my-claudecode. Silent hooks make a
  broken install look the same as always-on being off.

### Platform facts that changed

- The 10,000-character hook cap is documented at
  code.claude.com/docs/en/hooks.md#json-output, and it cannot be raised.
- A Codex `config.toml` entry `[plugins."x@mkt"] enabled = true`, followed by
  `codex plugin marketplace upgrade`, installed the plugin from a git
  marketplace. DECISIONS said a config entry alone does not load it. Both
  observations hold: the entry alone does nothing until an upgrade or
  install runs.
- A local-path Claude Code install copied files into the plugin cache on
  2.1.283 in one test, while an earlier test saw "loads in place" for a
  directory marketplace. `08-tests-claude.md` settles which applies when.
- Claude Code added a SessionStart `fork` source in 2.1.214. Neither of our
  matchers includes it.
- The Claude Code docs say not to set `version` in both `plugin.json` and
  the marketplace entry. We set both, kept equal.

## How the insights map to the result

| Insight | Outcome in 0.3.0 | Decision |
| --- | --- | --- |
| No repo uses plugin `dependencies`; copy plus drift check is the norm | `adhd-unslop` embeds its own copies; no dependencies | D4 |
| Mirrors are simpler when nothing loads them | Vendored `SKILL.md` byte for byte | D7 |
| Skills can read files next to them, but end-to-end runs showed the reads are denied or skipped (`11`) | The skill embeds the texts and reads nothing | D9 |
| The build could not add a plugin and missed strays | Generic build from `src/`, stray check, `--prune` | D10, D11 |
| Documented manifest minimum | No entry `version`, explicit Codex `hooks`, `products` kept | D22 |
| Resume duplicates in both runtimes; Codex can also lose the copy | Launcher skips `resume` in Claude Code only | D23 |
| Codex hashes every handler field for trust | Chunk handlers frozen by a test | D24 |
| Output styles force themselves; mode trackers need a per-prompt hook | Both rejected | D25 |
| Doctors are common | `adhd-unslop:doctor` | D26 |
| Keyless loads work in both CLIs | `load-check.mjs` in `verify.yml` with pinned CLIs | D27 |
| Pinned plus drift is the proven CLI model | `cli-drift.yml` | D28 |
| SHA pins, Dependabot, actionlint, zizmor | Workflow hygiene | D29 |
| Version bumps were not enforced | `version-gate.mjs` | D17 |
