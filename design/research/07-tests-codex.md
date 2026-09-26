# Research 07: Codex behavior tested with the real CLIs

Status: research, 2026-09-26. This file records tests C1 to C8, run to
decide how to restructure the plugin repo. It changes nothing else in the
repo.

Versions: Codex CLI 0.154.0 (installed, `/opt/homebrew/bin/codex`) and
0.157.1 (from npm, in a scratch directory). Every test ran on both. The
default model was `gpt-6-astra` on 0.154.0 and `gpt-6-sol` on 0.157.1.

Decisions cited as D1 to D21 are in `design/DECISIONS.md`. Claims cited as
"research 01 claim N" are in the "Claims to test" lists of the earlier
research files.

## Results

| Test | 0.154.0 | 0.157.1 | Conclusion |
| --- | --- | --- | --- |
| C1 skill body cut | A `.codex-plugin` skill of 12,000 bytes arrived whole, all 3 markers. A Claude-only plugin skill of 12,000 bytes arrived whole. An agent-plugins skill was cut to its first 8,000 bytes, with a warning. | Same | The 8,000-byte cut applies only to plugins with a root `plugin.json` carrying the agent-plugins `$schema`. Our 9,976-byte composed skill is safe in either legacy layout. |
| C2 skill reads its references file | Read `<cache>/skills/refs/references/extra.md` and replied with its marker | Same | Relative paths in `SKILL.md` resolve against the skill directory in the cache on both versions. |
| C3 hooks path | a: ran once. b: ran once. c: no hook listed, none ran. | Same | An absent `hooks` key and `"./hooks/hooks.json"` give the same single hook and the same trust key. `"hooks": {}` turns off that plugin's hooks. |
| C3 trust key | `<plugin>@<mkt>:hooks/hooks.json:session_start:<group>:<handler>` | Same | Trust follows the hooks file path and handler position. A version bump or a manifest move keeps it. Renaming the hooks file or editing any handler field loses it. |
| C4 resume | Startup and resume each injected the marker. The resumed session carried 2 copies. | Same | A `resume` matcher duplicates SessionStart context. The startup copy stays in the history. |
| C5 output shapes | `systemMessage` only: accepted, not in context. `additionalContext` JSON: in context. Plain text: in context. | Same | All three shapes are valid. `systemMessage` never reaches the model. `{"continue":true}` is also accepted. Unknown keys or broken JSON fail the handler. |
| C6 over the limit | Limit 500: cut to about 458 tokens, head and tail kept, full text saved to a file. 9,000 chars whole. 12,000 chars cut. 10,000 whole, 10,001 cut. | Same | The default cap is 2,500 tokens per handler, counted as ceil(chars / 4), so 10,000 ASCII characters. Over the cap, Codex cuts the middle and saves the full text. It never drops the payload. |
| C7 features | `hooks` stable, true. `plugin_hooks` removed, false. | Same | Hooks are on by default. No flag is needed. `plugin_hooks` is listed as removed. |
| C8 Claude-only plugin | Added, installed, skill and hook both reached the model | Same | A plugin with only `.claude-plugin/plugin.json`, in a marketplace with only `.claude-plugin/marketplace.json`, works in Codex. The version comes from `plugin.json`. |

## Method

All work ran under the session scratchpad. `$S` below is
`/private/tmp/claude-1484880986/-Users-ruben-varela-stow-documents-ruben-Development-00-Scratch-2026-09-12--adhd-unslop/ea918357-43c4-48f0-96d7-15f563ab2bbc/scratchpad`,
and `$TC` is `$S/tests-codex`. The scratchpad is session storage and may be
deleted later. The files there:

- `gen.py` builds two fixture marketplaces and commits each as a git repo.
  `mkt-zq` has `.agents/plugins/marketplace.json` and plugins with
  `.codex-plugin/plugin.json`. `mkt-cl` has only `.claude-plugin/` files.
- `lib.sh` holds the shell helpers. `mkhome` makes a throwaway home per
  test and version under `$TC/homes/`. `exe` runs `codex exec
  --skip-git-repo-check -s read-only -c 'model_reasoning_effort="low"'`
  with `HOME=$T CODEX_HOME=$T/.codex` and `</dev/null`.
- `ana.py` lists every rollout line that carries a `ZQ` marker, with its
  item type, role, and text length.
- `probe.py` speaks JSON-RPC to `codex app-server` in an existing home. It
  calls `initialize`, `hooks/list`, `plugin/list`, and `plugin/read`. It
  needs no auth.
