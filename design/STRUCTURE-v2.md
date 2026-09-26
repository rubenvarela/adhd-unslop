# Structure v2 proposal

Status: revision 5, 2026-09-26. Revision 4 reached CONSENSUS in Codex
adversarial review round 9 (`design/round-9-codex.md`) after REVISE verdicts
in rounds 6 to 8. End-to-end tests of the first implementation then showed
that the skill's reference reads were unreliable, so revision 5 embeds the
upstream texts instead. It goes to review round 10. See "Revision 5" at the
end. Research is in `design/research/`, summarized in
`design/research/00-synthesis.md`. Test results are in
`design/research/07-tests-codex.md`, `08-tests-claude.md`,
`09-tests-clear-compact.md`, `10-tests-hook-env.md`, and
`11-tests-e2e.md`. D1 to D21 refer to
`design/DECISIONS.md` as of `fc308bd`.

## Goals

The user set these goals:

- a clean marketplace
- clean skills
- easy to maintain
- supported by both runtimes' documented behavior
- a proven structure, one that popular repos already use
- easy to extend, starting with a planned `presentation` plugin that reuses
  i-have-adhd
- automation in GitHub Actions that keeps the repo working, clean, and
  current

## Summary of changes

1. `adhd-unslop` becomes self-contained. Its skill embeds both upstream
   texts in its body, the same bytes the always-on hook delivers. The Claude
   Code `dependencies` field, the dependency-check hook, and
   `hooks/dependencies.json` go away.
2. `au-i-have-adhd` and `au-unslop` stay as optional standalone mirrors.
   Each ships the upstream `SKILL.md` byte for byte, frontmatter included.
3. The always-on hook keeps its three embedded chunks and its hook
   definitions, so Codex trust carries over. The launcher skips `resume` in
   Claude Code only, the chunk text becomes factual, and an environment
   variable can switch injection off.
4. The build becomes generic. Every file under `plugins/` is generated from
   `tools/plugins.json`, `src/<plugin>/`, and `upstream/`. The check fails on
   stray files. Only `--prune` deletes them.
5. `adhd-unslop` gains a user-only `doctor` skill.
6. CI adds keyless install and load tests in both CLIs with pinned
   versions, a version gate, workflow linting, a daily run against the
   latest CLI releases, and Dependabot with actions pinned by commit.

## Decisions

### P1. Self-contained adhd-unslop, no plugin dependencies

This reverses part of D4 and all of D15, which the user chose over an earlier
proposal to copy the texts at build time. Three findings changed the
balance.

- No repo out of 25 uses plugin `dependencies`. Repos that share text
  between plugins copy it at build time and check the copies for drift
  (`03-multi-plugin-marketplaces.md`).
- Dependencies failed in practice. `claude plugin update` did not install
  newly declared dependencies, and a repeated install added one missing
  dependency per run (D16). Codex has no dependencies at all, so Codex users
  ran three install commands and relied on a warning hook.
- The hook already carries its own copy of both texts (D12), so a skill that
  carries the same copy adds no new kind of duplication.

What the user asked for still holds. The text comes only from our own pinned
copies, never a third-party marketplace. i-have-adhd stays available as its
own plugin. A new plugin reuses i-have-adhd by listing it, and the build
copies the text in.

The skill embeds the texts. Its body, after a one-line generated comment,
is the always-on bundle byte for byte: the overlay sections, the
i-have-adhd block, the unslop block, and the final check. It reads no files.

- Revision 4 had the skill read the texts from `references/` files next to
  it. End-to-end tests showed that failed in both runtimes (`11`). Claude
  Code denied both reads in `-p` mode because the files sit outside the
  working directory, and an interactive session would ask for permission
  each time. Codex skipped the reads in 7 of 8 runs with a short prompt.
  Rules that must always apply cannot depend on a permission rule or on the
  model choosing to read a file.
- `references/` is the progressive-disclosure pattern for optional detail.
  These texts are the rules themselves, so they belong in the body. 0.1.0
  embedded them the same way, and `design/BEHAVIOR.md` recorded that it
  worked.
