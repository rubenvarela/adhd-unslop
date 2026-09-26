# Tests: end to end on the first 0.3.0 build

Date: 2026-09-26. Claude Code 2.1.283, Codex 0.154.0 and 0.157.1.
`tests/e2e/run.sh` with the modes `claude`, `codex`, and `migrate`, in
throwaway homes as `AGENTS.md` requires. The build under test was the
first implementation of `STRUCTURE-v2.md` revision 4, in which the
`adhd-unslop` skill read both upstream texts from files in its own
`references/` folder.

## Results

| Run | Passed |
| --- | --- |
| Claude Code 2.1.283 | 15 of 17 |
| Codex 0.154.0 | 17 of 18 in one run, 16 of 18 in the final run |
| Codex 0.157.1 | 16 of 18 |
| `migrate`, Claude Code and both Codex versions | 16 of 16 |

After every run a `find` showed no `auth.json`, no `shell_snapshots`, and
no key strings in the scratch folders.

## Findings

### The Claude Code reads were denied

In `claude -p`, both Read calls on `skills/adhd-unslop/references/*.md`
were denied in every run, because the files sit outside the working
directory. The model still answered as asked, with no upstream rules
loaded. An interactive session would ask the user for permission to read
each file instead.

- `allowed-tools: Read` in the skill's frontmatter let the reads through
  and passed `claude plugin validate --strict`. It would pre-approve every
  Read while the skill is active, and it does nothing for Codex.
- A narrower rule, `Read(${CLAUDE_SKILL_DIR}/references/**)`, did not work.

### Codex usually skipped the reads

With the prompt `$adhd-unslop:adhd-unslop Reply with the single word
READY.`, Codex read the reference files in 1 of 8 runs across both
versions. With the same prompt, 0.2.2, whose skill named other skills to
read, read them in 2 of 2 runs. With the plugin's own default prompt, `Use
$adhd-unslop:adhd-unslop for this session.`, it read both files in 4 of 4
runs. Whether the model reads a file depends on the prompt, so a rule set
that must always apply cannot rely on it.

### Codex sometimes loaded the unslop mirror unprompted

With both mirrors installed, an unrelated question made Codex 0.154.0 load
`au-unslop:unslop` in 2 of 4 runs. Codex 0.157.1 did not, in 4 of 4. The
mirror keeps upstream's frontmatter, whose description says "Must always
apply", and its `openai.yaml` allows implicit invocation to match
upstream (`DECISIONS.md` D7). A user who has always-on and this mirror gets
a second, independent unslop that the `stop unslop` switch does not
control.

### Migration

- Every `migrate` check passed in both runtimes: the 0.2.2 install, the
  update commands, `claude plugin prune`, Codex hook trust carried over
  without review, and one complete bundle after the update.
- After `claude plugin prune`, an `au-unslop` mirror that the user had
  installed by name stayed at 0.1.1. Codex moved it to 0.2.0. Anyone who
  keeps a mirror in Claude Code needs `claude plugin update
  au-unslop@adhd-unslop` as well.

## Conclusions

- Mandatory rules must not depend on the model choosing to read a file, or
  on a permission rule. `STRUCTURE-v2.md` revision 5 embeds both upstream
  texts in the `adhd-unslop` skill body instead of `references/`.
- The end-to-end checks should prove that text arrived in context, from the
  transcript or rollout, not infer it from how the model answers a short
  prompt.
- The unprompted-question check runs before the mirrors are installed, the
  clean case. The mirror's auto-load is documented in the README.
- The README's upgrade steps add `claude plugin update` for a kept mirror.

## An invoked skill after compaction in Claude Code

Date: 2026-09-26. Claude Code 2.1.283, revision 5 build, in which the
`adhd-unslop` skill embeds both upstream texts. `SKILL.md` is 21,823
characters, about 5,455 tokens at 4 characters per token, and its body after
the frontmatter is 21,356 characters. compound-engineering reads the docs as
saying that compaction re-attaches each invoked skill with only its first
5,000 tokens, 25,000 for all skills together. This test checks what our
skill keeps.

### Method

Always-on was off, so no hook text was in context. Each case used a
throwaway `CLAUDE_CONFIG_DIR`, as `tests/e2e/run.sh` does, which now runs
both cases and prints the result as INFO lines.

- Case A, one process. `tests/e2e/claude-turns.mjs` keeps one `claude -p
  --input-format stream-json` process open and sends
  `/adhd-unslop:adhd-unslop Reply with the single word READY.`, then
  `/compact`.
- Case B, a resumed process. The skill was invoked in one `claude -p` run.
  A second run, `claude -p --resume <session> "/compact"`, compacted.
- Evidence. The transcript records after the last `compact_boundary` line.
  Claude Code stores a re-attached skill there as an attachment of type
  `invoked_skills`, with the skill's name, path, and `content`. In one ad
  hoc run of each case, a local proxy saved each `/v1/messages` request
  body, never headers, and a third turn asked, with no tools, for the last
  sentence of the final check section.

### Results

| Case | Compaction | What came back |
| --- | --- | --- |
| A, one process | 23,049 to 6,804 tokens in `run.sh`; 22,987 to 6,639 ad hoc | The skill, cut to exactly 20,000 characters |
| B, after `--resume` | 23,049 to 1,401 tokens in `run.sh`; 22,994 to 1,661 ad hoc | Nothing. No `invoked_skills` attachment |

Case A in detail:

- The request after compaction carried the skill in a system-role message
  that begins "The following skills were invoked EARLIER in this session
  (before the conversation was compacted)" and then `### Skill:
  adhd-unslop:adhd-unslop`.
- The `content` field is exactly 20,000 characters, counting the `Base
  directory for this skill:` line at the start and this marker at the end:
  `[... skill content truncated for compaction; use Read on the skill path
  if you need the full text]`.
- The cut fell inside unslop rule 31, in both runs. Kept: the intro, scope
  and precedence, lifecycle, all of i-have-adhd, and unslop up to rule 31.
  Lost: the rest of rule 31, rules 32 and 33, the `<!-- END upstream
  unslop -->` line, and the whole `## Final check` section. That is about
  1,770 of the 21,356 body characters. The exact cut point moves with the
  length of the base directory path.
