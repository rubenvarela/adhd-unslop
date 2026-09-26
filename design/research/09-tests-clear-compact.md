# Research 09: SessionStart on clear and compact, tested with the real CLIs

Status: research, 2026-09-26. This file records tests of the `clear` and
`compact` SessionStart sources in Claude Code 2.1.283, Codex 0.154.0, and
Codex 0.157.1. It answers the review block on changing the always-on
matcher from `startup|resume|clear|compact` to `startup|clear|compact`. It
changes nothing else in the repo.

Research 07 (C4) and 08 (L1) showed that `resume` adds a second copy. This
file checks that `clear` and `compact` still fire, and that each leaves
exactly one copy in the context the model sees.

## Results

| Question | Claude Code 2.1.283 | Codex 0.154.0 | Codex 0.157.1 |
| --- | --- | --- | --- |
| S1. How to trigger `compact` | `/compact` as a `-p` prompt with `--resume <id>`, as a message in `--input-format stream-json`, or typed in the TUI | `thread/compact/start` over `codex app-server`, which is what the TUI `/compact` calls. `codex exec` has no slash commands. | Same, and `/compact` in the TUI tested |
| S1. How to trigger `clear` | `/clear` as a stream-json message or typed in the TUI | `thread/start` with `sessionStartSource: "clear"`, which is what the TUI `/clear` sends | Same, and `/clear` in the TUI tested |
| S2. Manual compact fires the hook | Yes, `source: "compact"`, during the compaction | Yes, `source: "compact"`, at the start of the next turn | Same as 0.154.0 |
| S2. Copies after compact | 1 full copy, the new one. The old copy is gone, but the model's summary names its tokens. | 1 full copy. Old developer messages are dropped from `replacement_history`. | Same as 0.154.0 |
| S3. Clear fires the hook | Yes, `source: "clear"`, at once, in a new session id | Yes, `source: "clear"`, on the first turn of the new thread | Same |
| S3. Copies after clear | 1 full copy, nothing from before | 1 full copy, nothing from before | Same |
| S4. Three chunks with END lines | All three whole on every source. Order follows handler completion and changes from run to run. | All three whole on every source, always in declared order | Same as 0.154.0 |
| S5. Auto-compact fires `compact` | Yes. Reactive auto-compact, forced with a 100k window and a 10 percent override, fired `compact` and left 1 full copy. | Yes, both mid-turn and pre-turn. 1 full copy each time. | Yes, both mid-turn and pre-turn. 1 full copy each time. |
| S5. Compact, quit before the next turn, then resume | 1 copy. The `compact` copy is written during `/compact` and reloads on resume (K2). | 0 full copies. The queued `compact` source is lost on exit, and `resume` no longer injects (X7). | Same as 0.154.0 |
| Matcher `startup\|clear\|compact` | Matched `startup`, `clear`, `compact`. `resume` fell through to the catch-all group. | Same | Same |

Conclusion: with `startup|clear|compact`, every clear, and every
compaction followed by another turn in the same process, ends with exactly
one full copy of the injected text in both runtimes. The change removes the
resume duplicate. It has one cost, in Codex only. If a user compacts and
quits before sending another message, a later `resume` has no copy, where
the old matcher gave one (X7). The model then has only what the compaction
summary kept.

## Method

- `$TS` below is the session scratchpad folder `tests-sources/`. The
  scratchpad is session storage and may be deleted later.
- `gen.mjs` builds a local git marketplace `zsmkt` in the Claude-only layout.
  Research 07 C8 showed that Codex installs it too. It has two plugins.
  - `zs-one`: group 1, matcher `startup|clear|compact`, one handler that
    prints `Fixture context line: ZSONE-<source>-n<count> is the session
    fixture token.` Group 2 has no matcher and only logs, so `resume`,
    `fork`, or anything unexpected still shows up in the log.
  - `zs-three`: one group, matcher `startup|clear|compact`, three handlers,
    like the real `hooks.json`. Handler k prints about 7,140 characters:
    `Fixture chunk k of 3 begins: ZSCkSTART-<tag>`, filler with
    `ZSCkMID-<tag>` in the middle, and a last line `Fixture chunk k of 3 END:
    ZSCkEND-<tag>`. The tag is `-<source>-n<count>`.
