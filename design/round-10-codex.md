## Verdict

REVISE

## Answers

1. Embedding is the right reversal. The read failures are decisive, and build plus E2E checks prove the pinned blocks, hook bundle, and delivered skill body match. It removes the runtime dependency on permission and model choice.

2. The duplicate is acceptable as an unavoidable 21.8 KB token cost, but it is not always a no-op. Explicit invocation intentionally enables both modes, even if the user had stopped one.

3. Yes. Shrinking or reordering only moves the loss and will not fix the resumed-session case. Always-on reinjection covers both cases, and reinvocation is a workable fallback.

4. Yes. `au-unslop` is explicitly optional and upstream-exact, so implicit invocation preserves its stated standalone behavior. The README warning and clean-install test boundary make the interaction clear.

## Blocking

1. Lines 341 to 345: “its cache copy holds the skill, both reference files, and the hooks.” Problem: Revision 5 removes `references/`, so P9 contradicts P1 and would specify a failing load check. Exact change: replace this with “its cache copy byte-matches every shipped file, including the skill with both embedded upstream blocks and the hooks,” and say Codex checks the same.

2. Lines 95 to 98: “That costs tokens and changes nothing.” Problem: this conflicts with the lifecycle rule that explicit invocation enables both modes. A user who stopped unslop will notice it reactivate. Exact change: say the duplicate adds no new rules, but explicit invocation re-enables both modes; passive chunk reloads preserve known state.

## Optional

None.