- `thread.py` runs one turn through `codex app-server` with `thread/start`
  and `turn/start`. It prints the `hook/started` and `hook/completed`
  notifications, which carry each handler's status and error text.
- `logs/` holds every command's output, probe JSON, and a pointer to each
  rollout file.

Rules followed:

- `~/.codex` was only read, to copy `auth.json` into a home for model runs.
  Every copy was deleted at the end, and `find $TC -name auth.json` printed
  nothing.
- Each model run started in a fresh `mktemp -d "$TMPDIR/zqcwd.XXXXXX"`,
  under `/var/folders/...`, away from the scratchpad tree. Each was deleted
  after the run.
- Markers are nonsense tokens such as `ZQBIGC-quartz-1190`. Prompts never
  named a marker, except C8, which asked the model to repeat what it saw.
- Evidence comes from the rollout files under
  `$T/.codex/sessions/**/rollout-*.jsonl`. Codex records injected skill
  bodies there as `response_item` messages with role `user`, and hook
  context as `response_item` messages with role `developer`.

Departures from the requested flags:

- Hook runs passed `--dangerously-bypass-hook-trust` but not `--enable
  hooks`. Hooks ran anyway, which agrees with C7.
- C3 set trust by writing `[hooks.state."<key>"] trusted_hash = "<hash>"`
  into the throwaway `config.toml` by hand, not through the `/hooks` TUI.
  `hooks/list` then reported `trustStatus: "trusted"`, and a run without
  the bypass flag ran only that hook.

## C1. Skill body truncation

Fixtures, all with frontmatter `name` and a quoted `description`:

| Skill | Manifest | Size | Markers at byte |
| --- | --- | --- | --- |
| `zq-skills:big` | `.codex-plugin/plugin.json` | 12,000 | A 501, B 7,901, C 11,981 |
| `zq-skills:small` (control) | `.codex-plugin/plugin.json` | 7,000 | A 501, B 3,501, C 6,982 |
| `zq-agentfmt:bigag` | root `plugin.json` with `"$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"` | 12,000 | A 501, B 7,901, C 11,981 |
| `zq-cl:bigcl` | `.claude-plugin/plugin.json` only | 12,000 | A 501, B 7,901, C 11,981 |

Marker C sits in the last 20 bytes, so it marks the end of the file. The
filler carries offset tags such as `[@07788]` every 250 bytes or so.

```sh
exe $T $v $D '$zq-skills:big Do not run any commands or read any files. Reply with the single word DONE.'
python3 $TC/ana.py <rollout>
```

Rollout results, the same on both versions:

```
c1-big    L10 response_item/message/user len=12316 [ZQBIGA, ZQBIGB, ZQBIGC]
c1-small  L10 response_item/message/user len=7320  [ZQSMA, ZQSMB, ZQSMC]
c1-bigag  L10 response_item/message/user len=8324  [ZQAGA, ZQAGB]
c1-bigcl  L10 response_item/message/user len=12315 [ZQCLBIGA, ZQCLBIGB, ZQCLBIGC]
```

The injected message wraps the whole file, frontmatter included:

```
<skill>
<name>zq-skills:big</name>
<path><cache>/zq-skills/0.0.1/skills/big/SKILL.md</path>
...the file...
</skill>
```

A byte comparison against the source file gave these results.

