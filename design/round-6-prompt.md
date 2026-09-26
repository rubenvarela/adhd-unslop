Round 6. Adversarial review of a restructure proposal. You are read-only. Do not modify files.

Context: this repo is a Claude Code and Codex plugin marketplace. It ships `adhd-unslop`, which combines two vendored third-party skills (i-have-adhd and unslop) with one tie-breaker, plus two vendored mirror plugins, `au-i-have-adhd` and `au-unslop`. Read, in this order:

1. `design/STRUCTURE-v2.md` in full. This is the proposal under review.
2. `design/DECISIONS.md`, the current decisions D1 to D21.
3. `design/research/00-synthesis.md`, then the "Implications" and "Claims to test" sections of `design/research/01` to `06`, and the result tables of `design/research/07-tests-codex.md` and `08-tests-claude.md`. These are real-CLI test results on Claude Code 2.1.283 and Codex 0.154.0 and 0.157.1.
4. The current code as needed: `tools/build.mjs`, `tools/sync.mjs`, `tools/plugins.json`, `plugins/adhd-unslop/hooks/`, `src/adhd-unslop/overlay/`, `.github/workflows/`, `tests/`.

The user's goals: a clean marketplace, clean skills, easy to maintain, supported by documented behavior, a proven structure that popular repos use, easy to extend (a `presentation` plugin that reuses i-have-adhd is planned), and GitHub Actions automation that keeps it working, clean, and current. The user wants consensus from an adversarial review before anything is built.

The proposal reverses two earlier user choices: plugin `dependencies` (P1) and rewritten frontmatter on the vendored skills (P2). Judge whether the evidence justifies that.

Your job, as an adversarial reviewer who would have to build and maintain this:

1. Challenge each decision P1 to P10. Look for claims the evidence does not support, behavior that would break for a user, missing migration steps, and anything that contradicts the tests or the docs.
2. Say what we should NOT build: anything in the proposal that adds maintenance cost without enough benefit.
3. Say what is missing that the goals require.
4. Check the migration path for a user who has 0.2.2 installed in both runtimes today, with always-on on and Codex hooks trusted.

Output:

## Verdict
Exactly `CONSENSUS` or `REVISE`.

## Blocking
Numbered items. Each: the claim or line, why it is wrong or risky, the exact change.

## Do not build
Numbered items with reasons.

## Missing
Numbered items.

## Optional
Non-blocking suggestions.

Be terse and concrete. Quote lines. No em dashes.
