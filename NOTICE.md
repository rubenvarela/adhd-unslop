# Notice

This marketplace ships two upstream works.

- The `au-i-have-adhd` and `au-unslop` plugins each carry one upstream
  `SKILL.md`, unchanged.
- The `adhd-unslop` plugin carries both upstream bodies, unchanged after
  removing their YAML frontmatter, in its skill and in its always-on hook
  chunks.

Each plugin ships the MIT license texts it needs in `LICENSES/` and lists
them in its `NOTICE.md`. `upstream/<name>/LICENSE` holds the originals.
Pinned commits live in `tools/upstream.json`.

| Upstream | Author | Repository | File | Shipped in |
| --- | --- | --- | --- | --- |
| i-have-adhd | Ayoub Ghriss | https://github.com/ayghri/i-have-adhd | skills/i-have-adhd/SKILL.md | `au-i-have-adhd`, `adhd-unslop` |
| unslop (pstack-claude) | Michael Denyer's port of Lauren Tan's pstack | https://github.com/michael-denyer/pstack-claude | plugins/pstack/skills/unslop/SKILL.md | `au-unslop`, `adhd-unslop` |

The overlay text and sources in `src/`, the tooling in `tools/`, and the
tests are original to this repository and are MIT licensed (see `LICENSE`).
