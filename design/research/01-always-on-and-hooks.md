# Always-on context and hooks shared between Claude Code and Codex

Research date: 2026-09-26. Local CLIs: Claude Code 2.1.283 and Codex CLI
0.154.0. Each repo was shallow-cloned at its default branch:

| Repo | Commit | Date |
| --- | --- | --- |
| obra/superpowers | 8ca22db | 2026-09-25 |
| DietrichGebert/ponytail | e3ba2aa | 2026-09-14 |
| JuliusBrussee/caveman | 2fd153c | 2026-09-22 |
| affaan-m/everything-claude-code (ECC) | e482e57 | 2026-09-24 |
| OthmanAdi/planning-with-files (pwf) | 4d24d9a | 2026-09-25 |
| thedotmack/claude-mem | abeb0db | 2026-09-26 |

Paths below are relative to each repo root and prefixed with the repo name.
No install script was run. Two measurements ran the repos' own instruction
builders in Node to get injected sizes, and one ran `claude plugin validate`
on our plugin in a throwaway `CLAUDE_CONFIG_DIR`.

## Our baseline

`adhd-unslop` has one `hooks/hooks.json` that both runtimes load. Claude Code
auto-loads it. Codex finds it through its default-path fallback, because
`plugins/adhd-unslop/.codex-plugin/plugin.json` has no `hooks` key. One
matcher group, `startup|resume|clear|compact`, runs three `always-on.mjs`
handlers. Each prints one chunk as plain stdout when a flag file exists.
Each handler sets `additionalContextLimit: 5000`. A second group,
`startup|resume`, runs `check-deps.mjs`, which prints JSON with both
`systemMessage` and `hookSpecificOutput.additionalContext`. Rendered chunk
sizes today are 8,721, 8,038, and 8,011 characters: 24,770 in total, or
about 2,181, 2,010, and 2,003 tokens at `ceil(chars / 4)`. Mode state lives
only in the conversation.

## Summary table

| Repo | SessionStart matcher | Output format | Size injected | What it injects | Codex route |
| --- | --- | --- | --- | --- | --- |
| superpowers | `startup\|clear\|compact` | JSON `hookSpecificOutput.additionalContext` | About 3,400 chars | Full text of a small bootstrap skill that tells the model to load other skills | No hook. Manifest sets `"hooks": {}` |
| ponytail | `startup\|resume\|clear\|compact` | Claude: plain stdout. Codex: JSON with `systemMessage` badge and `hookSpecificOutput` | 5,202 to 5,267 chars by mode | Full skill body, filtered to the active level | Same file as Claude, `hooks/claude-codex-hooks.json` |
| caveman | None, so every source | Plain stdout | 5,087 to 5,213 chars by mode, plus a one-time nudge | Full skill body, filtered to the active level | No plugin hook. A repo-local `.codex/hooks.json` echoes a short rule line |
| ECC | `.*` | JSON `hookSpecificOutput.additionalContext` | Dynamic, capped at 8,000 chars | Session memory, instincts, project type | Separate `hooks/codex-hooks.json` |
| pwf | `startup\|resume\|clear\|compact` | JSON `hookSpecificOutput.additionalContext` | Dynamic: plan head plus progress tail | Project plan files from disk | Separate `hooks/codex-hooks.json` |
| claude-mem | `startup\|resume\|clear\|compact` | JSON `hookSpecificOutput.additionalContext` | Dynamic, 50 observations by default | Memory timeline from a local worker | Separate `plugin/hooks/codex-hooks.json` |

No repo uses `additionalContextLimit` or splits one payload across several
handlers. Every repo that injects rules stays under about 8,000 characters
in a single handler. At about 24,800 characters in three handlers, we are
the outlier.

## 1. How each repo injects always-on context

### superpowers

- Event and matcher: one `SessionStart` group with matcher
  `startup|clear|compact`, one handler, `"async": false`
  (`superpowers/hooks/hooks.json`).
- The command is `"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd" session-start`.
  `superpowers/hooks/run-hook.cmd` is a polyglot file that runs bash on Unix
  and finds Git Bash on Windows.
- `superpowers/hooks/session-start` reads
  `superpowers/skills/using-superpowers/SKILL.md` (3,192 bytes) and wraps it in
  `<EXTREMELY_IMPORTANT>` tags with the line "Below is the full content of
  your 'superpowers:using-superpowers' skill - your introduction to using
  skills. For all other skills, use the 'Skill' tool". This is a pointer
  pattern. It injects one short skill in full, and that skill tells the
  model to load the rest on demand.
- Output: a JSON `hookSpecificOutput.additionalContext` for Claude Code,
  chosen by environment sniffing. The script warns: "Claude Code reads BOTH
  additional_context and hookSpecificOutput without deduplication, so we
  must emit only the field the current platform consumes."
