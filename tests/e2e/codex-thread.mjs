// Drives one Codex thread through `codex app-server` for tests/e2e/run.sh,
// in the home that HOME and CODEX_HOME name. `compact` sends
// thread/compact/start, which is what the TUI's /compact calls; codex exec
// has no way to ask for it (design/research/09-tests-clear-compact.md).
//
//   node tests/e2e/codex-thread.mjs <codex-bin> <cwd> <log> <step>...
//     A step is turn:<prompt> or compact. Each step waits until the thread
//     is idle again, or for turn/completed or thread/compacted.
//
// App-server does not take --dangerously-bypass-hook-trust, so hooks run
// only when trusted (see codex-hooks.mjs trust). Prints "thread <id>" and
// "rollout <path>". Writes every JSON-RPC line to <log>. Exits 1 when a
// request fails or a step takes longer than 5 minutes.

import { spawn } from "node:child_process";
import fs from "node:fs";

const [codex, cwd, log, ...steps] = process.argv.slice(2);
if (!codex || !cwd || !log || !steps.length || !steps.every((s) => s === "compact" || s.startsWith("turn:"))) {
  console.error("usage: codex-thread.mjs <codex-bin> <cwd> <log> turn:<prompt>|compact ...");
  process.exit(2);
}

const out = fs.createWriteStream(log);
const env = { ...process.env, RUST_LOG: "warn" };
delete env.OPENAI_API_KEY;
delete env.CODEX_API_KEY;
delete env.ANTHROPIC_API_KEY;
const server = spawn(codex, ["app-server", "--listen", "stdio://"], { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
server.stderr.on("data", (d) => out.write(d));

const waiting = new Map();
const listeners = new Set();
let lastError = "";
let buffer = "";
server.stdout.setEncoding("utf8");
server.stdout.on("data", (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line.startsWith("{")) continue;
    out.write(line + "\n");
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.id !== undefined && waiting.has(msg.id)) {
      waiting.get(msg.id)(msg);
      waiting.delete(msg.id);
    } else if (msg.method) {
      if (msg.method === "error") lastError = msg.params?.error?.message ?? "";
      for (const fn of [...listeners]) fn(msg);
    }
  }
});

let nextId = 0;
function request(method, params) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    waiting.set(id, (msg) => (msg.error ? reject(new Error(`${method}: ${JSON.stringify(msg.error)}`)) : resolve(msg.result)));
    server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}

// Resolves when the thread goes active and then idle, or on a done event.
// A turn/completed counts only for turnId: Codex can send the compaction
// turn's turn/completed late, after the next turn/start.
function settled(threadId, doneMethods, turnId = () => null) {
  return new Promise((resolve, reject) => {
    let active = false;
    const timer = setTimeout(() => {
      listeners.delete(fn);
      reject(new Error(`timed out waiting for ${doneMethods.join(" or ")}`));
    }, 300000);
    const fn = (msg) => {
      const p = msg.params ?? {};
      if (p.threadId && p.threadId !== threadId) return;
      if (msg.method === "thread/status/changed") {
        if (p.status?.type === "active") active = true;
        if (p.status?.type === "systemError") {
          clearTimeout(timer);
          listeners.delete(fn);
          reject(new Error(`thread status systemError${lastError ? `: ${lastError}` : ""}`));
          return;
        }
        if (!(active && p.status?.type === "idle")) return;
      } else if (!doneMethods.includes(msg.method)) {
        return;
      } else if (msg.method === "turn/completed" && p.turn?.id !== turnId()) {
        return;
      }
      clearTimeout(timer);
      listeners.delete(fn);
      resolve(msg.method);
    };
    listeners.add(fn);
  });
}

let code = 0;
try {
  await request("initialize", {
    clientInfo: { name: "adhd-unslop-e2e", title: "adhd-unslop e2e", version: "0" },
    capabilities: { experimentalApi: true, requestAttestation: false, optOutNotificationMethods: [] },
  });
  server.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "initialized" }) + "\n");
  const started = await request("thread/start", { cwd, sandbox: "read-only", approvalPolicy: "never" });
  const thread = started.thread;
  console.log(`thread ${thread.id}`);
  if (thread.path) console.log(`rollout ${thread.path}`);
  for (const step of steps) {
    if (step === "compact") {
      const done = settled(thread.id, ["thread/compacted"]);
      await request("thread/compact/start", { threadId: thread.id });
      await done;
    } else {
      let id = null;
      const done = settled(thread.id, ["turn/completed"], () => id);
      const res = await request("turn/start", { threadId: thread.id, input: [{ type: "text", text: step.slice(5) }] });
      id = res?.turn?.id ?? null;
      await done;
    }
  }
} catch (err) {
  console.error(`codex-thread.mjs: ${err.message}`);
  code = 1;
} finally {
  server.stdin.end();
  server.kill("SIGTERM");
  const killer = setTimeout(() => server.kill("SIGKILL"), 3000);
  server.on("exit", () => {
    clearTimeout(killer);
    out.end(() => process.exit(code));
  });
}
