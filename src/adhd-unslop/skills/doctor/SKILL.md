---
name: doctor
description: 'Check an adhd-unslop install and print what is wrong, with the fix for each problem. Run it only when the user invokes it.'
disable-model-invocation: true
license: MIT
---
# Check the adhd-unslop install

Run the doctor script that ships in this skill's folder. It only reads files and changes nothing.

- In Claude Code, run `node "${CLAUDE_SKILL_DIR}/scripts/doctor.mjs"`.
- In Codex, run `node "<dir>/scripts/doctor.mjs"`, where `<dir>` is the absolute path of the folder that holds this `SKILL.md`.

Run only that path, and never search the disk for another copy of the script.

The script prints one line per check, starting with `OK`, `WARN`, or `FAIL`. Each `WARN` or `FAIL` line has a `fix:` line under it, and sometimes a `then:` line. A `fix:` line holds either one shell command or one instruction. A `then:` line is a step for the user after the fix. The script exits with code 1 when a check fails. That exit code is the expected result for a broken install, not a problem with the script, so do not debug the script.

## Report and fixes

1. Show the user the full output in a code block, unchanged.
2. If there are no `WARN` or `FAIL` lines, say the install looks healthy and stop.
3. Otherwise, go through the fixes one at a time. For a `fix:` line that is a shell command, show it exactly as printed and ask the user. Run it only after the user says yes. For an instruction, show it to the user instead of acting on it. Then show any `then:` line, and move to the next fix.

Never run a fix without asking, and never change anything the output does not name.