- `allowed-tools: Read` in the frontmatter would let Claude Code read
  without asking, but it would pre-approve every Read while the skill is
  active and would do nothing for Codex. Rejected.
- Size: about 21,800 bytes, about 5,500 tokens. Codex cuts skills at 8,000
  bytes only for a plugin with a root `plugin.json` that uses the
  agent-plugins `$schema`, and our plugins have none (`07` C1). The
  end-to-end check confirms that the whole skill arrives in both runtimes
  (`11`).
- A user who invokes the skill while always-on already delivered the bundle
  gets a second, identical copy. That costs tokens and changes nothing,
  because the bundle rules treat a repeat as a repeat. The case is rare,
  since always-on makes invoking unnecessary.

Result: `claude plugin install adhd-unslop@adhd-unslop` or
`codex plugin add adhd-unslop@adhd-unslop` installs everything. Updates touch
one plugin.

#### Embedding contract

- A skill template embeds an upstream with a line `{{upstream <name>}}`.
  The build replaces it with the upstream block: the line `<!-- BEGIN
  upstream <name> <repo>/<path> @<commit> -->`, the upstream `SKILL.md`
  with its frontmatter removed and a final newline ensured, and `<!-- END
  upstream <name> -->`.
- The always-on chunks use the same block, byte for byte.
- `tools/plugins.json` lists each skill's embedded upstreams in
  `upstreams`. The build fails when the template's directives and the list
  disagree, or when a directive names an unpinned upstream.
- Tests check that each listed block appears exactly once in the skill and
  matches the hook chunk that carries it, and that the `adhd-unslop` skill
  body equals the hook bundle.

#### Versioning rule

A plugin ships an upstream's text when it is that upstream's vendored
mirror, when one of its skills embeds the upstream, or when its always-on
chunks include it. `sync.mjs` raises the patch version of every such plugin
once per bump run. A future `presentation` plugin that embeds i-have-adhd
therefore gets a new version whenever i-have-adhd changes. The CI version
gate catches every other change to shipped files.

### P2. Vendored plugins are byte-for-byte mirrors

`au-i-have-adhd` and `au-unslop` ship the upstream `SKILL.md` unchanged,
frontmatter included. Neither upstream skill folder has an
`agents/openai.yaml`, so the build generates one that matches the Claude Code
setting: `allow_implicit_invocation: false` when the upstream frontmatter
sets `disable-model-invocation: true`, and `true` otherwise.

- This reverses D7, whose only reason was that `adhd-unslop` loaded these
  skills through the Skill tool. Nothing loads them now.
- A mirror that changes nothing is simpler to trust and to test. The test
  becomes one comparison of the whole file.
- Typed invocation still works. i-have-adhd stays user-only, as upstream
  ships it. unslop stays model-invocable, as upstream ships it.
- The `au-` prefix stays (D6). The name clash it prevents still exists.
- The plugins are optional. `adhd-unslop` never needs them.

### P3. The always-on hook keeps embedded chunks

The hook keeps three chunks printed from files inside `adhd-unslop`.

- Always-on SessionStart injection is the proven pattern: superpowers,
  ponytail, caveman, ECC, and planning-with-files use it.
- Codex has no other mechanism a plugin can set. `~/.codex/AGENTS.md` and
  `developer_instructions` belong to the user (`06-official-docs.md`).
- Three chunks are needed because Claude Code saves a value over 10,000
  characters to a file and shows the model a path and the first 2,000
  characters (`08` L5). The cap is documented at
  code.claude.com/docs/en/hooks.md#json-output and cannot be raised.

Changes:

- The matcher stays `startup|resume|clear|compact`, and the launcher
  decides what to do on `resume`.
  - Claude Code keeps the earlier injection in a resumed session, so a
    second copy of about 24,000 characters arrived on every resume (`08`
    L1). Claude Code never loses the copy: `/compact`, `/clear`, and
    auto-compaction each leave exactly one (`09`). The launcher prints
    nothing on `resume` in Claude Code.
  - Codex also duplicates the copy on resume (`07` C4), but it can lose the
    copy too. Codex fires `compact` only when the next turn starts, so a
    user who compacts and quits before sending a message resumes later with
    no copy (`09`). The launcher keeps injecting on `resume` in Codex. A
    duplicate costs tokens, and a missing copy silently turns always-on
    off, so the duplicate is the lesser problem. This is today's behavior.
  - The launcher tells the runtimes apart by `PLUGIN_ROOT`, which Codex sets
    and Claude Code never does (`10`). When it cannot tell, it injects.
  - It reads `source` from the SessionStart payload on stdin, with a short
    timeout, and injects when stdin is missing or unreadable.
  - A forked Claude Code session sends `source: "fork"` and carries the
    parent's copy (`08` L1), so `fork` needs no match.
  - One Claude Code edge case: a user who turns always-on on during a
    session and then resumes it gets no copy until the next startup,
    `/clear`, or compaction. The README says to start a new session.
  - Claude Code orders the chunks by which handler finishes first, while
    Codex keeps the declared order (`09`). The header already accepts any
    order.
- Handlers keep `additionalContextLimit: 5000`. The built chunks were not
  tested against the Codex default with non-ASCII text, and unslop contains
  `→`. Keeping the key costs nothing and avoids that risk.
- Header wording becomes statements of fact. The Claude Code docs warn that
  imperative hook text can trigger prompt-injection defenses. The header
  adds that a chunk counts only when its END line is present.
- The Codex manifest names the hooks file explicitly, as every repo that
  ships a Codex plugin hook does. Trust survives the explicit path (`07` C3).

`ADHD_UNSLOP_ALWAYS` semantics:

- Unset or empty: the flag files decide, as today.
- `0`, `false`, or `off`, in any case: injection is off for this process,
  even when a flag file exists.
- `1`, `true`, or `on`: injection is on without a flag file.
- Any other value is treated as unset. The doctor reports it.

Codex keys hook trust by plugin, hooks file path, event, group, and handler
index, and checks a hash of the handler fields (`07` C3). The three chunk
handlers keep their group, positions, and every field, so trust recorded
for 0.2.2 stays valid and Codex users do not review the hooks again. The
dependency check was the second group, so removing it shifts nothing. A
unit test freezes the three handler definitions, so a change to them fails
until someone decides to accept one more review.

The chunk footer also names the environment switch, so it no longer tells
a user that removing the flag files is the only way off.

### P4. Output styles are not adopted

A plugin can force an output style with `force-for-plugin: true`. It
arrives with no size cap and persists through compaction (`08` L8, docs). It
is rejected:

- It overrides the user's own `outputStyle` whenever the plugin is enabled,
  which bypasses the opt-in flag (D14).
- No repo of the 25 ships one, so it is not proven.
- It is Claude Code only. Codex still needs the hook, so the repo would
  maintain two delivery paths.

Revisit if Claude Code adds an opt-in style that composes with the user's
style.

### P5. No per-session mode tracker

caveman stores mode state per session so compaction cannot turn a mode back
on. That needs a `UserPromptSubmit` hook on every prompt, in both runtimes,
with its own trust entry in Codex. The case it fixes, a user stopping a mode
and then compacting, is rare, and a repeated stop command fixes it. The
limitation stays documented.

### P6. Every file under plugins/ is generated

`tools/plugins.json` lists each plugin. Its schema:

| Field | Kinds | Meaning |
| --- | --- | --- |
| `name`, `version`, `category`, `description`, `keywords` | all | Manifest fields |
| `marketplaceDescription` | all, optional | Marketplace listing text |
| `codexInterface` | all | Codex `interface` block |
| `kind` | all | `vendored` or `authored` |
| `upstream`, `skill` | vendored | The pinned upstream and its skill folder name |
| `skills` | authored | Map of skill name to `{ "upstreams": [upstream, ...] }`, the upstreams its template embeds |
| `alwaysOn` | authored, optional | Ordered chunk list. Each chunk lists parts: `{ "file": "<path under src/<plugin>/>" }` or `{ "upstream": "<name>" }` |

An authored plugin's hand-written sources live in `src/<plugin>/`:

- `skills/<skill>/` is copied to `plugins/<plugin>/skills/<skill>/`. A
  `SKILL.md.tmpl` in it is rendered to `SKILL.md`. The template syntax is
  two line directives: `{{include <path under src/<plugin>/>}}` inserts
  that file, and `{{upstream <name>}}` inserts the pinned upstream block.
  gstack renders skills from templates the same way.
- `hooks/` is copied to `plugins/<plugin>/hooks/`.
- Generated per plugin: both manifests, `README.md`, `NOTICE.md`, one
  `LICENSES/<upstream>.LICENSE` per upstream it ships, and the always-on
  chunks with their manifest.

Build rules:

- `build.mjs --check` fails when a generated file is stale or missing, and
  when a file under `plugins/`, `.claude-plugin/`, or `.agents/plugins/` is
  not one the build writes. claude-octopus and gstack both check for strays
  (`04`).
- `build.mjs` writes expected files only. `build.mjs --prune` also deletes
  strays, and prints each path it deletes.
- Tests require at least one skill per plugin, and that every `upstreams`
  and `alwaysOn` upstream is pinned in `tools/upstream.json`.

Adding `presentation`:

1. Add an entry to `tools/plugins.json` with `"kind": "authored"` and
   `"skills": { "presentation": { "upstreams": ["i-have-adhd"] } }`.
2. Write `src/presentation/skills/presentation/SKILL.md.tmpl` with a line
   `{{upstream i-have-adhd}}` where the rules belong, and
   `agents/openai.yaml` for its Codex invocation policy.
3. Run `node tools/build.mjs` and the tests.

### P7. Manifests follow the documented minimum

- Both native manifests stay for each plugin, generated. hashicorp uses this
  layout. Codex falls back to the Claude files, but then loses the
  `interface` text, and `interface` in a Claude manifest fails `claude plugin
  validate --strict` (`02`).
- Claude Code marketplace entries drop `version`. The docs say not to set it
  twice. Install, listing, and update all use `plugin.json` (`08` L3).
- The Codex marketplace keeps `policy.products: ["CODEX"]`. The repo
  targets Claude Code and Codex, and dropping it would publish to ChatGPT
  and Atlas too.
- Claude Code manifests gain `homepage`, `repository`, and `keywords`. Each
  plugin gains a generated `README.md`.
- No root `plugin.json` with the agent-plugins `$schema`. Codex would read
  it first and cut skills at 8,000 bytes (`07` C1).

### P8. A user-only doctor skill

`adhd-unslop:doctor` runs `node` on a script in its own folder. The script
prints OK, WARN, or FAIL lines, each with the fix, and changes nothing. The
skill's frontmatter sets `disable-model-invocation: true`, and its
`openai.yaml` sets `allow_implicit_invocation: false`.

Checks:

- the runtime and the plugin root the script runs from
- the installed `adhd-unslop` version, from the plugin root's manifest
- the `au-` plugins, listed as optional independent installs, never WARN
  or FAIL when absent
- which always-on flag files exist, and the value of `ADHD_UNSLOP_ALWAYS`,
  with a WARN for an unrecognized value
- the chunk hashes and sizes, reusing the launcher's validation
- Codex: whether `[features]` in `config.toml` turns hooks off. Codex turns
  hooks on by default (`07` C7).
- a `~/.agents/skills` entry named `adhd-unslop`, or a link into a copy of
  this repo, which creates a duplicate skill name (D20)

It reports the installed hook definitions and tells Codex users to confirm
trust in `/hooks`. It does not parse Codex's trust records, whose layout is
not documented.

Precedent: ECC, gstack, claude-octopus, planning-with-files, oh-my-codex, and
oh-my-claudecode ship doctors. Silent hooks make a broken install look like
always-on being off.

### P9. CI

`verify.yml`, renamed from `daily-build.yml`, runs on pull requests, pushes
to `main`, and manual dispatch.

- `checks`: `sync.mjs --check`, `build.mjs --check` with the stray-file
  rule, unit tests, and on pull requests a version gate. The gate fails when
  files under `plugins/<name>/` differ from the merge base and that plugin's
  version did not rise. The pattern comes from expo.
