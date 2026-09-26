// JSON-RPC client for `codex app-server` over stdio, shared by
// codex-hooks.mjs and codex-thread.mjs. Runs in the home that HOME and
// CODEX_HOME name, with API keys removed and managed config turned off, so
// nothing outside the throwaway home leaks in.
//
// Every request has a timeout. When app-server fails to start or exits,
// every pending request and wait is rejected at once, so a caller never
// hangs on a dead server.

import { spawn } from "node:child_process";

export function startAppServer(codex, cwd, { onLine = () => {} } = {}) {
  const env = { ...process.env, CODEX_APP_SERVER_DISABLE_MANAGED_CONFIG: "1", RUST_LOG: "warn" };
  delete env.OPENAI_API_KEY;
  delete env.CODEX_API_KEY;
  delete env.ANTHROPIC_API_KEY;
  const child = spawn(codex, ["app-server", "--listen", "stdio://"], { cwd, env, stdio: ["pipe", "pipe", "pipe"] });

  const pending = new Map();
  const listeners = new Set();
  const waits = new Set();
  let dead = null;
  let stderr = "";
  let gone = false;
  let markGone;
  const goneP = new Promise((resolve) => {
    markGone = () => {
      gone = true;
      resolve();
    };
  });

  function die(err) {
    if (dead) return;
    dead = err;
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    pending.clear();
    for (const fail of [...waits]) fail(err);
  }

  child.on("error", (e) => {
    die(new Error(`app-server failed: ${e.message}`));
    if (child.pid === undefined) markGone();
  });
  child.on("exit", (code, signal) => {
    const tail = stderr.trim().split("\n").slice(-3).join(" | ");
    die(new Error(`app-server exited (${signal ?? `code ${code}`})${tail ? `: ${tail}` : ""}`));
    markGone();
  });
  child.stdin.on("error", () => {
    // A write after the server died; die() reports it.
  });
  child.stderr.on("data", (d) => {
    stderr += d;
    onLine(String(d));
  });

  let buffer = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("{")) continue;
      onLine(line + "\n");
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.id !== undefined && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.error) p.reject(new Error(`${p.method}: ${JSON.stringify(msg.error)}`));
        else p.resolve(msg.result);
      } else if (msg.method) {
        for (const fn of [...listeners]) fn(msg);
      }
    }
  });

  let nextId = 0;
  function request(method, params, timeoutMs = 30000) {
    if (dead) return Promise.reject(dead);
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method}: no reply from app-server in ${timeoutMs / 1000} s`));
      }, timeoutMs);
      pending.set(id, { method, resolve, reject, timer });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }

  function notify(method, params) {
    if (!dead) child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, ...(params ? { params } : {}) }) + "\n");
  }

  // Calls fn for every notification until close.
  function on(fn) {
    listeners.add(fn);
  }

  // Resolves with the first value other than undefined that match returns
  // for a notification. Rejects on timeout, a throw from match, or a dead
  // server.
  function waitFor(match, timeoutMs, what) {
    return new Promise((resolve, reject) => {
      if (dead) {
        reject(dead);
        return;
      }
      const finish = (err, value) => {
        clearTimeout(timer);
        listeners.delete(listener);
        waits.delete(finish);
        if (err) reject(err);
        else resolve(value);
      };
      const listener = (msg) => {
        let value;
        try {
          value = match(msg);
        } catch (err) {
          finish(err);
          return;
        }
        if (value !== undefined) finish(null, value);
      };
      const timer = setTimeout(() => finish(new Error(`no ${what} from app-server in ${timeoutMs / 1000} s`)), timeoutMs);
      listeners.add(listener);
      waits.add(finish);
    });
  }

  async function close() {
    child.stdin.end();
    if (gone) return;
    child.kill("SIGTERM");
    const killer = setTimeout(() => child.kill("SIGKILL"), 3000);
    const cap = new Promise((resolve) => setTimeout(resolve, 6000).unref());
    await Promise.race([goneP, cap]);
    clearTimeout(killer);
  }

  return { request, notify, on, waitFor, close, stderr: () => stderr };
}
