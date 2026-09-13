Codex supports plugin hooks. The plan also resets disabled modes and removes behavior neither upstream forbids.

Line references below are to [design/PLAN.md](/Users/ruben.varela/stow/documents-ruben/Development/00-Scratch/2026-09-12--adhd-unslop/design/PLAN.md).

1. **Question 1: Choose C, but strengthen preservation and upgrade checks.**

   C preserves pristine sources while avoiding runtime reads of multiple documents. B does not inherently require three user invocations.

   Change lines 129–132:

   > “on Codex the user must type three `$skill` invocations unless we ship a fourth composite”

   Replace with:

   > “On Codex, the arbiter can instruct the model to read both source documents. C avoids those extra reads and packages all instructions in one entry point. Claude’s invocation restrictions must be handled separately.”

   Preserving rule headings does not preserve features. ADHD’s exceptions, persistence instructions, examples, and checklist matter. Unslop’s scan, rewrite, preserve-meaning, match-tone, and self-audit process matters too.

   Change line 146:

   > “Pre-send check <- ours, merges both checklists”

   Replace with:

   > “Final check <- ours, runs both upstream checks under the applicability and precedence rules. It must not undo a winning ADHD instruction or replace either upstream process.”

   Stripping frontmatter also removes behavioral metadata. Carry unslop’s “Must always apply” instruction into the composite’s active-mode contract. Document activation policy separately from text preservation.

2. **Question 2: The definitions overlap and leave important cases unresolved.**

   Chat transcripts outlive turns. Plan-tool entries and clarification-tool questions address the user despite passing through tools. A document draft remains a deliverable even when printed without a code fence. Search queries and machine-readable arguments may be neither ordinary replies nor persistent artifacts.

   Change lines 50–52:

   > “When, and only when, a rule from each skill would produce different text for the same span, the surface decides”

   Replace with:

   > “First determine which rules apply, including their conditions and exceptions. A conflict exists when satisfying one applicable instruction would violate another. Resolve cross-skill conflicts in favor of ADHD for direct replies and unslop otherwise. Compatible instructions remain active.”

   Replace the definitions and edge cases in lines 60–76, beginning with:

   > “Reply surface = the assistant's chat turn.”

   With:

   > “Classify each authored passage separately.
   >
   > Direct replies communicate with the current user about their request. They include answers, progress reports, clarification questions, and user-facing plan or tool text.
   >
   > Other writing includes requested deliverables wherever displayed, edited or translated text, file prose, messages for third parties, application copy, delegation instructions, agent reports to other agents, and compaction summaries.
   >
   > Fences, transport, and persistence do not determine precedence. A command offered as the user’s next step belongs to the reply; an accompanying README draft belongs to other writing.
   >
   > Preserve syntax, identifiers, paths, URLs, schemas, exact-match data, and text explicitly quoted verbatim. Apply prose rules to editable comments and natural-language strings where the task permits.
   >
   > Text supplied for rewriting is editable. Quotation marks do not exempt it.
   >
   > Workflow instructions govern the agent’s conduct under their stated conditions. Do not insert session bookkeeping into deliverables merely because both skills are active.”

   Neither upstream explicitly establishes the plan’s blanket verbatim exemption. Make it a wrapper rule, and distinguish quotation from editing.

3. **Question 3: Conditional deviation is acceptable. The blanket prohibition is not.**

   ADHD rule 10 bans generic closing phrases. It does not ban every useful question. Rule 4 expressly requires a separate question about another issue. The ambiguity, destructive-action, and debugging exceptions also require questions.

   ADHD’s own exception 6 supports doing already-authorized work instead of offering to do it. That does not justify turning every question into an imperative.

   Change row 3 and its explanation:

   > “Never ‘Want me to...?’ in an agent harness”  
   > “No closer at all”

   Replace with:

   > “Reply: when work remains, preserve one useful next action or necessary question. Follow the current runtime’s instructions and existing authorization. Do not ask permission again for authorized work. Preserve questions required by ADHD’s tangent, ambiguity, diagnostic, and destructive-action rules.
   >
   > Other writing: remove generic chatbot closers. Preserve a substantive request or closing action required by the deliverable.”

   An email requesting a decision may need a final question. Unslop does not prohibit that.

4. **Question 4: Several listed conflicts are inaccurate, and several interactions are missing.**

   - **Fragments:** Unslop 33 applies. Rule 32 can also conflict with fragment patterns. Rule 16 targets redundant bold-label lists, not every label followed by a colon. Rule 14 permits colons before lists and examples.
   - **Estimates:** ADHD 6 asks for concrete ballparks, not a number in every response. Unslop 30 concerns adverbs. It does not say “never invent a measurement.” There is no basis for banning estimates from ordinary documentation.
   - **Status:** Concrete progress can satisfy both ADHD 5 and unslop 27. ADHD explicitly allows the task checklist to perform the restatement. A status report is also a legitimate artifact.
   - **Lists:** ADHD 9 says to aim for five per group and explicitly forbids omissions when completeness matters. Unslop 10 opposes forced triples. These rules often coexist.
   - **Missing interactions:** Unslop’s intended-tone requirement can conflict with imposing ADHD’s conversational structure on another audience. ADHD’s action-first rule, answer-first rule, visible-completion rule, and no-recap rule need interpretation within ADHD itself. Its pre-send deletion rule must respect its exception for required tool announcements.

   Change lines 23–24:

   > “Six places where the two skills tell the model to do opposite things on the same line of text.”

   Replace with:

   > “The following are candidate interactions. Distinguish actual conflicts from compatible rules, illustrative examples, and exceptions within each skill.”

   Replace outcome-table rows 4–6 with:

   | Topic | Direct reply | Other writing |
   | --- | --- | --- |
   | Estimates | Give concrete, qualified ballparks when relevant to executing or planning work. | Preserve relevant estimates and their assumptions. Do not present estimates as measurements. |
   | State | Restate relevant progress through the checklist or concise prose, without duplicating the plan. | Include status when it is substantive content; omit unrelated session bookkeeping. |
   | Lists | Aim for five per meaningful group. Show every relevant item when completeness matters. | Use the natural count and preserve completeness. |

   Add:

   > “Exceptions constrain rules and checklists within each upstream. Examples illustrate their stated purpose; they do not create unrelated blanket exemptions.”

