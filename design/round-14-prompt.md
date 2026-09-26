Round 14. Adversarial review of the implementation, not the design. You are read-only. Do not modify files.

Read `design/round-12-prompt.md`: it is the brief for this review, and it still applies in full. The Codex run of round 12 stopped when the workspace ran out of credits. A Claude reviewer then ran the same brief twice: `design/round-12-claude.md` (first pass) and `design/round-13-claude.md` (second pass). The branch has commits fixing their findings: `git log --oneline fc308bd..HEAD` shows them.

Your job:

1. Review `git diff fc308bd HEAD` with the round 12 brief, independently. Do not assume the Claude reviews found everything.
2. For each blocking item in `round-12-claude.md` and `round-13-claude.md`, say in one line whether HEAD resolves it.
3. Raise a blocking item only for a real bug, a contradiction with the accepted design (`design/STRUCTURE-v2.md` revision 5) or `design/DECISIONS.md`, a security problem, or something that would make CI red or flaky. Everything else goes under Optional.

You may run read-only commands: `node tools/build.mjs --check`, `node --test tests/*.test.mjs`, `node tools/sync.mjs --check`, `git diff`, `git log`, `git show`, and reading files. Do not run the e2e script or the load check, and do not install anything.

Output:

## Verdict
Exactly `CONSENSUS` or `REVISE`.

## Earlier Claude findings
One line per blocking item from rounds 12 and 13.

## Blocking
Numbered items. Each: file and line, the problem, a concrete fix.

## Optional
Non-blocking suggestions.

Be terse and concrete. No em dashes.
