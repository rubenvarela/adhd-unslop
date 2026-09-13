A file-backed state store is not required for v1. The blockers are contradictory instructions, switch semantics, upgrade staging, and test expectations.

References below are to [design/PLAN.md](/Users/ruben.varela/stow/documents-ruben/Development/00-Scratch/2026-09-12--adhd-unslop/design/PLAN.md).

1. **Question 1: The approval plan is a direct reply, with one distinction.**

   “Requested deliverables wherever they are displayed” at lines 96–98 also describes a requested execution plan. Add:

   > “The agent’s proposed next steps, presented for approval before acting, are a direct reply. A plan document supplied as the requested work product is other writing, even when awaiting approval.”

   The protected-text rule also freezes too much. Lines 113–115 say:

   > “Protected text is preserved by both skills and never rewritten”

   Replace with:

   > “Style edits must preserve syntax, identifiers, paths, URLs, schemas, exact-match data, and verbatim quotations. The requested task may change them. Required output structure is protected; editable prose within that structure still follows these rules.”

   Otherwise, “rename this identifier” conflicts with “never rewritten,” and a required JSON response could exempt every prose value.

2. **Question 2: Row 1 is too restrictive, not too permissive.**

   `Cause: X. Fix: Y.` follows ADHD’s example. But line 126 says:

   > “Everything else is a whole sentence.”

   That excludes ADHD’s next-action fragments and can force headings or labels into sentences. Replace the reply cell with:

   > “Allow functional fragments modeled by ADHD, including next-action, progress, completion, and error lines. Otherwise apply unslop’s sentence rules. Preserve required headings, labels, and non-prose structure.”

   Row 3 also drops ADHD’s two-minute requirement and makes its question whitelist exhaustive. Replace:

   > “Ask a question only where ADHD requires one”

   With:

   > “When work remains, give one concrete action the reader can complete in under two minutes, or a necessary question under ADHD’s rules, task exceptions, or current user/runtime instructions. Do not seek authorization already given.”

3. **Question 3: Accept model-tracked state for v1, but fix its semantics.**

   Lines 145–146 say:

   > “unslop stays on”  
   > “ADHD part stays on”

   These are not independent switches. After disabling ADHD, disabling unslop would enable ADHD again. Replace them with:

   > “‘stop adhd mode’ disables ADHD and leaves unslop’s current state unchanged.”  
   > “‘stop unslop’ disables unslop and leaves ADHD’s current state unchanged.”

   The banner’s historical condition is also wrong:

   > “If the reader turned a part off earlier in this session … keep it off.”

   This overrides a later explicit reactivation. Replace with:

   > “Restore the latest known state of each part in this session. Explicit invocation enables both; stop commands change the specified state. Reloading these instructions does not change known state. If no state is available, initialize both active.”

   Replace lines 156–159 with:

   > “Mode state lives in conversation context, not durable storage. Compaction or resume can lose it. Reinjection restores instructions, not missing state, and may therefore restore the active defaults. README documents that stop commands may need repeating.”

   That is an honest v1 limitation. Upstream precedent alone does not establish reliability.

   Also replace:

   > “Delete <flag path> to turn always-on off for good.”

   With:

   > “Remove every existing opt-in flag to stop future injections. Use ‘normal mode’ to disable both parts in the current session.”

   Either flag enables both runtimes, so removing only one may change nothing.

