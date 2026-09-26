# Research 08: Claude Code tests that decide the restructure

Status: research, 2026-09-26. This file records real-CLI tests of Claude
Code 2.1.283. It changes nothing else in the repo.

Decisions cited as D1 to D21 are in `design/DECISIONS.md`. Open questions
come from research notes 01, 03, and 06.

## Results

| Test | Result | Conclusion |
| --- | --- | --- |
| L1. Resume duplication | `--resume` fired the hook with `source: "resume"` and added a second copy. The resumed transcript holds both `hook_additional_context` attachments, and the model counted 2 and listed both unique markers. `--resume --fork-session` reported `source: "fork"`, so our matcher did not fire. The fork still carried both copies from the parent transcript. | Resume duplicates the injection. Drop `resume` from the always-on matcher, and keep `fork` out. |
| L2. Skill reads its own files | `${CLAUDE_SKILL_DIR}` was replaced with the cache path `.../cache/zqmkt/zq-l2/0.0.1/skills/withvar` before the model saw it. The model read `references/extra.md` and returned its marker. A bare relative path also worked, because every skill body starts with `Base directory for this skill: <dir>`. | A plugin skill can ship and read `references/` files. Both forms work. The variable is the more explicit of the two. |
| L3. Entry without `version` | Install recorded 1.2.3 from `plugin.json` in `plugin list --json`, `installed_plugins.json`, and the cache directory name. `--available` listed the entry with no `version` field. After a bump to 1.2.4, `marketplace update` and `plugin update` moved it to 1.2.4. A text change with no version bump reported "already at the latest version" and kept the old text. | Marketplace entries can omit `version`. Bare-name dependencies still install. `plugin.json` is the only version that matters, and every text change still needs a bump. |
| L4. Unknown hook key | The debug log had no warning about `additionalContextLimit`, or about any unknown key. The hook ran, and its context reached the transcript. `plugin validate --strict` passed. | Claude Code ignores the key without a warning. One shared `hooks.json` is fine. |
| L5. Hook over 10,000 characters | The 12,000 characters were saved to `projects/<cwd>/<session>/tool-results/hook-<id>-1-additionalContext.txt`. Context got a header with that path and the first 2,000 characters. Markers at 0 and 1,900 arrived. Markers at 2,100, 6,000, and the end did not. | An oversized chunk loses everything past 2,000 characters unless the model reads the file. Keep each chunk under 10,000, as D12 does. |
| L6. Same skill name in two plugins | `zq-a:shared` and `zq-b:shared` were both listed and each ran by full name, typed or through the Skill tool. A bare `/shared` silently ran the skill from whichever plugin was installed first. | `plugin:skill` names are enough to tell the skills apart. Never rely on a bare skill name. |
| L7. `validate --strict` | Passed for a skill folder with `references/` and a `plugin.json` with `homepage`, `repository`, and `keywords`. Controls showed that `--strict` fails an unknown manifest key and a skill with no `description`. | Safe for CI. The structure and fields in question raise no warning. |
| L8. Plugin output style | `force-for-plugin: true` applied the style with nothing selected. Its text came in as a system-role message headed `# Output Style: zq-l8:zqstyle`. It replaced the user's `"outputStyle": "Explanatory"`. `keep-coding-instructions` true and false gave identical system prompts in `-p` mode. A 25,000-character style arrived in full, and on resume the style was sent once, not twice. | A forced style works, overrides the user's style, has no 10,000 cap, and does not duplicate on resume. The `init` event still reports the user's setting. `keep-coding-instructions` shows no effect in print mode. |

## Method

- Claude Code 2.1.283, `claude -p --output-format stream-json --verbose ...
  </dev/null`. The throwaway config's default model was `claude-opus-5-5`.
- Each test had its own `CLAUDE_CONFIG_DIR=$T`, made with `mktemp -d`
  under the session scratchpad, with only that test's plugin installed.
  The model's cwd was a separate `mktemp -d` under `$TMPDIR`, away from any
  marketplace copy. `~/.claude` and `~/.codex` were not touched. Auth came
  from `ANTHROPIC_API_KEY` in the environment.