- `big` and `bigcl`: all 12,000 bytes of the file are present.
- `bigag`: exactly the first 8,000 bytes of the file are present, counted
  from the start of the frontmatter. The text stops mid-word ("with no
  instructions in it at al") and `</skill>` follows. Nothing inside the
  message tells the model it was cut.
- The warning is printed only on exec's output, on both versions:
  `warning: Skill `zq-agentfmt:bigag` exceeded the main prompt context
  limit and was truncated.` It does not appear in the rollout file.

This matches the source reading in research 03. `load_skill_prompts` cuts
only when `is_agent_plugin_skill` is true. The second cut site that
research 03 found in `extension.rs` did not cut a typed mention of a legacy
skill on either version.

Only typed `$plugin:skill` mentions were tested. Implicit invocation was
not tested.

## C2. Skill reading its own references file

`zq-skills:refs` tells the model to read `references/extra.md`, which sits
next to its `SKILL.md`, and to reply with the token on its last line. A decoy
`references/extra.md` with a different token sits at the plugin root.

```sh
exe $T $v $D '$zq-skills:refs Follow the skill.'
```

```
0.154.0: /bin/zsh -lc 'cat <cache>/zq-skills/0.0.1/skills/refs/references/extra.md'
0.157.1: /bin/zsh -lc 'tail -n 1 <cache>/zq-skills/0.0.1/skills/refs/references/extra.md'
reply on both: ZQREF-lichen-5582
```

`<cache>` is `$T/.codex/plugins/cache/zqmkt`. Both versions read the cache
copy next to the skill and never touched the decoy. The `<path>` line of
the injected skill gives that directory.

## C3. Plugin hooks path

Three plugins, each with the same `hooks/hooks.json` shape: one SessionStart
group, matcher `startup|resume`, one handler that runs `echo <marker>
root=$PLUGIN_ROOT`.

| Variant | `.codex-plugin/plugin.json` `hooks` key |
| --- | --- |
| `zq-hook-a` | absent |
| `zq-hook-b` | `"./hooks/hooks.json"` |
| `zq-hook-c` | `{}` |

```sh
python3 $TC/probe.py "$(cbin $v)" $T $D out.json zq-hook-a zq-hook-b zq-hook-c
exe $T $v $D --dangerously-bypass-hook-trust "Reply with the single word OK."
```

`hooks/list` accepts `{}` or `{"cwds": [...]}` and returned, on both
versions:

```
key=zq-hook-a@zqmkt:hooks/hooks.json:session_start:0:0 src=<cache>/zq-hook-a/0.0.1/hooks/hooks.json trust=untrusted hash=sha256:94cf5b32...
key=zq-hook-b@zqmkt:hooks/hooks.json:session_start:0:0 src=<cache>/zq-hook-b/0.0.1/hooks/hooks.json trust=untrusted hash=sha256:c1d16662...
warnings: []  errors: []
plugin/read zq-hook-c -> hooks=[]
```

Rollout, on both versions:

```
L8  response_item/message/developer  ZQHOOKA-fennel-3321 root=<cache>/zq-hook-a/0.0.1
L9  response_item/message/developer  ZQHOOKB-thistle-5540 root=<cache>/zq-hook-b/0.0.1
```

Each marker appears once. `zq-hook-c` never ran. No "loading hooks from
both" warning appeared for variant b. The command runs through a shell,
since `$PLUGIN_ROOT` was expanded.

### Trust

The trust state lives in `config.toml`:

```toml
[hooks.state."zq-hook-a@zqmkt:hooks/hooks.json:session_start:0:0"]
trusted_hash = "sha256:94cf5b32544e31ea176e7222e9ef7787de004ac4933665edfaba3c24c6201cdc"
```

With only that entry, `codex exec` without the bypass flag ran hook a and
skipped hook b. Exec printed no warning about the skipped hook.

I then changed `zq-hook-a` step by step, reinstalled it with `codex plugin
add`, and read `trustStatus` from `hooks/list`. Both versions gave the same
answers.

| Step | Key | Status |
| --- | --- | --- |
| 0.0.2: explicit `"hooks": "./hooks/hooks.json"` | unchanged | trusted |
| 0.0.3: `.codex-plugin/` removed, `.claude-plugin/plugin.json` only | unchanged | trusted |
| 0.0.4: file renamed to `hooks/codex-hooks.json`, key points at it | `...:hooks/codex-hooks.json:session_start:0:0` | untrusted |
| 0.0.5: back to `hooks/hooks.json`, `timeout` 20 to 25 | unchanged | modified |
| 0.0.6: `timeout` back, `statusMessage` added | unchanged | modified |
| 0.0.7: handler restored to the original | unchanged | trusted |
| 0.0.8: `additionalContextLimit: 5000` added | unchanged | modified |

So the key is the plugin id, the hooks file path relative to the plugin
root, the event, the group index, and the handler index. The hash covers
the handler's fields, not the version, the cache path, or the manifest.
This extends the DECISIONS platform table, which saw trust survive 0.2.0 to
0.2.1.

## C4. Resume duplication

`zq-resume` has one handler on `startup|resume`. It reads the hook's stdin
JSON and prints `ZQRES-mango-6610 source=<source>`.

```sh
exe $T $v $D --dangerously-bypass-hook-trust "Reply with the single word OK."
exe $T $v $D --dangerously-bypass-hook-trust resume --last "say ok"
```

Both runs used the same cwd, because `--last` filters by cwd. The resume
reused the session id and appended to the same rollout file. The file grew
from 16 lines to 27 on 0.154.0 and to 28 on 0.157.1. The 0.157.1 file:

```
2   response_item/message/developer  <skills_instructions> ...
5   response_item/message/user       <environment_context> ...
8   response_item/message/developer  ZQRES-mango-6610 source=startup
9   response_item/message/user       Reply with the single word OK.
12  response_item/message/assistant  OK
14  event_msg/token_count            input_tokens 13811
16  event_msg/thread_settings_applied
18  event_msg/task_started
20  response_item/message/developer  ZQRES-mango-6610 source=resume
21  response_item/message/user       say ok
24  response_item/message/assistant  ok
26  event_msg/token_count            input_tokens 13839
```

The hook got `source: "resume"` on stdin for the second run. The resumed
turn did not record the skills instructions or environment context again,
yet its input rose from 13,811 to 13,839 tokens. So Codex rebuilt the
request from the recorded history, lines 2 to 12 included, and the model saw
both lines 8 and 20. The 0.154.0 file has the same shape, with the second
marker at line 19.

## C5. Hook output shapes

`zq-shapes` has four handlers in one group. `zq-extra` adds negative
controls. Status and error text come from the `hook/completed`
notifications of `codex app-server`, since `codex exec` prints only
"Completed" or "Failed" and `--json` prints no hook events.

| Stdout | Status | In model context | Other effect |
| --- | --- | --- | --- |
| `{"systemMessage":"ZQSYS-only-2231"}` with no newline | completed | no | none visible in exec |
| `{"systemMessage":"ZQSYSNL-newline-3030"}` with a newline | completed | no | a `warning` entry with the text |
| `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"ZQCTX-json-4410"}}` | completed | yes, as its own developer message | none |
| `ZQPLAIN-text-7719` plain text | completed | yes | none |
| `systemMessage` and `additionalContext` together | completed | only the `additionalContext` text | `warning` entry |
| `{"continue":true}` | completed | nothing to add | no entries |
| `{"notAField":"ZQNEGUNK-field-5150"}` | failed | no | error "hook returned invalid session start JSON output" |
| `{"systemMessage": ZQBADJSON-brace-7070`, broken JSON | failed | no | same error. It is not treated as plain text. |

Both versions gave the same table. `systemMessage` never appears in the
rollout file, so it never reaches the model. This agrees with D15, which
sends the missing-plugin warning as both `systemMessage` and
`additionalContext`. `{"continue":true}` is accepted on both versions,
which contradicts the rejection claude-mem reported for an earlier Codex.
An unknown top-level key fails the whole handler, so a JSON shape must use
only keys Codex knows.

## C6. Over-limit output

Each handler prints filler with offset tags `<@N>`, a `...START` marker at
the front, and a `...END-okra` marker at the end.

| Handler | Chars | Limit | Result in rollout |
| --- | --- | --- | --- |
| `ZQL500` | 4,003 | 500 | 2,100 chars, cut, both markers kept |
| `ZQN9K` | 9,002 | default | 9,002 chars, whole |
| `ZQN12K` | 12,003 | default | 10,100 chars, cut, both markers kept |
| `ZQX10000` | 10,000 | default | 10,000 chars, whole |
| `ZQX10001` | 10,001 | default | 10,099 chars, cut |
| `systemMessage` of 8,000 chars and context of 4,033 | 12,130 | default | the 4,033-char context, whole |

A cut message has this shape, the same on both versions:

```
Warning: truncated output (original token count: 1001)
Total output lines: 1

ZQL500START <@12> ... <@830> Plain filler sentence ... <@91…543 tokens truncated…r sentence ... <@3151> ... <@3981> ZQL500END-okra

Full hook output saved to: $TMPDIR/hook_outputs/<thread-id>/<uuid>.txt
```

- The count is ceil(chars / 4): 4,003 chars gave 1,001 tokens, 10,001 gave
  2,501, and 12,003 gave 3,001. The fixtures were ASCII only, so bytes and
  characters were not told apart.
- The default cap is 2,500 tokens. 10,000 characters pass whole and 10,001
  are cut.
- Codex keeps the head and the tail and cuts the middle. The 12,003-char
  output kept about offsets 0 to 4,900 and 7,130 to the end. Both over-limit
  cases lost 543 tokens, which is the excess over the limit plus about 42
  tokens for the warning lines and the file path.
- The full output was saved, 4,003 and 12,003 bytes with the end marker
  intact. The file sits under the system temp directory, not under
  `CODEX_HOME`. I deleted the files my runs created.
- The limit is per handler. Three handlers of 2,100, 9,002, and 10,100
  characters all arrived in one session.
- `systemMessage` does not count toward the cap. This is research 01 claim
  2, and claude-mem's contrary claim did not reproduce.

## C7. Feature flags

```sh
HOME=$T CODEX_HOME=$T/.codex codex features list </dev/null
```

```
hooks          stable   true
plugin_hooks   removed  false
plugins        stable   true
```

Both versions print the same three lines. `hooks` is on by default, and
`plugin_hooks` is listed as removed. Every hook run in this file worked
without `--enable hooks`.

## C8. Claude-only plugin in Codex

`mkt-cl` has only `.claude-plugin/marketplace.json`, with entry `{"name":
"zq-cl", "source": "./plugins/zq-cl"}`. The plugin has only
`.claude-plugin/plugin.json`, a skill, and `hooks/hooks.json`.

```sh
cxh $T $v plugin marketplace add $TC/mkt-cl
cxh $T $v plugin add zq-cl@zqcl
exe $T $v $D --dangerously-bypass-hook-trust '$zq-cl:clsk Do not run any commands or read any files. Reply with the fixture token named in the skill, then on a new line any other token starting with ZQ that you were given.'
```

```
Added marketplace `zqcl` from $TC/mkt-cl.
Installed plugin root: $T/.codex/plugins/cache/zqcl/zq-cl/0.0.3
zq-cl@zqcl  installed, enabled  0.0.3
plugin/read zq-cl skills=['zq-cl:clsk'] hooks=[zq-cl@zqcl:hooks/hooks.json:session_start:0:0]
L8   response_item/message/developer  ZQCLHOOK-bramble-6127 root=<cache>/zq-cl/0.0.3
L11  response_item/message/user       <skill> ... ZQCLSKILL-sedge-4402 ...
reply: ZQCLSKILL-sedge-4402 / ZQCLHOOK-bramble-6127
```

Both versions gave the same results. The cache copy has no
`.codex-plugin/`. Codex did not write a fallback manifest, because it found
`.claude-plugin/plugin.json`.

To see which file sets the version, I then set the marketplace entry to
`9.9.9` and `plugin.json` to `0.0.4`. `codex plugin add` installed into
`zq-cl/0.0.4` and removed the `0.0.3` directory. The 12,000-byte skill in C1
was added to this plugin in the same commit.

## Implications for adhd-unslop

These follow from the results. None is a decision.

1. Keep the root manifest out. The 8,000-byte cut hits only the
   agent-plugins format. `adhd-unslop`'s 9,976-byte `SKILL.md` arrives
   whole from `.codex-plugin/plugin.json` or from `.claude-plugin/plugin.json`.
2. A Claude-only layout works in Codex 0.154.0 and 0.157.1 for install,
   skills, hooks, versions, and trust keys. Research 02 found that it loses
   only the plugin `interface` in Codex.
3. Moving hooks to `.claude-plugin` only, or to an explicit
   `"hooks": "./hooks/hooks.json"`, keeps existing Codex trust. Renaming
   `hooks.json`, reordering handlers, or changing any handler field sends
   users back to `/hooks`.
4. Each chunk of 8,011 to 8,721 characters fits under the default 2,500
   tokens, with at least 1,279 characters left. `additionalContextLimit: 5000` is not needed
   for them today. Removing it changes each handler's hash and forces a
   re-trust, so remove it only in a release that changes the handlers
   anyway.
5. An oversized chunk is cut in the middle, not dropped. The model would
   see the start and end of the chunk and miss the rules in between, with
   only the warning line to tell it. A build-time size check is still the
   guard.
6. The always-on matcher includes `resume`, so every `codex exec resume`
   adds another full copy of about 21,500 characters to a
   history that already holds one. Dropping `resume` from the chunk group
   avoids that. `compact` and `clear` were not tested here.
7. The broken-install `{"systemMessage": ...}` output of D14 is valid on
   both versions and reaches the user, not the model. Any extra key in a
   JSON output would fail the handler.
8. `--enable hooks` and `--enable plugin_hooks` can go from test scripts.
   Hooks are on by default, and `plugin_hooks` is removed.

## Not tested

- Implicit skill invocation of an oversized skill.
- `compact` and `clear` sources, and subagent threads.
- Non-ASCII hook output, so bytes and characters were not separated.
- Trust set through the `/hooks` TUI, as opposed to the hand-written
  `config.toml` entry that the TUI's format implies.
- A GitHub-hosted Claude-only marketplace. Research 05 covered GitHub mode
  for the current layout.
- The 0.154.0 app-server run in `thread.py` timed out waiting for
  `turn/completed` after the hook notifications arrived. The hook data is
  complete. The 0.157.1 run finished normally.