- `load`: installs pinned Claude Code and Codex versions and runs
  `tools/load-check.mjs` with no keys, in throwaway homes.
  - Claude Code: `validate --strict` on the marketplace and each plugin,
    `marketplace add` of the checkout, `install adhd-unslop@adhd-unslop`,
    and `list --json`. It asserts that only `adhd-unslop` installs, with the
    expected version and no errors, and that its cache copy holds the skill,
    both reference files, and the hooks.
  - Codex: `codex plugin marketplace add` of the checkout and `codex plugin
    add adhd-unslop@adhd-unslop`. It asserts that only `adhd-unslop` is in
    the cache, and checks its cache copy the same way.
  - Both runtimes, second step: install `au-i-have-adhd` and `au-unslop` by
    name, and assert that each installs with its expected version and skill.
  - Codex, catalog: `app-server` with `initialize`, `plugin/list`, and
    `plugin/read`. `plugin/read` reads the marketplace entry, installed or
    not, so it asserts full skill names, hook keys, and versions for all
    three plugins. The pattern comes from trailofbits.
- `workflows`: actionlint and zizmor, from trailofbits and gstack.

`cli-drift.yml` runs the load check daily against the latest CLI releases
and opens or updates an issue on failure. The pattern comes from caveman.

`upstream-bump.yml` keeps D18's design. It dispatches `verify.yml` by its
new name and adds `sync.mjs --verify-remote`, which refetches the pinned
files and compares hashes.

Dependabot updates GitHub Actions weekly with a cooldown. Workflows pin
actions by commit SHA with a version comment. `.gitattributes` sets LF line
endings and marks generated files.

### P10. End-to-end tests and migration

`tests/e2e/run.sh` stays local, because model-driven checks need signed-in
CLIs. It gains:

- Claude Code and Codex: `/adhd-unslop:adhd-unslop` and
  `$adhd-unslop:adhd-unslop` with always-on off deliver the whole skill,
  seen in the transcript or rollout as both BEGIN lines and the last line
  of the final check. The checks look at what arrived in context, not at
  how the model answered.
- The unprompted-question check runs before the mirrors are installed, and
  requires that no skill loads.
- Typed `/au-i-have-adhd:i-have-adhd` and `$au-i-have-adhd:i-have-adhd`
  still work with the restored upstream frontmatter.
- Always-on delivers one complete bundle at startup, with each END line
  present.
- Typed `/au-unslop:unslop` and `$au-unslop:unslop` work too.
- A Claude Code resume holds one copy, and a Codex resume holds at least
  one.
- An upgrade from 0.2.2 in each runtime, served from a local git
  marketplace. A small `git http-backend` on localhost worked as a git
  marketplace with real cache paths (`08`). The script installs 0.2.2 with
  an always-on flag set, runs the documented update commands, and checks
  the result.
  - Claude Code: 0.2.2 pulls in both `au-` plugins as dependencies, and the
    user also installs `au-unslop` by name. After `claude plugin prune`,
    `au-i-have-adhd` is gone and `au-unslop` stays. `claude plugin update
    au-unslop@adhd-unslop` moves the kept mirror to its new version, and
    always-on delivers one bundle.
  - Codex: the user installs `au-unslop` by name, and the test records
    trust for every 0.2.2 handler using the hashes that `app-server`
    `hooks/list` reports. After the update, `hooks/list` reports the three
    chunk handlers as trusted, a `codex exec` run without the bypass flag
    delivers one bundle, and `au-unslop` is still installed.

Documented migration from 0.2.2:

- Claude Code: `claude plugin marketplace update adhd-unslop`, then
  `claude plugin update adhd-unslop@adhd-unslop`, then optionally `claude
  plugin prune` to remove the `au-` plugins that 0.2.2 installed as
  dependencies. A mirror kept by name needs its own `claude plugin
  update`.
- Codex: `codex plugin marketplace upgrade adhd-unslop`, then `codex plugin
  add adhd-unslop@adhd-unslop`. Existing hook trust carries over. Remove the
  `au-` plugins with `codex plugin remove` only if they were installed for
  `adhd-unslop` alone.