- The runner unset the parent session's variables before each call:
  `CLAUDECODE`, `CLAUDE_CODE_*`, `CLAUDE_PID`, `CLAUDE_EFFORT`,
  `CLAUDE_PLUGIN_DATA`, `AI_AGENT`, and `CODEX_COMPANION_SESSION_ID`.
- The fixture marketplace `zqmkt` was a git repo with one plugin per test
  and nonsense markers such as `QUORBLEX`, `PLINTHOVAR`, and `GLIMFROST`.
- Installs went through a git source, not a local path, so plugins were
  copied into `$T/plugins/cache/zqmkt/<plugin>/<version>/` as in a GitHub
  install. See the next section.
- Every config was fresh, so remote feature flags read their defaults.
  The L4 debug log says so: "rollout flag (tengu_plugin_hooks_modules) is
  off, from the default (a cold GrowthBook cache, no payload yet)". That
  flag governs hook modules, not the `hooks.json` command hooks tested
  here. A long-lived user config with a warm flag cache could still behave
  differently.
- Evidence came from the stream-json events, the transcripts under
  `$T/projects/**/*.jsonl`, `--debug-file` logs, and for L8, the raw API
  request bodies.

### A local git marketplace with real cache paths

D21 says a local-path marketplace loads plugins in place, so only a git
source tests the cache. These sources were tried with `claude plugin
marketplace add`:

| Source | Result |
| --- | --- |
| `git://127.0.0.1:19418/mkt` (git daemon) | "Invalid marketplace source format. Try: owner/repo, https://..., or ./path" |
| `http://127.0.0.1:18080/mkt.git` (dumb HTTP, `python3 -m http.server`) | Clone failed: "dumb http transport does not support shallow capabilities" |
| `http://127.0.0.1:18081/mkt.git` (smart HTTP, `git http-backend` behind a 40-line node server) | "Successfully added marketplace: zqmkt". `known_marketplaces.json` recorded `"source": "git"`. |

Smart HTTP on localhost therefore gives a git marketplace with the real
clone and cache paths, and no GitHub push. `tests/e2e/run.sh` could use it
for the default mode. To publish a change, commit in the fixture repo and
`git push` to the bare repo that the server exports.

## L1. Resume duplication

Fixture `zq-l1`, `hooks/hooks.json`:

```json
{ "hooks": { "SessionStart": [
  { "matcher": "startup|resume|clear|compact",
    "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/h.mjs\" marker", "timeout": 30 }] },
  { "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/h.mjs\" log-only", "timeout": 30 }] }
] } }
```

`h.mjs` appends its stdin JSON to a log file and, in `marker` mode, prints
`{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"Hook marker: QUORBLEX-<source>-<time>-<pid>. Remember it."}}`.
Each firing therefore has a unique marker. The catch-all group logs any
source the first group's matcher misses.

The question avoids spelling the marker, so the user message cannot
pollute the count: `Count the system reminders in your context that
contain a line starting with "Hook marker:". Reply with the count in digits
on the first line, then each marker token after "Hook marker:" on its own
line, in order.`

Commands, all from the same cwd:

```
claude -p --output-format stream-json --verbose --include-hook-events "say ok"
claude -p ... --include-hook-events --resume <sid> "<question>"
claude -p ... --include-hook-events --resume <sid> --fork-session "<question>"
```

Output, trimmed:

```
SID=feddc81c-5174-4ce9-86ae-24cbb5594d9a
run1 result: "ok"
run2 session: feddc81c-5174-4ce9-86ae-24cbb5594d9a
run2 result: "2\nQUORBLEX-startup-1790442216399-49612\nQUORBLEX-resume-1790442219388-49661"
run3 session: 94cbad77-9e95-4180-ab10-de07d056100d
run3 result: "2\nQUORBLEX-startup-1790442216399-49612\nQUORBLEX-resume-1790442219388-49661"
== hook log (mode, source)
marker   1790442216399-49612 source=startup session=feddc81c...
log-only 1790442216400-49613 source=startup session=feddc81c...
log-only 1790442219388-49662 source=resume  session=feddc81c...
marker   1790442219388-49661 source=resume  session=feddc81c...
log-only 1790442223493-49701 source=fork    session=94cbad77...
```

