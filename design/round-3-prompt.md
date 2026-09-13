Round 3. `design/PLAN.md` is now v3. Read it in full again.

Accepted from round 2, all six blocking items and the optional items: precedence conditional on active parts, table subordinate to exceptions, approval-plan and protected-text wording, rows 1 and 3 corrected, independent switch semantics with latest-known-state rule, honest state-loss limitation, hook trust and invocation wording, flag-removal wording, staged --bump with separate hashes, lint exclusions, dependency check separated from illustrative paths, Codex delivery check, version test tightened, qualified command name documented.

New in v3, not from you: Claude Code caps each hook's stdout at 10,000 characters and spills larger output to a file with a preview (code.claude.com/docs/en/hooks, "Hook output strings, including additionalContext, systemMessage, and plain stdout, are capped at 10,000 characters"). The composite is about 18,000 characters. The plan now delivers it through three parallel command handlers under one SessionStart matcher, each printing one labelled chunk, each under 9,000 characters, each with its own additionalContextLimit for Codex. Read the "Hook (both runtimes)" section carefully.

Your job:
1. Attack the three-chunk hook design. Failure modes, ordering, duplication on resume/compact, what happens on Codex when only some handlers are trusted, whether Claude Code's 10,000 cap is per handler.
2. Answer the three open questions.
3. Re-read the precedence section, surface list, outcome table, and lifecycle as the model. Any remaining line that would make the model guess or that contradicts an upstream rule without saying so.
4. `## Verdict` with exactly `CONSENSUS` or `REVISE` plus numbered blocking changes. Non-blocking in `## Optional`.

Terse. Quote the line, give the replacement. No em dashes.