### P11. Versions

- `adhd-unslop` 0.3.0: no dependencies, embedded upstream texts, launcher
  changes, doctor.
- `au-i-have-adhd` 0.2.0 and `au-unslop` 0.2.0: upstream frontmatter
  restored.

### P12. Documentation

`README.md`, `AGENTS.md`, `NOTICE.md`, and `DECISIONS.md` change to match.
In `DECISIONS.md`, D4, D7, D9, D12, D15, D16, D17, and D21 are rewritten, the
platform facts table takes the new test results, and new entries record P3
to P9. `design/idea1.md` records its outcome. The README drops the
`~/.codex/AGENTS.md` fallback, because hooks are the supported always-on
path and the fallback named a skill Codex hides from the model.

## Not changed

- D1 tie-breaker, D2 verbatim upstream bodies, D3 citation gate, D5
  vendoring with pins, D6 `au-` prefix, D8 composed skill runs only when
  asked, D13 one always-on hook, D14 flag files, D18 bump PRs reviewed by a
  person, D19 marketplace name, D20 full Codex names.

## Rejected or deferred

| Idea | Source | Why not |
| --- | --- | --- |
| Keep plugin `dependencies` | D4, D15 | Unused in the ecosystem, update failures, no Codex support |
| Skill reads `references/` files | revision 4 | Claude Code denies or prompts for the reads; Codex skipped them in 7 of 8 runs (`11`) |
| `allowed-tools: Read` | `11` | Pre-approves every Read while the skill is active; does nothing for Codex |
| Shrink or reorder the skill to survive Claude Code's compaction cut | `11` | Fixes only the same-process case, cuts settled overlay text, or loses other rules; always-on covers compacting sessions |
| Hook reads the `au-` plugins | idea1 option A | Siblings can be missing or at other pins |
| Hook injects a pointer only | idea1 option B | Same context once loaded, less reliable |
| Output style | idea1 option D | P4 |
| Per-session mode tracker | caveman | P5 |
| `SubagentStart` injection | ponytail | Triples the bundle cost per subagent with no stated need |
| `userConfig` switch | ECC | Claude Code only; the env switch covers scripted runs |
| Release tags and GitHub releases | `05` | Tags matter only for dependency version ranges, which P1 removes |
| Separate `codex-hooks.json` | ECC | Claude Code accepts the shared file without warnings (`08` L4) |
| Dropping `additionalContextLimit` | `07` C6 | Non-ASCII chunks untested against the default; keeping it is free |
| Dropping `policy.products` | `02` | Would publish beyond Claude Code and Codex |
| Doctor checks of Codex trust records or upstream flags | round 6 | Undocumented layouts give false results |
| Rerun the PR's own `action_required` run | agentic-awesome-skills | The dispatched run already reports on the PR |
| Markdown lint | `05` | Upstream text must stay verbatim (D2) |

## Round 6 responses

| Round 6 item | Response |
| --- | --- |
| Blocking 1, reference contract | P1 "Reference contract" and "Versioning rule" |
| Blocking 2, clear and compact untested | Tested in `09`: one complete copy on each source in both runtimes, plus one Codex gap that P3 now covers |
| Blocking 3, non-ASCII and the Codex default | Keep `additionalContextLimit` (P3) |
| Blocking 4, build deletes files | Only `--prune` deletes (P6) |
| Blocking 5, `policy.products` | Kept (P7) |
| Blocking 6, doctor treats `au-` as required | Listed as optional, never WARN or FAIL (P8) |
| Blocking 7, doctor parses trust records | Removed; points to `/hooks` (P8) |
| Blocking 8, load check skips the install path | CLI install in both runtimes plus cache assertions (P9) |
| Blocking 9, tests miss P1, P2, and migration | E2E additions (P10) |
| Blocking 10, migration not actionable | Exact commands and an upgrade test from 0.2.2 (P10) |
| Do not build 1 to 5 | All five are in "Rejected or deferred" |
| Missing 1, source schema | P6 table |
| Missing 2, docs and tests | P12 and P10 |
| Missing 3, versioning for `presentation` | P1 "Versioning rule" |
| Missing 4, env switch semantics | P3 |

