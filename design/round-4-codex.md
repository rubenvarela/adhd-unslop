**Question 3: Yes. Four implementation contracts still need clarification.** The precedence table needs no further redesign.

References are to [design/PLAN.md](/Users/ruben.varela/stow/documents-ruben/Development/00-Scratch/2026-09-12--adhd-unslop/design/PLAN.md).

1. **Restore the flag specification.**

   V4 mentions “the Claude flag or the Codex flag” but no longer defines either path or how they combine.

   Replace line 239:

   > “reads flag, prints banner + composite body”

   With:

   > “Checks for `.adhd-unslop-always` under `CLAUDE_CONFIG_DIR`, defaulting to `~/.claude`, and under `CODEX_HOME`, defaulting to `~/.codex`. Either flag enables all three handlers in either runtime. With neither flag present, exit 0 without output. Emit only the selected chunk after validation.”

2. **Make completeness explicitly precede activation.**

   Lines 144–146 still say:

   > “when the always-on hook injects it … Both parts start active.”

   That conflicts with the incomplete-bundle rule. Replace with:

   > “Explicit user invocation enables both modes. Hook delivery may initialize mode defaults only after a complete matching bundle is available. An incomplete bundle initializes neither mode. Receiving a complete bundle preserves known mode states; an unknown mode defaults to active.”

   Make the header’s default conditional too. Replace:

   > “if none is known, both are active”

   With:

   > “after a complete bundle is available, default each unknown mode to active”

   Also specify which rules survive an upgrade. Replace:

   > “keep any earlier complete configuration”

   With:

   > “retain the previously selected complete bundle and current mode states. A newly completed bundle replaces its rules without resetting those states. Repeated chunks from an older bundle do not select that bundle again.”

3. **Separate reproducible manifest data from runtime sizes.**

   Lines 297–300 require the manifest to contain:

   > “each chunk’s emitted size”

   But emitted text includes flag paths that differ by machine. Two implementations could produce different committed manifests from identical sources.

   Replace with:

   > “The manifest records SHA-256 hashes over the exact UTF-8 bytes of the composite body and each payload, plus payload byte counts and UTF-16 code-unit counts. Do not normalize payload whitespace or line endings. Environment-dependent emitted sizes are not committed. The launcher measures the complete expanded value at runtime.”

   Replace test 8’s:

   > “the longest plausible flag paths”

   With:

   > “fixed path fixtures with documented lengths, plus an oversized-path case that verifies rejection before any payload output”

   Use one shared, specified token-estimation function in the build, launcher, and tests.

4. **Remove the spill-file shortcut from delivery verification.**

   Lines 404–405 say:

   > “read the session log or the `hook_outputs` spill directory. Compare each value with the chunk file.”

   A spill file contains the full output precisely when the model received a shorter preview. It cannot prove complete delivery. Also, the delivered value contains transport text absent from the payload file. [Codex output-limit documentation](https://learn.chatgpt.com/docs/hooks#large-hook-output)

   Replace with:

   > “Inspect the recorded model-visible context and compare it with the launcher’s expected complete emitted value, including header and footer. A spill file is diagnostic evidence, not proof of full delivery. If the runtime exposes no suitable record, mark direct delivery verification unverified rather than passing it from raw output or spill-file contents.”

## Optional

- **Question 1: Keep the control header.** Its repeated instructions matter when chunk 1 is missing. The cost estimate is wrong: the current header is **111 words and 709 characters** after substituting a 64-character hash, before its final newline.

  Replace:

  > “costing roughly 450 characters per chunk”

  With:

  > “currently about 710 characters per chunk after hash substitution; the build reports the measured size”

- **Question 2: Prefer a warning when an opted-in installation is broken.** Keep normal opt-out silent. Use a JSON `systemMessage`, not a prose diagnostic that becomes instruction context. Both runtimes support this warning field. [Claude hook output](https://code.claude.com/docs/en/hooks#json-output), [Codex hook output](https://learn.chatgpt.com/docs/hooks#common-output-fields)

  Replace:

  > “On any mismatch it prints nothing and exits 0.”

  With:

  > “With opt-in present, a missing file, invalid manifest, hash mismatch, or oversized value returns one bounded JSON systemMessage identifying the failed chunk and reason, then exits 0. Return no additionalContext or chunk payload. With no opt-in, remain silent.”

  Update the corresponding failure tests if adopted.

## Verdict

REVISE

1. Restore exact flag paths, defaults, and enablement semantics.
2. Gate initialization on completeness and define bundle replacement without mode resets.
3. Separate deterministic manifest fields from runtime emission sizes and specify size-test inputs.
4. Verify delivered context rather than treating spill files as proof.