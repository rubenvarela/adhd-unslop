## Verdict

REVISE

## Round 6 items

1. Resolved. P1 defines generated reference paths, bytes, tests, and bump propagation.
2. Resolved. Research 09 proves `clear` and normal `compact` delivery in both runtimes.
3. Resolved. P3 retains `additionalContextLimit: 5000`.
4. Resolved. Only `--prune` deletes orphans.
5. Resolved. P7 keeps `products: ["CODEX"]`.
6. Resolved. P8 makes `au-*` optional with no WARN or FAIL when absent.
7. Resolved. P8 reports hook definitions and sends users to `/hooks`.
8. Resolved. P9 exercises marketplace add, plugin add, and installed-cache assertions.
9. Resolved. P10 adds reference, frontmatter, always-on, and upgrade coverage.
10. Not resolved. P10 does not require an old Codex trust record, prove one re-trust, or prove the Codex update preserves independently installed `au-*` plugins.

## Blocking

1. P3: “A user who compacts and quits ... resumes later with no copy.” This makes always-on silently disappear after a normal Codex `/compact`, exit, and resume. README recovery instructions do not restore the promised automatic behavior. Keep `resume` in the matcher until Codex exposes durable compact state, and add X7 to E2E.

2. P10: “checks ... hook definitions changed once.” A changed definition is not proof that an old trusted handler is rejected and one `/hooks` review restores it. The only retention test is `claude plugin prune`. Seed 0.2.2 Codex trust, assert upgraded hooks do not run until re-trusted, assert they run after one review and remain trusted on restart, and assert a manually installed `au-*` remains after the advertised Codex update commands.

## Optional

- Update the generated chunk footer. Its current “remove every opt-in flag” instruction conflicts with `ADHD_UNSLOP_ALWAYS=1` and `=off`. Add unit cases for both overrides.
- Test typed `au-unslop:unslop` too, not only `au-i-have-adhd:i-have-adhd`.