5. **Question 5: A prompt stub is optional. It does not solve activation or persistence.**

   The plan’s Codex claim is false. Current documentation supports plugin `hooks/hooks.json`, `SessionStart`, and all four listed start sources. Codex supplies `PLUGIN_ROOT` and Claude-compatible variables. Plugin hooks require trust. Oversized output can become a preview, with a default threshold around 2,500 tokens. [Official hooks documentation](https://learn.chatgpt.com/docs/hooks)

   The supplied ADHD launcher already supports both root variables. Its tests exercise a Codex-shaped invocation. Pstack’s README claim that Codex lacks plugin hooks is outdated.

   Change lines 202–206:

   > “Codex has no SessionStart hook”

   Replace with:

   > “Use the existing shared Node SessionStart hook mechanism on supported Claude Code and Codex versions. Preserve upstream flag resolution through CLAUDE_CONFIG_DIR, defaulting to ~/.claude, and document that the flag controls both runtimes. Document Codex hook trust and verify delivery of the complete composite within the configured output limit.
   >
   > Keep an AGENTS.md loader as an optional fallback. It must load the complete installed skill and respect session overrides. A precedence summary alone does not provide either ruleset. Codex prompt stubs are optional invocation shortcuts.”

   Keep `allow_implicit_invocation: false` if explicit activation remains the chosen policy. That field controls Codex invocation; testing Claude’s `disable-model-invocation` field alone is insufficient. A literal `$skill` in AGENTS.md should not be treated as proof that the full skill loaded. [Official skills documentation](https://learn.chatgpt.com/docs/build-skills)

   Claude blocks model invocation of skills marked `disable-model-invocation: true`. Full-body hook injection avoids depending on that invocation path, as ADHD already does. Pstack deliberately removed this flag from its callable unslop skill. [Claude invocation documentation](https://code.claude.com/docs/en/skills#control-who-invokes-a-skill)

   The lifecycle needs a separate correction. These instructions contradict each other:

   > “Both parts start active when the skill is loaded.”  
   > “Load and follow $adhd-unslop on every turn”

   Replace the activation and persistence wording with:

   > “Explicit user activation enables both modes. Loading, rereading, or reinjecting instructions does not change mode state.
   >
   > Track ADHD and unslop state separately per session. Stop commands change only the specified state; normal mode disables both. Startup and clear initialize the configured defaults. Resume and compact restore the session’s saved choices.
   >
   > Implement and test the state writer and restoration path. A flag file supplies defaults, not session state. Instructions quoted for discussion are not control commands.”

   The current hook reads no session state and prints an unconditional active banner. Reinjection cannot substantiate the claim that the model need not remember mode state. It also does nothing for manual activation without the flag.

6. **Question 6: Keep upstream headings unchanged.**

   Change lines 149–150:

   > “Upstream bodies are included verbatim, with heading levels demoted by one so they nest under Part 1 and Part 2.”

   Replace with:

   > “Copy each upstream body byte-for-byte after removing its leading frontmatter. Preserve headings, examples, and fences. Use begin/end provenance comments instead of Part headings. Test exact body equality.”

   “Verbatim” and “demoted” contradict each other. Demoting once also turns each upstream H1 into an H2, making it a sibling of the proposed Part H2 rather than nesting it underneath.

**The tests and upgrade contract also need replacements.**

Change:

> “Composite contains every upstream rule heading”

To:

> “Verify exact upstream body inclusion, preserved frontmatter behavior, both processes, all exceptions, and both runtime metadata files. Detect newly introduced relative dependencies and require them to remain available within the installed skill directory.”

Change:

> “Run two prompts in a fresh Claude Code session”

To:

> “Test each documented installation and activation route on recorded CLI and model versions. Cover mixed reply/deliverable output, necessary questions, complete lists exceeding five items, estimates, task-tool progress, protected syntax, all off/on transitions, topic changes, resume, clear, and compaction. Verify full instruction delivery and repeat behavioral cases with recorded results.”

The current two prompts barely exercise the disputed behavior.

Change:

> “tools/upstream.json holds the two pins (repo, path, sha)”

To:

> “Record repository, path, commit, content hash, and source license files. Stage and verify updates before replacing the pins and sources together. Review source, metadata, dependency, overlay, and generated-output changes. Regenerate committed installation snippets and aligned manifest versions.”

Finally, replace:

> “LICENSE (MIT) + NOTICE.md (attribution to both upstreams)”

With:

> “Preserve both upstream copyright and permission notices. Include them inside the installed skill directory for skills-only distribution, with provenance in NOTICE.md.”

Root-only attribution disappears under pstack’s documented skills-only installation boundary.

## Verdict

REVISE

1. Correct the conflict inventory and remove unsupported outcome-table restrictions.
2. Define passage-level classification, protected text, and workflow applicability.
3. Preserve upstream exceptions, processes, metadata behavior, and exact bodies.
4. Separate activation from loading and implement session-state restoration.
5. Correct Codex hook support and verify every documented deployment route.
6. Expand behavioral coverage and make upgrades preserve dependencies, licenses, and installation metadata.