- Resume: `superpowers/RELEASE-NOTES.md` v5.0.3 dropped `resume` because
  "the startup hook was re-injecting context on resumed sessions, which
  already have the context in their conversation history. The hook now
  fires only on `startup`, `clear`, and `compact`."
- Async: v4.3.0 changed `async: true` to `false`, because "When async, the
  hook could fail to complete before the model's first turn, meaning
  using-superpowers instructions weren't in context for the first message."
- Compaction: re-injects on `compact`. v6.1.0 trimmed the bootstrap
  because "its size is paid for constantly".

### ponytail

- Events: `SessionStart` with matcher `startup|resume|clear|compact`,
  `SubagentStart`, and `UserPromptSubmit`, all in
  `ponytail/hooks/claude-codex-hooks.json`. Every handler runs
  `node "${CLAUDE_PLUGIN_ROOT}/hooks/<script>.js"` with a 5-second timeout.
- `ponytail/hooks/ponytail-activate.js` reads `ponytail/skills/ponytail/SKILL.md`
  (6,637 bytes), strips frontmatter, and drops table rows and examples for
  levels other than the active one (`ponytail/hooks/ponytail-instructions.js`,
  `filterSkillBodyForMode`). The result is 5,202 to 5,267 characters. For a
  mode with its own skill, such as `review`, it emits one pointer line that
  names the skill instead.
