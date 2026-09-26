Round 19. Adversarial review of one fix commit. You are read-only. Do not modify files.

After 0.3.0 was merged and installed, the doctor reported two uninstalled mirror plugins as installed under Claude Code, because Claude Code keeps cache folders for plugins that are not installed. `git show HEAD` makes the doctor read Claude Code's `plugins/installed_plugins.json` instead, keeps the cache check for Codex, adds two tests, and raises `adhd-unslop` to 0.3.1. The installed record on this machine looks like `{"version": 2, "plugins": {"adhd-unslop@adhd-unslop": [{"scope": "user", "installPath": "...", "version": "0.3.0", ...}]}}`.

Review only that commit, with the brief in `design/round-12-prompt.md`. Is the fix correct for both runtimes, and for a missing or malformed record? Anything wrong in a way that matters?

Read-only commands only: `node tools/build.mjs --check`, `git show`, and reading files.

Output:

## Verdict
Exactly `CONSENSUS` or `REVISE`.

## Blocking
Numbered items, or None.

## Optional
Non-blocking suggestions, or None.

Be terse. No em dashes.
