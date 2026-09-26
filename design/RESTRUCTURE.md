# Restructure plan: one marketplace, several plugins

Status: implemented in 0.2.0 and merged 2026-09-26 (PR #1, #2). Superseded
for 0.3.0 by `STRUCTURE-v2.md`, which removed the plugin dependencies this
plan introduced. `DECISIONS.md` has the current decisions. This file keeps
the 0.2.0 test runs and the reasoning at the time.

## Where the implementation differs

- All upstream bumps share one PR on branch `upstream-bump`, instead of one
  branch per upstream.
- The citation gate checks ADHD exceptions, ADHD checks, and unslop process
  steps as well as rules. On its first real run it refused an upstream
  unslop change that removes process step 3, which the final check cites.
- The dependency hook sends its warning both as `systemMessage` and as model
  context, because `codex exec` does not print hook system messages.
- The load step tells Codex to read only the path in its skills list. In one
  test the model searched the disk and read a stale copy.
- Upgrading an install from 0.1.0 does not bring the new dependencies.
  `claude plugin update` moved `adhd-unslop` to 0.2.0 and left both `au-`
  plugins uninstalled. Running `claude plugin install adhd-unslop` again added
  one missing dependency per run. The README tells users to install both by
  name.

## Goal

The repo becomes a marketplace for Claude Code and Codex that holds several
plugins. The first three are:

- `au-i-have-adhd`, a vendored copy of ayghri/i-have-adhd.
- `au-unslop`, a vendored copy of the unslop skill from michael-denyer/pstack-claude.
- `adhd-unslop`, which keeps only the overlay text and loads the other two.

A later `presentation` plugin will depend on `au-i-have-adhd` the same way.

We ship only copies we have pinned and checked. Users never install from a
third-party marketplace.

## What we verified

These results come from a throwaway two-plugin marketplace run in isolated
homes on 2026-09-26, with Claude Code 2.1.283 and Codex 0.154.0.

| Behavior | Claude Code | Codex |
| --- | --- | --- |
| A plugin declares `"dependencies": ["dep"]` | Installing `top` also installed `dep` | Ignored. The user installs `dep` separately. |
| Skill in `top` loads the skill in `dep` | Skill tool call `dep:dep` succeeded | The model read `cache/<mkt>/dep/<ver>/skills/dep/SKILL.md` from its skill list |
| Skill in `top` when `dep` is absent | Not tested, because install always adds it | The model followed the skill's fallback and reported the skill missing |
| The user types the vendored skill's name | `/dep:dep` loaded | `$dep:dep` loaded |
| Unprompted question the vendored skill could answer | Not loaded in 3 of 3 runs | Not loaded in 3 of 3 runs |
| `disable-model-invocation: true` on the target | The Skill tool refuses to load it | Not applicable |
| `allow_implicit_invocation: false` on the target | Not applicable | The skill leaves the model's list, so the model has no path to read |
| `claude plugin update top` after both `top` and `dep` got new versions | `top` updated. `dep` stayed at its old version. | Not tested |
| A second marketplace also ships a plugin named `dep` | `/top:top` loaded `dep:dep` from our marketplace in 2 of 2 runs. Which copy wins is not documented. | `$top:top` read our copy in 2 of 2 runs. A typed `$dep:dep` saw both copies and reported the clash. |

The update test used a local-directory marketplace, and the loaded skill text
came from the newest source even where `claude plugin list` showed the old
version. A GitHub-hosted marketplace may behave differently, so the e2e
script repeats this against the real repo.

Other findings that shape the plan:

- Codex copies only the plugin's own directory into its cache and skips
  symlinks. A plugin cannot share files with a sibling through `../` or a link.
- Codex caches plugins at `plugins/cache/<marketplace>/<plugin>/<version>/`,
  the same shape as Claude Code.
- The current `"source": "./"` makes Codex copy the whole repo, including
  `.git`, `design/`, and `tests/`, into its cache.
- The README's `~/.agents/skills` symlink creates a second skill named
  `adhd-unslop:adhd-unslop`. Codex then injects neither copy on
  `$adhd-unslop:adhd-unslop`. Invoking a plugin skill in Codex takes the
  namespaced name. A bare `$adhd-unslop` does not match.

## Decisions already made

1. Each shared upstream skill is its own plugin in this marketplace.
   Consumers declare it as a Claude Code dependency.
2. Vendored skills stay invocable by the user and by the model. A narrow
   description keeps the model from picking them on its own. The build drops
   `disable-model-invocation: true` and Codex's
   `allow_implicit_invocation: false` from the vendored copies.
3. Upstream bodies stay byte-for-byte. Only frontmatter changes.
4. The always-on hook keeps embedding generated text. It never reads a
   sibling plugin, because Codex does not guarantee one is installed.
5. Upstream changes arrive as pull requests, not direct pushes.

## Target layout

```
.claude-plugin/marketplace.json     GENERATED, lists every plugin in plugins/
.agents/plugins/marketplace.json    GENERATED, same list for Codex
plugins/
  au-i-have-adhd/                   GENERATED, the whole directory
    .claude-plugin/plugin.json
    .codex-plugin/plugin.json
    skills/i-have-adhd/SKILL.md     upstream body, rewritten frontmatter
    skills/i-have-adhd/agents/openai.yaml
    skills/i-have-adhd/LICENSE
  au-unslop/                        same shape
  adhd-unslop/
    .claude-plugin/plugin.json      GENERATED, declares dependencies
    .codex-plugin/plugin.json       GENERATED
    hooks/hooks.json                hand-written
    hooks/always-on.mjs             hand-written
    hooks/lib.mjs                   hand-written
    hooks/chunks/                   GENERATED, full text as today
    skills/adhd-unslop/SKILL.md     GENERATED, overlay plus load step
    skills/adhd-unslop/agents/openai.yaml
    skills/adhd-unslop/LICENSES/    GENERATED
src/
  adhd-unslop/overlay/*.md          hand-written, moved from overlay/
upstream/<name>/                    pinned upstream files, unchanged
tools/
  plugins.json                      new, the single list of plugins
  upstream.json                     pins, unchanged format
  build.mjs
  sync.mjs
tests/
design/
```

`plugins/` holds only what ships. Source text lives in `src/` and `upstream/`,
so neither runtime copies it into a cache.

### tools/plugins.json

This file is the one place that names plugins, versions, and dependencies.
The build generates both marketplace files and every `plugin.json` from it.

```json
{
  "marketplace": { "name": "adhd-unslop", "owner": "Rubén Varela" },
  "plugins": {
    "au-i-have-adhd": { "version": "0.1.0", "kind": "vendored", "upstream": "i-have-adhd",
      "description": "Shapes replies for a reader with ADHD. Load when the user invokes it or another skill tells you to." },
    "au-unslop": { "version": "0.1.0", "kind": "vendored", "upstream": "unslop",
      "description": "Removes AI patterns from writing. Load when the user invokes it or another skill tells you to." },
    "adhd-unslop": { "version": "0.2.0", "kind": "composed",
      "dependencies": ["au-i-have-adhd", "au-unslop"] }
  }
}
```

The two descriptions are placeholders to settle during implementation.
Dependencies are bare names. All plugins come from one marketplace checkout,
so they always match, and bare names need no `<plugin>--v<version>` git tags.

## The slimmer adhd-unslop skill

`SKILL.md` becomes the overlay plus a new first section,
`src/adhd-unslop/overlay/05-load.md`. The section tells the model to:

1. Load `au-i-have-adhd:i-have-adhd` and `au-unslop:unslop` before anything else.
   In Claude Code it uses the Skill tool. In Codex it reads the `SKILL.md`
   that its skill list gives for each name.
2. If either is missing, name it once, give the install command for the
   current runtime, and apply the rules it did load.

The file shrinks from about 22,000 characters to about 8,000. On explicit
invocation the model still reads all three texts, so the context cost does
not drop. The new risk is that the model skips a load and applies the
overlay without the rules it cites. The end-to-end check below tests for this.

The overlay now appears in two contexts, and three passages assume
embedding. `00-intro.md` says both skills "appear below".
`10-precedence.md` refers to "the embedded upstream text".
`90-final-check.md` says "Both upstream texts appear above." Step 3 rewords
them so they hold whether the upstream texts arrive as loaded skills or in
the hook chunks. The overlay tests check the reworded lines.

When always-on is active and the user also invokes the skill, the load step
brings both upstream texts into context a second time. This is harmless and
goes into the skill's known limitations.

The hook chunks do not change. `build.mjs` assembles them from the overlay
without `05-load.md`, plus the two upstream bodies. The hook stays
self-contained and needs no sibling plugin.

Only `adhd-unslop` has an always-on hook. Vendored plugins get none. A
second plugin with its own hook would inject i-have-adhd twice. When
`presentation` arrives it either has no hook or checks for the adhd-unslop
flag and skips.

## Build changes

`tools/build.mjs` reads `tools/plugins.json` and writes:

- Both marketplace files, with `"source": "./plugins/<name>"`. The Codex file
  keeps `policy` and `category` per entry.
- Each plugin's `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json`
  with its own version. The Claude manifest of `adhd-unslop` gets
  `dependencies`.
- For each vendored plugin, `SKILL.md` made of rewritten frontmatter plus the
  upstream body. The rewrite keeps `name`, `license`, and `metadata`, replaces
  `description`, and drops `disable-model-invocation`. It also writes
  `agents/openai.yaml` without `allow_implicit_invocation: false` and copies
  the upstream `LICENSE`.
- The `adhd-unslop` skill, chunks, chunk manifest, licenses, and notice, as
  today, at their new paths.

`build.mjs --check` covers every generated file. The root `VERSION` file goes
away, because each plugin has its own version in `plugins.json`.

## Sync changes

`tools/sync.mjs --bump <name> <commit>` keeps its checks. Those are the
dependency scan, the citation report, and restore on failure. It also gains:

- Its backup list covers `plugins/`, both marketplace files, and
  `tools/plugins.json` instead of the old paths.
- After a successful bump it raises the patch version of every plugin that
  embeds the upstream. For `i-have-adhd` that is the `au-i-have-adhd` and
  `adhd-unslop` plugins. Without a version change, installed copies never
  update.
- A new `--latest` mode asks the GitHub API for the newest commit that
  touched each pinned path. It fetches the file and runs `--bump` only when
  the file's sha256 differs from the pin. A commit that leaves the file
  unchanged does nothing. It sends `GITHUB_TOKEN` when set, to avoid the
  unauthenticated rate limit in Actions.

## Dependencies in Codex

Codex has no way to declare a plugin dependency. This holds at 0.154.0 and at
the `openai/codex` main branch on 2026-09-26, and it was tested in an
isolated home:

- The plugin manifest has no `dependencies` field.
- `agents/openai.yaml` has `dependencies.tools`, but Codex acts only on
  entries of type `mcp`, which it offers to install as MCP servers.
- The marketplace policy `INSTALLED_BY_DEFAULT` did not install anything,
  either on `codex plugin marketplace add` or at session start. The source
  uses it for admin-assigned remote plugins.
- `[plugins."dep@mkt"] enabled = true` in `config.toml` without an install
  did not load the plugin.

A SessionStart hook in the consuming plugin can install what is missing.
The test hook looked for `$PLUGIN_ROOT/../../<dep>/`. When the folder was
absent, it ran `codex plugin add <dep>@<marketplace>`, taking the
marketplace name from the cache path. It then printed the new skill's path
as session context.

| Run | Result |
| --- | --- |
| `dep` missing, hooks off | `DEP-MISSING` |
| `dep` missing, hook trusted | The hook installed `dep`. In the same session the model read the new `SKILL.md` and answered `PAPAYA`. |
| Next session | The hook reported `dep` present. `$dep:dep` typed directly also worked. |

The limits:

- Codex runs a plugin hook only after the user trusts it in `/hooks`. The
  tests used `--dangerously-bypass-hook-trust`. Until the user trusts the
  hook, the skill's own missing-plugin message is the fallback.
- The source keys hook trust by plugin id and handler position, not by
  version, and compares a hash of the handler. Trust should survive an
  upgrade when `hooks.json` stays the same. This comes from reading the
  source and was not tested.
- Installing covers only missing plugins. Updating dependencies still needs
  the per-plugin steps in the next section.

One test gave a false pass. The model found the uninstalled `dep` by
searching the local marketplace folder next to its working directory. For
git marketplaces, Codex keeps a full copy of the repo at
`$CODEX_HOME/.tmp/marketplaces/<name>/`, so an uninstalled sibling's files
are on disk there too. This is an undocumented internal path, and the plan
does not rely on it. The e2e script runs from a directory outside the
marketplace.

Decision: the hook warns and does not install. A hook that runs
`codex plugin add` at session start changes the user's config without asking.

The hook goes into `adhd-unslop` as a separate handler that runs whether or
not the always-on flag is set. For each dependency missing from
`$PLUGIN_ROOT/../../`, it prints one line naming the plugin and the exact
install command. The command matches the runtime whose cache holds the
plugin root. When nothing is missing it prints nothing. It never blocks
session start and exits 0 on every path, like the current launcher.

## Updates reach dependencies only when asked

`claude plugin update adhd-unslop` does not update `au-i-have-adhd` or
`au-unslop`. Users need `claude plugin update` for each plugin, and Codex users
need the matching steps for each plugin. The README says so, and each bump
PR body lists the plugins whose version changed.

## Name collisions with upstream plugins

Skill names carry the plugin name but not the marketplace. The upstream
i-have-adhd plugin is also named `i-have-adhd`, so a user with both installed
has two skills called `i-have-adhd:i-have-adhd`. Neither copy overwrites the
other on disk, because each runtime caches plugins per marketplace.

Claude Code uses whichever copy was installed first. In the tests, with ours
installed first, ours won 3 of 3 times, including a typed `/dep:dep`. With
the other plugin installed first, the other copy won 3 of 3 times, again
including the typed name. The marketplace names did not decide the order.
In Codex, ours was installed first and won 2 of 2 times. A typed
`$dep:dep` found both copies and reported the clash.

When the upstream copy wins, three things break:

- Upstream i-have-adhd sets `disable-model-invocation: true`, so the Skill
  tool refuses to load it. `adhd-unslop` then runs without the ADHD rules.
- If upstream is at a different commit, the overlay's rule numbers may point
  at the wrong rules.
- The upstream always-on hook, if its flag is set, injects the ADHD rules a
  second time.

Decision (2026-09-26): the vendored plugins are named `au-i-have-adhd` and
`au-unslop`, so they cannot clash with upstream.

## GitHub Action

A new workflow, `.github/workflows/upstream-bump.yml`, runs daily and on
manual dispatch.

1. Check out, set up Node 22.
2. Run `node tools/sync.mjs --latest`. It exits 0 with no change, 0 after a
   successful bump, and 1 when a bump fails its checks.
3. On a successful bump, open or update a PR on branch `upstream-bump`
   with `peter-evans/create-pull-request`. The PR body lists old and new
   commits, the citation warnings, and a link to the upstream diff.
4. On a failed bump, open an issue with the failure text. The usual cause
   is that upstream removed a rule the overlay cites, and a person has to
   update the overlay.

The workflow needs `contents: write`, `pull-requests: write`, `issues: write`,
and the repository setting that lets Actions create pull requests.

A PR opened with the default `GITHUB_TOKEN` does not start other workflows.
The existing verify workflow would not run on it. The bump job already
builds and tests before it opens the PR. GitHub documents one exception.
`GITHUB_TOKEN` can start a `workflow_dispatch` run. After opening the PR,
the bump job runs `gh workflow run daily-build.yml --ref upstream-bump`,
which needs `actions: write`. The verify run then reports on the PR's head
commit. This needs no extra secret. It is documented but not yet tested
here.

Repository state on 2026-09-26, read with the `rubenvarela` account:

- The repo is public. `main` has no branch protection and no rulesets, so no
  check is required to merge.
- Default workflow permissions are `read`, which the job overrides with its
  own `permissions` block.
- "Allow GitHub Actions to create and approve pull requests" is off
  (`can_approve_pull_request_reviews: false`). It must be turned on before
  the bump job can open a PR.
- The repo has no Actions secrets.

The existing `daily-build.yml` keeps running on push and pull request. Its
schedule becomes redundant and can go.

## Tests

Update paths in the existing suite, then add:

- Each vendored `SKILL.md` body equals the upstream body byte-for-byte.
- Vendored frontmatter lacks `disable-model-invocation`, and vendored
  `openai.yaml` lacks `allow_implicit_invocation: false`.
- Both marketplace files list exactly the plugins in `plugins.json`, each at
  `./plugins/<name>`.
- The `adhd-unslop` Claude manifest lists the dependencies from `plugins.json`.
- No file under `plugins/` is a symlink, and no generated text links outside
  its own plugin directory.
- The hook chunks omit `05-load.md` and still reproduce the full text.
- A bump raises the version of each plugin that embeds the changed upstream.

The suite cannot run the CLIs in CI because they need auth. A manual script,
`tests/e2e/run.sh`, repeats the throwaway-home checks against the real
plugins:

1. Claude Code: install `adhd-unslop` and confirm both dependencies arrive.
   Run `/adhd-unslop:adhd-unslop` and confirm two Skill tool calls.
2. Codex: install `adhd-unslop` alone and confirm the missing-plugin message.
   Install the other two, run `$adhd-unslop:adhd-unslop`, and confirm the
   model read both vendored `SKILL.md` files.
3. Both: ask a question with no skill named and confirm neither vendored
   skill loads.
4. Both: install from the GitHub-hosted marketplace, push a version bump to
   a test branch, and record what `update` does to each plugin.
5. Both: install the upstream i-have-adhd plugin alongside ours and confirm
   `adhd-unslop` still loads our copy.

Run it before each release. Redirect Codex stdin from `/dev/null`, because
`codex exec` otherwise waits on it.

## Docs

- Remove the `~/.agents/skills` symlink route from the README.
- Codex install is three commands, `codex plugin add <name>@adhd-unslop` for
  each plugin. Invocation is `$adhd-unslop:adhd-unslop`.
- Claude Code install is one command, because dependencies follow.
- Update the `AGENTS.md` fallback text to name the namespaced skill.
- Update `NOTICE.md` and the layout section for `plugins/` and `src/`.

## Order of work

Each step ends with `node tools/build.mjs && node --test tests/*.test.mjs`
passing and is its own commit.

1. Add `tools/plugins.json`, move files into `plugins/adhd-unslop/` and
   `src/adhd-unslop/`, and generate the manifests from it. The skill still
   embeds both upstreams, so behavior is unchanged.
2. Add the vendored `au-i-have-adhd` and `au-unslop` plugins with rewritten
   frontmatter.
3. Add `05-load.md`, reword the three overlay passages that assume
   embedding, slim the `adhd-unslop` skill, and add `dependencies`. Add the
   dependency warning hook with tests for the present and missing cases in
   both runtimes' cache layouts.
4. Update the README, `NOTICE.md`, and the `AGENTS.md` fallback.
5. Add `--latest` and version bumps to `sync.mjs`, and add the workflow.
6. Write and run `tests/e2e/run.sh` in both CLIs.
7. Migrate the local machine. Remove the `~/.agents/skills/adhd-unslop`
   symlink, reinstall in both CLIs, and check which always-on flags exist.
   `~/.claude/.i-have-adhd-always` belongs to the upstream i-have-adhd
   plugin. That plugin is not installed now, so the flag does nothing, but
   reinstalling upstream would inject ADHD rules a second time. This step touches
   files outside the repo, so it waits for approval.

## Open decisions

Settled on 2026-09-26:

- The marketplace keeps the name `adhd-unslop` for now.
- Bump PRs use the default `GITHUB_TOKEN`, with a `workflow_dispatch` run of
  the verify workflow for checks.
- The Codex dependency hook only warns.
- The vendored plugins are `au-i-have-adhd` and `au-unslop` for now. The
  skills inside keep the names `i-have-adhd` and `unslop`.

Still open:

1. Whether to turn on "Allow GitHub Actions to create and approve pull
   requests" in the repo settings. The bump job needs it.
2. Whether a `workflow_dispatch` run started by `GITHUB_TOKEN` shows up as a
   check on the PR. Test it on the first bump.
