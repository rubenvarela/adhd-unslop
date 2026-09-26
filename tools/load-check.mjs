#!/usr/bin/env node
// Install this marketplace with the real Claude Code and Codex CLIs, with no
// keys and no sign-in, and check what each CLI loads. No model runs.
//
//   node tools/load-check.mjs [--claude <bin>] [--codex <bin>] [--only claude|codex] [--repo <path>]
//
// The repo's tracked and untracked-not-ignored files are copied into a fresh
// git repo in a temp dir, which serves as the marketplace, so no CLI writes
// into the working tree. Every CLI runs in throwaway homes that are deleted at
// the end. Expected names, versions, and hook keys come from
// tools/plugins.json and the generated plugins/*/hooks/hooks.json.
//
// Step one installs the authored plugins only and asserts that nothing else
// comes with them. Step two installs the vendored plugins by name. Codex also
// gets a catalog check through `codex app-server` (plugin/list, plugin/read,
// hooks/list). Prints PASS and FAIL lines and exits 1 on any failure.

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const CLI_TIMEOUT_MS = 180_000;
const RPC_TIMEOUT_MS = 60_000;
const STRIPPED_ENV = ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "OPENAI_API_KEY", "CODEX_API_KEY"];

// ---------------------------------------------------------------- arguments

function parseArgs(argv) {
  const opts = {
    claude: "claude",
    codex: "codex",
    only: null,
    repo: path.join(path.dirname(fileURLToPath(import.meta.url)), ".."),
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) usage(`${arg} needs a value`);
      return argv[++i];
    };
    if (arg === "--claude") opts.claude = value();
    else if (arg === "--codex") opts.codex = value();
    else if (arg === "--repo") opts.repo = value();
    else if (arg === "--only") {
      opts.only = value();
      if (!["claude", "codex"].includes(opts.only)) usage(`--only takes claude or codex, not ${opts.only}`);
    } else if (arg === "-h" || arg === "--help") usage();
    else usage(`unknown argument ${arg}`);
  }
  opts.repo = path.resolve(opts.repo);
  return opts;
}

function usage(message) {
  if (message) console.error(message);
  console.error("usage: node tools/load-check.mjs [--claude <bin>] [--codex <bin>] [--only claude|codex] [--repo <path>]");
  process.exit(2);
}

// ---------------------------------------------------------------- results

let passed = 0;
let failed = 0;

function pass(name) {
  passed++;
  console.log(`PASS  ${name}`);
}

function fail(name, detail) {
  failed++;
  console.log(`FAIL  ${name}`);
  if (detail) for (const line of String(detail).trimEnd().split("\n")) console.log(`      ${line}`);
}

function check(name, ok, detail) {
  if (ok) pass(name);
  else fail(name, typeof detail === "function" ? detail() : detail);
  return ok;
}

// Thrown to stop one runtime's checks after a step that later steps need.
class Abort extends Error {}

const tail = (text, n = 20) => String(text ?? "").trimEnd().split("\n").slice(-n).join("\n");
const sameSet = (a, b) => a.length === b.length && [...a].sort().join("\n") === [...b].sort().join("\n");
const show = (list) => (list.length ? list.join(", ") : "(none)");

// ---------------------------------------------------------------- temp dirs

const tempRoots = [];
const children = new Set();

function cleanup() {
  for (const child of children) {
    try { child.kill("SIGKILL"); } catch { /* already gone */ }
  }
  // Codex writes shell snapshots with environment variables into CODEX_HOME.
  for (const dir of tempRoots.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
}

process.on("exit", cleanup);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(130));

function makeTempRoot() {
  // realpath, because macOS reports /var/folders paths as /private/var/folders.
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "adhd-unslop-load-")));
  tempRoots.push(dir);
  return dir;
}

// ---------------------------------------------------------------- processes

function baseEnv(extra) {
  const env = { ...process.env };
  for (const key of STRIPPED_ENV) delete env[key];
  return { ...env, ...extra };
}

