// SessionStart hook: warn when a plugin this one depends on is not installed.
// Claude Code installs dependencies itself; Codex does not, so this mostly
// fires there. It only warns and never installs anything.
//
// Never blocks session start: every path exits 0. Prints nothing when every
// dependency is present.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { missingDependencies, dependencyWarning } from "./lib.mjs";

try {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const missing = missingDependencies(root);
  if (missing.plugins.length) {
    // systemMessage reaches the user in the Claude Code and Codex TUIs. The
    // context line lets the model pass it on where no TUI shows it, as in codex exec.
    const warning = dependencyWarning(root, missing);
    process.stdout.write(JSON.stringify({
      systemMessage: warning,
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: `Tell the user once, before anything else: ${warning}` },
    }) + "\n");
  }
} catch {
  // Never block session start.
}
process.exit(0);
