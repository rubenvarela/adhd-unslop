// SessionStart hook launcher. Prints one chunk of the adhd-unslop rules when
// the user has opted in: a flag file at $CLAUDE_CONFIG_DIR/.adhd-unslop-always
// or $CODEX_HOME/.adhd-unslop-always, or ADHD_UNSLOP_ALWAYS=1. ADHD_UNSLOP_ALWAYS=0
// turns it off even when a flag exists.
//
// Selected by ADHD_UNSLOP_CHUNK=1|2|3, set by each handler in hooks/hooks.json.
// Prints nothing on a Claude Code resume, which keeps the earlier copy.
// Never blocks session start: every path exits 0. With opt-in present and a
// broken installation, prints one JSON systemMessage and no context.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { flagPaths, optedIn, readHookInput, renderChunk, runtimeOf, shouldInject } from "./lib.mjs";

async function main() {
  if (!optedIn()) return;
  const input = await readHookInput();
  if (!shouldInject(input?.source, runtimeOf())) return;
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

main()
  .catch(() => {
    // Never block session start.
  })
  .finally(() => process.exit(0));