The transcripts agree. The resumed session file `feddc81c...jsonl` holds
two `hook_additional_context` attachments, one per firing:

```
2  attachment/hook_success/SessionStart:startup   QUORBLEX-startup-...
3  attachment/hook_additional_context             QUORBLEX-startup-...
4  user ("say ok")
...
23 attachment/hook_success/SessionStart:resume    QUORBLEX-resume-...
24 attachment/hook_additional_context             QUORBLEX-resume-...
25 user (question)
```

The stored form of one attachment:

```json
{"attachment":{"type":"hook_additional_context","content":["Hook marker: QUORBLEX-resume-1790442219388-49661. Remember it."],"hookName":"SessionStart","hookEvent":"SessionStart"},"type":"attachment",
 "rendered":[{"content":"<system-reminder>\nSessionStart hook additional context: Hook marker: QUORBLEX-resume-...\n</system-reminder>"}]}
```

The fork file `94cbad77...jsonl` starts with a copy of the parent's lines,
both attachments included. The fork fired only the catch-all group.

Conclusions:

- A resumed session keeps the earlier SessionStart context and adds a new
  copy. This matches superpowers v5.0.3. With our bundle of about 24,800
  characters, each resume adds about 6,200 tokens of duplicate rules.
- `--fork-session` reports `source: "fork"`, as the docs say for 2.1.214
  and later. Neither of our matchers includes `fork`. The fork inherits the
  parent's copies, so leaving `fork` out is correct.
- Recommendation for the always-on group: `startup|clear|compact`. Not
  tested here: `clear` and `compact`. The docs say compaction summarizes
  earlier hook context and reruns `compact` hooks, so both still need the
  injection.
- Edge case: a session that started before the flag file existed gets no
  rules on resume once `resume` is gone. That seems acceptable.
- The `check-deps.mjs` group on `startup|resume` duplicates too, but its
  output is one short warning and appears only when a sibling is missing.

## L2. Plugin skill referencing its own files

Fixture `zq-l2` has two skills, each with its own
`references/extra.md`:

```
skills/withvar/SKILL.md:
  Skill directory as substituted: ${CLAUDE_SKILL_DIR}
  Read the file ${CLAUDE_SKILL_DIR}/references/extra.md with the Read tool.
  Do not search the disk. Reply with only the code word that file contains.
skills/withvar/references/extra.md: The reference code word is PLINTHOVAR.

skills/relpath/SKILL.md:
  Read the file references/extra.md, relative to this skill, with the Read
  tool. Do not search the disk. Reply with only the code word that file
  contains, then on a new line the absolute path you read.
skills/relpath/references/extra.md: The reference code word is SPORNIKREL.
```

Commands: `claude -p ... "/zq-l2:withvar" --allowedTools Read` and the same
for `/zq-l2:relpath`. The prompt must come before `--allowedTools`, because
that flag takes several values and swallows a prompt placed after it.

Output, with `$T` for the config dir:

```
== /zq-l2:withvar
tool_use: Read {"file_path":"$T/plugins/cache/zqmkt/zq-l2/0.0.1/skills/withvar/references/extra.md"}
result: "PLINTHOVAR" denials: []
== /zq-l2:relpath
tool_use: Read {"file_path":"$T/plugins/cache/zqmkt/zq-l2/0.0.1/skills/relpath/references/extra.md"}
result: "SPORNIKREL\n$T/plugins/cache/zqmkt/zq-l2/0.0.1/skills/relpath/references/extra.md" denials: []
```

The skill body as stored in the transcript, which is what the model saw:

```
Base directory for this skill: $T/plugins/cache/zqmkt/zq-l2/0.0.1/skills/withvar
Skill directory as substituted: $T/plugins/cache/zqmkt/zq-l2/0.0.1/skills/withvar
Read the file $T/plugins/cache/zqmkt/zq-l2/0.0.1/skills/withvar/references/extra.md with the Read tool. ...

Base directory for this skill: $T/plugins/cache/zqmkt/zq-l2/0.0.1/skills/relpath
Read the file references/extra.md, relative to this skill, ...
```

Conclusions:

- Claude Code replaces `${CLAUDE_SKILL_DIR}` in a plugin skill with the
  versioned cache directory before the text reaches the model.
- Each skill body is prefixed with `Base directory for this skill: <dir>`,
  so a relative path also resolves. The model read the right file with no
  search in both cases.
- A skill can keep long text in `references/` and load it on demand. For
  a skill shared with Codex, a relative path is likely the portable form.
  DECISIONS platform facts says the Codex model resolves relative paths
  against the skill directory. Whether Codex does anything with
  `${CLAUDE_SKILL_DIR}` was not tested here.

## L3. Marketplace entry without version

Fixture: the `zq-l3` entry in `marketplace.json` has no `version`.
`plugin.json` says 1.2.3. The marketplace was installed from the local git
server.

After `claude plugin install zq-l3@zqmkt`:

```
plugin list --json:      {"id":"zq-l3@zqmkt","version":"1.2.3","installPath":"$T/plugins/cache/zqmkt/zq-l3/1.2.3", ...}
installed_plugins.json:  {"version":"1.2.3","installPath":".../zq-l3/1.2.3","gitCommitSha":"6e8787b..."}
cache dirs:              1.2.3
plugin list (text):      Version: 1.2.3
```

`plugin list --available --json` puts installed plugins under `installed`
and leaves them out of `available`. In a fresh config with nothing
installed, the two kinds of entry look like this:

```
{"pluginId":"zq-l1@zqmkt","name":"zq-l1","description":"Fixture zq-l1","marketplaceName":"zqmkt","version":"0.0.1","source":"./plugins/zq-l1"}
{"pluginId":"zq-l3@zqmkt","name":"zq-l3","description":"Fixture zq-l3","marketplaceName":"zqmkt","source":"./plugins/zq-l3"}
```

Next I bumped `plugin.json` to 1.2.4, changed the skill text, committed,
pushed, and ran `claude plugin marketplace update zqmkt`, then `claude
plugin update zq-l3@zqmkt`:

```
-- marketplace update
Successfully updated marketplace: zqmkt
-- state before plugin update
plugin list --json version: 1.2.3
cache dirs: 1.2.3  1.2.4
-- plugin update
Plugin "zq-l3" updated from 1.2.3 to 1.2.4 for scope user. Restart to apply changes.
-- state after
plugin list --json version: 1.2.4, installPath .../zq-l3/1.2.4
installed_plugins.json: "version":"1.2.4","gitCommitSha":"8e5a63d..."
/zq-l3:ver result: "TRONVEL124"
```

The cache directory for 1.2.4 appeared after `marketplace update` and
before `plugin update`. The installed record moved only on `plugin
update`.

Extra check in a new config: I changed the skill text again and kept the
version at 1.2.4:

```
Successfully updated marketplace: zqmkt
zq-l3 is already at the latest version (1.2.4).
installed: 1.2.4 8e5a63d...     cached text: TRONVEL124 (the new commit has TRONVEL124B)
```

`claude plugin validate --strict` on the fixture marketplace file, which
has the `zq-l3` entry with no version, passed.

Dependency check in a new config: fixture `zq-dep` has `plugin.json`
version 2.0.0 and `"dependencies": ["zq-l3"]`. Neither marketplace entry
has a `version`.

