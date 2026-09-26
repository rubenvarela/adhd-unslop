## Verdict

REVISE

## Round 7 items

1. Resolved. P3 keeps `resume`; only Claude skips it, while Codex reinjects after the compact-then-quit gap.
2. Resolved. The three trusted handlers keep their fields and positions. P10 seeds 0.2.2 trust, verifies trusted delivery without bypass, and retains a separately installed `au-unslop`.

## Blocking

1. P9: "`install adhd-unslop@adhd-unslop`" then "`asserting full skill names, hook keys, and versions for all three plugins`." P9 also asserts that only `adhd-unslop` installs. The optional `au-*` plugins have no prescribed Codex install before the all-three assertion. Make the self-contained check assert only `adhd-unslop`; add a separate explicit install of both `au-*` plugins before asserting all three.

## Optional

- Test `PLUGIN_ROOT` detection on Codex 0.157.1 too, not only 0.154.0.
- Add unit cases for `ADHD_UNSLOP_ALWAYS=off` and `=on`, including the revised footer.