# adhd-unslop

This repo is a plugin marketplace for Claude Code and Codex. Its main plugin
combines [i-have-adhd](https://github.com/ayghri/i-have-adhd) and pstack's
[unslop](https://github.com/michael-denyer/pstack-claude) with one
tie-breaker.

| Plugin | Skills | What it is |
| --- | --- | --- |
| `adhd-unslop` | `adhd-unslop`, `doctor` | The overlay rules plus both upstream texts, an always-on hook, and a doctor. Everything you need. |
| `au-i-have-adhd` | `i-have-adhd` | Optional. A pinned, unchanged copy of ayghri/i-have-adhd |
| `au-unslop` | `unslop` | Optional. A pinned, unchanged copy of the unslop skill from pstack-claude |

All upstream text comes from copies pinned by commit and sha256 in
`tools/upstream.json`. The `au-` prefix keeps the mirrors from clashing with
the upstream plugins of the same name.

## The rule

Both rule sets stay active. When a rule from each would produce different text
for the same passage:

- In a direct reply to the user, i-have-adhd wins.
- In all other writing, unslop wins. This includes files, docs, commit
  messages, PR text, subagent prompts, and text you were asked to rewrite.

Compatible rules apply everywhere. The skill defines both surfaces per
passage, lists the known interactions in an outcome table, and adds
independent off switches. The overlay text is in `src/adhd-unslop/overlay/`.

## Install

### Claude Code

```bash
claude plugin marketplace add rubenvarela/adhd-unslop
claude plugin install adhd-unslop@adhd-unslop
```

Type `/adhd-unslop` in a session. If another command uses that name, type
`/adhd-unslop:adhd-unslop`. The skill carries both upstream texts itself. It
has `disable-model-invocation: true`, so nothing applies until you invoke it
or turn on always-on mode.

### Codex

```bash
codex plugin marketplace add rubenvarela/adhd-unslop --ref main
codex plugin add adhd-unslop@adhd-unslop
```

Type `$adhd-unslop:adhd-unslop` in a session. Codex matches plugin skills by
their full name, so a bare `$adhd-unslop` finds nothing.

Do not link the skill into `~/.agents/skills`. Codex names a linked skill
after the plugin that contains it, so the link becomes a second
`adhd-unslop:adhd-unslop`, and with two skills of one name Codex loads
neither. The doctor warns about such a link.

### The optional mirrors

Install `au-i-have-adhd` or `au-unslop` only if you want that skill on its
own. `adhd-unslop` never needs them.

```bash
claude plugin install au-i-have-adhd@adhd-unslop     # then /au-i-have-adhd:i-have-adhd
codex plugin add au-unslop@adhd-unslop               # then $au-unslop:unslop
```

They behave exactly as upstream ships them: i-have-adhd runs only when you
type it, and unslop can also be chosen by the model. With the unslop mirror
installed, Codex sometimes loads it on its own. That copy is separate from
`adhd-unslop`, so `stop unslop` does not turn it off. If you use
`adhd-unslop`, you do not need the unslop mirror.

## Update

Each plugin updates on its own.

```bash
claude plugin marketplace update adhd-unslop
claude plugin update adhd-unslop@adhd-unslop

codex plugin marketplace upgrade adhd-unslop
codex plugin add adhd-unslop@adhd-unslop
```

Update a mirror the same way if you installed one.

### From 0.2.x

0.2.x installed the two mirrors as dependencies of `adhd-unslop`. 0.3.0 does
not need them.

- Claude Code: run the update commands above, then `claude plugin prune` to
  remove the mirrors that 0.2.x installed for you. A mirror you installed by
  name stays; update it with `claude plugin update au-unslop@adhd-unslop` or
  `claude plugin update au-i-have-adhd@adhd-unslop`.
- Codex: run the update commands above. Your hook trust carries over, because
  the hook definitions did not change. Remove the mirrors with `codex plugin
  remove au-i-have-adhd@adhd-unslop` and `codex plugin remove
  au-unslop@adhd-unslop` if you installed them only for `adhd-unslop`.

## Always-on mode

Create a flag file to deliver the rules at session start without invoking
the skill:

```bash
touch ~/.claude/.adhd-unslop-always      # or "$CLAUDE_CONFIG_DIR/.adhd-unslop-always"
touch ~/.codex/.adhd-unslop-always       # or "$CODEX_HOME/.adhd-unslop-always"
```

Either flag turns always-on on in both runtimes. Remove every flag to stop.

`ADHD_UNSLOP_ALWAYS` overrides the flags for one process, which helps in CI
and scripted runs:

- `ADHD_UNSLOP_ALWAYS=0`, `false`, or `off` turns it off even when a flag
  exists.
- `ADHD_UNSLOP_ALWAYS=1`, `true`, or `on` turns it on without a flag.
- Any other value is ignored, and the doctor warns about it.

Codex runs plugin hooks only after you review and trust them:

1. Open `/hooks` in an interactive Codex session.
2. Trust the `adhd-unslop` handlers.
3. Restart.

### When the rules arrive

The hook runs at `startup`, `clear`, `compact`, and `resume`.

- Claude Code keeps the earlier copy in a resumed session, so the hook adds
  nothing on resume. If you turn always-on on in the middle of a session,
  start a new session to get the rules.
- Codex also keeps the earlier copy, but it can lose it: after a manual
  compaction, Codex fires the hook only when your next message starts. If
  you compact and quit before sending a message, the resumed session would
  have no copy. So the hook injects on every Codex resume, which can leave a
  second copy in context.
- If the rules ever seem missing, invoke `/adhd-unslop` or
  `$adhd-unslop:adhd-unslop`, or run the doctor. Invoking it while
  always-on already delivered the rules adds a second, identical copy, and
  turns both modes back on, including one you had stopped.

### How the always-on hook works

The hook carries its own copy of both upstream texts, so it works without the
mirrors and without the model reading any file first.

Claude Code caps each hook's output at 10,000 characters, and Codex allows
about 2,500 tokens per handler by default. The rules are about 21,500
characters, so the hook delivers them as three chunks from three handlers
under one matcher:

1. Scope, surfaces, precedence, and lifecycle.
2. The i-have-adhd body, verbatim.
3. The unslop body, verbatim, plus the final check.

Every chunk has the same header, with its index and the first 12
hexadecimal characters of the bundle's SHA-256. The header states that a
bundle counts only when all three chunks with that id arrive, each with its
END line, and that arriving instructions do not change mode state.

Each handler sets `additionalContextLimit: 5000` for Codex. The launcher
checks each chunk hash against `hooks/chunks/manifest.json` and checks the
assembled size against both caps before printing. With always-on on and a
broken install, it prints one JSON `systemMessage` with no context. With
always-on off, it prints nothing.

## Doctor

Type `/adhd-unslop:doctor` or `$adhd-unslop:doctor`. It prints one OK, WARN,
or FAIL line per check, with the fix for each problem, and changes nothing.
It checks the install, the optional mirrors, the always-on flags and switch,
the hook chunks, the Codex hooks feature, and a `~/.agents/skills` name
clash. You can also run it directly:

```bash
node ~/.claude/plugins/cache/adhd-unslop/adhd-unslop/<version>/skills/doctor/scripts/doctor.mjs
```

## Switches

- `stop adhd mode` turns the ADHD rules off. unslop stays as it was.
- `stop unslop` turns the unslop rules off. ADHD stays as it was.
- `normal mode` turns both off.
- Invoking the skill again turns both on.

Known limitations:

- Mode state lives in the conversation. Compaction can lose it, and the
  re-injected instructions then restore the active defaults. Repeat the stop
  command if that happens.
- Without always-on, Claude Code keeps an invoked skill through `/compact`
  only up to 20,000 characters, and this skill is about 21,800, so the last
  unslop rules and the final check drop out. After a resume and a compaction
  it keeps none of it. For long sessions that compact, turn on always-on,
  which delivers the whole rule set again at every compaction, or invoke the
  skill again after compacting.

## Upstream updates

The `Bump upstream skills` workflow runs daily. It first runs
`node tools/sync.mjs --verify-remote`, which refetches each pinned file and
compares its hash. Then `node tools/sync.mjs --latest`:

1. Finds the newest upstream commit that touched a pinned file.
2. Skips an upstream when that commit changed none of the pinned files.
3. Fetches the files and refuses a body that references files the plugins
   do not ship, such as `references/`, `scripts/`, or relative links.
4. Refuses a body that drops a rule, exception, check, or process step the
   overlay cites.
5. Swaps the files in, raises the patch version of each plugin that ships
   the text, rebuilds, and runs the tests. It restores everything if a step
   fails.

The workflow opens or updates one PR with the results and starts the verify
workflow on it. When a bump fails, it opens an issue with the reason. The
usual cause is an upstream change to a rule the overlay cites, which needs an
overlay edit. It needs the repository setting "Allow GitHub Actions to create
and approve pull requests".

To bump by hand:

```bash
node tools/sync.mjs --check                        # upstream/ matches the pins
node tools/sync.mjs --bump i-have-adhd <commit>    # or: --bump unslop <commit>
git diff
```

Review the upstream diff for conflicts with the other skill. Record them in
the outcome table in `src/adhd-unslop/overlay/10-precedence.md`.

## Editing

Edit only `src/`, `tools/plugins.json`, and `tools/upstream.json`. Then:

```bash
node tools/build.mjs
node --test tests/*.test.mjs
```

`node tools/build.mjs` generates everything under `plugins/` and both
marketplace files. `node tools/build.mjs --check` fails when a generated file
is stale or when a stray file sits under a generated folder, and
`node tools/build.mjs --prune` deletes strays. Raise a plugin's version in
`tools/plugins.json` whenever its shipped files change. CI enforces this.

To add a plugin that uses i-have-adhd:

1. Add an entry to `tools/plugins.json` with `"kind": "authored"` and
   `"skills": { "<skill>": { "upstreams": ["i-have-adhd"] } }`.
2. Write `src/<plugin>/skills/<skill>/SKILL.md.tmpl` with a line
   `{{upstream i-have-adhd}}` where the rules belong, and
   `agents/openai.yaml` for its Codex policy. The build puts the pinned
   i-have-adhd text in place of that line.
3. Build and test. Give the plugin no always-on hook of its own, or it would
   inject the ADHD rules a second time.

## Checks

- `verify.yml` runs on every pull request and push to `main`: the pin check,
  the generated-file check, the unit tests, a version gate on pull requests,
  a keyless load check that installs the plugins into pinned Claude Code and
  Codex versions, and workflow linting.
- `cli-drift.yml` runs the load check daily against the latest CLI releases.
  It opens an issue when that fails, and a PR that raises the pins in
  `tools/cli-versions.json` when newer releases pass.
- `tests/e2e/run.sh` drives the real models in throwaway homes. It needs both
  CLIs signed in, so it runs locally. `tests/e2e/run.sh migrate` checks the
  upgrade from 0.2.2 in both runtimes. `E2E_REPO=<owner/repo>
  E2E_REF=<branch>` installs from GitHub.

## Layout

```
.claude-plugin/marketplace.json     GENERATED Claude Code marketplace
.agents/plugins/marketplace.json    GENERATED Codex marketplace
plugins/                            GENERATED, every file
  adhd-unslop/                      overlay skill, doctor, always-on hook
  au-i-have-adhd/                   pinned copy of i-have-adhd
  au-unslop/                        pinned copy of unslop
src/adhd-unslop/                    hand-written sources
  overlay/                          overlay sections
  skills/                           skill templates, doctor, Codex metadata
  hooks/                            hooks.json, launcher, shared helpers
upstream/                           upstream files at the pinned commits
tools/                              build.mjs, sync.mjs, load-check.mjs, version-gate.mjs,
                                    plugins.json, upstream.json, cli-versions.json
tests/                              node:test suite, fixtures, and tests/e2e/
design/DECISIONS.md                 decisions, reasons, and verified platform facts
design/                             plans, research, review rounds, and test runs
AGENTS.md                           rules for agents; Claude Code and Codex both read it
```

## License

MIT. Both upstreams are MIT; see `NOTICE.md`.