## Round 7 responses

| Round 7 item | Response |
| --- | --- |
| Blocking 1, Codex resume after compact loses the copy | The matcher keeps `resume`. The launcher skips it only in Claude Code, which never loses the copy (P3, `10`) |
| Blocking 2, migration trust not proven | The hook definitions do not change, so trust carries over. The upgrade test seeds 0.2.2 trust from `hooks/list`, then checks trust and delivery without the bypass flag, and that an `au-` plugin installed by name survives (P10) |
| Round 6 item 10 | Same as blocking 2 |
| Optional, footer names only the flag files | The footer also names the environment switch (P3) |
| Optional, typed `au-unslop:unslop` | Added to the E2E list (P10) |

## Round 8 responses

| Round 8 item | Response |
| --- | --- |
| Blocking 1, load check asserts all three plugins after installing one | The self-contained step asserts only `adhd-unslop`. A second step installs both `au-` plugins by name and asserts them. `plugin/read` covers the catalog for all three (P9) |
| Optional, `PLUGIN_ROOT` on Codex 0.157.1 | Tested; same variables as 0.154.0 (`10`) |
| Optional, unit cases for the env switch and footer | Added to the implementation's unit tests |

## Revision 5

Revision 4 reached CONSENSUS in round 9. Implementing it, the end-to-end
script (`design/research/11-tests-e2e.md`) found two failures in the
`references/` mechanism of P1:

1. Claude Code denied both reads in `-p` mode, because the files sit outside
   the working directory. The model answered anyway, with no upstream rules
   loaded. An interactive session would ask for permission on each read.
2. Codex read the files in 1 of 8 runs with a short prompt, and in 4 of 4
   with the plugin's own default prompt. Whether the rules load depended on
   the prompt.

Revision 5 changes only how the skill gets the texts. It embeds them with a
`{{upstream <name>}}` template directive, so the skill body is the hook
bundle byte for byte. Everything else in revision 4 stands: no plugin
dependencies, byte-for-byte mirrors, the frozen hook handlers, the launcher's
resume rule, the generated `plugins/`, the doctor, and CI.

It also records two findings from the same run:

- With both mirrors installed, Codex 0.154.0 loaded `au-unslop:unslop` for
  an unrelated question in 2 of 4 runs, and 0.157.1 in 0 of 4. That is
  upstream's frontmatter, kept on purpose by P2. A user with always-on and
  this mirror gets a second unslop that `stop unslop` does not control. The
  README says so, and the check for an unprompted skill load now runs
  before the mirrors are installed.
- A mirror kept by name in Claude Code stays at its old version after the
  upgrade until `claude plugin update` runs on it. P10 now says so.

The second end-to-end run on revision 5 passed every check: Claude Code 17
of 17, Codex 0.154.0 19 of 19, Codex 0.157.1 19 of 19, and `migrate` 16 of
16 in each runtime. Both runtimes received the whole skill body byte for
byte, so Codex does not cut a skill of about 22 KB.

It also measured one platform limit (`11`, last section). With always-on
off, Claude Code 2.1.283 re-attaches an invoked skill after `/compact` cut
to 20,000 characters, which drops unslop rules 32 and 33, the END line, and
the final check. After `--resume` and then `/compact`, it re-attaches
nothing. The always-on hook is not affected, because it injects the whole
bundle again on `compact`.

Revision 5 documents this instead of reshaping the skill:

- Shrinking the body under 20,000 characters would fix only the first case,
  and would mean cutting overlay text that five review rounds settled, with
  upstream growth pushing it over again later.
- Moving the final check ahead of the upstream texts would lose other rules
  instead, and would break the identity between the skill body and the hook
  bundle, because chunk 1 has no room for it under the 10,000-character cap.
- The README tells users who work in long, compacting sessions to turn on
  always-on, or to invoke the skill again after a compaction. A unit test
  reports the skill's size against the 20,000-character re-attach budget, so
  the gap stays visible.
