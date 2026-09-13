# Behavioral test results

Date: 2026-09-12. Repo state: composite body sha256 7d8542079093 (bundle id).

| Runtime | Version | Model | Activation |
| --- | --- | --- | --- |
| Claude Code | 2.1.270 | user default (`claude -p`) | always-on hook via `--plugin-dir`, flag in `~/.claude/.adhd-unslop-always`; upstream i-have-adhd flag moved aside for the test window and restored after |
| Codex CLI | 0.154.0 | gpt-6-astra, medium | `$adhd-unslop` mention in `codex exec`; skill found via `~/.agents/skills/adhd-unslop` symlink |

Raw outputs are in `design/behavior/`.

## Delivery check (test 13)

Claude Code: the session transcript for the question test contains all three
chunk values verbatim, header and footer included, and no spill preview.
Verified by byte comparison against the launcher's expected output for each
chunk (8792, 8060, 7975 characters with the real flag paths).

Codex: not verified. Plugin hooks run only after interactive trust in
`/hooks`, and the safety bypass flag was not used. The launcher is covered by
the unit tests. The Codex plugin cache did receive the full repo, including
the reference clones, so those are now git-ignored.

## 1. Interactive question

Prompt: "What's the difference between a symlink and a hard link? I'm on macOS."

Claude Code (`claude-T1-question.md`): answer first, no preamble, no closer,
no em dash, no rule 7 words, sentence-case bold labels, ends with a way to
see the difference. Parentheses used for short asides, which the outcome
table allows only for locators on the reply surface. Minor miss.

Codex, first run without the symlink (`codex-T1-question.md`): "I couldn't
find the adhd-unslop skill locally." Then answered with an em dash and curly
quotes. Skill not applied. Cause: `codex exec` did not list the plugin's
skill in its catalog.

Codex, rerun with the symlink (`codex-T1b-question.md`): read
`~/.agents/skills/adhd-unslop/SKILL.md`, then answered with a table, no em
dash, straight quotes, no closer. Pass.

## 2. Doc write, the tie-breaker test

Prompt: "Write docs/links.md explaining symlinks vs hard links for a junior dev. Then tell me what you did."

Claude Code doc (`claude-T2-doc.md`): whole sentences, sentence-case
headings, no em dash, no connector colon, no status line, no estimate, no
next-action line, natural list lengths. Four parenthetical asides remain,
which unslop rule 13 would rewrite. Partial miss on rule 13, pass on the
tie-breaker: no ADHD bookkeeping leaked into the file.

Claude Code reply (`claude-T2-reply.md`): two sentences reporting the write,
then "Next: open `docs/links.md` and skim it." Exactly the ADHD shape. Pass.

Codex doc (`codex-T2-doc.md`): whole sentences, table, runnable example
blocks, no em dash, no status line, no next-action line. Pass.

Codex reply (`codex-T2-reply.md`): reports completion and verification in
two short paragraphs, no closer, no next action (none needed). Pass.

Both runtimes produced a doc in unslop style and a reply in ADHD style from
the same turn. The tie-breaker held on both.

## 5. Switches (Claude Code, `claude-T5-switches.md`)

| Turn | Input | Result |
| --- | --- | --- |
| 1 | which modes are active | "Both ADHD mode and unslop mode are active." Answer in ADHD shape with a next action. |
| 2 | stop adhd mode | "ADHD mode off. Unslop mode still active." |
| 3 | which modes, plus a question | "Unslop mode is active. ADHD mode is off." Prose answer, no next-action line. |
| 4 | stop unslop | "Both ADHD mode and unslop mode are off now." |
| 5 | which modes | "Both are off — ADHD mode and unslop mode." Em dash appears once unslop is off, as expected. |
| 6 | /adhd-unslop | "Both ADHD mode and unslop mode are active now." |
| 7 | which modes | "Both ADHD mode and unslop mode are active." |

State sequence matches the plan: both on, ADHD off, both off, both on.

## Not run

Mixed turn (3), long list (4), and compaction (6) from the plan were not run
in this pass. Codex switch sequence not run.