- Asked for the last sentence of the final check, the model replied NONE.
  It said the skill text was cut off partway through unslop rule 31.

Case B in detail:

- The resumed process did not know that the skill had been invoked, so
  compaction re-attached nothing. The request after compaction held no
  skill text, only the summary. The model replied NONE to the same
  question.

### Conclusions

- The docs reading holds for 2.1.283. A re-attached skill is cut at 20,000
  characters, marker included. Our skill loses its last 1,770 characters,
  final check included.
- After a resume, an invoked skill does not come back after compaction at
  all. Only the compaction summary remains.
- The marker tells the model to Read the skill path. That file sits in the
  plugin cache, outside the working directory. In `claude -p` a Read there
  was denied in the earlier `references/` runs, and an interactive session
  would ask for permission.
- The always-on hook does not have either problem. It injects the whole
  bundle again on `compact` (research 09).
- Options, none decided:
  - Keep the skill body under about 19,500 characters, which leaves room
    for the base directory line and any arguments.
  - Move the final check ahead of the upstream texts. The cut then loses
    the end of unslop instead.
  - Tell users who compact long sessions to turn on always-on.
- Not tested: automatic compaction, the interactive TUI, the skill loaded
  through the Skill tool instead of typed, and several invoked skills
  sharing the 25,000-token total.

## Always-on through compaction

Date: 2026-09-26. Claude Code 2.1.283, Codex 0.154.0 and 0.157.1, revision
5 build. `tests/e2e/run.sh` now requires exactly one complete bundle after a
compaction: all three END lines with the tree's bundle id, each once, in the
context that follows the compaction. Research 09 found the same with fixture
chunks. These checks use the real plugin.

### Method

- Claude Code, flag file on. `tests/e2e/claude-turns.mjs` keeps one `claude
  -p --input-format stream-json` process open and sends `Reply with the
  single word OK.`, then `/compact`. `inspect.mjs bundle ... after-compact`
  counts the SessionStart attachments after the last `compact_boundary`
  record of the transcript.
- Codex, flag file on. `codex exec` cannot compact on request, and
  auto-compaction depends on how much the model reads or prints, so the
  test uses `codex app-server` instead. `tests/e2e/codex-thread.mjs` starts
  a thread and sends a turn, then `thread/compact/start`, which is what the
  TUI's `/compact` sends, then one more turn. Codex fires the queued
  `compact` source at the start of that turn (research 09). App-server has
  no bypass flag, so the script first records trust for the hooks with
  `codex-hooks.mjs trust`. The count covers the `replacement_history` of the
  last `compacted` rollout record plus the developer messages after it.
- The driver waits for each step to finish: the thread going active and
  then idle, `thread/compacted`, or `turn/completed` for the turn it
  started. Codex can send the compaction turn's `turn/completed` late,
  after the next `turn/start`, so a `turn/completed` for another turn id
  does not count. An earlier draft of the driver counted it, stopped
  early, and aborted the last turn.

### Results

Claude Code: the check passed. The whole transcript holds two copies, one
from `startup` and one from `compact`. After the boundary it holds exactly
one of each chunk. The compaction went from 24,980 to 7,930 tokens.

Codex: not measured yet. The ChatGPT workspace behind the copied
`auth.json` ran out of credits during this work, so every model turn failed
with "Your workspace is out of credits" (`usageLimitExceeded`). The Codex
check stays a required PASS or FAIL line and is ready to run.

- Before the credits ran out, one 0.157.1 run reached the compaction
  through app-server. The rollout got a `compacted` record whose
  `replacement_history` held the user message and one compaction item. The
  driver then stopped early, the bug described above, so the bundle count
  after the compaction was not taken. The same step on 0.154.0 failed
  inside the remote compact task with the credits error.
- With no credits, both the compaction step and the count after it fail on
  0.154.0 and 0.157.1.
- Checks that read only the rollout still pass without a model answer,
  because Codex records the injected skill and the hook output before it
  samples: skill arrival, the startup bundle, the resume bundle, and the
  migrate bundle without the bypass flag. The "answers" checks and the
  typed mirror checks fail. The "reads no skill" checks pass but prove
  nothing without an answer, which the failing "answers" check beside each
  one shows.
