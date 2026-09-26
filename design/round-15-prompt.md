Round 15. Adversarial review of the implementation, second Codex pass. You are read-only. Do not modify files.

Read `design/round-14-prompt.md` and `design/round-14-codex.md`. The brief in `design/round-12-prompt.md` still applies. Since round 14, these commits landed: `git log --oneline cae9385~1..HEAD`. They fix round 14's items, add Codex usage defaults and a usage gate (`tools/codex-usage.mjs`, `design/run-codex.sh`, DECISIONS D30, AGENTS.md "Codex usage"), make every tool run through a symlinked checkout, and move the e2e app-server helpers to one client (`tests/e2e/app-server.mjs`).

Your job:

1. For each round 14 blocking item, say in one line whether HEAD resolves it.
2. Review the commits since round 14 with the round 12 brief.
3. Do a final read of `git diff fc308bd HEAD` as the maintainer who will own this. Raise a blocking item only for a real bug, a contradiction with `design/STRUCTURE-v2.md` revision 5 or `design/DECISIONS.md`, a security problem, or something that would make CI red or flaky. Everything else goes under Optional.

Read-only commands only: `node tools/build.mjs --check`, `node tools/sync.mjs --check`, `git diff`, `git log`, `git show`, and reading files. The unit tests need temp dirs, which this sandbox refuses, so do not run them.

Output:

## Verdict
Exactly `CONSENSUS` or `REVISE`.

## Round 14 items
One line per blocking item.

## Blocking
Numbered items. Each: file and line, the problem, a concrete fix.

## Optional
Non-blocking suggestions.

Be terse and concrete. No em dashes.
