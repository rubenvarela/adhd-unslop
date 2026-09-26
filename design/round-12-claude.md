## Verdict

REVISE

## Blocking

1. `tests/build.test.mjs:41-53`, caused by `tools/build.mjs:337-379`. The stray test runs the real `prune()` on the live working tree. `strayFiles()` and `prune()` walk the module-level `repo`, so the test deletes every stray under `plugins/`, `.claude-plugin/`, and `.agents/plugins/`, not only its own file. It deletes first and asserts after, so the file is gone even when the test fails.
   - Proof: in a scratch copy of the repo I created `plugins/adhd-unslop/skills/doctor/scripts/my-wip-helper.mjs` and ran `node --test tests/build.test.mjs`. The test failed with `actual: [ '.../stray-test-file.md', '.../my-wip-helper.mjs' ]`, and `my-wip-helper.mjs` no longer existed.
   - This contradicts D10 ("a normal build must not remove files a person put there by mistake", "Only `build.mjs --prune` deletes such files") and AGENTS.md. It runs on every `node --test tests/*.test.mjs`, which is the documented edit loop, and inside `sync.mjs` `buildAndTest()`. The round prompt lists that command as read-only, but it writes a file under `plugins/` and prunes the live tree. My runs of it here deleted nothing only because `build.mjs --check` had just reported no strays.
   - Supporting evidence: `node --test` runs test files in parallel, and `hook.test.mjs` (`tempPlugin`) and `doctor.test.mjs` (`copyPlugins`) `cpSync` the same `plugins/adhd-unslop/skills` tree. I ran a tight loop that wrote the stray and called `prune()`, against a concurrent `cpSync` loop. It produced ENOENT on 340 of 3,477 copies. The loop was adversarial. In a real run the window is a few milliseconds, so this is a rare CI flake, not a steady failure.
   - Fix: add a `root` parameter, defaulting to `repo`, to `strayFiles(expected, root)` and `prune(expected, root)`. Have the test copy the three generated roots into a temp dir, add the stray there, and call `prune(expectedFiles(), tmp)`. No test should call `prune()` on the live tree.

2. `src/adhd-unslop/skills/doctor/scripts/doctor.mjs:252-269`. `linksIntoThisRepo` only flags a link whose target sits under a marketplace root named `adhd-unslop`. A link into the installed plugin cache passes as clean.
   - Why it matters: D20 says Codex names a linked skill after the plugin that contains the target. A link to `~/.codex/plugins/cache/adhd-unslop/adhd-unslop/<version>/skills/adhd-unslop` is therefore the same duplicate, and it is a plausible link for a user to make.
   - Proof: I put a Codex cache copy at `$H/.codex/plugins/cache/adhd-unslop/adhd-unslop/0.3.0` and ran `ln -s <that>/skills/adhd-unslop $H/.agents/skills/adhd`. Then `env -i PATH=$PATH HOME=$H node <cache>/skills/doctor/scripts/doctor.mjs` printed `OK   no .../.agents/skills entry clashes with the adhd-unslop skills` and exited 0.
   - Fix, detection: while walking up from the target, also return a match at any directory whose `.codex-plugin/plugin.json` or `.claude-plugin/plugin.json` has a `name` from this marketplace. Add a doctor test for a link into a cache-layout copy.
   - Fix, message: the WARN at line 290 always says "a duplicate adhd-unslop skill name". A link into `plugins/au-unslop/skills/unslop` duplicates `au-unslop:unslop`, so the WARN should name the plugin whose manifest was found.

