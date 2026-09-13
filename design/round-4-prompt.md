Round 4. `design/PLAN.md` is v4. Read it in full.

Accepted from round 3, all five blocking items plus the optional ones: control header with bundle hash, index, total, completeness rule, state rule, and precedence line in every chunk; missing-handler behavior defined and not silently recovered; payloads are contiguous slices in composite order (prefix through lifecycle, ADHD block, unslop block plus final check); build writes chunk files and a manifest with hashes and sizes; the launcher validates the payload hash and the complete emitted value against limits before writing stdout; tests reconstruct the composite from payloads; the delivery check inspects delivered context directly on both runtimes and covers missing handlers, duplicates, partial trust, and resume/compact after a mode change; heading and opener cells corrected in both columns; "mode" vs "chunk" terminology fixed; the lint example uses inline code; the size claim now defers to the build's exact report.

Your job:
1. Read the whole plan once more as the person who will build it tomorrow. Anything underspecified enough that two engineers would build it differently in a way that matters?
2. Answer the three open questions.
3. `## Verdict` with exactly `CONSENSUS` or `REVISE` plus numbered blocking changes. Non-blocking in `## Optional`.

Terse. Quote the line, give the replacement. No em dashes.
