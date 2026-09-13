Three handlers can avoid the size limit. They do not make delivery complete or activation atomic.

References are to [design/PLAN.md](/Users/ruben.varela/stow/documents-ruben/Development/00-Scratch/2026-09-12--adhd-unslop/design/PLAN.md).

1. **Question 1: Labels address ordering, but not missing instructions.**

   Claude documents the 10,000-character limit per returned context value. Several hooks can each return a value below that limit. This supports splitting, but does not promise three distinct transcript messages. [Claude hook documentation](https://code.claude.com/docs/en/hooks#add-context-for-claude)

   Replace lines 271–272:

   > “Both runtimes deliver every matching hook's output separately and all matching hooks run in parallel.”

   With:

   > “Matching handlers run concurrently. Keep all three synchronous. Each successful handler contributes context subject to its own output limit. Do not depend on arrival order or transcript message boundaries.”

   **The critical failure is part 1 missing.** Parts 2 and 3 then deliver upstream instructions without the precedence rules, switches, or instruction to read all three. Conversely, part 1 alone announces activation without delivering either skill.

   Codex can skip untrusted hooks and disable individual hooks. One matcher group is not an all-or-nothing execution contract. Timeouts and process failures can also leave a subset. [Codex hook documentation](https://learn.chatgpt.com/docs/hooks#review-and-trust-hooks)

   Replace lines 281–282:

   > “Each chunk starts with a self-identifying line … because delivery order is not guaranteed.”

   With:

   > “Every chunk carries a common control header, the composite hash, its index and total count, and an end marker. The header identifies the payload as part of one composite, states the precedence and mode-preservation rules, and requires a complete matching set before applying a newly delivered bundle. If incomplete, preserve any previously established complete configuration, report the missing chunks once, and do not activate from the partial bundle.”

   Do not silently recover a deliberately disabled or untrusted handler by another route. Document trusting/enabling all handlers or explicitly invoking the composite.

   **Resume and compaction create duplicates.** Treat repeated chunks with the same hash and index as repeated instructions, not new activation. Do not combine different hashes. Reinjection may still be needed after compaction, so a previous-delivery flag would be insufficient.

   Replace the banner’s:

   > “ADHD-UNSLOP MODE ACTIVE … Three parts follow”

   With:

   > “ADHD-UNSLOP INSTRUCTIONS. This is chunk N of 3 from bundle HASH. Receiving instructions does not itself change established mode state.”

   Use **chunks** for the three deliveries and **modes** for ADHD and unslop. “Restore the state of each part” currently conflates them.

2. **Question 2: Prefer generated chunk files, with reconstruction checked at build time.**

   This moves marker parsing and partition validation out of three independently failing startup processes. Generate them from the same canonical composite and promote them with the other generated output.

   Replace lines 286–288:

   > “The launcher reads the chunks from the generated composite by its provenance markers, so the hook and the skill file cannot drift.”

   With:

   > “The build generates chunk payload files and a manifest containing their hashes and the composite hash. The launcher validates the selected payload before emitting it. Tests reconstruct the canonical composite from the payloads and reject stale generated files.”

   **The current partition cannot reproduce the composite exactly.** The composite puts the final check last; chunk 1 moves it before both upstream bodies.

   Replace lines 277–279:

   > “Banner plus overlay (scope, precedence, lifecycle, final check).”

   With this partition:

   > “Chunk 1 contains the composite prefix through the lifecycle section. Chunk 2 contains the ADHD block, including its provenance markers. Chunk 3 contains the unslop block and the final check. Payloads are contiguous slices of the composite; transport headers are separate.”

   Replace test 7’s:

   > “parts 1 to 3 together reproduce the composite body exactly”

   With:

   > “After removing transport headers and footers, concatenating payloads in index order reproduces the composite body byte-for-byte.”

   Also replace:

   > “A test asserts each chunk is under 9,000 characters”

   With:

   > “Check the complete emitted value, including control headers, provenance, labels, and expanded flag paths, against both limits. Assemble and validate the entire value before writing stdout.”

   A size test on payload files alone misses the added text.

3. **Question 3: Two table entries still suppress compatible upstream rules.**

   Row 1 says:

   > “Headings, labels, and non-prose structure stay as they are.”

   That exempts headings from unslop’s sentence-case, emoji, quotation, and vocabulary rules. Replace with:

   > “Do not force headings or labels into sentences. Apply other active style rules to their wording and formatting. Preserve required non-prose structure.”

   Apply that distinction to both columns. “Whole sentences with articles and verbs” should govern running prose, not force every document heading into a sentence.

   Row 8 says:

   > “Delete openers except an announcement the runtime requires.”

   “Openers” could include the answer or action ADHD requires first. Replace with:

   > “Remove preambles and announcements of intended work unless the runtime requires them. Keep the answer or action that opens the reply.”

   The classification and independent-switch rules need no further redesign. The documented loss of conversation state remains acceptable for v1. Incomplete instruction delivery is a separate failure and must not be excused as state loss.

**The delivery test does not establish complete delivery.**

Test 13 asks:

> “print the last heading of each adhd-unslop part you received”

A preview can contain the last heading while omitting the middle. A heading can also precede several missing rules.

Replace with:

> “On both runtimes, inspect delivered hook context for missing text and spill previews, comparing available payloads with expected output. Supplement with temporary beginning, middle, and end sentinels; model recall alone is not proof. Exercise reordered delivery, each missing handler, duplicate chunks, mixed bundle hashes, and resume/compact after a mode change. Include a Codex case with only some handlers enabled or trusted.”

These checks target the new delivery mechanism. They do not require repeating the writing suite for every installation route.

**The lint exclusion still does not cover its example.**

Lines 345–347 exclude fenced blocks, inline code, and provenance comments, then claim that quoted `"delve"` is excluded. Ordinary quotation marks are none of those.

Replace the precedence example’s:

> `the word "delve"`

With:

> ``the word `delve` ``

Change the test explanation to “the inline-code example does not fail lint.”

## Optional

- Replace “the composite is about 18,000 characters” with “the build reports the exact emitted sizes.” The current precedence/lifecycle text and stripped upstream bodies already total **19,181 characters**, before provenance, the final check, and transport text.
- Keep all-or-nothing delivery described as a model instruction, not a runtime guarantee. Independent handlers cannot enforce that guarantee by labelling their output.

## Verdict

REVISE

1. Put completeness, bundle identity, precedence, and mode-preservation instructions in every chunk; define missing-handler behavior.
2. Preserve composite order and make payload reconstruction exact.
3. Validate complete emitted values before writing output.
4. Replace the heading-recall test with delivery checks covering both runtimes, partial delivery, and reinjection.
5. Correct the heading/opener rules and the remaining lint-example mismatch.