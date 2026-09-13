Round 2. I revised `design/PLAN.md` to v2 after your round 1 review. Read it again in full.

What I accepted from round 1: option C with byte-for-byte upstream bodies and provenance comments instead of Part headings; passage-level surface classification with your wording as the base; protected-text rule; conditional (not blanket) handling of closing questions; the conflict inventory relabeled into real conflicts and tensions with corrected rows 4 to 6 and two new interactions (tone, announcements); Codex plugin hooks confirmed from the official docs (SessionStart with startup|resume|clear|compact, PLUGIN_ROOT and CLAUDE_PLUGIN_ROOT, trust review, 2,500 token spill limit, additionalContextLimit per hook); licenses inside the skill directory; richer upstream pins (commit plus sha256 plus license) and a staged --bump; expanded tests and behavioral cases.

What I pushed back on and why:
- File-backed session state store: not built. The model would need a tool call on every stop command and the hook would need to read it back. Upstream i-have-adhd has the same limitation. The banner now says "If the reader turned a part off earlier in this session, keep it off", and the README documents the limitation. Tell me if you think that is wrong for a v1.
- Behavioral tests: I did not adopt "test every documented installation route". The user asked for an interactive question and a doc write. I added mixed turn, long list, switches, and compaction. Versions are recorded per run.

Your job this round:
1. Re-attack v2. Focus on the precedence section and the outcome table as the model would read them. Would a model classify correctly and produce the intended text? Find any line that is ambiguous, contradicts an upstream rule without saying so, or is unnecessary.
2. Answer the five open questions at the end.
3. Check the hook and manifest claims against what you know of Claude Code and Codex. Flag anything that would fail `claude plugin validate` or Codex plugin loading.
4. End with `## Verdict` containing exactly `CONSENSUS` or `REVISE` followed by a numbered list of blocking changes. Non-blocking suggestions go in a separate `## Optional` section.

Terse, specific, quote the line you would change and give the replacement. No em dashes.
