# Plan: run i-have-adhd and unslop together with defined tie-breaking

Status: v5, CONSENSUS in Codex round 5 (design/round-5-codex.md). Built. Results in design/BEHAVIOR.md.

## Goal

Ship one installable plugin (Claude Code and Codex) that applies both the
`i-have-adhd` skill and pstack's `unslop` skill, keeps every rule, example,
exception, process, and checklist of both, resolves their conflicts with one
precedence rule, and stays easy to upgrade when either upstream changes.

## Fixed requirements (user's decision)

1. Keep all features of both skills.
2. Tie-break: text that is a direct reply to the user follows i-have-adhd on
   conflict; all other text follows unslop on conflict.
3. Installs and runs on Claude Code and Codex CLI using the mechanisms the two
   upstream repos already use.
4. Easy to upgrade when either upstream changes.

## Upstreams

| Upstream | Path in upstream repo | License |
| --- | --- | --- |
| ayghri/i-have-adhd | `skills/i-have-adhd/SKILL.md` | MIT (`LICENSE`) |
| michael-denyer/pstack-claude | `plugins/pstack/skills/unslop/SKILL.md` | MIT (`LICENSE`), original by Lauren Tan (cursor/plugins pstack) |

The full clones at `i-have-adhd--repo/` and `pstack-claude--repo/` in this
scratch directory are reference material only. Nothing reads them at build or
run time.

## Interactions between the two skills

Candidate interactions, sorted into real conflicts (both rules apply to the
same span and cannot both be satisfied) and tensions (both can usually be
satisfied; the overlay says how). Each upstream's own exceptions constrain
its own rules first. Examples in either skill illustrate their rule; they do
not create blanket exemptions.

Real conflicts:

1. Fragments. ADHD "Good" examples model label-and-fragment shape ("Step 3 of
   5 done: schema updated. Next: backfill."). Unslop rule 33 (over-compression)
   and rule 32 (rhetorical fragments) reject that shape. Unslop rule 14 rejects
   the connector colon. (Rule 16 targets a bold label that restates the line;
   it is not in play for a plain "Next:" label.)
2. Parentheses as separators. ADHD rule 2 example writes "(lines 42 to 58)".
   Unslop rule 13 bans parentheses as dash substitutes.
3. Closing question. ADHD rule 4 ends with "Want me to handle that next?" and
   rule 5 with "Run the script?". Unslop rule 20 removes offer-style closers.
   ADHD rule 10 also bans closers, and ADHD exception 6 says do authorized
   work instead of asking. ADHD's ambiguity, destructive-action, debug-spiral,
   and tangent rules require a question in their stated cases.

Tensions:

4. Estimates. ADHD rule 6 asks for a concrete ballpark when duration matters.
   Unslop rule 30 replaces vague adverbs with the measured number. Both can be
   satisfied: give a ballpark, label it as one, name the assumption, never
   present it as a measurement.
5. State restatement. ADHD rule 5 requires restating progress each turn and
   allows a task checklist to do it. Unslop rule 27 cuts sentences that carry
   no project-specific information. A concrete status line ("Step 3 of 5
   done. The schema has the new column.") satisfies both.
6. List length. ADHD rule 9 aims for five per group and forbids omitting
   items when completeness matters. Unslop rule 10 rejects forced triples.
   Both can be satisfied.
7. Audience and tone. Unslop's process says "match intended tone". ADHD's
   shape is for the chat reader. Imposing "Next: run X" structure on a README
   for a different audience breaks unslop's tone rule. Resolved by surface.
8. Tool announcements and harness rules. ADHD rule 10 and pre-send check 1
   delete openers; ADHD exception 6 keeps a harness-required announcement.
   The overlay repeats: the runtime's system prompt outranks both skills.

Lifecycle gaps (not rule conflicts): no tiebreaker stated anywhere; ADHD has
"stop adhd mode" but unslop has no off switch; "normal mode" is ambiguous
about unslop.

## Precedence rule

Apply rules only from active parts, subject to each part's own conditions
and exceptions. A conflict exists when satisfying one applicable
instruction would violate another. When both parts apply and conflict, ADHD
wins for a direct reply and unslop wins for other writing. Compatible
instructions stay in force everywhere. Example: ADHD says nothing about em
dashes or the word `delve`, so unslop rules 13 and 7 apply to replies too.
These scope, lifecycle, and precedence instructions govern any conflicting
statement inside the embedded upstream bodies.

### Surfaces, classified per passage

Direct reply. Text that talks to the current user about their request in
this conversation. Answers, progress reports, tool-call announcements the
runtime requires, clarifying questions, status restatements, task or plan
tool entries the user reads, a command or snippet offered as the user's next
step, and the agent's own proposed next steps shown for approval before
acting.

Other writing. Everything else the model authors or edits. Requested
deliverables wherever they are displayed (a doc drafted inline in the chat is
still a deliverable), files written or edited, code comments and
natural-language strings where the task permits editing them, commit
messages, PR and issue text, messages for third parties, application copy,
instructions to subagents, reports from one agent to another, compaction
summaries, and any text the user handed over to be rewritten, edited, or
translated. Text supplied for rewriting is editable; quotation marks around
it do not exempt it. A plan document that is itself the requested work
product is other writing, even while it awaits approval.

Rules for the boundary:

- Classify each passage on its own. One turn can contain both surfaces. The
  sentence that says "I wrote docs/links.md" is a direct reply; the file body
  is other writing.
- Fences, transport, and persistence do not decide. A fenced command the user
  will run next is a direct reply. An unfenced README draft is other writing.
- Style edits preserve syntax, identifiers, paths, URLs, schemas,
  exact-match data, and verbatim quotations. The requested task may still
  change them ("rename this identifier"). Required output structure is
  protected; editable prose inside that structure still follows these rules.
- Workflow rules govern conduct under their own conditions. Do not insert
  session bookkeeping (status lines, next-action lines, estimates) into a
  deliverable because both skills are active.

### Outcome table

The table shows the outcome when both parts are active and applicable. It
does not override either upstream's exceptions. Resolve an unlisted
interaction with the precedence rule above.

| Interaction | Direct reply (ADHD wins) | Other writing (unslop wins) |
| --- | --- | --- |
| 1 Fragments | Functional fragments that ADHD models are allowed: next-action, progress, completion, and error lines ("Step 3 of 5 done: schema updated." "Cause: missing header. Fix: add it." "Next: run `npm test`."). Otherwise apply unslop's sentence rules to running prose. Do not force headings or labels into sentences; apply the other active style rules to their wording and formatting. Preserve required non-prose structure. | Running prose in whole sentences with articles and verbs. No connector colon. Headings and labels keep their form and follow the active style rules for wording and formatting. |
| 2 Parentheses | Allowed for a locator only ("(lines 42 to 58)", "(see `auth.ts:42`)"). Not for an aside. | Rewrite as a sentence or a comma clause. |
| 3 Closing question | When work remains, end with one concrete action the reader can finish in under two minutes ("Run `npm test` and paste the first failing line."), or one necessary question under ADHD's rules (separate tangent, real ambiguity, destructive action, debug spiral), the task's own exceptions, or current user or runtime instructions. Do not seek authorization already given. | Remove stock closers. Keep a closing request or action the deliverable itself requires, such as the decision an email asks for. |
| 4 Estimates | Give a ballpark when the reader must plan or start. Say whose time, name the main assumption, use a range when unsure. If you cannot estimate responsibly, say what to check first. | Keep an estimate the document needs, with its assumption. Never present a ballpark as a measurement. |
| 5 State | Restate progress each turn of multi-step work through the checklist or one concrete line. Do not narrate the whole plan again. | Include status only when it is the document's content. No session bookkeeping. |
| 6 Lists | Aim for five per group. Show every item when completeness matters. | Natural count. Completeness wins. |
| 7 Tone | ADHD shape for the chat reader. | Match the deliverable's audience and intended tone. |
| 8 Announcements | Remove preambles and announcements of intended work unless the runtime requires them. Keep the answer or action that opens the reply. | Not applicable. |

## Lifecycle

Activation. The skill is active when the user invokes it (`/adhd-unslop` in
Claude Code, `$adhd-unslop` in Codex) or when the always-on hook injects it
at session `startup` or `clear`. Explicit user invocation enables both
modes. Hook delivery initializes mode defaults only after a complete
matching bundle is available; an incomplete bundle initializes neither
mode. Receiving a complete bundle preserves known mode states; an unknown
mode defaults to active. Claude Code blocks
model-initiated Skill calls (`disable-model-invocation: true`). Codex
disables implicit skill selection (`allow_implicit_invocation: false`). The
Codex AGENTS.md fallback explicitly tells the model to read and follow the
complete installed SKILL.md.

Two modes, ADHD and unslop, each with an independent switch. ("Mode" is
one of the two rule sets. "Chunk" is one of the three hook deliveries.)
Each mode holds its own state for the session:

- "stop adhd mode" disables ADHD and leaves unslop's current state unchanged.
- "stop unslop" disables unslop and leaves ADHD's current state unchanged.
- "normal mode" disables both.
- Invoking the skill again enables both.
- Confirm each change in one line naming what is now active.

State rule, in the skill and in every chunk header: restore the latest
known state of each mode in this session. Explicit invocation enables both.
Stop commands change only the named mode. Receiving or reloading these
instructions does not change known state. After a complete bundle is
available, each unknown mode defaults to active. A newly completed bundle
with a different hash (an upgrade mid-session) replaces the rules without
resetting mode states. Repeated chunks from an older bundle do not select
that bundle again. Quoted or discussed control phrases are not commands.

Persistence. Active parts stay active for the rest of the session, across
topic changes. The hook also fires on `resume` and `compact` to restore the
instructions after context loss.

Known limitation, documented in README. Mode state lives in conversation
context, not durable storage. Compaction or resume can lose it. Reinjection
restores instructions, not lost state, so it may restore the active
defaults and a stop command may need repeating. A file-backed state store
is not built in v1.

## Architecture: vendored sources plus a generated composite skill

Chosen over a hand-merged single skill (every upstream change becomes a hand
merge, and the earlier `unslop-final` attempt rewrote ADHD's examples, which
loses the ADHD reply shape) and over three separately loaded skills
(multiple documents for the model to juggle, additional loading steps, same
token cost).

### Composite layout

`skills/adhd-unslop/SKILL.md` is generated by `tools/build.mjs`:

```
---                                    frontmatter (ours)
name: adhd-unslop
description: ...
disable-model-invocation: true
license: MIT
---
# adhd-unslop                          overlay/00-intro.md
## Scope, surfaces, and precedence     overlay/10-precedence.md (this plan's section)
## Lifecycle                           overlay/20-lifecycle.md
<!-- BEGIN upstream i-have-adhd skills/i-have-adhd/SKILL.md @<commit> -->
<upstream body byte-for-byte, frontmatter removed, headings untouched>
<!-- END upstream i-have-adhd -->
<!-- BEGIN upstream pstack-claude plugins/pstack/skills/unslop/SKILL.md @<commit> -->
<upstream body byte-for-byte, frontmatter removed>
<!-- END upstream unslop -->
## Final check                         overlay/90-final-check.md
```

Rules for the composite:

- Upstream bodies are copied exactly after removing the leading YAML
  frontmatter. Headings, examples, fences, and rule numbers are untouched.
  Tests assert byte equality between the marker pairs and the stripped
  upstream files.
- The frontmatter description of unslop ("Must always apply") is carried into
  the overlay as an explicit mandate: unslop applies to every prose surface
  while active.
- Citations: "ADHD rule N", "ADHD exception N", "ADHD check N", "unslop rule
  N", "unslop process N".
- Final check (overlay) runs the checks and processes of the active parts,
  in order, under the precedence rule. It must not undo a winning ADHD
  instruction on a direct reply, and must not replace either upstream
  process.
- Both upstream LICENSE files and a NOTICE with provenance live inside the
  skill directory (`skills/adhd-unslop/LICENSES/`) so a skills-only install
  carries attribution. Root `LICENSE` and `NOTICE.md` repeat it.

### Repo layout

Mirrors ayghri/i-have-adhd, which already installs on both runtimes.

```
.
├── .claude-plugin/plugin.json            Claude Code manifest (version stamped from VERSION)
├── .claude-plugin/marketplace.json       lets `claude plugin marketplace add <owner>/<repo>` work
├── .codex-plugin/plugin.json             Codex manifest, "skills": "./skills/"
├── .agents/plugins/marketplace.json      Codex marketplace
├── hooks/hooks.json                      SessionStart, matcher startup|resume|clear|compact
├── hooks/always-on.mjs                   checks opt-in flags, validates and prints one chunk
├── hooks/lib.mjs                         shared: frontmatter strip, token estimate, hashing
├── hooks/chunks/{1,2,3}.md, manifest.json GENERATED payloads and hashes
├── skills/adhd-unslop/SKILL.md           GENERATED
├── skills/adhd-unslop/agents/openai.yaml Codex: allow_implicit_invocation false
├── skills/adhd-unslop/LICENSES/          upstream LICENSE files + NOTICE
├── upstream/i-have-adhd/SKILL.md         pristine, synced
├── upstream/i-have-adhd/LICENSE
├── upstream/unslop/SKILL.md              pristine, synced
├── upstream/unslop/LICENSE
├── overlay/*.md                          hand-written sections
├── tools/upstream.json                   pins: repo, path, commit, sha256, license path
├── tools/sync.mjs                        fetch at pin, verify hash, --bump to advance
├── tools/build.mjs                       compose SKILL.md, stamp versions, copy licenses
├── tests/*.test.mjs                      node:test, no dependencies
├── VERSION
├── README.md
├── LICENSE, NOTICE.md
└── design/                               this plan and the Codex rounds
```

### Hook (both runtimes)

Codex supports plugin `hooks/hooks.json` with `SessionStart` sources
`startup|resume|clear|compact`, sets `PLUGIN_ROOT` and `CLAUDE_PLUGIN_ROOT`,
and requires the user to review and trust the current hook definition in
`/hooks`; a changed definition needs review again because trust is recorded
against the definition's hash (developers.openai.com/codex/hooks). The
upstream i-have-adhd launcher already reads both env vars, so one
`hooks.json` serves both runtimes.

Output caps. Claude Code caps each returned hook context value at 10,000
characters and replaces larger values with a file path and preview
(code.claude.com/docs/en/hooks). Codex caps each handler at about 2,500
tokens by default and raises it per handler with `additionalContextLimit`.
The build reports the exact emitted size of every chunk; the current
overlay plus stripped upstream bodies already exceed 19,000 characters, so a
single handler cannot deliver the composite on Claude Code.

Delivery model. Matching handlers run concurrently. All three are
synchronous. Each successful handler contributes its own context value
subject to its own limit. Nothing depends on arrival order or on transcript
message boundaries. One matcher group is not an all-or-nothing contract:
Codex can skip untrusted handlers and disable individual ones, and a timeout
or crash can drop any chunk. Completeness is therefore a model instruction
carried in every chunk, not a runtime guarantee.

Design: three command handlers under one `SessionStart` matcher group. Each
runs the same launcher with `ADHD_UNSLOP_CHUNK` set to `1`, `2`, or `3`.
The payloads are contiguous slices of the generated composite, in order:

1. Composite prefix through the end of the lifecycle section.
2. The i-have-adhd block, including its provenance markers.
3. The unslop block, including its markers, and the final check.

Concatenating the three payloads in index order reproduces the composite
body byte-for-byte. Transport text (header and footer) is separate from the
payload.

Generated chunk files. `tools/build.mjs` writes `hooks/chunks/1.md`,
`2.md`, `3.md` and `hooks/chunks/manifest.json`. The launcher
reads the manifest, validates the selected payload's hash, assembles the
complete value (header, payload, footer, expanded flag paths), checks it
against the size limits, and only then writes stdout. Tests reconstruct
the composite from the payloads and reject stale generated files.

The manifest records SHA-256 over the exact UTF-8 bytes of the composite
body and of each payload, plus each payload's byte count and UTF-16 code
unit count. Payload whitespace and line endings are not normalized.
Environment-dependent emitted sizes are not committed; the launcher
measures the complete expanded value at runtime.

Chunk header (identical wording in every chunk, with N and HASH filled in):

```
ADHD-UNSLOP INSTRUCTIONS. Chunk N of 3 from bundle HASH. Apply this bundle
only once all three chunks with this hash have arrived. If any is missing,
retain the previously selected complete bundle and the current mode
states, say once which chunk is missing, and do not activate from the
partial set. A repeated chunk with the same hash and index is a repeat,
not a new activation. Do not combine chunks from different hashes. A newly
completed bundle replaces its rules without resetting mode states; repeated
chunks from an older bundle do not select that bundle again. Receiving
instructions does not change established mode state: restore the latest
known state of the ADHD mode and the unslop mode in this session; after a
complete bundle is available, default each unknown mode to active.
Precedence: on a direct reply ADHD wins a conflict, elsewhere unslop wins.
```

Chunk footer:

```
END adhd-unslop chunk N of 3 (HASH). To stop always-on injection remove
every opt-in flag: <expanded flag paths>. "normal mode" turns both modes
off for this session.
```

Missing or untrusted handlers are not recovered by another route. README
tells the user to trust or enable all three handlers, or to invoke the
skill explicitly instead.

Opt-in flags. The launcher checks for `.adhd-unslop-always` under
`CLAUDE_CONFIG_DIR` (default `~/.claude`) and under `CODEX_HOME` (default
`~/.codex`). Either flag enables all three handlers in either runtime. With
neither flag present, exit 0 without output. With a flag present, emit only
the selected chunk, after validation.

Failure reporting. With opt-in present, a missing chunk file, invalid
manifest, hash mismatch, or oversized value returns one bounded JSON
`systemMessage` naming the failed chunk and the reason, then exits 0. It
returns no `additionalContext` and no payload. Both runtimes show
`systemMessage` to the user without adding it to instruction context. With
no opt-in, the launcher stays silent.

Token estimate. One shared function in `hooks/lib.mjs`, `ceil(utf16 code
units / 4)`, is used by the build, the launcher, and the tests.

Codex fallback without hooks: README gives a `~/.codex/AGENTS.md` snippet
that instructs the model to read and follow the complete installed
`SKILL.md` for `adhd-unslop` at the start of every session. The snippet
contains no rules of its own.

Codex prompt stub (`.codex-plugin/prompts/adhd-unslop.md`) is an optional
slash shortcut. Not shipped in v1; README notes how to add one. Claude Code
users can also type the qualified `/adhd-unslop:adhd-unslop` if another
command occupies the bare name.

### Upgrade flow

```
node tools/sync.mjs --check                     # upstream/ matches pinned sha256
node tools/sync.mjs --bump i-have-adhd <commit> # fetch at commit, stage, print diff
node tools/build.mjs                            # regenerate composite, stamp versions
node --test tests/                              # invariants
git diff upstream/ skills/ overlay/             # review every change for applicability, conflicts, activation, dependencies
```

`--bump` fetches SKILL.md and LICENSE from raw.githubusercontent.com at the
commit into a staging directory (`.sync-staging/<name>/`), records a
separate sha256 for each file, builds and tests against the staged pins,
and only then promotes sources, pins, and generated output together. On
failure it keeps staging for inspection and leaves canonical files
unchanged. It warns when the new body adds a rule number or heading the
overlay does not cite, and fails when the overlay cites a rule number that
no longer exists or when the new body references a runtime dependency
(`references/`, `scripts/`, `agents/`, or a relative link) that the
composite does not ship.

## Tests (node:test, `node --test tests/`)

1. Composite equals fresh `build.mjs` output.
2. Each upstream body appears byte-for-byte between its markers; nothing
   else sits between the marker pairs.
3. `upstream/*/SKILL.md` and `LICENSE` match `upstream.json` sha256.
4. Authored overlay prose passes mechanical unslop checks: no em dash, no
   en dash used as a dash, no curly quotes, no "not just", no rule 7
   vocabulary, no title case headings, no decorative emoji. Fenced blocks,
   inline code spans, and provenance comments are excluded, so the
   inline-code `delve` example does not fail the lint.
5. Precedence section names both surfaces and the outcome table has one row
   per interaction in a shared `tests/interactions.json`.
6. Overlay carries the unslop "always apply" mandate and all three switches.
7. Hook: silent without flag; with the Claude flag or the Codex flag, each
   chunk's emitted value is header plus payload plus footer, and after
   removing header and footer the payloads concatenated in index order
   reproduce the composite body byte-for-byte; every header carries the
   index, total, bundle hash, completeness rule, state rule, and precedence
   line; exits 0 with empty stdout when no flag is present; with a flag
   present and a missing chunk file, missing manifest, hash mismatch,
   oversized value, or invalid chunk number, exits 0 and prints exactly one
   JSON object with a `systemMessage` and no `additionalContext`; works with
   `CLAUDE_PLUGIN_ROOT` and with `PLUGIN_ROOT`.
8. `hooks.json`: three handlers, one per chunk; matcher covers all four
   sources; each command references both root env vars and sets its chunk;
   each complete emitted value, computed with fixed path fixtures of
   documented length (two 120-character flag paths), is under 9,000
   characters and under 4,000 estimated tokens; an oversized-path fixture
   (two 2,000-character paths) is rejected before any payload output; each
   handler's `additionalContextLimit` is at least 1.25 times that chunk's
   estimated tokens under the fixed fixtures.
9. Frontmatter: `name` equals directory name, `disable-model-invocation:
   true`, description under 1024 chars. `openai.yaml` has
   `allow_implicit_invocation: false`.
10. Manifests: both plugin.json `version` fields and the Claude marketplace
    plugin `version` field equal `VERSION`.
11. `skills/adhd-unslop/LICENSES/` holds both upstream licenses and a NOTICE
    naming both repos and commits.
12. No runtime dependency in the composite points outside
    `skills/adhd-unslop/`: relative Markdown links and references to
    `references/`, `scripts/`, or `agents/` fail; illustrative paths such as
    `src/auth.ts` inside examples do not.
13. Delivery check (manual, recorded in design/BEHAVIOR.md), both runtimes.
    Inspect the recorded model-visible context, not model recall, and
    compare it with the launcher's expected complete emitted value including
    header and footer: on Claude Code read the session transcript JSONL for
    the three values; on Codex read the session log. A spill file is
    diagnostic evidence that a preview was delivered, not proof of delivery.
    If a runtime exposes no suitable record, mark direct delivery
    verification as unverified for that runtime. Then exercise: each handler missing in turn (disable it), duplicate
    chunks (resume), and resume or compact after a mode change. On Codex
    include a run with only some handlers trusted. Expected: the model
    reports the missing chunk once and does not activate from a partial
    set; duplicates do not re-enable a stopped mode within the same
    context.

## Behavioral test (manual, recorded in design/BEHAVIOR.md)

Record Claude Code version, Codex version, and model for each run. Run on
Claude Code with the flag set and on Codex with `$adhd-unslop`.

1. Interactive question. "What's the difference between a symlink and a hard
   link? I'm on macOS." Expect: answer first, no preamble, no closer, no em
   dash, no rule 7 words, fragments and locator parentheses tolerated.
2. Doc write. "Write `docs/links.md` explaining symlinks vs hard links for a
   junior dev." Expect file body: whole sentences, no connector colon, no
   unrelated session bookkeeping (task-relevant instructions and estimates
   are allowed), natural list lengths, sentence-case headings. Expect chat
   reply: ADHD shape, reports completion, includes a next action only if
   work remains.
3. Mixed turn. "Fix the typo in README.md line 3 and tell me what else looks
   off." Expect: the edit follows unslop; the reply follows ADHD; the "what
   else" findings are ranked and grouped where useful, and nothing relevant
   is omitted when completeness matters.
4. Long list. "List every HTTP status code in the 4xx range with one line
   each." Expect: complete list (ADHD rule 9 completeness clause), grouped,
   not truncated.
5. Switches. Assert the state sequence: both on; "stop adhd mode" gives
   ADHD off and unslop on; "stop unslop" gives both off; "normal mode" keeps
   both off; invoking the skill again gives both on. One-line confirmation
   after each command naming what is active.
6. Compaction. On Claude Code, after step 5 ends with both on, say "stop
   unslop", run `/compact`, and ask a question. Expect ADHD on and unslop
   off. If the state is lost, record it as the documented limitation, not a
   failure of the precedence rule.

## Open questions for round 5

None outstanding. Round 4's optional items are adopted: the control header
stays (the build reports its measured size), and a broken opt-in
installation reports one JSON `systemMessage` instead of staying silent.
