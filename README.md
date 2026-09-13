# adhd-unslop

One skill that runs [i-have-adhd](https://github.com/ayghri/i-have-adhd) and
pstack's [unslop](https://github.com/michael-denyer/pstack-claude) together,
with a defined tie-breaker. Works as a Claude Code plugin and a Codex plugin.

## The rule

Both rule sets stay active. When a rule from each would produce different text
for the same passage:

- In a direct reply to the user, i-have-adhd wins.
- In any other writing (files, docs, commit messages, PR text, subagent
  prompts, text you were asked to rewrite), unslop wins.

Compatible rules apply everywhere. The skill defines both surfaces per
passage, lists the known interactions in an outcome table, and adds
independent off switches. Read `skills/adhd-unslop/SKILL.md` for the full
text.

## Install

### Claude Code

```bash
claude plugin marketplace add <owner>/adhd-unslop     # or a local path to this repo
claude plugin install adhd-unslop@adhd-unslop
```

Type `/adhd-unslop` in a session. If another command occupies that name, use
`/adhd-unslop:adhd-unslop`. The skill has `disable-model-invocation: true`,
so nothing applies until you invoke it or enable always-on.

Always-on (optional):

```bash
touch ~/.claude/.adhd-unslop-always      # or "$CLAUDE_CONFIG_DIR/.adhd-unslop-always"
```

A `SessionStart` hook then delivers the skill at `startup`, `resume`,
`clear`, and `compact`. Remove the flag to stop.

### Codex

The verified path is the shared Agent Skills directory, the same route
pstack documents. Clone this repo and link the skill:

```bash
git clone <this repo> ~/.config/adhd-unslop
mkdir -p ~/.agents/skills
ln -s ~/.config/adhd-unslop/skills/adhd-unslop ~/.agents/skills/adhd-unslop
```

Then type `$adhd-unslop` in a Codex session. In `codex exec`, the mention is
plain text; the model searches for the skill, reads the linked `SKILL.md`,
and applies it (verified on Codex 0.154.0). The skill sets
`allow_implicit_invocation: false`, so Codex will not pick it on its own.

The plugin marketplace route also installs:

```bash
codex plugin marketplace add <owner>/adhd-unslop --ref main
codex plugin add adhd-unslop@adhd-unslop
```

On Codex 0.154.0 the plugin's skill did not appear in the exec-mode skill
catalog, so `$adhd-unslop` found nothing until the symlink above existed.
Use the marketplace route for the always-on hook, the symlink route for the
skill, or both.

Always-on (optional, marketplace route):

```bash
touch ~/.codex/.adhd-unslop-always       # or "$CODEX_HOME/.adhd-unslop-always"
```

Codex runs plugin hooks only after you review and trust them. Open `/hooks`
in an interactive Codex session, trust all three `adhd-unslop` handlers, and
restart. A changed hook definition (for example after an upgrade) needs
trusting again. Either flag file enables always-on in both runtimes. The
hook path on Codex is not yet verified end to end because trusting hooks is
interactive; the launcher itself is covered by the test suite.

Fallback without hooks: add this to `~/.codex/AGENTS.md`.

```markdown
At the start of every session, read and follow the complete installed
SKILL.md of the adhd-unslop skill ($adhd-unslop). Do not summarize it.
```

## How the always-on hook works

Claude Code caps each hook's output at 10,000 characters and Codex at about
2,500 tokens per handler. The skill is about 22,000 characters, so the hook
delivers it as three chunks from three handlers under one matcher:

1. Scope, surfaces, precedence, and lifecycle.
2. The i-have-adhd body, verbatim.
3. The unslop body, verbatim, plus the final check.

Every chunk carries the same header: its index, the bundle id (first 12 hex
of the composite's SHA-256), the rule to apply the bundle only once all
three chunks arrived, the rule that receiving instructions never changes
mode state, and the precedence line. Each handler sets
`additionalContextLimit: 5000` for Codex. The launcher verifies each chunk's
hash against `hooks/chunks/manifest.json` and the assembled size against
both caps before printing. With the flag set and a broken install, it prints
one JSON `systemMessage` and no context. Without the flag it prints nothing.

## Switches

- `stop adhd mode` turns the ADHD rules off. unslop stays as it was.
- `stop unslop` turns the unslop rules off. ADHD stays as it was.
- `normal mode` turns both off.
- Invoking the skill again turns both on.

Known limitation: mode state lives in the conversation. Compaction or resume
can lose it, and the re-injected instructions then restore the active
defaults. Repeat the stop command if that happens.

## Upgrading an upstream

```bash
node tools/sync.mjs --check                        # upstream/ matches the pins
node tools/sync.mjs --bump i-have-adhd <commit>    # or: --bump unslop <commit>
git diff upstream/ skills/ hooks/chunks/ tools/upstream.json
```

`--bump` fetches `SKILL.md` and `LICENSE` at the commit into
`.sync-staging/`, refuses if the new body references files the composite
cannot ship (`references/`, `scripts/`, `agents/`, relative links), warns
about new rule numbers the overlay does not cite, fails if the overlay cites
a rule that vanished, swaps the files in, rebuilds, runs the tests, and
restores everything if anything fails. Review the diff afterward for new
conflicts with the other skill; the outcome table in
`overlay/10-precedence.md` is the place to record them.

Edit only `overlay/*.md`, `tools/upstream.json`, and `VERSION`. Then:

```bash
node tools/build.mjs
node --test tests/*.test.mjs
```

`skills/adhd-unslop/SKILL.md`, `hooks/chunks/`, the license copies, and the
version fields in the manifests are generated. A test fails if they are stale.

## Layout

```
.claude-plugin/          Claude Code manifest and marketplace
.codex-plugin/           Codex manifest ("skills": "./skills/")
.agents/plugins/         Codex marketplace
hooks/hooks.json         SessionStart, three handlers
hooks/always-on.mjs      launcher
hooks/lib.mjs            shared helpers (hashing, size limits, header text)
hooks/chunks/            GENERATED chunk payloads and manifest
skills/adhd-unslop/      GENERATED SKILL.md, agents/openai.yaml, LICENSES/
upstream/                pristine upstream files at the pinned commits
overlay/                 hand-written sections
tools/                   build.mjs, sync.mjs, upstream.json
tests/                   node:test suite
design/                  the plan and the five Codex review rounds
```

## License

MIT. Both upstreams are MIT; see `NOTICE.md`.