```
claude plugin install zq-dep@zqmkt
  Successfully installed plugin: zq-dep@zqmkt (scope: user) (+ 1 dependency: zq-l3)
plugin list --json:
  zq-dep@zqmkt 2.0.0 errors: null zqmkt/zq-dep/2.0.0
  zq-l3@zqmkt  1.2.4 errors: null zqmkt/zq-l3/1.2.4
```

Conclusions:

- With no entry `version`, Claude Code takes the version from
  `plugin.json` for install, listing, cache path, and update.
- `build.mjs` could drop `version` from Claude marketplace entries. That
  removes a copy and the "plugin.json wins" warning path from research 05.
  Bare-name dependencies still install, as in D15. The cost is that
  `plugin list --available` shows no version for plugins that are not
  installed yet.
- The update check compares versions, not commits. This confirms the rule
  in AGENTS.md and D17: a text change without a version bump never reaches
  installed copies.

## L4. Unknown hook key

Fixture `zq-l4`, one handler:

```json
{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/h.mjs\" l4", "timeout": 30,
  "statusMessage": "zq l4", "additionalContextLimit": 5000 }
```

`claude --help` lists `--debug-file <path>`, which implies debug mode. Command:
`claude -p ... "say ok" --debug-file $T/debug.log --include-hook-events`.

Debug log, 248 lines. A case-insensitive search for
`additionalContextLimit|unknown|ignor|unrecogni|invalid` matched only two
unrelated cache cleanup lines ("Keeping ... it still holds a directory").
The hook lines:

```
[DEBUG] Read hooks.json for plugin zq-l4 (enabled=true): $T/plugins/cache/zqmkt/zq-l4/0.0.1/hooks/hooks.json
[DEBUG] Loading hooks from plugin: zq-l4
[DEBUG] Registered 1 hooks from 3 plugins
[DEBUG] Successfully parsed and validated hook JSON output
[DEBUG] Hook SessionStart (zq l4) provided additionalContext (45 chars)
```

The hook's own log line shows that it ran. The transcript has
`"type":"hook_additional_context","content":["Hook marker: VEXTRAMOOL-startup. Remember it."]`.
The result was "ok". The stream output, captured with `2>&1`, had no
non-JSON lines, so nothing was printed to stderr either. `plugin list
--json` showed no `errors` for the plugin. `claude plugin validate` and `validate --strict --json` on the
installed copy both passed with empty `errors`, `warnings`, and `notes`.

Conclusions:

- Claude Code 2.1.283 accepts `additionalContextLimit` without a warning
  at load time or in validation, and runs the handler normally.
- The ECC report of "unknown keys ... ignored" warnings does not apply to
  this version, at least for this key. Keeping one `hooks.json` for both
  runtimes is safe (research 01, item 5).

## L5. Hook over 10,000 characters

Fixture `zq-l5` prints exactly 12,000 characters of `additionalContext`,
with markers `GLIMFROST-START` at 0, `GLIMFROST-1900`, `GLIMFROST-2100`,
`GLIMFROST-6000`, and `GLIMFROST-END` at the end.

The run blocked tools so the model could not fetch the saved file:
`claude -p ... "<question>" --disallowedTools Read Bash Grep Glob
--debug-file $T/debug.log`. The question: `Without using any tool, list
every token that begins with GLIMFROST and appears in your context, in
order, one per line. Then, if any hook output in your context was replaced
by a file path, print that path on a last line prefixed with PATH:.`

Output, trimmed:

```
result: "GLIMFROST-START\nGLIMFROST-1900\n\nPATH:$T/projects/<cwd>/<session>/tool-results/hook-83842ec6-...-1-additionalContext.txt"
debug:  Hook SessionStart (...) provided additionalContext (12000 chars)
debug:  Persisted tool result to $T/projects/<cwd>/<session>/tool-results/hook-...-1-additionalContext.txt (11.7KB)
transcript attachment content: 2,504 chars, markers ["GLIMFROST-START","GLIMFROST-1900"]
saved file: 12,000 bytes, all five markers
```

The attachment text, with the path shortened:

```
<persisted-output>
Output too large (11.7KB). Full output saved to: <path> (first 2KB):
GLIMFROST-START lorem ipsum ... GLIMFROST-1900 lorem ipsum ... lor
...
</persisted-output>
```

The preview body is exactly 2,000 characters.

Conclusions:

- This matches the docs: an oversized value becomes a saved file plus a
  2,000-character preview. The value is neither cut at 10,000 nor dropped.
- The model can read the rest only with a Read call, which a restricted
  session may deny. For always-on rules, treat anything over 10,000
  characters as lost after the first 2,000. D12's chunking and the build's
  per-chunk check stay necessary for the hook route.

## L6. Same skill name in two plugins

Fixtures `zq-a` and `zq-b`, each with `skills/shared/SKILL.md` that
replies with its own marker (`WOMBLEAX` and `WOMBLEBY`). Both were
installed in one config, `zq-a` first.

```
init skills:         ["zq-a:shared","zq-b:shared"]
init slash_commands: ["zq-a:shared","zq-b:shared"]
== /zq-a:shared   result: "WOMBLEAX"
== /zq-b:shared   result: "WOMBLEBY"
== /shared        result: "WOMBLEAX"   (transcript: <command-name>/zq-a:shared</command-name>)
== "Use the Skill tool to load zq-b:shared and follow it."
   tool_use: Skill {"skill":"zq-b:shared"}   result: "WOMBLEBY"
```

In a second config I installed `zq-b` first, then `zq-a`:

```
init skills: ["zq-b:shared","zq-a:shared"]
/shared result: "WOMBLEBY" (2 of 2 runs), expanded to /zq-b:shared
```

Conclusions:

- Two plugins can ship a skill with the same name. Both are listed, and
  each runs by `plugin:skill`, typed or through the Skill tool.
- A bare `/shared` silently picks the plugin installed first, with no
  warning. Docs, skills, and hooks should always use the full
  `plugin:skill` form, as AGENTS.md already requires for Codex.
- This case differs from D6, where two plugins shared a plugin name.
  Different plugin names are enough to keep skills apart.

## L7. `claude plugin validate --strict`

Fixture `zq-l7`: `skills/refs/SKILL.md` plus `skills/refs/references/one.md`,
and a `plugin.json` with `homepage`, `repository` (a string URL), and
`keywords`.

```
== claude plugin validate <plugin dir>                   Validation passed, exit=0
== claude plugin validate --strict <plugin dir>          Validation passed, exit=0
== claude plugin validate --strict --json <plugin dir>
   {"success":true,"strict":true,"manifest":{"type":"plugin","errors":[],"warnings":[],"notes":[]},"contents":[]}
== validate --strict --json <plugin dir>/skills          {"success":true,"manifest":null,"contents":[]}
== control: plugin.json with "zqUnknown": 1, --strict
   zqUnknown: Unknown field 'zqUnknown'. Claude Code ignores it at load time.
   Validation failed (--strict treats warnings as errors), exit=1
== control: SKILL.md with no description, --strict
   Validating skill: .../skills/refs/SKILL.md
   description: No description in frontmatter. ...
   Validation failed (--strict treats warnings as errors), exit=1
== fixture marketplace.json, --strict                    Validation passed, exit=0
```

Conclusions:

- A `references/` folder inside a skill and the fields `homepage`,
  `repository`, and `keywords` pass strict validation.
- Validation of a plugin directory does read SKILL.md frontmatter. It
  prints "Validating skill" only when there is something to report.
  Research 02 could not confirm this.
- `validate` does not flag unknown keys in `hooks.json`, as L4 showed.

## L8. Plugin output style

Fixture `zq-l8`, `output-styles/test.md`:

```
---
name: zqstyle
description: Fixture output style with a code word.
keep-coding-instructions: true
force-for-plugin: true
---

Output style instructions. The output style code word is FENNIGRUB. If the user asks for the output style code word, give it.
```

