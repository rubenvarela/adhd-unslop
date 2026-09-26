Round 12. Adversarial review of the implementation, not the design. You are read-only. Do not modify files.

The design is `design/STRUCTURE-v2.md` revision 5, accepted in round 11. The implementation is on the current branch. Review `git diff fc308bd HEAD` (fc308bd is 0.2.2 on main), excluding generated files under `plugins/` except where a generated file reveals a build bug. Focus on:

- `tools/build.mjs`, `tools/sync.mjs`, `tools/load-check.mjs`, `tools/version-gate.mjs`, `tools/plugins.json`, `tools/cli-versions.json`
- `src/adhd-unslop/hooks/` (launcher, library, hooks.json), `src/adhd-unslop/skills/` (template, doctor skill and script), `src/adhd-unslop/overlay/`
- `.github/workflows/*.yml`, `.github/dependabot.yml`, `.gitattributes`
- `tests/*.test.mjs`, `tests/fixtures/`, `tests/e2e/` (another agent may still be adding a compaction case to `tests/e2e/`; review what is there)
- `README.md`, `AGENTS.md`, `NOTICE.md`, `design/DECISIONS.md` for claims that the code does not match

You may run read-only commands: `node tools/build.mjs --check`, `node --test tests/*.test.mjs`, `node tools/sync.mjs --check`, `git diff`, `git log`, and reading files. Do not run the e2e script or the load check, and do not install anything.

Look for:

1. Bugs: wrong behavior, edge cases (empty stdin, TTY stdin, Windows paths, missing files, malformed JSON, unicode, CRLF), races between the three hook handlers, exit codes, a hook that could block or fail a session.
2. Places the code contradicts the accepted design or DECISIONS.
3. Security: workflow permissions, token exposure, script injection in workflows, anything that runs untrusted input with write access, secrets in logs, the doctor or launcher reading or printing sensitive data.
4. Maintainability: dead code, duplicated logic, unclear names, tests that do not test what they claim, missing tests for new behavior.
5. Anything that would make CI red or flaky on ubuntu-latest.

Output:

## Verdict
Exactly `CONSENSUS` or `REVISE`.

## Blocking
Numbered items. Each: file and line, the problem, a concrete fix.

## Optional
Non-blocking suggestions.

Be terse and concrete. No em dashes.
