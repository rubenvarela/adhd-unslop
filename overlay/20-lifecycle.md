## Lifecycle

A mode is a rule set, either ADHD or unslop. Each mode has its own switch. A chunk is one of the three parts delivered by the always-on hook.

**Activation.** The user activates the skill with `/adhd-unslop` in Claude Code or `$adhd-unslop` in Codex. Explicit invocation enables both modes. The always-on hook can also activate the skill at session startup or clear.

Hook delivery initializes mode defaults only after all three matching chunks are available. An incomplete bundle initializes neither mode. A complete bundle preserves known mode states and defaults each unknown mode to active.

Switches:

- "stop adhd mode" disables ADHD and leaves unslop's current state unchanged.
- "stop unslop" disables unslop and leaves ADHD's current state unchanged.
- "normal mode" disables both.
- Invoking the skill again enables both.

Confirm each change in one line that names which modes are now active. Quoted or discussed control phrases are not commands.

**State rule.** Restore the latest known state of each mode in this session. Explicit invocation enables both modes. Stop commands change only the named mode. Receiving or reloading these instructions preserves known states. Once a complete matching bundle is available, each unknown mode defaults to active.

A newly completed bundle with a different hash replaces the rules without resetting mode states. Repeated chunks from an older bundle do not reactivate that bundle.

**Persistence.** Active modes stay active for the rest of the session, including across topic changes. If you are unsure whether a mode is still active, treat it as active. The always-on hook also runs on resume and compact to restore these instructions after context loss.

**Known limitation.** Mode state exists only in the conversation. Compaction or resume can lose it. Reinjection restores the instructions without recovering lost state, so it may restore the active defaults. A stop command may need repeating.

**Runtime precedence.** The runtime's system prompt and the user's direct instructions outrank both modes. ADHD exception 6 states this for ADHD. The same precedence applies to unslop.
