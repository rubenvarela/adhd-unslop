# adhd-unslop

This repo is a plugin marketplace for Claude Code and Codex. Its main plugin
combines [i-have-adhd](https://github.com/ayghri/i-have-adhd) and pstack's
[unslop](https://github.com/michael-denyer/pstack-claude) with one
tie-breaker.

| Plugin | Skill | What it is |
| --- | --- | --- |
| `adhd-unslop` | `adhd-unslop` | The overlay rules. Loads the two skills below. |
| `au-i-have-adhd` | `i-have-adhd` | A pinned copy of ayghri/i-have-adhd |
| `au-unslop` | `unslop` | A pinned copy of the unslop skill from pstack-claude |

The two `au-` plugins ship upstream text unchanged except for the
frontmatter, at commits pinned in `tools/upstream.json`. The `au-` prefix
keeps them from clashing with the upstream plugins of the same name. When
two installed plugins share a name, Claude Code uses whichever was installed
first.

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
claude plugin marketplace add rubenvarela/adhd-unslop     # or a local path to this repo
claude plugin install adhd-unslop@adhd-unslop
```

The install brings `au-i-have-adhd` and `au-unslop` with it, because
`adhd-unslop` declares them as dependencies.

Type `/adhd-unslop` in a session. If another command uses that name, type
`/adhd-unslop:adhd-unslop`. The skill then loads the two others through the
Skill tool. It has `disable-model-invocation: true`, so nothing applies until
you invoke it or turn on always-on mode.

Updates do not follow dependencies. Update each plugin:

```bash
claude plugin marketplace update adhd-unslop
claude plugin update adhd-unslop@adhd-unslop
claude plugin update au-i-have-adhd@adhd-unslop
claude plugin update au-unslop@adhd-unslop
```

Installed `adhd-unslop` 0.1.0 before the split? `claude plugin update` moves
it to 0.2.0 but does not install the new dependencies, and `claude plugin
list` then shows a dependency error. Install both by name:

```bash
claude plugin install au-i-have-adhd@adhd-unslop
claude plugin install au-unslop@adhd-unslop
```

### Codex

Codex has no plugin dependencies, so install all three:

```bash
codex plugin marketplace add rubenvarela/adhd-unslop --ref main
codex plugin add adhd-unslop@adhd-unslop
codex plugin add au-i-have-adhd@adhd-unslop
codex plugin add au-unslop@adhd-unslop
```

Type `$adhd-unslop:adhd-unslop` in a session. Codex matches plugin skills by
their full name, so a bare `$adhd-unslop` finds nothing. The model then reads
the `SKILL.md` of each `au-` plugin. If one is missing, the skill names it and
gives the install command.

Do not symlink the skill into `~/.agents/skills`. Codex names a linked skill
after the plugin that contains it, so the link becomes a second
`adhd-unslop:adhd-unslop`. With two skills of one name, Codex loads neither.
Remove any such link from an earlier install.

To update, run `codex plugin marketplace upgrade adhd-unslop`, then run
`codex plugin add` again for each plugin.

### Missing plugin warning

At session start, a hook checks that both `au-` plugins are installed. For
each missing one it prints the install command for the current runtime. It
never installs anything. Codex runs plugin hooks only after you trust them in
`/hooks`.

## Always-on mode

Create a flag file to deliver the rules at every session start without
invoking the skill:

```bash
touch ~/.claude/.adhd-unslop-always      # or "$CLAUDE_CONFIG_DIR/.adhd-unslop-always"
touch ~/.codex/.adhd-unslop-always       # or "$CODEX_HOME/.adhd-unslop-always"
```

Either flag enables always-on in both runtimes. A `SessionStart` hook then
delivers the rules at `startup`, `resume`, `clear`, and `compact`. Remove the
flag to stop.

Codex runs plugin hooks only after you review and trust them:

1. Open `/hooks` in an interactive Codex session.
2. Trust the `adhd-unslop` handlers.
3. Restart.

Trust a changed hook definition again after an upgrade. Without hooks, add
this to `~/.codex/AGENTS.md`:

```markdown
At the start of every session, read and follow the complete installed
SKILL.md of the adhd-unslop skill ($adhd-unslop:adhd-unslop). Do not
summarize it.
```

### How the always-on hook works

The hook does not load the `au-` plugins. It carries its own copy of both
upstream texts, because a hook cannot count on another plugin being
installed.

Claude Code caps each hook's output at 10,000 characters and Codex at about
2,500 tokens per handler. The rules are about 21,500 characters, so the hook
delivers them as three chunks from three handlers under one matcher:

1. Scope, surfaces, precedence, and lifecycle.
2. The i-have-adhd body, verbatim.
3. The unslop body, verbatim, plus the final check.

Every chunk has the same header, with its index and the first 12
hexadecimal characters of the bundle's SHA-256. The header also:

- Says to apply the bundle only after all three chunks arrive
- Preserves mode state when instructions arrive
- States the precedence rule

Each handler sets `additionalContextLimit: 5000` for Codex. The launcher
checks each chunk hash against `hooks/chunks/manifest.json` and checks the
assembled size against both caps before printing. With the flag set and a
broken install, it prints one JSON `systemMessage` with no context. Without
the flag, it prints nothing.

## Switches

- `stop adhd mode` turns the ADHD rules off. unslop stays as it was.
- `stop unslop` turns the unslop rules off. ADHD stays as it was.
- `normal mode` turns both off.
- Invoking the skill again turns both on.

Known limitation: mode state lives in the conversation. Compaction or resume
can lose it, and the re-injected instructions then restore the active
defaults. Repeat the stop command if that happens.

## Upstream updates

The `Bump upstream skills` workflow runs daily. It runs
`node tools/sync.mjs --latest`, which:

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
overlay edit.

The workflow needs the repository setting "Allow GitHub Actions to create and
approve pull requests".

To bump by hand:

```bash
node tools/sync.mjs --check                        # upstream/ matches the pins
node tools/sync.mjs --bump i-have-adhd <commit>    # or: --bump unslop <commit>
git diff
```

Review the upstream diff for conflicts with the other skill. Record them in
the outcome table in `src/adhd-unslop/overlay/10-precedence.md`.

## Editing

Edit only `src/`, `tools/plugins.json`, `tools/upstream.json`, and the
hand-written files in `plugins/adhd-unslop/hooks/`. Then:

```bash
node tools/build.mjs
node --test tests/*.test.mjs
```

`node tools/build.mjs` generates both marketplace files, every plugin
manifest, the `au-` plugins, the `adhd-unslop` skill, and the hook chunks. A
test fails if any of them go stale. `tools/plugins.json` holds each plugin's
version and dependencies.

To add a plugin that uses i-have-adhd, add it to `tools/plugins.json` with
`"dependencies": ["au-i-have-adhd"]` and have its skill load
`au-i-have-adhd:i-have-adhd`, as `src/adhd-unslop/overlay/05-load.md` does.
Give it no always-on hook of its own, or it will inject the ADHD rules a
second time.

`tests/e2e/run.sh` installs the marketplace into throwaway Claude Code and
Codex homes and checks the behavior with the real CLIs. It needs both CLIs
signed in, so CI does not run it.

## Layout

```
.claude-plugin/marketplace.json     GENERATED Claude Code marketplace
.agents/plugins/marketplace.json    GENERATED Codex marketplace
plugins/adhd-unslop/                the overlay plugin
  hooks/hooks.json                  SessionStart handlers
  hooks/always-on.mjs               always-on launcher
  hooks/check-deps.mjs              missing plugin warning
  hooks/lib.mjs                     shared helpers
  hooks/chunks/                     GENERATED chunk payloads and manifest
  skills/adhd-unslop/               GENERATED SKILL.md, agents/openai.yaml, LICENSES/
plugins/au-i-have-adhd/             GENERATED pinned copy of i-have-adhd
plugins/au-unslop/                  GENERATED pinned copy of unslop
src/adhd-unslop/overlay/            hand-written overlay sections
upstream/                           upstream files at the pinned commits
tools/                              build.mjs, sync.mjs, plugins.json, upstream.json
tests/                              node:test suite and tests/e2e/
design/                             plans and review rounds
```

## License

MIT. Both upstreams are MIT; see `NOTICE.md`.
