Round 10. Adversarial review of revision 5 of a restructure proposal. You are read-only. Do not modify files.

Revision 4 of `design/STRUCTURE-v2.md` reached CONSENSUS in round 9 (`design/round-9-codex.md`). While implementing it, end-to-end tests with the real CLIs found that one mechanism failed, so the proposal changed. Read, in this order:

1. `design/STRUCTURE-v2.md`, especially P1 and the final section "Revision 5".
2. `design/research/11-tests-e2e.md` in full: the failure of the `references/` reads, the results after embedding, the unslop mirror auto-load counts, and the compaction measurements.
3. As needed: `design/DECISIONS.md` (D4, D7, D9, D11, D17 changed), the implementation on this branch (`tools/build.mjs`, `tools/plugins.json`, `src/adhd-unslop/skills/adhd-unslop/SKILL.md.tmpl`, the generated `plugins/adhd-unslop/skills/adhd-unslop/SKILL.md`, `tests/build.test.mjs`, `tests/e2e/run.sh`), `README.md`, and `AGENTS.md`.

Judge these specifically:

1. The reversal from reading `references/` files to embedding the upstream texts in the skill body. Is the evidence sufficient, and does anything break?
2. The duplicate copy a user gets when invoking the skill while always-on already delivered the bundle.
3. The Claude Code compaction limit: an invoked skill is re-attached cut at 20,000 characters after `/compact`, and not at all after `--resume` then `/compact`. Revision 5 documents it and points compacting sessions at always-on instead of shrinking or reordering the skill. Is that the right call?
4. The unslop mirror keeps upstream's model-invocable frontmatter, and Codex 0.154.0 loaded it unprompted in 2 of 4 runs. A user with always-on and this mirror gets a second unslop that `stop unslop` does not control. Is `allow_implicit_invocation: true` on the mirror still right?

Standard: raise a blocking item only if two competent engineers would build it differently in a way the user would notice, or if the proposal contradicts the tests, the docs, or the user's goals: a clean marketplace, clean skills, easy to maintain, supported, proven, easy to extend, and automation that keeps it working and current. Everything else goes under Optional.

Output:

## Verdict
Exactly `CONSENSUS` or `REVISE`.

## Answers
One short paragraph each for questions 1 to 4.

## Blocking
Numbered items. Each: the line, the problem, the exact change.

## Optional
Non-blocking suggestions.

Be terse and concrete. Quote lines. No em dashes.