4. **Question 4: The Codex key and value are valid. Claude validation does not currently reject it.**

   Put `additionalContextLimit: 12000` on the command handler, beside `type` and `command`. It sets a threshold, not a fixed allocation. Measure the complete banner-plus-body output. [Codex hook documentation](https://learn.chatgpt.com/docs/hooks)

   I tested temporary fixtures with Claude Code **2.1.270**. Hook validation accepted this property, including with `--strict`. An invalid-command control was rejected under `--strict`.

   Replace lines 249–252:

   > “Claude Code ignores unknown hook keys (to be verified …)”

   With:

   > “Set additionalContextLimit to 12000 on the command handler. Claude Code 2.1.270 accepts this field in validation. Validate the generated plugin with --strict and check complete payload delivery in Codex.”

   Correct line 243:

   > “review and trust plugin hooks once”

   To:

   > “review and trust the current hook definition; changed definitions require review again.”

   Codex records trust against the definition’s hash. [Hook trust documentation](https://learn.chatgpt.com/docs/hooks#review-and-trust-hooks)

   The `.codex-plugin/plugin.json` layout remains supported. I found no demonstrated manifest-schema blocker in the proposed layout; these checks were not a Codex installation test. [Plugin compatibility documentation](https://developers.openai.com/plugins/build/plugins)

   Lines 140–141 overstate equivalence between invocation controls. Replace:

   > “Neither runtime lets the model invoke it on its own”

   With:

   > “Claude blocks model-initiated Skill calls. Codex disables implicit skill selection. The AGENTS.md fallback explicitly instructs the model to read and follow the complete installed SKILL.md.”

5. **Question 5: Warn about uncited new rules. Fail for broken dependencies or references.**

   The overlay should cite conflicts, not enumerate every upstream rule. A new compatible rule needs no overlay citation. Conversely, changed wording under an existing number can introduce a conflict without adding a heading.

   Replace line 283’s review comment:

   > “update overlay citations if a rule moved”

   With:

   > “Review every upstream change for applicability, conflicts, activation, and dependencies. Warn about new uncited rules. Fail for unresolved cited rules or unavailable runtime dependencies.”

   The `--bump` description contradicts itself:

   > “updates commit and sha256 … then runs the build and tests”  
   > “If tests fail … does not amend the pin.”

   Replace lines 286–289 with:

   > “Fetch candidate sources and licenses into staging. Record separate hashes for SKILL.md and LICENSE. Build and test against staged pins. Promote sources, pins, and generated output together only after checks pass. On failure, retain staging for inspection and leave canonical files unchanged.”

**Additional blocking edits**

- **Disabled parts still apply under the precedence section.** Lines 81–82 say:

  > “All rules from both skills apply to every passage”

  Replace with:

  > “Apply rules only from active parts, subject to their conditions and exceptions. When both parts apply and conflict, ADHD wins for direct replies and unslop wins otherwise. These scope, lifecycle, and precedence instructions govern conflicting statements in the embedded bodies.”

  Change line 122:

  > “The model applies this table instead of deriving the outcome.”

  To:

  > “The table illustrates outcomes when both parts are active and applicable. It does not override upstream exceptions. Resolve unlisted interactions with the precedence rule.”

  Change line 202 similarly from “both upstream checklists” to “the checks and processes of active parts.”

- **Behavioral expectations contradict the table.** Lines 331–333 require no document estimate or next-action line, then require a chat next action after the write. Replace with:

  > “The document contains no unrelated session bookkeeping. Task-relevant instructions and estimates are allowed. The reply reports completion and includes a next action only if work remains.”

  Replace line 336:

  > “capped at five with the rest offered”

  With:

  > “ranked and grouped where useful; no relevant findings omitted when completeness matters.”

  In the switch test, assert the actual state sequence: both on, ADHD off, both off, both off. Add reactivation followed by compaction to catch the banner’s historical-off bug.

- **Mechanical checks need exclusions.** Test 4 rejects the precedence section’s own quoted `delve` example. Test 12 could reject provenance paths and illustrative paths such as `auth.ts`.

  Replace those checks with:

  > “Lint authored overlay prose, excluding marked literal examples and provenance. Validate actual runtime dependencies and resource links separately from illustrative paths.”

I accept the smaller behavioral suite. Add one Codex hook-loading check that verifies the complete payload reaches context. This does not require repeating the writing suite for every installation route.

## Optional

- Line 166 still says “three invocations.” Replace with “multiple documents and additional loading steps.” Three user invocations are not inherent to that architecture.
- Test 10 should require matching versions in both plugin manifests and any supported marketplace plugin-version fields. Requiring `VERSION` somewhere in every marketplace file proves little.
- Document the qualified Claude command `/adhd-unslop:adhd-unslop`. The bare alias works unless another command occupies it. [Claude command naming](https://code.claude.com/docs/en/skills#how-a-skill-gets-its-command-name)

## Verdict

REVISE

1. Make precedence and final checks conditional on active parts; keep the table subordinate to exceptions.
2. Clarify approval plans and protected text; correct rows 1 and 3.
3. Preserve independent switch states and the latest activation choice; document state loss accurately.
4. Correct hook trust, invocation, payload-validation, and flag-removal wording.
5. Make `--bump` staging and pin promotion consistent.
6. Align tests with the rules, add literal-text exclusions, and verify Codex hook delivery.