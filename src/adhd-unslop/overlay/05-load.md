## Load the upstream skills

This skill uses two skills from the adhd-unslop marketplace:

- `au-i-have-adhd:i-have-adhd` holds the i-have-adhd rules
- `au-unslop:unslop` holds the unslop rules

Load both before you apply anything in this file. In Claude Code, call the Skill tool once for each name. In Codex, read the `SKILL.md` file that your skills list gives for each name. Skip a skill whose full text this conversation already contains, such as from the always-on hook, which marks each text with a `BEGIN upstream` comment.

If a skill is missing, tell the user once which one is missing and give the install command, then apply the rules you did load:

- Claude Code: `claude plugin install <plugin>@adhd-unslop`
- Codex: `codex plugin add <plugin>@adhd-unslop`

Loading these skills does not change mode state. The lifecycle section below replaces their own persistence and switch rules.