- Every handler uses the real launcher pattern, `node -e` with
  `CLAUDE_PLUGIN_ROOT||PLUGIN_ROOT`, and prints plain text as
  `always-on.mjs` does. Each handler keeps its own counter and appends its
  stdin JSON to `<config home>/zs-log/hooklog.jsonl`.
- A "full copy" means START, MID, and END of one tag inside one unbroken
  chunk body, or the exact ZSONE sentence. Tokens inside a model-written
  summary are counted separately, because only full copies answer the
  question.
- Claude Code: `CLAUDE_CONFIG_DIR=$T`, a fresh `mktemp -d` per test, and
  the model cwd in a separate `mktemp -d` under `$TMPDIR`. The runner
  unset the parent session's `CLAUDE_*` variables, as in research 08.
  `proxy.mjs` saved each `/v1/messages` request body, never headers, and
  forwarded to `api.anthropic.com` through `ANTHROPIC_BASE_URL`. The first
  request after a compact or clear is the ground truth. `body.py`
  summarizes a body.
- Codex: `HOME=$T CODEX_HOME=$T/.codex` per test and version, a copied
  `auth.json`, and the model cwd under `$TMPDIR`. `codex exec` ran with
  `--enable hooks --dangerously-bypass-hook-trust </dev/null`.
  `codex app-server` does not take the bypass flag, so `trust.py` copied
  each `currentHash` from `hooks/list` into `config.toml`, as research 07
  did. `appsrv.py` drives the app-server. `rana.py` rebuilds what the
  model sees after the last compaction, which is `replacement_history`
  plus the later response items, and counts full copies there.
- The question never names a marker: `Without using any tool, answer from
  your context only. List every token in your context that starts with the
  two letters ZS, one per line, in order of appearance, including repeats.
  Then on a last line write TOTAL: and the number of tokens you listed.`
- `~/.claude` and `~/.codex` were not touched, except to read and copy
  `auth.json`. See Cleanup.

## Where the sources come from

### Claude Code

`claude --help` lists no compact or clear flag. It does list `--autocompact
<auto|tokens>`, with a floor of 100k. Slash commands work as prompt text in
`-p`, as user messages in stream-json input, and in the TUI. The binary
names three env vars that matter here: `CLAUDE_CODE_AUTO_COMPACT_WINDOW`,
`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`, and `DISABLE_AUTO_COMPACT`.

### Codex

Codex source, checked at tags `rust-v0.154.0` and `rust-v0.157.1`. Line
numbers are for 0.157.1, with 0.154.0 in brackets.

- `hooks/src/events/session_start.rs`: `SessionStartSource` has `Startup`,
  `Resume`, `Clear`, `Compact`, and `Fork`. The matcher runs against
  `as_str()`.
- `core/src/session/session.rs:1881` [1621]: `InitialHistory::New` gives
  `startup`, `Resumed` gives `resume`, `Forked` with a parent gives `fork`,
  and `Cleared` gives `clear`.
- `app-server/src/request_processors/thread_processor.rs:1494` [1467]:
  `thread/start` with `sessionStartSource: "clear"` builds
  `InitialHistory::Cleared`. The field is not marked experimental.
- TUI: `/clear` (`AppEvent::ClearUi` in `tui/src/app/event_dispatch.rs`)
  starts a fresh thread with `ThreadStartSource::Clear`. `/compact` calls
  `thread_compact_start` (`tui/src/app/thread_routing.rs:912`). So the
  app-server tests below run the same code path as the TUI.
- `core/src/session/mod.rs:4117` [3846]: `replace_compacted_history` queues
  `SessionStartSource::Compact`. Manual, pre-turn, and mid-turn compaction
  all end there.
- `core/src/session/turn.rs:320` [287] runs the queued sources at the start
  of a turn. Pre-turn auto-compaction runs earlier, at line 183, so its
  `compact` fires in the same turn. `turn.rs:633` [545] runs them again
  right after a mid-turn auto-compaction.