3. `.gitattributes:1,4` and `tools/build.mjs:70-73`. This is latent: it triggers only if an upstream ever ships CRLF. It still breaks the unattended daily bump and P2's byte-for-byte promise, in a file this diff adds.
   - Cause: `upstream/** -text` keeps CRLF in `upstream/`, but `* text=auto eol=lf` normalizes the build's copies under `plugins/**` to LF at `git add`.
   - How it breaks the bump:
     1. `sync.mjs --latest` writes the CRLF files into `upstream/`.
     2. The build writes the same bytes into `plugins/au-*/skills/*/SKILL.md` and into chunk 2 or 3. `manifest.json` gets the hashes of the CRLF text.
     3. `create-pull-request` stages the files, and git stores the `plugins/` copies as LF.
     4. The dispatched `verify.yml` checkout fails `build.mjs --check` on the mirror, the chunk, and the skill. The mirror is no longer byte for byte.
   - Proof: I made a scratch repo with this `.gitattributes`, a CRLF `upstream/x/SKILL.md`, and an identical `plugins/au-x/skills/x/SKILL.md`. After a commit and a clone, `cmp` reports `differ: char 4, line 1`: the upstream copy starts `---\r\n` and the plugin copy starts `---\n`.
   - A second CRLF bug: `userOnly` matches `^---\n`, so it returns false for `"---\r\nname: x\r\ndisable-model-invocation: true\r\n---\r\nbody\r\n"` (checked). That would flip a user-only upstream to `allow_implicit_invocation: true` in Codex. `stripFrontmatter` (`src/adhd-unslop/hooks/lib.mjs:26`) already accepts `\r?\n`.
   - Fix, `.gitattributes`: mark the generated roots `-text` (`plugins/** -text linguist-generated=true`, and the same for both marketplace files), so git stores the bytes the build wrote.
   - Fix, `userOnly`: use `\r?\n` in its regex and in the tests' `frontmatterOf`, and add a CRLF unit case.

## Optional

- `tools/build.mjs:89-103` and `tests/build.test.mjs:85`. With CRLF, `templateUpstreams` still finds `{{upstream unslop}}\r`, because its `m` flag lets `$` match before `\r`. `renderTemplate` does not replace that line. So the directive check passes and the literal directive ships (checked). The "no template syntax survives" test only looks for `{{include`. Strip a trailing `\r` per line, or throw on any leftover `{{` line, and test both directives. A CRLF working copy is needed to reach this, and the skill-equals-bundle test would still fail.
- `doctor.mjs:221-247`. With `features = { hooks = false }` (TOML inline table), the doctor prints `OK   Codex hooks feature on (default)` (checked in a scratch home). Either parse that form or say "not set under [features]" instead of "on".
- `doctor.mjs:128-131`. The reinstall fix reads `... && claude plugin install adhd-unslop@adhd-unslop, then start a new session`. The doctor skill tells the model to show each fix and then run it. Run literally, the trailing prose becomes extra arguments. Keep the command and the prose apart.
- `doctor.mjs:22` uses `env.HOME || os.homedir()`, but the launcher's `flagPaths()` (`lib.mjs:30`) uses `os.homedir()`. They agree on POSIX. On Windows under Git Bash, `HOME` and `USERPROFILE` can differ, so the doctor could report flag files the hook never reads. Not proven here. Use one home source for both.
- `design/DECISIONS.md:541` says a Claude Code local directory marketplace "loads in place". `tools/load-check.mjs:294-295` asserts that `installPath` is `<config>/plugins/cache/<mkt>/<plugin>/<version>`, and `research/05` recorded a local-path install that copied into the cache on 2.1.283. Make the row and D21's "Why a git source" reason match what the load check asserts.
- `tests/e2e/run.sh:283` says "5,000-token re-attach budget". The README, D9, and `tests/build.test.mjs:235-242` say 20,000 characters. Use one unit.
- `tools/sync.mjs:150-151`. The comment still says "any skill that lists it in references", from revision 4. The field is `upstreams`.
- `src/adhd-unslop/overlay/20-lifecycle.md:32` ships "The always-on hook also runs on resume and compact to restore these instructions" to the model. In Claude Code the launcher now prints nothing on resume. Reword it to "on compact, and on resume in Codex". This is an overlay change, so the version must rise.
- `.github/workflows/cli-drift.yml:157`. `case "$CLAUDE$CODEX"` accepts one empty value if the other is not empty, and would then write `"claude-code": ""`. Check each variable on its own. The risk is low, because a broken CLI should fail the load check first. `outputs.outcome` at line 30 is unused.
- I checked `tests/e2e/codex-thread.mjs`, which is untracked and still being written. It strips the API keys, kills `app-server` in `finally`, and a failed request or `systemError` gives exit 1. No finding.
