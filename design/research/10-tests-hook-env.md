# Tests: hook environment and payload per runtime

Date: 2026-09-26. Claude Code 2.1.283, Codex 0.154.0 and 0.157.1. Throwaway homes, as
`AGENTS.md` requires. The Codex `auth.json` copy and `shell_snapshots/` were
deleted afterwards.

## Question

Round 7 asked to keep `resume` in the always-on matcher, because Codex can
resume a session with no copy after a compaction (`09`). Claude Code has no
such gap and duplicates the copy on every resume (`08` L1). If a hook can
tell the runtimes apart, the launcher can skip `resume` in Claude Code only,
with no change to the hook definitions.

## Method

A fixture plugin `envp` in a local marketplace with both native manifests.
Its SessionStart hook, matcher `startup|resume|clear|compact`, appends the
names of environment variables that match `PLUGIN`, `CODEX`, or `CLAUDE`, and
its stdin payload, to a log. Each runtime ran one session and one resume.

## Results

| Runtime | Variables the hook receives | Payload fields seen | Fired on |
| --- | --- | --- | --- |
| Claude Code | `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`, `CLAUDE_PROJECT_DIR`, `CLAUDE_ENV_FILE`, `CLAUDE_CONFIG_DIR` | `session_id`, `transcript_path` | startup, resume |
| Codex 0.154.0 and 0.157.1 | `PLUGIN_ROOT`, `PLUGIN_DATA`, `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`, `CODEX_HOME` | `session_id`, `transcript_path` | startup, resume |

Other `CLAUDE_CODE_*` variables in both logs came from the parent shell,
because the test ran inside a Claude Code session.

## Conclusions

- `PLUGIN_ROOT` is set by Codex and never by Claude Code. The launcher can
  treat its presence as Codex, and its absence with `CLAUDE_PLUGIN_ROOT` set
  as Claude Code.
- Both runtimes send `session_id` and `transcript_path`. `source` values
  were confirmed in `07` C4, `08` L1, and `09`.
- A launcher that skips `source: "resume"` in Claude Code keeps `hooks.json`
  unchanged, so Codex trust recorded for 0.2.2 stays valid (`07` C3: trust
  follows the hooks file path, handler position, and handler fields).
