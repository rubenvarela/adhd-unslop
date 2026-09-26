## Verdict

REVISE

## Blocking

1. P1: “the build copies the text in” has no reference contract. C2 proves a relative file can be read, not that copies stay byte-accurate, omit frontmatter consistently, or trigger version bumps. Define generated reference contents and paths, test them against pinned bodies, and make `sync.mjs` bump every plugin with `references`, including future `presentation`.

2. P3: “The matcher becomes `startup|clear|compact`” relies on untested `clear` and `compact` behavior. Both result files explicitly leave them untested. Add real-CLI tests in both runtimes that prove one complete bundle arrives on each source before freezing this matcher.

3. P3: “any value under Claude Code's 10,000-character cap fits” overstates C6. Non-ASCII output was not tested, and shipped unslop text contains `→`. Test the built chunks with the default Codex limit and end markers, including non-ASCII, before removing `additionalContextLimit`.

4. P6: “The build deletes [stray files].” A normal build must not delete arbitrary untracked files under `plugins/`. Make `--check` fail on orphans, make normal build write expected files only, and require an explicit `--prune` for deletion.

5. P7: “The Codex marketplace drops `policy.products`.” This expands distribution from Codex to ChatGPT and Atlas. The stated scope is Claude Code and Codex. Keep `products: ["CODEX"]` unless the user explicitly approves those additional products.

6. P8: “installed versions of the three plugins” contradicts P1 and P10, which make `au-*` optional. The doctor must require only `adhd-unslop`; report `au-*` as independent optional installs, not WARN or FAIL when absent.

7. P8: “whether `config.toml` has trust entries” is not proven. C3 established trust-key behavior, but the results explicitly did not test trust recorded through `/hooks`. Do not make private `config.toml` layout a doctor verdict. Report installed hook definitions and direct the user to `/hooks` until that path is tested.

8. P9: Codex `initialize`, `plugin/list`, and `plugin/read` validate marketplace discovery, not the user install path. Add a clean-home `marketplace add` plus `plugin add` check, then assert that 0.3.0 installs only `adhd-unslop` and exposes its skill and hooks.

9. P9: The proposed tests do not cover P1, P2, or the hook migration. Extend E2E to prove both referenced upstream bodies are read, restored vendored frontmatter preserves typed invocation, and always-on arrives once after a 0.2.2 upgrade.

10. P10: The migration is not actionable. “can remove” is not a tested path. Document and test exact Claude and Codex update commands from 0.2.2 with flags on and old Codex trust present, then verify: new hook definitions require one re-trust, always-on resumes afterward, and pruning or removing `au-*` does not remove standalone installs.

## Do not build

1. P4 forced output styles. They override the user's selected style and create a Claude-only delivery path.

2. P5 per-session mode tracking. A hook on every prompt and another Codex trust entry do not justify fixing a recoverable edge case.

3. P8 checks for an upstream plugin's undocumented always-on flag or private trust-state schema. They will create false diagnostics.

4. Subagent injection. It triples the bundle cost per subagent without a stated need.

5. A separate Codex hooks file. L4 supports the shared file, and a second file adds drift and another trust migration.

## Missing

1. A formal generated-source schema for authored skills, references, hook sources, READMEs, licenses, and notices.

2. Updates to `README.md`, D4, D7, D9, D15 to D17, D21, and all tests that currently require dependencies and rewritten frontmatter.

3. A versioning rule for a future `presentation` plugin when i-have-adhd changes.

4. Defined `ADHD_UNSLOP_ALWAYS` semantics: accepted values, precedence over flag files, and behavior for invalid values.

## Optional

1. P1 and P2 are directionally justified. Claude dependency updates failed in real use, Codex has no dependencies, and byte-for-byte mirrors are simpler once `adhd-unslop` no longer loads them.

2. Keep both native manifests, explicit Codex hooks path, marketplace-entry version removal, orphan detection, pinned CLI checks, and a latest-CLI drift job after the install-path coverage is added.