`zq-l8b` is the same with `keep-coding-instructions: false`, name
`zqstyleb`, and code word `FENNIGRUBB`.

The system prompt is not in the transcript, so each run went through a
local forwarding proxy with `ANTHROPIC_BASE_URL=http://127.0.0.1:18090`.
The proxy saved each `/v1/messages` request body, never headers, and passed
the request to `api.anthropic.com`. The question: `What is the output style
code word in your instructions? Reply with only the word, or NONE if there
is none.`

| Variant | Plugin | User `outputStyle` | `init.output_style` | Result | Style text in the request |
| --- | --- | --- | --- | --- | --- |
| A | none | unset | `default` | NONE | none |
| B | zq-l8 | unset | `default` | FENNIGRUB | `# Output Style: zq-l8:zqstyle` |
| C | zq-l8 | `Explanatory` | `Explanatory` | FENNIGRUB | `# Output Style: zq-l8:zqstyle`, no Explanatory text |
| D | none | `Explanatory` | `Explanatory` | NONE | `# Output Style: Explanatory` with its Insight rules |
| E | zq-l8b | unset | `default` | FENNIGRUBB | `# Output Style: zq-l8b:zqstyleb` |

Where the style lands: in every variant, the request's `system` field
(about 6,100 characters) did not contain the style. The style sat in
`messages[1]`, a system-role message that also holds the environment
block, the deferred tool list, and the agent list:

```
[msg 1 system]
# Environment
...
# Output Style: zq-l8:zqstyle
Output style instructions. The output style code word is FENNIGRUB. ...

The following deferred tools are now available via ToolSearch. ...
```

The transcript stores it once as an attachment:
`{"attachment":{"type":"output_style_instructions","style":{"name":"zq-l8:zqstyle","prompt":"..."}}}`.

System prompt diffs, with paths ignored:

- A against B, and A against D: one line changes. "You are an interactive
  agent that helps users with software engineering tasks." becomes "You are
  an interactive agent that helps users according to your "Output Style",
  which describes how you should respond to user queries."
- B against E (`keep-coding-instructions` true against false): identical.
  The messages differ only in the style name and code word.
- B against C: identical. The user's Explanatory setting left no trace.

The `-p` system prompt has only the sections Harness, Session-specific
guidance, Memory, Environment, and Context management. It has no separate
coding-instructions block, and all five sections stayed in every variant.
So `keep-coding-instructions` has nothing to remove in print mode.
Interactive mode was not tested.

Follow-up tests, same proxy method:

- Size: fixture `zq-l8c` holds a forced style of 25,000 characters with
  markers at 0, 10,000, 20,000, and the end. All four markers reached the
  request and the model listed all four. The 10,000-character hook cap does
  not apply to output styles.
- Resume: I ran `say ok` with `zq-l8`, then resumed with `--resume`. Each
  request held one copy of the style in `messages[1]`. The resumed request
  had 4 messages and still one `# Output Style` heading. The model answered
  1. The transcript has one `output_style_instructions` line.

Conclusions:

- `force-for-plugin: true` applies a plugin style without selection and
  overrides the user's `outputStyle`. The `init` event's `output_style`
  field shows the user's setting, not the style in effect. Do not use it as
  evidence.
- A forced style is sent once per request, so resume does not stack
  copies the way SessionStart context does.
- A forced style is not capped at 10,000 characters. It could carry the
  whole always-on bundle in one piece, with no chunks and no bundle id.
- Costs to weigh before choosing it:
  - Claude Code only. Codex still needs the hook.
  - It replaces any style the user picked.
  - It applies whenever the plugin is enabled, so the D14 flag file cannot
    gate it. The opt-in would have to be enabling a separate plugin.
  - Its text sits next to the environment block, not in the `system`
    field. The docs' "survives compaction" claim was not tested here.
- `keep-coding-instructions` showed no effect in `-p` mode on 2.1.283.

## Implications for the decisions