- What compaction keeps. Hook context is recorded as a developer message
  (`record_additional_contexts` in `core/src/hook_runtime.rs`). Local
  compaction (`core/src/compact.rs`) keeps only user messages and the
  summary. Remote compaction (`core/src/compact_remote_v2.rs`) keeps user
  messages, and developer messages only when they are client-authored.
  Either way the old hook text is dropped. Mid-turn compaction re-adds the
  canonical initial context, which does not include hook output.
- `codex exec` has no slash-command handling. The only compaction code in
  `exec/src` prints "context compacted". Exec can reach `compact` only
  through auto-compaction, and it can never reach `clear`.

## Claude Code tests

### K1. `/compact` in one stream-json process

`drive.mjs` keeps one `claude -p --input-format stream-json --output-format
stream-json --verbose --include-hook-events` process open and sends `say
ok`, then `/compact`, then the question, each after the previous `result`.

```
>> say ok       hook_started SessionStart:startup x5 ... result: "ok"
>> /compact     status compacting
                hook_started SessionStart:compact x5
                hook_response ... "Fixture context line: ZSONE-compact-n2 ..."
                compact_boundary {"trigger":"manual","pre_tokens":22045,"post_tokens":6685}
>> question     result: "ZSONE-startup-n1 ... ZSC3END-startup-n1, ZSONE-compact-n2 ... ZSC1END-compact-n2, TOTAL: 20"
hook log:       one/log/c1/c2/c3 n=1 source=startup, then n=2 source=compact, same session id
```

The model listed 20 tokens. The request bodies show where each came from:

```
0001 (say ok)      msg1 system len=29767  startup: ZSONE + C1 C2 C3 START/MID/END
                   => full chunk bodies 3, exact ZSONE ['ZSONE-startup-n1']
0002 (summarize)   same history plus the compaction prompt
0003 (question)    msg0 user len=2281     "This session is being continued ..." summary,
                                          names all 10 startup tokens
                   msg1 system len=24204  compact: ZSONE + C2 C3 C1 START/MID/END
                   => full chunk bodies 3, exact ZSONE ['ZSONE-compact-n2']
```

The summary the model wrote says, in part:

```
2. Key Technical Concepts:
   - SessionStart hooks loaded fixture context:
     - Session fixture token: ZSONE-startup-n1
     - Three filler chunks with markers: ZSC1START-startup-n1, ZSC1MID-startup-n1, ...
     - The chunks were plain filler text with no instructions.
```

The transcript agrees. It has 4 `hook_success` attachments for
`SessionStart:startup` before the `compact_boundary` line, the
`isCompactSummary` user line, then 4 `hook_success` attachments for
`SessionStart:compact`. In 2.1.283, plain-text SessionStart output is stored
as `hook_success`, not `hook_additional_context`, and is rendered as
`SessionStart:<source> hook success: <text>` in a system-role message.

### K2. `/compact` through `-p --resume`

```
claude -p ... "say ok"                          startup x5
claude -p ... --resume <sid> "/compact"         resume (catch-all only), then compact x5
                                                compact_boundary manual, pre 22048, post 6671
claude -p ... --resume <sid> "<question>"       resume (catch-all only)
0003 (question): full chunk bodies 3, all compact; exact ZSONE ['ZSONE-compact-n2']
```

This is the new matcher at work. Both resumed processes fired `resume`,
which only the log group caught, so no copy was added. The compacted
history still held exactly one copy, the `compact` one.

### K3. `/clear` in one stream-json process

```
>> say ok       SessionStart:startup, session 207ef48f...
>> /clear       SessionStart:clear x5, init session 14e84b5c... (new id)
>> question     result: 10 tokens, all -clear-n2
0002 (question): msg0 holds the /clear caveat and the question only
                 msg1 system: ZSC2 ZSC1 ZSC3 START/MID/END and ZSONE, all clear-n2
                 => full chunk bodies 3, exact ZSONE ['ZSONE-clear-n2']
```

Nothing from the first session reached the new one. The hook fired as soon
as `/clear` ran, not on the next message.

