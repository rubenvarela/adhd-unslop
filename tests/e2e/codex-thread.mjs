// Drives one Codex thread through `codex app-server` for tests/e2e/run.sh,
// in the home that HOME and CODEX_HOME name. `compact` sends
// thread/compact/start, which is what the TUI's /compact calls; codex exec
// has no way to ask for it (design/research/09-tests-clear-compact.md).
//
//   node tests/e2e/codex-thread.mjs <codex-bin> <cwd> <log> <step>...
//     A step is turn:<prompt> or compact. Each step waits until the thread
//     is idle again, or for turn/completed or thread/compacted.
//
// CODEX_MODEL and CODEX_EFFORT, when set, pick the model and reasoning effort
// for the thread, its turns, and so its compaction.
//
// App-server does not take --dangerously-bypass-hook-trust, so hooks run
// only when trusted (see codex-hooks.mjs trust). Prints "thread <id>" and
// "rollout <path>". Writes every JSON-RPC line to <log>. Exits 1 when a
// request fails, app-server exits, or a step takes longer than 180 seconds.

import fs from "node:fs";
import { startAppServer } from "./app-server.mjs";

const STEP_MS = 180000;

const [codex, cwd, log, ...steps] = process.argv.slice(2);
if (!codex || !cwd || !log || !steps.length || !steps.every((s) => s === "compact" || s.startsWith("turn:"))) {
  console.error("usage: codex-thread.mjs <codex-bin> <cwd> <log> turn:<prompt>|compact ...");
  process.exit(2);
}

const model = process.env.CODEX_MODEL || null;
const effort = process.env.CODEX_EFFORT || null;
const out = fs.createWriteStream(log);
const server = startAppServer(codex, cwd, { onLine: (line) => out.write(line) });
let lastError = "";
server.on((msg) => {
  if (msg.method === "error") lastError = msg.params?.error?.message ?? "";
});

// Resolves when the thread goes active and then idle, or on a done event.
// A turn/completed counts only for turnId: Codex can send the compaction
// turn's turn/completed late, after the next turn/start.
// The promise also gets a no-op catch, so a rejection that lands while the
// caller still awaits the request is not reported as unhandled.
function settled(threadId, doneMethods, turnId = () => null) {
  let active = false;
  const wait = server.waitFor(
    (msg) => {
      const p = msg.params ?? {};
      if (p.threadId && p.threadId !== threadId) return undefined;
      if (msg.method === "thread/status/changed") {
        const type = p.status?.type;
        if (type === "active") active = true;
        if (type === "systemError") throw new Error(`thread status systemError${lastError ? `: ${lastError}` : ""}`);
        return active && type === "idle" ? msg.method : undefined;
      }
      if (!doneMethods.includes(msg.method)) return undefined;
      if (msg.method === "turn/completed" && p.turn?.id !== turnId()) return undefined;
      return msg.method;
    },
    STEP_MS,
    doneMethods.join(" or "),
  );
  wait.catch(() => {});
  return wait;
}

let code = 0;
try {
  await server.request("initialize", {
    clientInfo: { name: "adhd-unslop-e2e", title: "adhd-unslop e2e", version: "0" },
    capabilities: { experimentalApi: true, requestAttestation: false, optOutNotificationMethods: [] },
  });
  server.notify("initialized");
  const started = await server.request("thread/start", {
    cwd,
    sandbox: "read-only",
    approvalPolicy: "never",
    ...(model ? { model } : {}),
    ...(effort ? { config: { model_reasoning_effort: effort } } : {}),
  });
  const thread = started.thread;
  console.log(`thread ${thread.id}`);
  if (thread.path) console.log(`rollout ${thread.path}`);
  for (const step of steps) {
    if (step === "compact") {
      const done = settled(thread.id, ["thread/compacted"]);
      await server.request("thread/compact/start", { threadId: thread.id }, STEP_MS);
      await done;
    } else {
      let id = null;
      const done = settled(thread.id, ["turn/completed"], () => id);
      const res = await server.request(
        "turn/start",
        {
          threadId: thread.id,
          input: [{ type: "text", text: step.slice(5) }],
          ...(model ? { model } : {}),
          ...(effort ? { effort } : {}),
        },
        STEP_MS,
      );
      id = res?.turn?.id ?? null;
      await done;
    }
  }
} catch (err) {
  console.error(`codex-thread.mjs: ${err.message}`);
  code = 1;
}
await server.close();
out.end(() => process.exit(code));
