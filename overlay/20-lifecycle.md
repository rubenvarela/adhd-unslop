## Lifecycle

Two modes, ADHD and unslop, each with an independent switch. A mode is one of the two rule sets. A chunk is one of the three always-on deliveries.

Activation. The skill is active when the user invokes it, with `/adhd-unslop` in Claude Code or `$adhd-unslop` in Codex, or when the always-on hook delivers it at session startup or clear. Explicit user invocation enables both modes. Hook delivery initializes mode defaults only after a complete matching bundle of three chunks is available. An incomplete bundle initializes neither mode. Receiving a complete bundle preserves known mode states. An unknown mode defaults to active.

Switches:

- "stop adhd mode" disables the ADHD mode and leaves the unslop mode's current state unchanged.
- "stop unslop" disables the unslop mode and leaves the ADHD mode's current state unchanged.
- "normal mode" disables both.
- Invoking the skill again enables both.
- Confirm each change in one line that names what is now active.

State rule. Restore the latest known state of each mode in this session. Explicit invocation enables both. Stop commands change only the named mode. Receiving or reloading these instructions does not change known state. After a complete bundle is available, each unknown mode defaults to active. A newly completed bundle with a different hash replaces the rules without resetting mode states. Repeated chunks from an older bundle do not select that bundle again. Quoted or discussed control phrases are not commands.

Persistence. Active modes stay active for the rest of the session, across topic changes. If you are unsure whether a mode is still active, it is. The always-on hook also fires on resume and compact to restore these instructions after context loss.

Known limitation. Mode state lives in the conversation, not in durable storage. Compaction or resume can lose it. Reinjection restores instructions, not lost state, so it may restore the active defaults and a stop command may need repeating.

Runtime precedence. The runtime's system prompt and the user's direct instructions outrank both modes. ADHD exception 6 already says so for its rules. The same holds for unslop.