- D12 and research 01: change the always-on matcher to
  `startup|clear|compact` (L1). Keep chunks under 10,000 characters (L5).
  `additionalContextLimit` can stay in the shared file (L4).
- D15 and D16: nothing here changes dependency behavior. L3 confirms that
  updates depend only on the `plugin.json` version.
- D11 and `build.mjs`: Claude marketplace entries can drop `version`
  (L3). Strict validation still passes (L7).
- D21: a localhost smart-HTTP git server gives a git marketplace with the
  real cache paths and no GitHub push. It could replace the local-path
  default in `tests/e2e/run.sh`.
- New option from L8: a `force-for-plugin` output style in a separate
  opt-in plugin could replace the chunked hook for Claude Code. The user
  would need to decide on the trade-offs listed in L8.

## Not tested

- The `clear` and `compact` sources, and whether a forced output style
  survives compaction.
- Interactive mode, where `keep-coding-instructions` may matter.
- Whether SessionStart context or an output style reaches subagents.
- Codex, which needs its own run.
- Remote feature flags other than their defaults. See Method.

## Reproduction

The scripts were in the session scratchpad, which is temporary. Each can
be rebuilt from the steps above.

- `build-mkt.mjs` wrote the fixture marketplace and made the first commit.
- `githttp.mjs <root> 18081` ran `git http-backend` as CGI over node's
  `http` module. The full script is below, because the D21 idea depends
  on it.
- `proxy.mjs <dir> 18090` saved request bodies and forwarded them to
  `api.anthropic.com`.
- `common.sh` held the helpers: `newhome` for a new config and cwd, `cl`
  for claude with a clean environment, `clp` for `claude -p` with
  stream-json, and `setup` for adding the marketplace and installing
  plugins.
- `L1.sh` to `L8b.sh`, plus `L3b.sh` and `L3c.sh`, held one test each.

Serve a bare clone with `git clone --bare mkt srv/mkt.git`, then `node
githttp.mjs srv 18081`, and add `http://127.0.0.1:18081/mkt.git` as the
marketplace.

```js
// Minimal smart-HTTP git server: runs `git http-backend` as CGI.
import http from 'node:http';
import { spawn } from 'node:child_process';

const root = process.argv[2];
const port = Number(process.argv[3] || 18081);
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const env = {
    ...process.env,
    GIT_PROJECT_ROOT: root,
    GIT_HTTP_EXPORT_ALL: '1',
    PATH_INFO: u.pathname,
    QUERY_STRING: u.search.slice(1),
    REQUEST_METHOD: req.method,
    CONTENT_TYPE: req.headers['content-type'] || '',
    REMOTE_ADDR: '127.0.0.1',
  };
  if (req.headers['git-protocol']) env.GIT_PROTOCOL = req.headers['git-protocol'];
  if (req.headers['content-encoding']) env.HTTP_CONTENT_ENCODING = req.headers['content-encoding'];
  const p = spawn('git', ['http-backend'], { env });
  req.pipe(p.stdin);
  let buf = Buffer.alloc(0);
  let headersDone = false;
  p.stdout.on('data', (chunk) => {
    if (headersDone) return res.write(chunk);
    buf = Buffer.concat([buf, chunk]);
    let i = buf.indexOf('\r\n\r\n'); let sep = 4;
    if (i < 0) { i = buf.indexOf('\n\n'); sep = 2; }
    if (i < 0) return;
    const head = buf.slice(0, i).toString().replace(/\r/g, '');
    let status = 200;
    for (const line of head.split('\n')) {
      const [k, ...v] = line.split(':');
      const val = v.join(':').trim();
      if (k.toLowerCase() === 'status') status = parseInt(val, 10);
      else res.setHeader(k, val);
    }
    res.writeHead(status);
    headersDone = true;
    res.write(buf.slice(i + sep));
  });
  p.stdout.on('end', () => res.end());
  p.stderr.on('data', (d) => process.stderr.write(d));
  console.log(req.method, req.url);
}).listen(port, '127.0.0.1', () => console.log('listening', port));
```