### K4. TUI, `/compact` and then `/clear`

`claude` ran in tmux with `CLAUDE_CONFIG_DIR=$T`. `$T/.claude.json` was
seeded with `hasCompletedOnboarding`, the API key approval, and trust for
the cwd. `tx.sh` typed each line and read the pane.

```
❯ say ok        ⏺ ok
❯ /compact      ⎿  Compacted (ctrl+o to see full summary)
❯ <question>    ⏺ 10 startup tokens, then 10 compact tokens, TOTAL: 20
❯ /clear
❯ <question>    ⏺ 10 tokens, all -clear-n3, TOTAL: 10
hook log: startup n=1, compact n=2, clear n=3 (new session id 84818d5a...)
0004 (after compact): full chunk bodies 3, compact only
0006 (after clear):   full chunk bodies 3, clear only
```

The TUI matches K1 and K3. Requests 0003 and 0005 were small
`claude-haiku-4-5` calls with no fixture text, probably titles.

### K5 and K6. Auto-compact

K5 set only `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=2` over three turns. Nothing
compacted, and the debug log has no autocompact line. The hook fired once,
on `startup`.

K6 set `CLAUDE_CODE_AUTO_COMPACT_WINDOW=100000` and
`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=10`, with `--debug-file`:

```
turn 1  autocompact: ... effectiveWindow=80000
        autocompact: routing through reactive (thresholdSource=env)
        Reactive compact: fewer than 2 groups, nothing to compact     -> compact_error too_few_groups
turn 2  autocompact: fixed prefix ~11794 > threshold 8000 - compaction cannot help
        Reactive compact: no assistant messages in summarize set, bailing
turn 3  [API REQUEST] /v1/messages source=compact
        Hook SessionStart:compact (SessionStart) success: Fixture chunk 2 of 3 begins: ZSC2START-compact-n2 ...
        compact_boundary {"trigger":"auto","pre_tokens":22118,"post_tokens":6761,"preserved_segment":{...}}
0004 (question): summary with the 10 startup tokens, a preserved "ok",
                 the question, then compact ZSC2 ZSC3 ZSC1 and ZSONE
                 => full chunk bodies 3, exact ZSONE ['ZSONE-compact-n2']
```

Auto-compact in 2.1.283 runs through the reactive compactor when the
threshold comes from the environment. It fired `SessionStart` with
`compact` and left one full copy. The preserved segment did not bring back
the startup attachments. Without the window override, the percent override
alone did not trigger anything in three short turns.

## Codex tests

### X1. Manual compact through app-server

```
python3 appsrv.py <codex> $T <cwd> out.jsonl start "turn:say ok" compact "turn:<question>"
```

Rollout, 0.157.1:

```
L8   developer len=68    ZSONE-startup-n1
L9   developer len=7139  ZSC1START/MID/END-startup-n1
L10  developer len=7139  ZSC2 ... L11 developer len=7139 ZSC3 ...
L17  token_count last_input=18247
L21  compacted replacement_history=2 items
       rh message user len=6       (say ok)
       rh compaction   len=1994    (opaque)
L33  developer len=68    ZSONE-compact-n2
L34-36 developer len=7139 each, ZSC1 ZSC2 ZSC3 compact-n2
L44  token_count last_input=18928
=> visible after compaction: exact ZSONE ['ZSONE-compact-n2'], full chunks C1 C2 C3 compact-n2
reply: the 10 compact tokens, TOTAL: 10
hook log: startup n=1, then compact n=2 when the question turn started
```

0.154.0 gave the same rollout shape: input 18,617 before and 19,584 after,
with `replacement_history` of the user message plus one compaction item.
Its model (`gpt-6-astra`) declined to list developer context, so the
evidence for 0.154.0 is the rollout and the token counts.

A second copy would add about 5,400 tokens, taking the input to about
24,000. The measured post-compaction inputs are within 1,000 of the
startup inputs on both versions. The old copy is gone even though the
compaction item is opaque.

