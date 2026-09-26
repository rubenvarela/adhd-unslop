## Verdict

REVISE

Scope: `git diff fc308bd HEAD`. HEAD moved from 3df5374 to b7f2896 during the review. b7f2896 touches only `tests/e2e/` and `design/research/11-tests-e2e.md`, which another agent owns, so I did not re-review `tests/e2e/`. On HEAD, `node tools/build.mjs --check`, `node tools/sync.mjs --check`, and `node --test tests/*.test.mjs` all pass (131 pass, 1 skip). Every experiment ran in a scratch clone.

## First-pass items

- Blocking 1, the prune test on the live tree: resolved. In a scratch clone I added `plugins/adhd-unslop/skills/doctor/scripts/my-wip-helper.mjs`. `node --test tests/build.test.mjs` failed two tests and left the file in place.
- Blocking 2, a link into a plugin cache: resolved. In a scratch home with a Codex cache copy, I linked to `skills/adhd-unslop`, `skills/doctor/scripts`, the plugin root, and `au-unslop/.../skills/unslop`. Each link gave a WARN naming `adhd-unslop:adhd-unslop`, `adhd-unslop:doctor`, or `au-unslop:unslop`.
- Blocking 3, CRLF: resolved for git storage, `userOnly`, and templates. I wrote a CRLF `upstream/unslop/SKILL.md` and its pin by hand, then built, committed, and re-cloned. `build.mjs --check` passed, `cmp` found the mirror identical, and `git ls-files --eol` showed `i/crlf attr/-text`. The real `sync.mjs` path never gets that far. See Blocking 1.
- Optional, the CRLF template directive: resolved, with unit cases for a CRLF directive and for an unknown `{{` line. The new test regex is a regression. See Blocking 2.
- Optional, `features = { hooks = false }`: resolved. Five inline and quoted forms each gave a WARN.
- Optional, the reinstall fix with trailing prose: resolved. The command is on `fix:` and "start a new session" is on `then:`. One problem remains for an unknown runtime, listed under Optional.
- Optional, the doctor home source: resolved. The doctor and the launcher both use `os.homedir()`.
- Optional, the DECISIONS local directory row: reworded to match `load-check.mjs`. The new clause is not verified. See Optional.
- Optional, the run.sh "5,000-token" wording: skipped as instructed. b7f2896 changed it to 20,000 characters.
- Optional, the `sync.mjs` comment: resolved.
- Optional, the `20-lifecycle.md` resume wording: resolved. `adhd-unslop` is at 0.3.0, against 0.2.2 on main, and `version-gate.mjs --base fc308bd` passes in a scratch clone.
- Optional, the cli-drift version check: resolved. It rejects an empty Claude Code version, an empty Codex version, both empty, and a prerelease. It accepts two numeric versions. The unused `outcome` output is gone.
- `tests/e2e/codex-thread.mjs`: now committed in b7f2896. Another agent owns it, so I did not re-review it.

## Blocking

1. `tools/sync.mjs:61-68` (`listNumbers`), which `CITATION_KINDS` uses at lines 74, 75, and 77. It searches for `\n${heading}\n`, so on a CRLF body the exception, check, and process lists come back empty. A CRLF upstream never reaches the storage fix from item 3. `bump()` refuses it at the citation gate and names the wrong cause.
   - Proof, the parser: with the pinned bodies, `unslop process` returns `[1,2]` for LF and `[]` for CRLF. `ADHD exception` returns 6 items for LF and 0 for CRLF. `ADHD check` returns 5 and 0.
   - Proof, the bump: I called `bump("unslop", <sha>, { fetched })` with the pinned SKILL.md converted to CRLF. It printed "refusing to bump unslop: the overlay cites unslop process 1, which no longer exists upstream". The issue report then says the usual cause is an upstream change to a cited rule, which is wrong here.
   - With a CRLF upstream committed by hand, three unit tests in the overlay and citation-gate suites fail for the same reason.
   - The first pass rated this kind of break to the unattended bump as blocking in item 3. Here it happens one step earlier.
   - Fix: normalize line endings in the shared readers, so the bump and the tests both get the fix. For example, run `body = body.replace(/\r\n/g, "\n")` at the top of `listNumbers` and of each `numbers` function, or once in `citationReport` and `ruleNumbers`. Add a CRLF case to the `citationReport` tests in `tests/sync.test.mjs`.

2. `tests/build.test.mjs:87-92`, a regression from 3df5374. The test now matches `/^\{\{/m` in every generated `.md` file, including the verbatim upstream text in the mirrors and in chunks 2 and 3. So a legitimate upstream line that starts with `{{` fails it. `bump()` runs the whole suite (`sync.mjs:167-170`) and rolls back on failure. D2 forbids editing upstream text, so only a test change can unblock the bump.
   - Proof: in a scratch clone I called `bump("unslop", <sha>, { fetched })` with the pinned SKILL.md plus a fenced block holding `{{first_name}}, thanks for your order.`. The build and `--check` passed. Then `no template syntax survives the build` failed, and the result was "bump of unslop failed and was rolled back". The old regex, `^\{\{include `, would not have matched that line.
   - Fix: `renderTemplate` already throws on an unknown `{{` template line at build time, so the test only needs to catch leftover directives. Either check only the outputs of `.tmpl` files, with the text between each BEGIN and END upstream marker removed, or match `^\{\{(include|upstream) ` instead of `^\{\{`.

## Optional

- `tests/build.test.mjs:43-57`. The prune test copies the live generated folders, so a person's stray file also fails it: `actual` listed `my-wip-helper.mjs` too. The test has no `try/finally`, so it leaks its temp dir when it fails. Write the copy from `expectedFiles()` instead of using `cpSync`, and remove the dir in `finally` or `t.after`.
- `tests/helpers.mjs:12-25` and `tests/doctor.test.mjs:16-23`. `tempPlugin`, `tempConfigDirs`, and `tempDirs` never clean up. One `node --test tests/*.test.mjs` run left 48 dirs (13 `cfg`, 32 `doctor`, 3 `plugin`), and this machine's TMPDIR holds over 900. This is harmless on CI. Register an `after` cleanup.
- `src/adhd-unslop/skills/doctor/scripts/doctor.mjs:134-138`. For an unknown runtime, the `fix:` line is the relative command `node tools/build.mjs`, and the condition "run that in a checkout of this repo" comes after it, on `then:`. The doctor skill runs a `fix:` command once the user says yes, from whatever the working directory is. When `<root>/../../tools/build.mjs` exists, print its absolute path. Otherwise make the reinstall instruction the fix.
- `doctor.mjs:307-308`. An entry named `adhd-unslop` that is not a link into our plugins gets a WARN saying it "creates a duplicate adhd-unslop:adhd-unslop skill name". That includes a dangling link, which creates no skill (see the dangling-link test in `tests/doctor.test.mjs`). D20 covers only links into a plugin. Word it as a possible clash with the `adhd-unslop` skill.
- `design/DECISIONS.md:543`. The new clause "so edits there show at the next session" is in the verified platform facts table, but no run in `design/research/` edited a source after a local install. Claim 1 in `research/05` is still open, and `research/08` installed from git only. Drop the clause or mark it untested. D29 at line 525 could also say that generated files are now stored byte for byte.
