# Idea 1: how always-on should deliver the rules

Status: proposal, 2026-09-26. Nothing here is implemented. The output-style
option is untested. Decisions referenced as D1 to D21 are in
`DECISIONS.md`.

## The question

With always-on enabled, a SessionStart hook injects the overlay, the
i-have-adhd text, and the unslop text in three chunks. The same texts also
ship as three installed skills: `adhd-unslop`, `au-i-have-adhd`, and
`au-unslop`. Carrying a second copy in the hook, on top of skills that are
already installed, looked like too much and unlike common practice.

This document answers four questions:

1. Is about 6,000 tokens of always-on context too much?
2. Should the hook inject the three texts, point the model at the skills, or
   do something else?
3. Can an install-time hook, a check script, or a doctor command replace or
   support the hook?
4. Is there a better pattern in either runtime?

## Current state

### What gets injected

Measured on `main` at `fc308bd`, adhd-unslop 0.2.2. Token counts use the
repo's estimate of one token per four characters.

| Piece | Characters | Tokens, about |
| --- | --- | --- |
| `00-intro.md` | 531 | 133 |
| `05-load.md`, skill only, not in the hook | 1,027 | 257 |
| `10-precedence.md` | 4,779 | 1,195 |
| `20-lifecycle.md` | 2,191 | 548 |
| `90-final-check.md` | 852 | 213 |
| i-have-adhd body | 7,207 | 1,802 |
| unslop body | 5,984 | 1,496 |
| Hook payload, all three chunks | 21,497 | 5,375 |
| Chunk headers and footers, three times about 900 | about 2,700 | about 675 |
| Total per injection | about 24,200 | about 6,050 |

### How it gets there

- Always-on: three SessionStart handlers, matcher
  `startup|resume|clear|compact`, one chunk each. Each chunk carries bundle
  id `53497c665897` and tells the model to apply the bundle only once all
  three arrive (D12).
- Explicit invocation: `/adhd-unslop` or `$adhd-unslop:adhd-unslop` loads
  the overlay, and the load step then loads the two `au-` skills. It skips
  them when the hook already delivered the texts (D9).
- A context window holds one copy at a time. The duplication is on disk, in
  the generated files `plugins/adhd-unslop/hooks/chunks/`, not in the
  conversation.

### Constraints that shape any answer

- Claude Code caps each hook value at 10,000 characters and replaces a
  longer value with a file path and preview. That is why the hook uses three
  chunks. The v0.1.0 plan cited code.claude.com/docs/en/hooks for this cap.
  The 2026-09-26 research agent did not find it in the current docs, so
  re-check it before relying on it.
- Codex caps a hook handler at about 2,500 tokens by default. Each handler
  raises this with `additionalContextLimit: 5000`.