- Output (`ponytail/hooks/ponytail-runtime.js`, `writeHookOutput`):
  - Claude: plain stdout for SessionStart. The comment says "Native Claude:
    SessionStart accepts raw stdout, but SubagentStart needs the
    hookSpecificOutput JSON form or the context is dropped."
  - Codex: `{"systemMessage": "PONYTAIL:<MODE>", "hookSpecificOutput": {...}}`.
    `ponytail/tests/hooks.test.js` asserts "Codex must not emit
    additionalContext at top level (#573)".
- Subagents: `ponytail/hooks/ponytail-subagent.js` exists because
  "SessionStart context is parent-thread only and never reaches subagents,
  so without this every Task-spawned agent runs ponytail-unaware (issue
  #252)."
- Compaction: the ruleset is re-injected on every source. The activate hook
  calls `getDefaultMode()` each time and does not read the payload's
  `source`, so a compaction resets a mid-session level change to the
  configured default. caveman fixed this same bug.

### caveman

- Claude hooks are inline in `caveman/.claude-plugin/plugin.json`:
  `SessionStart` with no matcher, and `UserPromptSubmit`. The command
  rewrites a `/c/` path prefix to `c:/` with `sed` before
  `node "$HOOK_ROOT/src/hooks/caveman-activate.js"`.
- `caveman/src/hooks/caveman-activate.js` injects the full skill body
  filtered to the active level: 5,087 to 5,213 characters from a 7,061-byte
  `SKILL.md`. The comment explains why the body is full: "models drifted
  back to verbose mid-conversation, especially after context compression
  pruned it away. Full rules with examples anchor behavior much more
  reliably."
- Output: plain stdout.
- Compaction: this is the most complete design of the six.
  - The hook parses the payload's `source`: "SessionStart re-fires
    mid-conversation (resume, /clear, context compaction), not just at true
    session start. Re-firing must not clobber a mode the user switched to
    mid-session (#691)".
  - `RESET_SOURCES` is `startup` and `clear`. Every other source, including
    `compact`, `resume`, `fork`, and an unknown one, reads the stored mode.
  - Mode state is per session, in
    `$CLAUDE_CONFIG_DIR/.caveman-sessions/<session_id>.mode`
    (`caveman/src/hooks/caveman-config.js`). The comment lists the bugs that
    one machine-wide file caused, starting with "parallel sessions shared a
    mode, SessionStart re-derived the default and clobbered an explicit
    "stop caveman" after every auto-compaction".
  - `off` is stored literally, so a compaction does not re-arm a session
    the user turned off.
  - A 2-second payload watchdog treats a late payload as source `unknown`,
    which does not reset.
- Codex:
  - `caveman/plugins/caveman/.codex-plugin/plugin.json` has no `hooks` key,
    and that plugin directory has no `hooks/` directory, so the Codex plugin
    ships no hook.
  - The only Codex hook is the repo-local `caveman/.codex/hooks.json`. Its
    matcher is `startup|resume`, and it echoes a one-line summary of the
    rules as plain text.
  - `caveman/INSTALL.md` lists Codex as "Per-session: `/caveman`". The agent
    matrix in `caveman/CLAUDE.md` says Codex auto-activates on macOS and
    Linux through that SessionStart hook. The two files contradict each
    other. The INSTALL.md row matches the shipped files.

### everything-claude-code (ECC)

- Claude: `everything-claude-code/hooks/hooks.json` has two `SessionStart` groups with matcher
  `.*`. The first runs `everything-claude-code/scripts/hooks/session-start-bootstrap.js`, which runs
  `everything-claude-code/scripts/hooks/session-start.js` through a profile gate
  (`run-with-flags.js`).
- Content: dynamic. It injects instincts, a prior-session summary on
  `startup` only, learned skills, and project type.
- Output: JSON `hookSpecificOutput.additionalContext`, written by
  `writeSessionStartPayload` in `everything-claude-code/scripts/hooks/session-start.js`.
- Size: capped at `DEFAULT_SESSION_START_CONTEXT_MAX_CHARS = 8000`. Over the
  cap, `limitSessionStartContext` cuts the text and appends "[SessionStart
  truncated context. Set ECC_SESSION_START_MAX_CHARS to raise the cap or
  ECC_SESSION_START_CONTEXT=off to disable injected context.]"
- Compaction:
  - The hook reads `source` from the payload and skips the prior-session
    summary for any source other than `startup`.
  - A `PreCompact` hook saves state before compaction.
  - A restored summary is wrapped with "HISTORICAL REFERENCE ONLY" so the
    model does not re-run stale commands.
- ECC moved the SessionStart bootstrap logic out of an inline `node -e`
  string and into a file, because characters like `!` "can trigger bash
  history expansion or other shell interpretation issues"
  (`everything-claude-code/scripts/hooks/session-start-bootstrap.js`). Its
  plugin-root resolver is still inline in both hooks files, and the Codex
  command still contains `if(!process.env.PLUGIN_ROOT)`. The lesson is
  minor, since history expansion needs an interactive shell.

### planning-with-files (pwf)

- Claude: `planning-with-files/hooks/hooks.json` registers `SessionStart` with matcher
  `startup|resume|clear|compact`, plus `UserPromptSubmit`, `PreToolUse`,
  `PostToolUse`, `PreCompact`, and `Stop`. Handlers use the exec form
  `"command": "sh", "args": ["${CLAUDE_PLUGIN_ROOT}/hooks/claude-hook.sh", "session-start"]`.
- Content: the active plan from disk, read by `planning-with-files/scripts/inject-plan.sh`. It
  takes the first 50 lines of the plan and the last 20 lines of progress.
  Each part is framed with a nonce and byte count
  (`planning-with-files/.codex/hooks/context_frame.py`, `MAX_BYTES` of 64 KiB for the plan and
  32 KiB for progress). It prints nothing when there is no plan.
- Output: JSON `hookSpecificOutput.additionalContext` on SessionStart
  (`planning-with-files/hooks/claude-hook.sh`, `emit_session_start`). `PreCompact` emits a
  `systemMessage` reminder to flush progress to disk.
- Compaction: the plan lives on disk, so after compaction the SessionStart
  hook on `compact` restores it. On the next turn, `UserPromptSubmit`
  re-injects it (`planning-with-files/docs/claude-code-lost-context-after-compaction.md`).

### claude-mem

- Claude: `claude-mem/plugin/hooks/hooks.json` registers `Setup`,
  `SessionStart` with matcher `startup|resume|clear|compact` (two handlers:
  start a worker, then fetch context), `UserPromptSubmit`, `PreToolUse`,
  `PostToolUse`, `Stop`, and `SessionEnd`. Only the context handlers are
  synchronous.
- Content: a timeline of observations from a local worker service. The
  default is 50 observations (`CLAUDE_MEM_CONTEXT_OBSERVATIONS: '50'` in
  `claude-mem/src/shared/SettingsDefaultsManager.ts`). There is no character cap in the
  hook.
- Output: JSON `hookSpecificOutput.additionalContext`, with an optional
  `systemMessage` for the terminal (`claude-mem/src/cli/handlers/context.ts`).
- Codex: `claude-mem/src/cli/adapters/codex.ts` maps the payload's `source` to
  `startup`, `resume`, or `clear` only, and rejects a payload with no
  `session_id`.

## 2. How one hook serves both runtimes

### File layout

| Pattern | Repos | Detail |
| --- | --- | --- |
| One file for both runtimes, explicit path | ponytail | Both manifests set `"hooks": "./hooks/claude-codex-hooks.json"`. The file is not at `hooks/hooks.json`, so Claude's auto-load does not also find it. |
| One file for both runtimes, default path | adhd-unslop | Claude auto-loads `hooks/hooks.json`. Codex reaches it through its fallback. |
| Separate files | ECC, pwf, claude-mem | `hooks/hooks.json` for Claude and `hooks/codex-hooks.json` for Codex. |
| Claude only | superpowers, caveman | superpowers suppresses the Codex fallback with `"hooks": {}`. caveman's Codex plugin has no `hooks/` directory. |

### The Codex manifest `hooks` key

- A string path relative to the plugin root:
  `"hooks": "./hooks/codex-hooks.json"` in `everything-claude-code/.codex-plugin/plugin.json`,
  `planning-with-files/.codex-plugin/plugin.json`, and
  `claude-mem/plugin/.codex-plugin/plugin.json`.
- An empty object: `"hooks": {}` in
  `superpowers/.codex-plugin/plugin.json`. v6.1.1 of
  `superpowers/RELEASE-NOTES.md` explains that "The Codex manifest now
  declares an explicit empty hooks object (`hooks: {}`), which Codex reads
  as "no hooks" instead of reaching the auto-discovery fallback. An absent
  field, `[]`, and an empty inline list all collapse back to the fallback,
  so the value has to be exactly `{}`."
- Absent: Codex falls back to the default path.
  `superpowers/tests/codex/test-marketplace-manifest.sh` says
  "load_plugin_hooks falls back to a hardcoded DEFAULT_HOOKS_CONFIG_FILE =
  "hooks/hooks.json" and registers it." Our Codex plugin loads its hooks
  this way today. The string `hooks/hooks.json` appears in the Codex 0.154.0
  binary.
- ECC's test (`everything-claude-code/tests/plugin-manifest.test.js`) requires the Claude
  manifest to have no `hooks` field, because Claude Code 2.1 and later
  auto-load `hooks/hooks.json`.

### Environment variables

- superpowers uses `${CLAUDE_PLUGIN_ROOT}` in the command. The script then
  derives its own root from `dirname "$0"`.
- ponytail uses `${CLAUDE_PLUGIN_ROOT}` in the shared file, so Codex must
  supply that name too. This matches our DECISIONS table: Codex sets both
  `PLUGIN_ROOT` and `CLAUDE_PLUGIN_ROOT`.
- ECC's Codex command asserts `PLUGIN_ROOT` and copies it into
  `CLAUDE_PLUGIN_ROOT`:
  `if(!process.env.PLUGIN_ROOT)throw new Error('Missing Codex PLUGIN_ROOT');process.env.CLAUDE_PLUGIN_ROOT=process.env.PLUGIN_ROOT;`.
  A test enforces that prefix: "Codex plugin hooks must pin
  Claude-compatible bootstrap resolution to Codex PLUGIN_ROOT".
- pwf uses `${PLUGIN_ROOT}` in `hooks/codex-hooks.json` and
  `${CLAUDE_PLUGIN_ROOT}` in `hooks/hooks.json`.
- claude-mem uses `${CLAUDE_PLUGIN_ROOT:-${PLUGIN_ROOT:-}}`, then falls back
  to scanning `~/.claude/plugins/cache/thedotmack/claude-mem/<version>/`,
  ranked by version, never by modification time. It sets
  `CLAUDE_MEM_CODEX_HOOK=1` on Codex commands.

### Runtime detection

- superpowers sniffs the environment in order: `CURSOR_PLUGIN_ROOT`, then
  `CLAUDE_PLUGIN_ROOT` without `COPILOT_CLI` or `MUSE_PLUGIN_ROOT`, then a
  default.
- ponytail uses `isCodex = !isCopilot && Boolean(process.env.PLUGIN_DATA)`
  (`ponytail/hooks/ponytail-runtime.js`). Claude Code sets
  `CLAUDE_PLUGIN_DATA`, but not `PLUGIN_DATA`.
- ECC, pwf, and claude-mem need no detection. Each runtime has its own
  hooks file, and the command passes the runtime explicitly. For example,
  claude-mem runs `hook codex context` for Codex and `hook claude-code
  context` for Claude.
- We detect the runtime by checking whether the plugin root sits inside
  `CODEX_HOME` or `CLAUDE_CONFIG_DIR` (`runtimeOf` in `hooks/lib.mjs`).

### What the Codex 0.154.0 binary shows

`strings` on `/opt/homebrew/Caskroom/codex/0.154.0/bin/codex` shows:

- `HookHandlerConfig::Command` has six fields: `command`, `commandWindows`,
  `timeout`, `async`, `statusMessage`, and `additionalContextLimit`.
- A warning reads "ignoring additionalContextLimit for ... hook in ...: this
  event cannot emit additionalContext". The key is honored only on events
  that can emit context.
- A message reads "running async ... hook synchronously in". This suggests
  0.154 runs `async` handlers synchronously. ECC's test, written for 0.146,
  says "Codex 0.146 skips async handlers".
- SessionStart source values appear as `startupresumeclearcompact`, next to
  the errors "hook returned invalid session start JSON output" and "hook
  returned invalid subagent start JSON output".
- A module `hooks/src/output_spill.rs` sits near the strings "Full hook
  output saved to:" and "Warning: truncated output (original token count:".
  This suggests Codex truncates oversized hook output and saves the full
  text to a file. It does not prove it.
- A warning reads "loading hooks from both ... ; prefer a single
  representation for this layer".

ECC's Codex key allowlist, `type`, `command`, and `timeout`, is from 0.146
(`everything-claude-code/scripts/ci/check-hooks-schema-keys.js`). The 0.154 binary accepts
more keys than that list.

## 3. Size caps

- No repo sets `additionalContextLimit`, and no repo chunks.
- The repos that inject rules keep them small. superpowers injects about
  3,400 characters, and ponytail and caveman about 5,200. Both ponytail and
  caveman drop the rows for inactive levels to get there.
- ECC truncates at 8,000 characters by default, below Claude's 10,000, and
  appends a marker that names the env vars to change.
- pwf bounds its payload by line count, 50 plan lines and 20 progress
  lines, and by byte caps of 64 KiB and 32 KiB. It does not measure against
  the 10,000-character cap.
- claude-mem has no character cap. It avoids doubling its payload on Codex:
  "Codex already receives the timeline through additionalContext. Repeating
  it as systemMessage can push SessionStart stdout past Codex's hook-output
  limit, causing Codex to discard the entire payload (including context)."
  (`claude-mem/src/cli/handlers/context.ts`). This implies two things: the
  Codex limit covers all of stdout, including `systemMessage`, and going
  over it loses the whole payload. The 0.154 strings in section 2 suggest
  truncation instead. See the claims to test.
- Our chunks are 8,011 to 8,721 characters, each about 2,000 to 2,200 tokens
  at `chars / 4`. If Codex's estimate is close to that, each chunk already
  fits under the default of about 2,500 tokens, and
  `additionalContextLimit: 5000` is a safety margin rather than a
  requirement. Chunk 1 has 1,279 characters of headroom under Claude's
  10,000 cap.

## 4. Opt-in and opt-out switches

| Repo | Default | Switches |
| --- | --- | --- |
| superpowers | Always on | None. `superpowers/docs/porting-to-a-new-harness.md` treats per-session opt-in as disqualifying: "If the only way to get Superpowers in front of the model is for your human partner to opt in each session (paste a prompt, run a command, enable a mode), the harness cannot be properly supported." |
| ponytail | On, level `full` | `PONYTAIL_DEFAULT_MODE=off\|lite\|full\|ultra`. `defaultMode` in `~/.config/ponytail/config.json`. `/ponytail default <mode>` persists the default. `stop ponytail` or `normal mode` turns it off for the session, and the `UserPromptSubmit` tracker records that in a state file. `PONYTAIL_SUBAGENT_MATCHER` scopes subagent injection by `agent_type`. `PONYTAIL_HIDE_STATUS` hides the badge, and `PONYTAIL_QUIET_STARTUP` hides the pi startup notice. |
| caveman | On, level `full` | `CAVEMAN_DEFAULT_MODE`. A repo-local `.caveman/config.json` or `.caveman.json`, found by walking up from the session's cwd, lets a team opt a project out. Then `~/.config/caveman/config.json`. Per-session state in `.caveman-sessions/`. |
| ECC | On | Claude `userConfig` keys `hooks_enabled` and `hook_profile` in `everything-claude-code/.claude-plugin/plugin.json`, read as `CLAUDE_PLUGIN_OPTION_HOOKS_ENABLED` and `CLAUDE_PLUGIN_OPTION_HOOK_PROFILE` (`everything-claude-code/scripts/lib/hook-flags.js`). An `ECC_*` env var of the same meaning wins over the plugin option: "Claude plugin options are used when their corresponding ECC variable is absent." Also `ECC_DISABLED_HOOKS`, `ECC_SESSION_START_CONTEXT=off`, and `ECC_SESSION_START_MAX_CHARS`. |
| pwf | On when a plan exists | `PLANNING_DISABLED=1` per invocation, added for one-shot sessions such as `codex exec` that share a cwd with a plan (issue #195). A session sees plan context only when `.planning/sessions/<key>.attached` exists. On Codex, `[features] hooks = false` turns every hook off. |
| claude-mem | On | `CLAUDE_MEM_EXCLUDED_PROJECTS` globs, and settings in `~/.claude-mem/settings.json`. |
| adhd-unslop | Off | A flag file in either config dir turns always-on on in both runtimes. |

The local `claude plugin install --help` confirms the Claude-side
mechanism: "--config <key=value> Set a userConfig option declared in the
plugin's manifest (repeatable)." ECC's setup script calls it that way:
`plugin install ... --config hooks_enabled=... --config hook_profile=...`
(`everything-claude-code/scripts/lib/claude-scope-migration.js`).

ponytail matches a switch phrase only when it is the whole message. The
comment in `ponytail/hooks/ponytail-config.js` explains why: "Matching the
phrase anywhere in the message turned it off mid-task for ordinary requests
like "add a normal mode toggle"".

## 5. Statusline, doctor, and health checks

- ponytail:
  - `ponytail/hooks/ponytail-statusline.sh` prints `[PONYTAIL]` or
    `[PONYTAIL:ULTRA]` from `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.ponytail-active`.
  - If no `statusLine` is configured, the SessionStart context tells the
    model once to offer setup. A marker file,
    `.ponytail-statusline-nudged`, prevents repeats.
  - The install path is embedded in the snippet only when it passes a
    character allowlist (`isShellSafe`).
  - On Codex, the `systemMessage` value `PONYTAIL:<MODE>` does the badge's
    job.
- caveman ships the same statusline design in
  `caveman/src/hooks/caveman-statusline.sh`, with a marker
  `.caveman-nudge-shown`. The comment gives the cost: "the nudge costs ~90
  tokens per session, so a marker file gates it to the first session only."
  When a sibling module is missing, caveman writes a short stderr note that
  names the fix instead of a stack trace (`requireSibling` in
  `caveman/src/hooks/caveman-activate.js`, issue #848).
- pwf:
  - `/plan-doctor` (`planning-with-files/commands/plan-doctor.md`, with
    `disable-model-invocation: true`) runs `planning-with-files/scripts/plan-doctor.sh`. It
    checks plan resolution, hook injection, path shape, attestation,
    install surfaces, and the latency of each hook run, and prints
    PASS, WARN, or FAIL for each.
  - The rationale: "the mechanisms this skill relies on (hook injection,
    plan resolution) exit 0 and stay silent by design when something is
    off, so a broken install looks identical to "no plan yet"."
- ECC:
  - `everything-claude-code/scripts/doctor.js` reports install drift.
  - `everything-claude-code/scripts/codex/check-plugin-cache.js` checks that every path in the
    cached Codex manifest resolves.
  - `everything-claude-code/scripts/ci/check-hooks-schema-keys.js` fails CI when a hooks file
    has a key its loader does not document. It says "Claude Code validates
    a plugin's hooks.json against its own schema at load time and prints
    "unknown keys ... ignored" for anything else (issues #3138 and #3114)."
- claude-mem: `claude-mem/plugin/scripts/statusline-counts.js` prints observation
  counts from its database for a statusline.
- superpowers:
  - The `diagnosing-superpowers` skill reads session transcripts and
    reports with `path:line` evidence.
  - The porting guide's test method: "Prove every assumption with a
    unique-marker test: inject a nonsense token through the mechanism you
    think works, start a fresh session, and confirm the token actually
    reached the model."

## 6. What contradicts or improves on our design

1. Mode state across compaction.
   - Our README lists a known limitation: compaction or resume can lose
     mode state, and the re-injected header then restores the defaults.
   - caveman solves this. It stores mode per `session_id`, branches on
     `source`, and stores `off` literally.
   - ponytail keeps the bug: it re-derives the default on every
     SessionStart.
2. Resume.
   - superpowers found that re-injecting on resume duplicates context the
     transcript already holds, and removed `resume` in v5.0.3.
   - We inject about 24,800 characters on every resume. If the duplicate is
     real, each resume adds about 6,200 tokens.
   - caveman, ponytail, pwf, and claude-mem keep `resume`, but their
     payloads are about a fifth of ours or depend on the current state.
3. Subagents.
   - ponytail reports that Claude Code does not pass SessionStart context
     to subagents. Codex behavior is untested. If that holds, files written
     by subagents get neither rule set unless the parent's prompt carries
     them. ponytail covers this with a `SubagentStart` hook.
   - For us, the full bundle would cost about 24,800 characters per spawn,
     and Claude would need the JSON form on that event.
4. The Codex `hooks` key.
   - Every repo that ships a Codex plugin hook names its file explicitly.
     We rely on the fallback, which superpowers calls a hardcoded default.
   - The fallback also means any future plugin in our marketplace that
     ships a `hooks/hooks.json` gets it registered in Codex, trust prompt
     included, whether or not we meant it.
5. A Codex-only key in a shared file.
   - `additionalContextLimit` is a Codex key. The string does not appear in
     the Claude Code 2.1.283 binary.
   - ECC reports that Claude warns about unknown hook keys at load time.
     `claude plugin validate plugins/adhd-unslop` passed with no warning.
     The load-time path is untested.
6. Truncation.
   - If Codex truncates rather than drops an oversized chunk, the
     truncated chunk still carries its header and bundle id, so it looks
     complete. Our header does not tell the model to check for the footer.
7. Runtime detection.
   - Our `runtimeOf` uses the install path. It returns null when a Claude
     local-directory marketplace loads the plugin in place (D21). The
     warning then prints both install commands.
   - ponytail's environment check does not depend on the path.
8. Silent failure.
   - With no flag, an untrusted Codex hook, or a missing `node`, our
     always-on hook prints nothing. Each of these looks the same as "not
     opted in". This is the case pwf built `/plan-doctor` for.
9. What we already do well.
   - We never set `async`, every path exits 0, and our timeouts are
     generous.
   - The bundle id and "apply only once all chunks arrive" rule have no
     counterpart elsewhere, because nobody else chunks.

## Implications for adhd-unslop

1. Persist mode state per session, following caveman.
   - Add a `UserPromptSubmit` handler to `adhd-unslop` only, so D13 still
     holds. It recognizes `stop adhd mode`, `stop unslop`, `normal mode`,
     and a typed invocation of the skill, and only when the phrase is the
     whole message, as ponytail requires.
   - Store the state in `${PLUGIN_DATA or CLAUDE_PLUGIN_DATA}/sessions/<session_id>.json`.
     Accept a session id only if it matches a character allowlist, and
     remove files older than a set age.
   - On SessionStart, reset for `startup` and `clear`. Read the stored
     state for `compact`, `resume`, and unknown sources. Print the actual
     states in the header, for example "ADHD mode: off. unslop mode:
     active.", instead of asking the model to restore them.
   - Store `off` literally.
   - Fall back to today's behavior when the payload has no `session_id`.
   - Follow the constraints ponytail's tracker shows
     (`ponytail/hooks/ponytail-mode-tracker.js`):
     - Print nothing on a prompt that does not match.
     - Exit 0 on every path.
     - Add a short stdin fallback timer with `unref()`. ponytail added one
       after a Windows hang in which stdin never closed (#443).
   - The handler runs on every prompt, so keep it fast.
   - This removes the known limitation in the README.
2. Make the chunk rule truncation-aware. Add one sentence to the header in
   `chunkHeader` (`hooks/lib.mjs`): a chunk counts as arrived only when its
   `END adhd-unslop chunk N of 3` line is present.
3. Decide `resume` on evidence. If both runtimes keep SessionStart context
   in a resumed transcript, drop `resume` from the always-on matcher. Keep
   it on the `check-deps.mjs` group. With item 1 in place, a resumed session
   loses nothing.
4. Declare the Codex hooks path.
   - Have `tools/build.mjs` write `"hooks": "./hooks/hooks.json"` into
     `plugins/adhd-unslop/.codex-plugin/plugin.json`. Leave the Claude
     manifest without the key.
   - Consider writing `"hooks": {}` into the Codex manifests of the `au-`
     plugins, so a vendored upstream `hooks/hooks.json` can never register
     itself.
5. Keep one hooks file unless Claude warns on `additionalContextLimit`. If
   it does, have `build.mjs` generate `hooks/codex-hooks.json` from the same
   source, with the key on the Codex handlers only, and point the Codex
   manifest at it. ECC, pwf, and claude-mem use this layout.
6. Detect the runtime from the environment. In `runtimeOf`, return `codex`
   when `PLUGIN_ROOT` or `PLUGIN_DATA` is set, and `claude` when only
   `CLAUDE_PLUGIN_ROOT` is set. Keep the path check as a fallback.
7. Add a doctor.
   - A script, such as `hooks/doctor.mjs`, run from a user-only command or
     skill with `disable-model-invocation: true`, as pwf does.
   - It reports:
     - Which flag files and env switches are set
     - The runtime found from the environment
     - Chunk hashes against `manifest.json`
     - Each rendered chunk against 10,000 characters and the Codex token
       limit
     - Whether sibling plugins are present, with their versions
     - A reminder that Codex hook trust is checked only in `/hooks`
   - It prints PASS, WARN, or FAIL lines.
8. Add switches without breaking the symmetric flag file.
   - Add an env override, such as `ADHD_UNSLOP_ALWAYS=0`, that disables
     injection for one run even when a flag exists. This covers `codex exec`
     and CI, the lesson of pwf issue #195. `=1` enables without a flag.
   - Optionally add a Claude `userConfig` boolean, read as
     `CLAUDE_PLUGIN_OPTION_<KEY>` and set with `claude plugin install
     adhd-unslop@adhd-unslop --config <key>=true`.
   - Precedence: env, then `userConfig`, then flag file. Document that
     `userConfig` exists in Claude Code only.
9. Treat subagent injection as an open option, not a default.
   - If added, use `SubagentStart` with JSON output, three chunks per spawn,
     and an `agent_type` scope like `PONYTAIL_SUBAGENT_MATCHER`.
   - Measure the token cost before shipping.
10. Treat a Claude pointer mode as an option with a known cost.
    - Claude installs the dependencies, so the hook could emit chunk 1 plus
      an instruction to load `au-i-have-adhd:i-have-adhd` and
      `au-unslop:unslop` with the Skill tool, the superpowers pattern. That
      cuts the always-on text from about 24,800 to about 8,700 characters.
    - The costs: a tool call after every compaction, version skew between
      the embedded pin and the installed `au-` plugins (D16), and a reversal
      of the reasoning in D12.
    - Codex has no dependencies, so it would keep the embedded chunks.
11. Batch every hook-definition change into one release.
    - Codex keys trust by plugin id and handler position and checks it
      against a hash of the handler (DECISIONS platform table).
      `everything-claude-code/.codex-plugin/README.md` says "Codex records trust against each definition's hash, so
      changed hooks require review again."
    - Items 1, 3, 4, and 5 each change `hooks.json` or where Codex finds
      it, so each one sends existing Codex users back to `/hooks`. Ship
      them together so users re-trust once.
    - Append new handler groups after the existing ones, so current
      positions do not shift.
    - Item 2 changes only chunk text, not `hooks.json`, so it needs no
      re-trust.
12. Keep what already works: no `async`, exit 0 on every path, and sizes
    checked in the build.

## Claims to test

Use superpowers' unique-marker method: put a nonsense token at the end of
each chunk, then confirm it reaches the model. Use throwaway homes as
AGENTS.md requires.

1. Codex 0.154 over-limit behavior. Set `additionalContextLimit: 500` on a
   handler that prints 4,000 characters ending in a marker. Check whether
   Codex truncates, saves the full output to a file, or discards the
   payload, as claude-mem says.
2. Whether `systemMessage` counts toward the Codex limit, as claude-mem
   implies.
3. Whether each current chunk fits under the Codex default with
   `additionalContextLimit` removed. At `chars / 4` they are 2,003 to 2,181
   tokens.
4. Whether Codex accepts a SessionStart stdout of only `{"systemMessage":
   "..."}`. Our broken-install path prints that, and ponytail prints it in
   off mode on Codex. claude-mem found that Codex rejected
   `{"continue":true}` as "invalid session start JSON output".
5. Whether a resumed session keeps the prior SessionStart context, in each
   runtime. superpowers v5.0.3 says it does in Claude Code. Count the
   markers in the model's context after `--resume`.
6. Whether `"hooks": {}` still suppresses the fallback in Codex 0.154.
   Whether an explicit `"hooks": "./hooks/hooks.json"` loads the file once,
   not twice. Whether trust recorded under the fallback survives the switch
   to an explicit path.
7. Whether Claude Code logs "unknown keys ... ignored" for
   `additionalContextLimit` at load time. Run `claude --debug` in a
   throwaway home and search the log. `claude plugin validate` did not warn.
8. Whether the Codex SessionStart payload carries `session_id` and a
   `source` of `compact` after a compaction. claude-mem's Codex adapter
   reads `source` but maps only `startup`, `resume`, and `clear`.
9. Whether a Codex `SubagentStart` handler can emit `additionalContext`,
   whether Claude drops plain stdout on `SubagentStart`, as ponytail says,
   and whether a subagent in either runtime sees the parent's SessionStart
   context.
10. Whether `CLAUDE_PLUGIN_OPTION_<KEY>` reaches the hook environment after
    `claude plugin install --config <key>=<value>`, and what case the key
    takes.
11. Whether Codex 0.154 runs `async: true` handlers synchronously, as its
    strings suggest, or skips them, as ECC found on 0.146.
12. What Claude Code 2.1.283 does with a hook value over 10,000 characters:
    truncate it, reject it, or save it to a file with a preview.
13. Whether Claude Code ever sets `PLUGIN_ROOT` or `PLUGIN_DATA`, and
    whether Codex always sets `CLAUDE_PLUGIN_ROOT`. Environment-based
    detection depends on both answers. ECC's forced copy of `PLUGIN_ROOT`
    into `CLAUDE_PLUGIN_ROOT` suggests it did not trust the second.
14. What the `UserPromptSubmit` payload's `prompt` field holds in Codex for a
    typed `$adhd-unslop:adhd-unslop`. ponytail's tracker matches
    `[/@$]ponytail`.
