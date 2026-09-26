Round 8. Adversarial review of a restructure proposal, third pass. You are read-only. Do not modify files.

Read, in this order:

1. `design/round-7-prompt.md` and `design/round-7-codex.md`: the previous round and its REVISE verdict with two blocking items.
2. `design/STRUCTURE-v2.md` in full. It is now revision 3. Its last section, "Round 7 responses", maps each round 7 item to the change that answers it. P3 and P10 changed most.
3. `design/research/10-tests-hook-env.md`: a new test of which environment variables each runtime gives a plugin hook.
4. As needed: `design/research/07-tests-codex.md` (C3 trust and `hooks/list`), `08-tests-claude.md`, `09-tests-clear-compact.md`, `design/DECISIONS.md`, and the code in `plugins/adhd-unslop/hooks/`, `tools/`, and `tests/`.

Your job:

1. For each round 7 blocking item, say whether revision 3 resolves it.
2. Review what revision 3 changed with the round 6 standard: claims the evidence does not support, behavior that would break for a user, and missing migration steps.
3. Raise a new blocking item only if two competent engineers would build it differently in a way the user would notice, or if it contradicts the tests, the docs, or the user's goals. Everything else goes under Optional.

Output:

## Verdict
Exactly `CONSENSUS` or `REVISE`.

## Round 7 items
One line per blocking item: resolved or not, and why.

## Blocking
Numbered items. Each: the line, the problem, the exact change.

## Optional
Non-blocking suggestions.

Be terse and concrete. Quote lines. No em dashes.