// Every CLI call except the app-server gets stdin from /dev/null.
function run(bin, args, { env, cwd, timeout = CLI_TIMEOUT_MS } = {}) {
  const r = spawnSync(bin, args, { env, cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", timeout, maxBuffer: 64 * 1024 * 1024 });
  const output = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  let problem = null;
  if (r.error) problem = r.error.code === "ETIMEDOUT" ? `timed out after ${timeout / 1000}s` : r.error.message;
  else if (r.status !== 0) problem = `exit ${r.status ?? r.signal}`;
  return { ok: !problem, problem, stdout: r.stdout ?? "", output };
}

// Run a CLI step that later steps depend on. PASS or FAIL, and abort on FAIL.
function step(name, bin, args, opts) {
  const r = run(bin, args, opts);
  const cmd = [path.basename(bin), ...args].join(" ");
  if (!check(name, r.ok, () => `$ ${cmd}\n${r.problem}\n${tail(r.output)}`)) throw new Abort(name);
  return r;
}

function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.error?.message ?? tail(r.stderr)}`);
  return r.stdout;
}

function cliVersion(bin, env) {
  const r = run(bin, ["--version"], { env, timeout: 60_000 });
  return r.ok ? r.stdout.trim() : `unavailable (${r.problem})`;
}

// ---------------------------------------------------------------- the copy

// Tracked plus untracked-not-ignored files, as tests/e2e/run.sh copies them.
// Index entries deleted from the working tree are skipped.
function copyRepo(repo, dest) {
  const files = git(repo, ["ls-files", "-co", "--exclude-standard", "-z"]).split("\0").filter(Boolean);
  fs.mkdirSync(dest, { recursive: true });
  let copied = 0;
  for (const rel of new Set(files)) {
    const src = path.join(repo, rel);
    let stat;
    try { stat = fs.lstatSync(src); } catch { continue; }
    const out = path.join(dest, rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    if (stat.isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(src), out);
    else if (stat.isFile()) fs.copyFileSync(src, out);
    else continue;
    copied++;
  }
  const quiet = ["-c", "init.defaultBranch=main", "-c", "user.name=load-check", "-c", "user.email=load-check@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null"];
  git(dest, [...quiet, "init", "-q"]);
  git(dest, [...quiet, "add", "-A"]);
  git(dest, [...quiet, "commit", "-q", "--no-verify", "-m", "load-check"]);
  return copied;
}

// ---------------------------------------------------------------- expectations

const snake = (event) => event.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

function listFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(abs));
    else out.push(abs);
  }
  return out;
}

function expectations(copy) {
  const config = JSON.parse(fs.readFileSync(path.join(copy, "tools", "plugins.json"), "utf8"));
  const mkt = config.marketplace.name;
  const plugins = config.plugins.map((p) => {
    const root = path.join(copy, "plugins", p.name);
    const skills = p.kind === "vendored" ? [p.skill] : Object.keys(p.skills ?? {});
    const required = [];
    for (const skill of skills) required.push(`skills/${skill}/SKILL.md`);
    // The hooks file Codex reads, as the Codex manifest names it, relative to the plugin root.
    let hooksFile = "hooks/hooks.json";
    try {
      const codexManifest = JSON.parse(fs.readFileSync(path.join(root, ".codex-plugin", "plugin.json"), "utf8"));
      if (typeof codexManifest.hooks === "string") hooksFile = codexManifest.hooks.replace(/^\.\//, "");
    } catch { /* checked by the install steps */ }
    const hookKeys = [];
    const hooksPath = path.join(root, hooksFile);
    if (fs.existsSync(hooksPath)) {
      required.push(hooksFile);
      const hooks = JSON.parse(fs.readFileSync(hooksPath, "utf8")).hooks ?? {};
      for (const [event, groups] of Object.entries(hooks)) {
        groups.forEach((group, g) => (group.hooks ?? []).forEach((_, h) => hookKeys.push(`${p.name}@${mkt}:${hooksFile}:${snake(event)}:${g}:${h}`)));
      }
    }
    if (p.alwaysOn) {
      required.push("hooks/chunks/manifest.json");
      p.alwaysOn.forEach((_, i) => required.push(`hooks/chunks/${i + 1}.md`));
    }
    const sourceFiles = listFiles(root).map((abs) => path.relative(root, abs).split(path.sep).join("/"));
    return {
      name: p.name,
      id: `${p.name}@${mkt}`,
      kind: p.kind,
      version: p.version,
      skills,
      fullSkills: skills.map((s) => `${p.name}:${s}`),
      displayName: p.codexInterface?.displayName ?? null,
      root,
      required,
      sourceFiles,
      hooksFile,
      hookKeys,
    };
  });
  return { mkt, plugins };
}

// ---------------------------------------------------------------- cache checks

const dirNames = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n !== ".DS_Store").sort() : []);

// <cache>/<mkt>/ holds exactly the installed plugins, each with one version folder.
function checkCacheLayout(label, mktCache, installed) {
  const names = dirNames(mktCache);
  check(`${label}: cache ${path.basename(mktCache)}/ holds only ${show(installed.map((p) => p.name))}`, sameSet(names, installed.map((p) => p.name)), `found: ${show(names)}`);
  for (const p of installed) {
    const versions = dirNames(path.join(mktCache, p.name));
    check(`${label}: cache ${p.name}/ holds only ${p.version}/`, sameSet(versions, [p.version]), `found: ${show(versions)}`);
  }
}

// The installed copy has the required files, and every shipped file byte for byte.
// Extra files are allowed, so a CLI that adds metadata does not fail the check.
function checkInstalledFiles(label, p, dir) {
  const missing = p.required.filter((rel) => !fs.existsSync(path.join(dir, rel)));
  check(`${label}: ${p.name} install has ${p.required.length} required files`, missing.length === 0, `missing under ${dir}:\n${missing.join("\n")}`);
  const differ = p.sourceFiles.filter((rel) => {
    const out = path.join(dir, rel);
    return !fs.existsSync(out) || !fs.readFileSync(out).equals(fs.readFileSync(path.join(p.root, rel)));
  });
  check(`${label}: ${p.name} install matches all ${p.sourceFiles.length} shipped files`, p.sourceFiles.length > 0 && differ.length === 0, `missing or different under ${dir}:\n${differ.join("\n") || "(no shipped files found)"}`);
}

// ---------------------------------------------------------------- Claude Code

function parseJson(text, what) {
  const trimmed = text.trim();
  const start = [trimmed.indexOf("["), trimmed.indexOf("{")].filter((i) => i >= 0).sort((a, b) => a - b)[0];
  try {
    return JSON.parse(start > 0 ? trimmed.slice(start) : trimmed);
  } catch (err) {
    throw new Error(`${what}: not JSON (${err.message}):\n${tail(text)}`);
  }
}

function claudeList(bin, opts, label) {
  const r = step(`${label}: claude plugin list --json`, bin, ["plugin", "list", "--json"], opts);
  const list = parseJson(r.stdout, "claude plugin list --json");
  if (!Array.isArray(list)) throw new Error(`claude plugin list --json: expected an array, got ${typeof list}`);
  return list;
}

function checkClaudeInstalled(label, list, expected, mkt, configDir) {
  const ours = list.filter((e) => String(e.id).endsWith(`@${mkt}`));
  check(`${label}: installed from ${mkt}: exactly ${show(expected.map((p) => p.name))}`, sameSet(ours.map((e) => e.id), expected.map((p) => p.id)), `installed: ${show(ours.map((e) => e.id))}`);
  for (const p of expected) {
    const entry = ours.find((e) => e.id === p.id);
    if (!entry) continue;
    check(`${label}: ${p.id} version ${p.version}`, entry.version === p.version, `listed version: ${entry.version}`);
    const errors = entry.errors ?? [];
    check(`${label}: ${p.id} reports no errors`, Array.isArray(errors) && errors.length === 0, JSON.stringify(errors, null, 2));
    check(`${label}: ${p.id} is enabled`, entry.enabled !== false, `enabled: ${entry.enabled}`);
    const expectedPath = path.join(configDir, "plugins", "cache", mkt, p.name, p.version);
    check(`${label}: ${p.id} installPath is the versioned cache copy`, path.resolve(entry.installPath ?? "") === expectedPath, `installPath: ${entry.installPath}\nexpected:    ${expectedPath}`);
    if (entry.installPath) checkInstalledFiles(label, p, entry.installPath);
  }
  checkCacheLayout(label, path.join(configDir, "plugins", "cache", mkt), expected);
}

function runClaude(bin, copy, exp, tmp) {
  const home = path.join(tmp, "claude-home");
  const configDir = path.join(tmp, "claude-config");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(configDir, { recursive: true });
  const env = baseEnv({ HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: configDir });
  const opts = { env, cwd: copy };
  console.log(`claude: ${cliVersion(bin, env)}`);

  const first = exp.plugins.filter((p) => p.kind === "authored");
  const second = exp.plugins.filter((p) => p.kind !== "authored");
  try {
    for (const target of [".claude-plugin/marketplace.json", ...exp.plugins.map((p) => `plugins/${p.name}`)]) {
      const r = run(bin, ["plugin", "validate", "--strict", path.join(copy, target)], opts);
      check(`claude: plugin validate --strict ${target}`, r.ok, () => `${r.problem}\n${tail(r.output)}`);
    }

    step("claude: plugin marketplace add <copy>", bin, ["plugin", "marketplace", "add", copy], opts);
    for (const p of first) step(`claude: plugin install ${p.id}`, bin, ["plugin", "install", p.id], opts);
    checkClaudeInstalled("claude step 1", claudeList(bin, opts, "claude step 1"), first, exp.mkt, configDir);

    for (const p of second) step(`claude: plugin install ${p.id}`, bin, ["plugin", "install", p.id], opts);
    checkClaudeInstalled("claude step 2", claudeList(bin, opts, "claude step 2"), exp.plugins, exp.mkt, configDir);
  } catch (err) {
    if (!(err instanceof Abort)) fail("claude: unexpected error", err.stack ?? err.message);
  }
}

// ---------------------------------------------------------------- Codex app-server

function startAppServer(bin, { cwd, env }) {
  const child = spawn(bin, ["app-server", "--listen", "stdio://"], { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
  children.add(child);
  let stderr = "";
  let exited = null;
  let nextId = 0;
  const pending = new Map();
  const rejectAll = (err) => {
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(err);
    }
    pending.clear();
  };
  // Drain stderr so a full pipe never blocks the server.
  child.stderr.on("data", (d) => {
    stderr = (stderr + d).slice(-20_000);
  });
  child.stdin.on("error", () => { /* reported through exit */ });
  child.on("error", (err) => {
    exited = { error: err };
    rejectAll(new Error(`app-server failed to start: ${err.message}`));
  });
  child.on("exit", (code, signal) => {
    exited = { code, signal };
    children.delete(child);
    rejectAll(new Error(`app-server exited (${code ?? signal})\n${tail(stderr)}`));
  });
  // One JSON object per line. Responses carry an id and no method; notifications
  // and server requests are ignored.
  readline.createInterface({ input: child.stdout }).on("line", (line) => {
    line = line.trim();
    if (!line.startsWith("{")) return;
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (msg.method !== undefined || !pending.has(msg.id)) return;
    const { resolve, timer } = pending.get(msg.id);
    pending.delete(msg.id);
    clearTimeout(timer);
    resolve(msg);
  });

  const send = (msg) => child.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");
  return {
    request(method, params, timeout = RPC_TIMEOUT_MS) {
      return new Promise((resolve, reject) => {
        if (exited) return reject(new Error(`app-server is not running (${JSON.stringify(exited)})\n${tail(stderr)}`));
        const id = ++nextId;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`${method} timed out after ${timeout / 1000}s\n${tail(stderr)}`));
        }, timeout);
        pending.set(id, { resolve, reject, timer });
        send({ id, method, params });
      });
    },
    notify(method, params) {
      send(params === undefined ? { method } : { method, params });
    },
    async close() {
      if (exited) return;
      const done = new Promise((resolve) => child.once("exit", resolve));
      child.stdin.end();
      child.kill("SIGTERM");
      const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
      await done;
      clearTimeout(timer);
    },
  };
}

async function rpc(server, label, method, params, what = method) {
  let msg;
  try {
    msg = await server.request(method, params);
  } catch (err) {
    fail(`${label}: ${what}`, err.message);
    throw new Abort(what);
  }
  if (!check(`${label}: ${what} succeeds`, !msg.error, () => JSON.stringify(msg.error, null, 2))) throw new Abort(what);
  return msg.result ?? {};
}

async function codexCatalog(bin, copy, exp, env, label) {
  const server = startAppServer(bin, { cwd: copy, env });
  try {
    await rpc(server, label, "initialize", {
      clientInfo: { name: "adhd-unslop-load-check", title: "adhd-unslop load check", version: "0" },
      capabilities: { experimentalApi: true, requestAttestation: false, optOutNotificationMethods: [] },
    });
    server.notify("initialized");

    // plugin/list: one local marketplace with this name, read from the Codex file.
    const listed = await rpc(server, label, "plugin/list", { cwds: [copy], marketplaceKinds: ["local"] });
    const loadErrors = listed.marketplaceLoadErrors ?? [];
    check(`${label}: plugin/list reports no marketplaceLoadErrors`, loadErrors.length === 0, JSON.stringify(loadErrors, null, 2));
    const ours = (listed.marketplaces ?? []).filter((m) => m.name === exp.mkt);
    check(`${label}: plugin/list shows exactly one marketplace named ${exp.mkt}`, ours.length === 1, `found ${ours.length}: ${JSON.stringify(ours.map((m) => m.path))}`);
    const codexMarketplace = path.join(copy, ".agents", "plugins", "marketplace.json");
    if (ours.length === 1) {
      check(`${label}: ${exp.mkt} is read from .agents/plugins/marketplace.json`, path.resolve(ours[0].path ?? "") === codexMarketplace, `path: ${ours[0].path}`);
      const names = (ours[0].plugins ?? []).map((p) => p.name);
      check(`${label}: ${exp.mkt} lists ${show(exp.plugins.map((p) => p.name))}`, sameSet(names, exp.plugins.map((p) => p.name)), `listed: ${show(names)}`);
    }

    // plugin/read reads the marketplace entry, installed or not.
    for (const p of exp.plugins) {
      let plugin;
      try {
        plugin = (await rpc(server, label, "plugin/read", { marketplacePath: codexMarketplace, remoteMarketplaceName: null, pluginName: p.name }, `plugin/read ${p.name}`)).plugin ?? {};
      } catch (err) {
        if (err instanceof Abort) continue;
        throw err;
      }
      const skills = (plugin.skills ?? []).map((s) => s.name);
      check(`${label}: ${p.name} skills are ${show(p.fullSkills)}`, skills.length > 0 && sameSet(skills, p.fullSkills), `read: ${show(skills)}`);
      const hooks = (plugin.hooks ?? []).map((h) => h.key);
      check(`${label}: ${p.name} hook keys are ${p.hookKeys.length ? p.hookKeys.map((k) => k.split(":").slice(-2).join(":")).join(" ") : "none"}`, sameSet(hooks, p.hookKeys), `read: ${show(hooks)}\nexpected: ${show(p.hookKeys)}`);
      const version = plugin.summary?.localVersion;
      check(`${label}: ${p.name} version ${p.version}`, version === p.version, `localVersion: ${version}`);
      const displayName = plugin.summary?.interface?.displayName ?? null;
      check(`${label}: ${p.name} interface.displayName from .codex-plugin`, displayName === p.displayName, `displayName: ${JSON.stringify(displayName)}, expected ${JSON.stringify(p.displayName)}`);
    }

    // hooks/list reports the installed plugins' hooks, from the cache copy.
    const hookList = await rpc(server, label, "hooks/list", { cwds: [copy] });
    const entries = hookList.data ?? [];
    const problems = entries.flatMap((e) => [...(e.warnings ?? []), ...(e.errors ?? [])]);
    check(`${label}: hooks/list reports no warnings or errors`, problems.length === 0, JSON.stringify(problems, null, 2));
    const all = new Map();
    for (const e of entries) for (const h of e.hooks ?? []) all.set(h.key, h);
    const listedHooks = [...all.values()].filter((h) => String(h.pluginId ?? "").endsWith(`@${exp.mkt}`));
    for (const p of exp.plugins) {
      const mine = listedHooks.filter((h) => h.pluginId === p.id);
      check(`${label}: hooks/list for ${p.name}: ${p.hookKeys.length ? p.hookKeys.map((k) => k.split(":").slice(-2).join(":")).join(" ") : "none"}`, sameSet(mine.map((h) => h.key), p.hookKeys), `listed: ${show(mine.map((h) => h.key))}\nexpected: ${show(p.hookKeys)}`);
      if (!mine.length) continue;
      const suffix = ["plugins", "cache", exp.mkt, p.name, p.version, ...p.hooksFile.split("/")].join(path.sep);
      const wrong = mine.filter((h) => !path.resolve(h.sourcePath ?? "").endsWith(path.sep + suffix));
      check(`${label}: hooks/list for ${p.name} reads the ${p.version} cache copy`, wrong.length === 0, wrong.map((h) => `${h.key}: ${h.sourcePath}`).join("\n"));
      const unhashed = mine.filter((h) => !/^sha256:[0-9a-f]{64}$/.test(h.currentHash ?? ""));
      check(`${label}: hooks/list for ${p.name} gives each handler a trust hash`, unhashed.length === 0, unhashed.map((h) => `${h.key}: ${h.currentHash}`).join("\n"));
      console.log(`      trust: ${mine.map((h) => `${h.key.split(":").slice(-2).join(":")}=${h.trustStatus}`).join(" ")}`);
    }
  } finally {
    await server.close();
  }
}

// ---------------------------------------------------------------- Codex

async function runCodex(bin, copy, exp, tmp) {
  const home = path.join(tmp, "codex-home");
  const codexHome = path.join(tmp, "codex-config");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(codexHome, { recursive: true });
  const env = baseEnv({ HOME: home, USERPROFILE: home, CODEX_HOME: codexHome, CODEX_APP_SERVER_DISABLE_MANAGED_CONFIG: "1", RUST_LOG: "warn" });
  const opts = { env, cwd: copy };
  console.log(`codex: ${cliVersion(bin, env)}`);

  const cache = path.join(codexHome, "plugins", "cache", exp.mkt);
  const checkCodexInstalled = (label, installed) => {
    checkCacheLayout(label, cache, installed);
    for (const p of installed) {
      const dir = path.join(cache, p.name, p.version);
      if (fs.existsSync(dir)) checkInstalledFiles(label, p, dir);
    }
  };
  const first = exp.plugins.filter((p) => p.kind === "authored");
  const second = exp.plugins.filter((p) => p.kind !== "authored");
  try {
    step("codex: plugin marketplace add <copy>", bin, ["plugin", "marketplace", "add", copy], opts);
    for (const p of first) step(`codex: plugin add ${p.id}`, bin, ["plugin", "add", p.id], opts);
    checkCodexInstalled("codex step 1", first);

    for (const p of second) step(`codex: plugin add ${p.id}`, bin, ["plugin", "add", p.id], opts);
    checkCodexInstalled("codex step 2", exp.plugins);

    await codexCatalog(bin, copy, exp, env, "codex catalog");
  } catch (err) {
    if (!(err instanceof Abort)) fail("codex: unexpected error", err.stack ?? err.message);
  }
}

// ---------------------------------------------------------------- main

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const tmp = makeTempRoot();
  const copy = path.join(tmp, "marketplace");
  const count = copyRepo(opts.repo, copy);
  console.log(`marketplace copy: ${count} files from ${opts.repo}`);
  const exp = expectations(copy);
  if (!exp.plugins.length) fail("tools/plugins.json lists plugins", "no plugins found");
  if (!exp.plugins.some((p) => p.kind === "authored")) fail("tools/plugins.json lists an authored plugin", "step one would install nothing");

  if (opts.only !== "codex") runClaude(opts.claude, copy, exp, tmp);
  if (opts.only !== "claude") await runCodex(opts.codex, copy, exp, tmp);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((err) => {
  console.error(err.stack ?? err.message);
  process.exitCode = 1;
});