- Neither runtime has an install-time hook. The Codex events, read from
  `codex-rs/hooks/src/lib.rs` on 2026-09-26, are `PreToolUse`,
  `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`,
  `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `SubagentStart`,
  `SubagentStop`, `Stop`, and `Interrupt`. Claude Code's documented events
  also have none. SessionStart is the earliest point a plugin can act.
- A hook cannot invoke a skill in either runtime. Hook output is text only.
  In Claude Code that means `additionalContext`, `systemMessage`, or
  `terminalSequence`.
- Codex has no plugin dependencies, so a sibling plugin may be missing or at
  a different version (D15, D16).
- Claude Code keeps old plugin versions in its cache. On this machine,
  `~/.claude/plugins/cache/adhd-unslop/au-unslop/` holds both `0.1.0` and
  `0.1.1`, and `adhd-unslop/` holds four versions. Codex keeps only the
  installed version.

## Research

Two reviews ran in parallel on 2026-09-26. A Claude Code research agent
read the Claude Code docs and checked Claude Code 2.1.283. A separate Codex
session, `codex exec` in read-only mode with high reasoning effort, read
this repo and answered the same question independently.

### Claude Code findings

Output styles:

- A plugin can ship output styles in an `outputStyles/` directory, declared
  in `plugin.json`. Source:
  code.claude.com/docs/en/plugins/manifest-reference.md.
- A user activates a style with `/output-style <name>` or the `outputStyle`
  setting. A plugin cannot set it, because a plugin's own `settings.json`
  applies only the `agent` and `subagentStatusLine` keys and drops the
  rest.
- The style's text goes into the system prompt. Claude Code's built-in
  software engineering instructions stay only when the style sets
  `keep-coding-instructions: true`. Source:
  code.claude.com/docs/en/output-styles.md.
- The docs publish no size limit for an output style.
- The docs do not say whether a style persists through `/compact` and
  resume. The system prompt is rebuilt on every request, so it should.
  This is inferred and untested.
- One style is active at a time. A user who already uses another output
  style would have to choose.
- The docs describe a style as instructions to follow, not a guarantee.
  That is equally true of hook context.

SessionStart context:

- The docs do not say where `additionalContext` lands or whether it is
  prompt-cached.
- It does not survive compaction, which is why the hook also runs on
  `compact`. This repo observed that behavior, and the docs do not state
  it.

Guidance on always-on size:

- The docs suggest keeping each `CLAUDE.md` under 200 lines. Auto memory
  loads the first 200 lines or 25 KB. Source: code.claude.com/docs/en/memory.md.
- A skill's `description` and `when_to_use` are cut at 1,536 characters in
  the skill list. Source: code.claude.com/docs/en/skills.md.
- The docs publish no total cap. The context window doc notes that more
  context reduces adherence. Source:
  code.claude.com/docs/en/context-window.md.

Other mechanisms, each checked and ruled out for a plugin:

- A plugin cannot ship a `CLAUDE.md`, `AGENTS.md`, or `.claude/rules/`
  file. They are user, project, or organization features. Sources:
  manifest-reference.md and create.md.
- No settings key appends to the system prompt. `--append-system-prompt`
  is a command-line flag only. Source: settings-reference.md.
- A `UserPromptSubmit` hook can return `additionalContext` on every turn.
  That removes the compaction problem, but it adds about 6,000 tokens to
  every user message, which is far worse.

### Codex findings

- `~/.codex/AGENTS.md`, or `AGENTS.override.md`, is the best mechanism that
  needs no hook. Codex loads it at session start before project guidance. It
  belongs to the user, and a plugin cannot install or edit it. The combined
  AGENTS chain defaults to 32 KiB, so our 21.5 KB of text would crowd out
  repository instructions. Source: learn.chatgpt.com/docs/agent-configuration/agents-md.
- `developer_instructions = """..."""` in `~/.codex/config.toml` adds
  developer instructions for the whole session. It could hold the full text
  at the same context cost. No plugin manifest field sets it, so the user or
  an admin would have to configure it.
- `model_instructions_file` replaces the built-in instructions and AGENTS
  behavior rather than adding to them. It is too broad for a style plugin.
- `instructions` is reserved. Do not use it.
- A project's `.codex/config.toml` applies only in trusted projects. It can
  enable a plugin but cannot change user configuration.
- Sources: learn.chatgpt.com/docs/config-file/config-reference and
  developers.openai.com/plugins/build/plugins.

Prompt caching:

- OpenAI's guidance requires an unchanged rendered prefix for a cache hit.
  It also notes that compaction reduces reuse. Source:
  developers.openai.com/api/docs/guides/prompt-caching.
- The three handlers run concurrently. They arrived in the orders 1, 3, 2
  and 2, 1, 3 in this session's resumes. Varying order lowers cache reuse
  across sessions. It is a cost issue, not a correctness issue, because the
  bundle rules accept any order.

## Analysis

### Is 6,000 tokens too much?

No. Both reviews agree.

- It is about 3% of a 200,000-token window and under 1% of a million-token
  window.
- It sits near the start of the session, so it is prompt-cached after the
  first request. Each later turn pays only the cached rate.
- The real repeated cost is re-injection. Each `/compact`, `resume`, and
  `clear` adds another 6,000 tokens, and a compaction also rebuilds the
  cached prefix.
- The upstream texts must stay verbatim (D2), so trimming them is not an
  option. The overlay could be tightened. `10-precedence.md` is the largest
  overlay file, at about 1,200 tokens.

### Lazy loading saves nothing

Pointing the model at the skills instead of injecting them looks cheaper.
It is not.

- With always-on, the goal is that the rules apply to every reply. The
  full text reaches the context window either way. Only who puts it there
  changes.
- Lazy loading adds a failure mode. The model must choose to load three
  skills before its first reply, and again after every compaction. If it
  skips the step, the rules are missing and nothing reports it.
- It also adds tool calls to the first turn.

### The duplicate copy costs disk, not context

- The hook's copy is generated by `tools/build.mjs` from the same
  `upstream/` files as the `au-` plugins. Nobody maintains it by hand, and
  `build.mjs --check` in CI keeps it in step.
- A session holds one copy. The load step skips the skills when the hook
  delivered the texts, and the hook never runs twice for one event.
- The cost is about 22 KB on disk per installed version, plus the old
  versions Claude Code keeps.

### Where the reviews disagreed

Before the reviews, this design proposed option A below. The hook would read
the texts from the installed `au-` plugins and carry no copy of its own.

The Codex review argued against it, and its argument holds:

- In Codex nothing installs or version-locks the siblings, so the hook can
  find a missing or mismatched plugin.
- The overlay's citations were checked against one pinned commit. A sibling
  at another pin can break them.
- The self-contained generated chunks are the right reliability boundary,
  and the duplication they remove is only on disk.

The context cost is the same under A and the current design, so A would
trade reliability for disk space. This document drops A.

## Options

| Option | Context cost | Reliability | Runtimes | Verdict |
| --- | --- | --- | --- | --- |
| Current. Hook injects embedded full text. | About 6k, again after each compaction | High, no model action needed | Both | Keep for Codex |
| A. Hook reads the texts from the `au-` plugins | Same | Lower. A sibling can be missing or mismatched. | Both | Drop |
| B. Hook injects a "load these skills" instruction | Same once loaded | Lower. It depends on the model, every session and after every compaction. | Both | Drop |
| C. Doctor skill plus script | None until invoked | Diagnostic only | Both | Add |
| D. Claude Code output style | About 6k in the system prompt, once | Expected high. It should survive compaction without re-injection. Untested. | Claude Code only | Prototype |
| E. `UserPromptSubmit` hook | About 6k on every turn | High | Both | Drop, too costly |
| F. User-owned `~/.codex/AGENTS.md` or `developer_instructions` | Same | High | Codex only | Document as an alternative |

### D. Claude Code output style

Ship `plugins/adhd-unslop/outputStyles/adhd-unslop.md`, generated from the
same sources as the hook. Its body is the overlay plus both upstream
texts. The user activates it once with `/output-style adhd-unslop`.

Advantages over the hook:

- It stays through compaction and resume without re-injection, because it
  is part of the system prompt.
- No chunks, no bundle ids, no 10,000-character cap, and no arrival-order
  issue.
- It caches with the system prompt.

Costs and risks:

- The user must activate it. A plugin cannot.
- It replaces any other output style the user has chosen.
- `keep-coding-instructions: true` is required. Without it, Claude Code
  drops its software engineering instructions.
- Persistence through compaction is inferred, not tested.
- It is Claude Code only. Codex keeps the hook.
- The always-on flag and the output style must not both be active, or the
  rules arrive twice. The hook would have to skip Claude Code when the
  style is active, or the docs would tell users to pick one.

### C. Doctor skill plus script

A skill, `adhd-unslop:doctor`, runs a script in the plugin, such as
`hooks/doctor.mjs` or `scripts/doctor.mjs`, and reports each check with the
exact fix. A skill works in both runtimes. A slash command would work in
Claude Code only.

Checks:

- Which of the three plugins are installed, and at which versions.
- Whether the installed versions match. The script compares the upstream
  commit each `au-` plugin was built from, which its `NOTICE.md` records,
  with the commit `adhd-unslop` expects.
- Whether an always-on flag exists, and which one.
- Whether the output style is active, once D exists, and whether the flag
  is also set.
- In Codex, whether the adhd-unslop hooks are trusted. The script can read
  `[hooks.state]` in `config.toml`.
- Whether the chunk hashes match the manifest, which the launcher already
  checks at run time.

A doctor does not deliver rules. It explains why they are missing.

## Risks the Codex review found

1. The README's hook-free fallback for Codex probably does not work. It
   tells users to add an `AGENTS.md` line that names
   `$adhd-unslop:adhd-unslop`. A mention inside `AGENTS.md` is not typed by
   the user, and the composed skill hides from the model's skill list
   (D8). The model may search the disk or do nothing. It needs a test, or a
   replacement that gives the absolute path of the installed `SKILL.md`.
2. The dependency check tests existence, not version. Updates do not
   cascade, so a manual invocation can combine different upstream pins. The
   doctor should report this.
3. The concurrent chunk order lowers cross-session cache reuse, as covered
   under prompt caching above.

## Recommendation

1. Keep the embedded full-text hook for Codex.
2. Prototype the Claude Code output style and test it. If it passes, it
   becomes the recommended always-on path for Claude Code, and the hook
   skips Claude Code while the style is active.
3. Add the doctor skill with the version-mismatch check.
4. Test the Codex `AGENTS.md` fallback and fix it or remove it.
5. Leave 6,000 tokens as is. Revisit only if a later change adds
   substantial text.

## Test plan for the output style

Run in a throwaway Claude Code home, `CLAUDE_CONFIG_DIR=<dir>`, from a
directory away from the marketplace copy (D21).

1. Build the style and install the marketplace from the working tree.
2. Set `outputStyle` to the plugin's style in the throwaway settings.
3. Check that the style loads. Without tools, ask the model to quote the
   bundle marker or a known overlay heading.
4. Check that the coding instructions stay. Compare a coding answer with the
   style on and off, or ask about a known line from the default
   instructions.
5. Check persistence. Start a session, run `/compact`, and ask again. If
   `claude -p` cannot compact, use `--resume` with a transcript long enough
   to compact, or test interactively.
6. Check for double delivery. With the always-on flag also set, confirm the
   hook skips and the rules appear once.
7. Check behavior. Ask a git question and confirm the ADHD reply shape and
   no em dashes, as in the earlier real-machine test.

Pass criteria: steps 3 to 6 all pass. Otherwise keep the hook for Claude
Code too and record the result in `DECISIONS.md`.

## Open questions

- Does an output style survive `/compact`? The test plan answers this.
- Does a plugin output style show up in `/output-style` under a namespaced
  name, such as `adhd-unslop:adhd-unslop`?
- Should the always-on flag stay the switch in Claude Code, or should
  activating the style be the switch?
- Is the 10,000-character hook cap still in the current docs? It governs
  how many chunks Codex needs, and whether one chunk could ever be enough.

## Sources

Claude Code, read 2026-09-26 for version 2.1.283:

- code.claude.com/docs/en/output-styles.md
- code.claude.com/docs/en/plugins/manifest-reference.md
- code.claude.com/docs/en/plugins/create.md
- code.claude.com/docs/en/hooks.md
- code.claude.com/docs/en/prompt-caching.md
- code.claude.com/docs/en/memory.md
- code.claude.com/docs/en/skills.md
- code.claude.com/docs/en/context-window.md
- code.claude.com/docs/en/settings-reference.md

Codex, read 2026-09-26 for version 0.154.0 and the main-branch source:

- learn.chatgpt.com/docs/agent-configuration/agents-md
- learn.chatgpt.com/docs/config-file/config-reference
- developers.openai.com/plugins/build/plugins
- developers.openai.com/api/docs/guides/prompt-caching
- `codex-rs/hooks/src/lib.rs`, hook event list

This repo:

- `DECISIONS.md` D2, D8, D9, D12 to D16, D21
- `plugins/adhd-unslop/hooks/chunks/manifest.json`, sizes and bundle id