`hook/started` and `hook/completed` arrived for all five handlers on the
turn after the compaction, not during the compaction turn.
`turn/completed` arrived late, only after the next request was sent, as the
0.154.0 hang in research 07 suggested. The driver ended each turn when
`thread/status/changed` went back to `idle`.

### X2. Clear through app-server

```
python3 appsrv.py <codex> $T <cwd> out.jsonl start "turn:say ok" start:clear "turn:<question>"
```

Both versions gave the same result. The second thread got a new rollout
file. The hook log shows `source=clear` for the new thread id. Its rollout
has only the clear copy:

```
L8   developer len=66    ZSONE-clear-n2
L9-11 developer len=7133 each, ZSC1 ZSC2 ZSC3 START/MID/END clear-n2
L19  token_count last_input=18770 (0.157.1), 18834 (0.154.0)
reply: the 10 clear tokens plus the bare "ZS" from the question, TOTAL: 11
```

### X3. TUI on 0.157.1

`codex -c 'model_reasoning_effort="low"' -s read-only -a never` ran in
tmux. After the folder trust prompt, the only warning was that `-c`
overrides force embedded mode.

```
› say ok        • ok                         hook log: startup n=1
› /compact      • Context compacted · 1s     hook log: nothing new yet
› <question>    • ZSONE-startup-n1, ZSC1/2/3, then the 10 compact tokens, TOTAL: 12
                                             hook log: compact n=2
› /clear        (session summary printed, fresh composer)
› <question>    • the 10 clear tokens, TOTAL: 11   hook log: clear n=3, new thread
rollout after compact: replacement_history = user + compaction; one full copy (compact-n2);
                       last_input 17989 before, 18116 after
rollout after clear:   one full copy (clear-n3), last_input 18031
```

The TUI matches X1 and X2. The first two tokens of the post-compact reply
come from the compaction summary. The rollout has no startup text after
the compaction.

### X4. Mid-turn auto-compaction in exec

```
codex exec ... -c model_auto_compact_token_limit=24000 \
  'Run the shell command `seq 1 4000` and read its output. Then run the shell command `echo second`. Then reply with the single word DONE.'
```

Both versions printed this, trimmed:

```
exec /bin/zsh -lc 'seq 1 4000' ... succeeded
context compacted
hook: SessionStart (x5) ... hook: SessionStart Completed (x5)
exec /bin/zsh -lc 'echo second' ... succeeded
DONE
```

Rollout, 0.157.1. The 0.154.0 rollout had the same shape.

```
L20  token_count last_input=18266
L22  compacted replacement_history=6 items: 3 developer (initial context, no ZS text),
     2 user, 1 compaction
L28-31 developer: ZSONE + ZSC1 ZSC2 ZSC3 compact-n2
L36  token_count last_input=18452
=> one full copy, compact-n2
```

The `compact` hook ran in the middle of the turn, right after the
compaction and before the next model request. That matches `turn.rs:633`.

### X5 and X6. Pre-turn auto-compaction on `exec resume`

The first run filled the history and set no limit. Then `codex exec -c
model_auto_compact_token_limit=... resume --last "<question>"`.

- 0.154.0, X5: after `seq 1 4000` the input was 29,751, with a limit of
  24,000. The resume turn logged `resume` (catch-all only), compacted, then
  ran `compact` x5 in the same turn. Visible after compaction: one full copy,
  compact-n2. Input 19,065. The reply listed the startup tokens too, from
  the compaction summary.
- 0.157.1, X5: no compaction. The model ran `seq` inside a code-mode script
  and kept only a summary, so the history stayed at 18,411 tokens. The
  resume turn fired only the catch-all `resume` handler and showed the one
  startup copy.
- 0.157.1, X6: the first turn asked for the integers 1 to 2500 with no
  command. The resume ran with a limit of 21,000. It compacted before
  sampling, logged `resume` then `compact`, and ended with one full copy,
  compact-n2. Input 18,407.

### X7. Compact, quit, then resume

Codex keeps queued SessionStart sources only in memory
(`pending_session_start_sources` in `core/src/state/session.rs`). The only
callers are the session start, which queues `resume` on a resume
(`session.rs:1899` [1639]), and `replace_compacted_history`. Nothing
rebuilds a pending `compact` from the rollout. Two cases, each in a fresh
home:

