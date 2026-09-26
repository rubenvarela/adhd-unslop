// Codex hook trust helper for tests/e2e/run.sh. Talks JSON-RPC to
// `codex app-server` over stdio in the home that HOME and CODEX_HOME name,
// with the request shapes recorded in design/research/07-tests-codex.md (C3).
// Needs no auth.
//
//   node tests/e2e/codex-hooks.mjs <codex-bin> <cwd> list
//     Prints one JSON object per hook: key, pluginId, trustStatus,
//     currentHash, sourcePath.
//   node tests/e2e/codex-hooks.mjs <codex-bin> <cwd> trust <plugin-id>
//     Records trust for every hook of <plugin-id> the way the /hooks review
//     does: appends [hooks.state."<key>"] trusted_hash = "<hash>" to
//     $CODEX_HOME/config.toml. Prints the number of entries written.
//
// Exits 1 when app-server fails or answers with an error.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const [codex, cwd, mode, pluginId] = process.argv.slice(2);
if (!codex || !cwd || !["list", "trust"].includes(mode) || (mode === "trust" && !pluginId)) {
  console.error("usage: codex-hooks.mjs <codex-bin> <cwd> list | trust <plugin-id>");
  process.exit(2);
}
const codexHome = process.env.CODEX_HOME;
if (!codexHome) {
  console.error("codex-hooks.mjs: CODEX_HOME must name the throwaway Codex home");
  process.exit(2);
}

const env = { ...process.env, CODEX_APP_SERVER_DISABLE_MANAGED_CONFIG: "1", RUST_LOG: "warn" };
delete env.OPENAI_API_KEY;
delete env.CODEX_API_KEY;
delete env.ANTHROPIC_API_KEY;

const server = spawn(codex, ["app-server", "--listen", "stdio://"], { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
let stderr = "";
server.stderr.on("data", (d) => {
  stderr += d;
});

const waiting = new Map();
let buffer = "";
server.stdout.setEncoding("utf8");
server.stdout.on("data", (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line.startsWith("{")) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.id !== undefined && waiting.has(msg.id)) {
      waiting.get(msg.id)(msg);
      waiting.delete(msg.id);
    }
  }
});

let nextId = 0;
function request(method, params, timeoutMs = 60000) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), timeoutMs);
    waiting.set(id, (msg) => {
      clearTimeout(timer);
      if (msg.error) reject(new Error(`${method}: ${JSON.stringify(msg.error)}`));
      else resolve(msg.result);
    });
    server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}

function notify(method) {
  server.stdin.write(JSON.stringify({ jsonrpc: "2.0", method }) + "\n");
}

async function listHooks() {
  await request("initialize", {
    clientInfo: { name: "adhd-unslop-e2e", title: "adhd-unslop e2e", version: "0" },
    capabilities: { experimentalApi: true, requestAttestation: false, optOutNotificationMethods: [] },
  });
  notify("initialized");
  const result = await request("hooks/list", { cwds: [cwd] });
  const hooks = [];
  for (const entry of result?.data ?? []) {
    for (const e of entry.errors ?? []) console.error(`hooks/list error: ${JSON.stringify(e)}`);
    for (const h of entry.hooks ?? []) hooks.push(h);
  }
  return hooks;
}

let code = 0;
try {
  const hooks = await listHooks();
  if (mode === "list") {
    for (const h of hooks) {
      const { key, pluginId: id, trustStatus, currentHash, sourcePath } = h;
      console.log(JSON.stringify({ key, pluginId: id, trustStatus, currentHash, sourcePath }));
    }
  } else {
    const configPath = path.join(codexHome, "config.toml");
    const existing = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf8") : "";
    let written = 0;
    let text = "";
    for (const h of hooks.filter((x) => x.pluginId === pluginId)) {
      if (!h.key || !h.currentHash) continue;
      if (existing.includes(`[hooks.state."${h.key}"]`)) continue;
      text += `\n[hooks.state."${h.key}"]\ntrusted_hash = "${h.currentHash}"\n`;
      written++;
    }
    if (text) fs.appendFileSync(configPath, text);
    console.log(written);
  }
} catch (err) {
  console.error(`codex-hooks.mjs: ${err.message}`);
  if (stderr) console.error(stderr.slice(-2000));
  code = 1;
} finally {
  server.stdin.end();
  server.kill("SIGTERM");
  const killer = setTimeout(() => server.kill("SIGKILL"), 3000);
  server.on("exit", () => {
    clearTimeout(killer);
    process.exit(code);
  });
}
