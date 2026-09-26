# Notice

This marketplace ships two upstream works. The `au-i-have-adhd` and
`au-unslop` plugins each carry one upstream `SKILL.md` with its body
unchanged and its frontmatter rewritten. The always-on hook of `adhd-unslop`
embeds both bodies, unchanged after removing their YAML frontmatter. Each
plugin ships the MIT license texts it needs, and `upstream/<name>/LICENSE`
holds the originals. Pinned commits live in `tools/upstream.json`.

| Upstream | Author | Repository | File | Shipped in |
| --- | --- | --- | --- | --- |
| i-have-adhd | Ayoub Ghriss | https://github.com/ayghri/i-have-adhd | skills/i-have-adhd/SKILL.md | `au-i-have-adhd`, `adhd-unslop` hook |
| unslop (pstack-claude) | Michael Denyer's port of Lauren Tan's pstack | https://github.com/michael-denyer/pstack-claude | plugins/pstack/skills/unslop/SKILL.md | `au-unslop`, `adhd-unslop` hook |

The overlay text in `src/`, the tooling in `tools/` and
`plugins/adhd-unslop/hooks/`, and the tests are original to this repository
and are MIT licensed (see `LICENSE`).
