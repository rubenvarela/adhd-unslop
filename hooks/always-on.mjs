// SessionStart hook launcher. Prints one chunk of the adhd-unslop composite
// when the user has opted in by creating the flag file
// $CLAUDE_CONFIG_DIR/.adhd-unslop-always or $CODEX_HOME/.adhd-unslop-always.
//
// Selected by ADHD_UNSLOP_CHUNK=1|2|3, set by each handler in hooks/hooks.json.
// Never blocks session start: every path exits 0. With opt-in present and a
// broken installation, prints one JSON systemMessage and no context.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { flagPaths, optedIn, renderChunk } from "./lib.mjs";

try {
  if (optedIn()) {
    const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
    const index = Number.parseInt(process.env.ADHD_UNSLOP_CHUNK ?? "", 10);
    const result = renderChunk(root, index, { flags: flagPaths() });
    if (result.ok) {
      process.stdout.write(result.text);
    } else {
      process.stdout.write(
        JSON.stringify({ systemMessage: `adhd-unslop always-on: ${result.reason}. Reinstall or rebuild the plugin.` }) + "\n",
      );
    }
  }
} catch {
  // Never block session start.
}
process.exit(0);
