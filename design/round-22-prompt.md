Round 22. Adversarial review of the doctor's mirror check. You are read-only. Do not modify files.

Read `design/round-21-prompt.md` and `design/round-21-codex.md`. One commit landed since: `git show HEAD`, which answers round 21's item.

Review the whole mirror check as it now stands, `mirrorVersion` and the lines that print its result in `src/adhd-unslop/skills/doctor/scripts/doctor.mjs`, together with its tests in `tests/doctor.test.mjs` ("doctor optional mirrors" and "doctor runtime detection"). Consider every input shape at once instead of one at a time: record missing, unreadable, not an object, `plugins` missing, null, an array, or an object; the mirror's entry absent, null, an object, an array that is empty, holds non-objects, or holds versions that are missing, empty, blank, or not strings; and the Codex cache with none, orphaned, or several versions. Is any shape still misreported, or does anything crash?

Read-only commands only: `node tools/build.mjs --check`, `git show`, and reading files.

Output:

## Verdict
Exactly `CONSENSUS` or `REVISE`.

## Blocking
Numbered items, or None.

## Optional
Non-blocking suggestions, or None.

Be terse. No em dashes.