- Case A: `appsrv.py ... start "turn:say ok" compact`, and the driver
  exits. Then `codex exec ... resume <thread-id> "<question>"` from the same
  cwd.
- Case B: the same, with one more turn, `say ok again`, after the compact
  and before the exit.

```
0.157.1 A  hook log: startup x5, resume (catch-all only)
           visible after compaction: exact ZSONE [], full chunks [], input 13,878
           reply: "ZS", TOTAL: 1
0.154.0 A  hook log: startup x5, resume (catch-all only)
           visible after compaction: exact ZSONE [], full chunks [], input 14,705
           reply: the 10 startup tokens, recalled from the compaction summary
0.157.1 B  hook log: startup x5, compact x5, resume (catch-all only)
           visible: one full copy, compact-n2, input 19,719
0.154.0 B  hook log: startup x5, compact x5, resume (catch-all only)
           visible: one full copy, compact-n2, input 20,516
```

In case A the resumed input is 3,900 to 4,400 tokens below the first turn,
which held a copy.
With the new matcher, a thread compacted as its last action comes back
with no rules, only the summary. The old matcher would have injected one
copy on that resume, and two in case B. Claude Code has no such gap,
because it runs the `compact` hook during `/compact` and saves the output
in the transcript. K2 showed that copy reloading on resume.

## Other findings

1. Claude Code orders parallel handler output by completion time. The
   chunk order varied between runs: startup ONE C1 C2 C3 in K1, ONE C3 C2 C1
   in K3, compact ONE C2 C3 C1 in K1, clear C2 C1 C3 ONE in K3. Codex kept
   the declared order in every run. The real chunks are labelled "1 of 3"
   to "3 of 3", so in Claude Code they can arrive out of order. That matters
   only if a chunk depends on the one before it.
2. Compaction summaries in both runtimes can carry marker tokens from the
   old copy, because the model summarizes what it saw. With real rules, the
   summary may paraphrase them. That is not a second copy, but a user may
   see a short restatement next to the fresh injection.
3. In Codex, `clear` and `compact` fire lazily, at the next turn. A user who
   runs `/compact` and quits gets no hook run, and under the new matcher a
   later resume adds none (X7). In Claude Code both fire during the command
   itself.
4. Codex writes the exported shell environment into
   `$CODEX_HOME/shell_snapshots/*.sh`, including `ANTHROPIC_API_KEY` when it
   is set. Test harnesses that give Codex a throwaway home should delete
   that folder, or unset secrets first. The same file exists from research
   07 in `tests-codex/homes/extra-154/.codex/shell_snapshots/`, which this
   test did not touch.
5. Codex `logs_*.sqlite` files in a throwaway home hold JWT-shaped strings.
   Delete them with `auth.json`.

## Not tested

- Claude Code auto-compact at its default threshold on a long real
  session. The forced run used env overrides and the reactive path.
- A forced output style after compaction, from research 08 L8.
- Subagent threads. Codex skips SessionStart for internal subagents and
  sends SubagentStart for spawned ones (`hook_runtime.rs`).
- `--fork-session` and Codex `fork` after a compaction.
- The Codex TUI with the shared background app-server. Every TUI run here
  used `-c`, which forces embedded mode. If a shared server keeps a thread
  loaded after the TUI exits, the pending `compact` might survive there.
  X7 used a fresh process for the resume.

## Cleanup

- Every `auth.json` copy was deleted. `find $TS -name auth.json` printed
  nothing.
- I deleted the `shell_snapshots` folders and `logs_*.sqlite*` files in the
  Codex homes, and the `.claude.json` backups in the seeded Claude home.
  A search for the API key's last 20 characters, and for `refresh_token`,
  `id_token`, and `eyJhbGci`, found nothing under `$TS`.
- The same sweep was repeated after the X7 runs, with the same result.
- The model cwds under `$TMPDIR` were deleted. The proxy and the tmux
  server were stopped. No `$TMPDIR/hook_outputs` files were created.
