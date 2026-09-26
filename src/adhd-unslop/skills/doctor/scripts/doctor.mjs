#!/usr/bin/env node
// adhd-unslop doctor. Checks the install this script ships in and prints one
// line per finding: OK, WARN, or FAIL, with a fix line under each WARN or FAIL.
// A fix line holds only a shell command or an instruction; any follow-up step
// goes on its own then line, so a command can be run exactly as printed.
// Reads only. Changes nothing on disk. Exits 1 when any check fails.
//
//   node <plugin root>/skills/doctor/scripts/doctor.mjs
//
// No dependencies. Runs on Node 18 or later. Honors HOME, CLAUDE_CONFIG_DIR,
// and CODEX_HOME, so tests can point it at temp dirs.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const MARKETPLACE = "adhd-unslop";
const PLUGIN = "adhd-unslop";
const MIRRORS = ["au-i-have-adhd", "au-unslop"];
const ACCEPTED = "1, true, or on to force always-on on; 0, false, or off to force it off; or unset it (unset ADHD_UNSLOP_ALWAYS)";

const env = process.env;
// The same home the launcher uses in lib.mjs flagPaths(). On POSIX os.homedir()
// honors HOME, so tests can point it at a temp dir.
const home = os.homedir();
const claudeDir = env.CLAUDE_CONFIG_DIR || path.join(home, ".claude");
const codexDir = env.CODEX_HOME || path.join(home, ".codex");

// scripts -> doctor -> skills -> plugin root
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..", "..", "..");

let failed = false;
const ok = (text) => console.log(`OK   ${text}`);
function warn(text, fix, then) {
  console.log(`WARN ${text}`);
  console.log(`     fix: ${fix}`);
  if (then) console.log(`     then: ${then}`);
}
function fail(text, fix, then) {
  failed = true;
  console.log(`FAIL ${text}`);
  console.log(`     fix: ${fix}`);
  if (then) console.log(`     then: ${then}`);
}

const shq = (p) => (/^[\w@%+=:,./-]+$/.test(p) ? p : `'${p.replace(/'/g, `'\\''`)}'`);

function real(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

function isInside(child, parent) {
  const rel = path.relative(real(parent), real(child));
  return rel === "" || (!!rel && !rel.startsWith("..") && !path.isAbsolute(rel));
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function lstat(p) {
  try {
    return fs.lstatSync(p);
  } catch {
    return null;
  }
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function compareVersions(a, b) {
  const pa = a.split(/[.+-]/).map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(/[.+-]/).map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

// The version a plugin dir declares, from either manifest.
function manifestVersion(dir) {
  for (const m of [".claude-plugin", ".codex-plugin"]) {
    const v = readJson(path.join(dir, m, "plugin.json"))?.version;
    if (typeof v === "string" && v) return v;
  }
  return null;
}

// Load the launcher's helpers from the installed plugin, so the doctor checks
// exactly what the hook runs.
let lib = null;
let libError = "";
try {
  lib = await import(pathToFileURL(path.join(root, "hooks", "lib.mjs")).href);
} catch (err) {
  libError = err?.code === "ERR_MODULE_NOT_FOUND" ? "missing" : String(err?.message ?? err).split("\n")[0];
}

// 1. Runtime and plugin root.
let runtime = lib?.runtimeOf?.(env) ?? null;
let runtimeWhy = runtime === "codex" ? "PLUGIN_ROOT is set" : runtime === "claude" ? "CLAUDE_PLUGIN_ROOT is set" : "";
if (!runtime) {
  const matches = [
    ["codex", codexDir],
    ["claude", claudeDir],
  ].filter(([, dir]) => isInside(root, dir));
  matches.sort((a, b) => real(b[1]).length - real(a[1]).length);
  if (matches.length) {
    runtime = matches[0][0];
    runtimeWhy = `plugin root is under ${matches[0][1]}`;
  }
}
ok(runtime ? `runtime: ${runtime === "codex" ? "Codex" : "Claude Code"} (${runtimeWhy})` : "runtime: unknown (source checkout?)");
ok(`plugin root: ${root}`);

const id = `${PLUGIN}@${MARKETPLACE}`;
// A checkout of this repo keeps the build two levels above the plugin root.
const checkoutBuild = path.resolve(root, "..", "..", "tools", "build.mjs");
const reinstallCmd = {
  claude: `claude plugin marketplace update ${MARKETPLACE} && claude plugin uninstall ${id} && claude plugin install ${id}`,
  codex: `codex plugin marketplace upgrade ${MARKETPLACE} && codex plugin remove ${id} && codex plugin add ${id}`,
}[runtime] ?? (isFile(checkoutBuild) ? `node ${shq(checkoutBuild)}` : `reinstall ${id} with your runtime's plugin commands`);
const reinstallThen = runtime ? "start a new session" : null;

// 2. Installed adhd-unslop version.
const manifest = readJson(path.join(root, ".claude-plugin", "plugin.json"));
if (manifest && typeof manifest.version === "string") {
  ok(`${PLUGIN} version ${manifest.version}`);
} else {
  fail(`cannot read the version from ${path.join(root, ".claude-plugin", "plugin.json")}`, reinstallCmd, reinstallThen);
}

// 3. Optional mirrors. Never WARN or FAIL: adhd-unslop does not need them.
function mirrorVersion(name) {
  // Repo checkout: plugins/<name>/ next to plugins/adhd-unslop/.
  const sibling = path.join(root, "..", name);
  const direct = manifestVersion(sibling);
  if (direct) return direct;
  // Claude Code keeps cache folders for plugins that are not installed, so
  // its install record decides. installed_plugins.json maps
  // "<plugin>@<marketplace>" to a list of installs, each with a version.
  if (runtime === "claude") {
    const record = readJson(path.join(claudeDir, "plugins", "installed_plugins.json"));
    if (record && typeof record.plugins === "object") {
      const installs = record.plugins[`${name}@${MARKETPLACE}`];
      const versions = (Array.isArray(installs) ? installs : []).map((i) => i?.version).filter((v) => typeof v === "string").sort(compareVersions);
      return versions.at(-1) ?? null;
    }
  }
  // Codex removes a plugin's cache folder when the plugin is removed, so the
  // cache decides: <cache>/<marketplace>/<name>/<version>/. Claude Code, when
  // its install record is missing, falls back to this too, skipping versions
  // it marked with .orphaned_at.
  const base = path.join(root, "..", "..", name);
  let entries = [];
  try {
    entries = fs.readdirSync(base, { withFileTypes: true });
  } catch {
    return null;
  }
  const versions = entries
    .filter((e) => e.isDirectory() && !fs.existsSync(path.join(base, e.name, ".orphaned_at")))
    .map((e) => manifestVersion(path.join(base, e.name)))
    .filter(Boolean)
    .sort(compareVersions);
  return versions.at(-1) ?? null;
}
for (const name of MIRRORS) {
  const v = mirrorVersion(name);
  ok(v ? `${name}: installed (${v})` : `${name}: not installed (optional)`);
}

// 4. Always-on switch and flag files. 5. Chunks.
if (!lib) {
  fail(`cannot load ${path.join(root, "hooks", "lib.mjs")} (${libError}), so the always-on hook cannot run`, reinstallCmd, reinstallThen);
} else {
  const flags = lib.flagPaths(env, home);
  const setting = lib.alwaysOnSetting(env);
  const present = flags.filter(isFile);
  for (const p of flags) ok(`flag file ${present.includes(p) ? "present" : "absent"}: ${p}`);
  if (setting.mode === "invalid") {
    warn(`ADHD_UNSLOP_ALWAYS=${JSON.stringify(setting.raw)} is not a recognized value, so it counts as unset`, `set ADHD_UNSLOP_ALWAYS to ${ACCEPTED}`);
  }
  const suggested = runtime === "codex" ? flags[1] : flags[0];
  if (setting.mode === "on") {
    ok(`always-on is on: ADHD_UNSLOP_ALWAYS=${setting.raw} turns it on for this process`);
  } else if (setting.mode === "off") {
    ok(`always-on is off: ADHD_UNSLOP_ALWAYS=${setting.raw} turns it off for this process${present.length ? ", even with a flag file" : ""}`);
  } else if (present.length) {
    ok(`always-on is on: flag file ${present.join(" and ")}`);
  } else {
    ok(`always-on is off: no flag file, and ADHD_UNSLOP_ALWAYS is not set. To turn it on, run: touch ${shq(suggested)}`);
  }

  for (let i = 1; i <= lib.TOTAL_CHUNKS; i++) {
    const r = lib.renderChunk(root, i, { flags });
    if (r.ok) {
      ok(`chunk ${i} of ${lib.TOTAL_CHUNKS}: hash matches, ${r.text.length} of ${lib.MAX_CHARS} characters, about ${r.tokens} tokens`);
    } else {
      fail(`chunk ${i} of ${lib.TOTAL_CHUNKS}: ${r.reason}`, reinstallCmd, reinstallThen);
    }
  }
}

// 6. Codex hooks feature and hook definitions.
const codexConfig = path.join(codexDir, "config.toml");
if (runtime === "codex" || (!runtime && isFile(codexConfig))) {
  const hooksFeature = readFeaturesHooks(codexConfig);
  if (hooksFeature === false) {
    warn(`Codex hooks are off: [features] sets hooks = false in ${codexConfig}`, `set hooks = true under [features] in ${codexConfig}, or delete the setting`, "start a new Codex session");
  } else {
    ok(`Codex hooks feature on (${hooksFeature === true ? `hooks = true in ${codexConfig}` : "default"})`);
  }

  const hooksFile = path.join(root, "hooks", "hooks.json");
  const groups = readJson(hooksFile)?.hooks?.SessionStart;
  const count = Array.isArray(groups) ? groups.reduce((n, g) => n + (Array.isArray(g?.hooks) ? g.hooks.length : 0), 0) : 0;
  if (count > 0) {
    ok(`${hooksFile} defines ${count} SessionStart handler${count === 1 ? "" : "s"}. Codex runs them only after you trust them: open /hooks in an interactive Codex session and confirm the ${PLUGIN} handlers are trusted`);
  } else {
    fail(`${hooksFile} is missing, unreadable, or defines no SessionStart handlers`, reinstallCmd, reinstallThen);
  }
}

// Returns true or false for hooks under [features], or null when unset.
function readFeaturesHooks(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
  let table = "";
  let value = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, "").replace(/^#.*$/, "").trim();
    if (!line) continue;
    const header = line.match(/^\[\s*([^\[\]]+?)\s*\]$/);
    if (header) {
      table = header[1].replace(/"/g, "");
      continue;
    }
    if (line.startsWith("[")) {
      table = "[array]";
      continue;
    }
    const key = table === "features" ? /^"?hooks"?\s*=\s*(true|false)\b/ : table === "" ? /^"?features"?\s*\.\s*"?hooks"?\s*=\s*(true|false)\b/ : null;
    const m = key && line.match(key);
    if (m) value = m[1] === "true";
    // The inline-table form: features = { hooks = false, ... }
    const inline = table === "" && line.match(/^"?features"?\s*=\s*\{([^}]*)\}/);
    const im = inline && inline[1].match(/(?:^|,)\s*"?hooks"?\s*=\s*(true|false)\b/);
    if (im) value = im[1] === "true";
  }
  return value;
}

// 7. ~/.agents/skills entries that clash with this plugin's skill names.
const skillsDir = path.join(home, ".agents", "skills");

// Where a symlink points, if it lands inside one of this marketplace's plugins:
// a repo checkout (found by its marketplace file) or an installed copy (found
// by a plugin manifest named like one of our plugins, as in a plugin cache).
// Returns { plugin, skill } for the duplicate name it creates, or null.
const OUR_PLUGINS = [PLUGIN, ...MIRRORS];
function linkTarget(linkPath) {
  let target;
  try {
    target = path.resolve(path.dirname(linkPath), fs.readlinkSync(linkPath));
  } catch {
    return null;
  }
  for (const start of new Set([target, real(target)])) {
    let skill = null;
    for (let dir = start; ; dir = path.dirname(dir)) {
      if (path.basename(path.dirname(dir)) === "skills") skill = path.basename(dir);
      for (const m of [[".claude-plugin", "plugin.json"], [".codex-plugin", "plugin.json"]]) {
        const name = readJson(path.join(dir, ...m))?.name;
        if (OUR_PLUGINS.includes(name)) return { plugin: name, skill: skill ?? name };
      }
      for (const m of [[".claude-plugin", "marketplace.json"], [".agents", "plugins", "marketplace.json"]]) {
        if (readJson(path.join(dir, ...m))?.name === MARKETPLACE) return { plugin: null, skill };
      }
      if (path.dirname(dir) === dir) break;
    }
  }
  return null;
}

const clashes = [];
let entries = [];
try {
  entries = fs.readdirSync(skillsDir);
} catch {
  // No ~/.agents/skills: nothing can clash.
}
for (const name of entries.sort()) {
  const p = path.join(skillsDir, name);
  const st = lstat(p);
  if (!st) continue;
  const target = st.isSymbolicLink() ? linkTarget(p) : null;
  if (target) {
    const dup = target.plugin ? `${target.plugin}:${target.skill}` : `${MARKETPLACE} plugin`;
    clashes.push({ p, st, why: `${p} links into ${target.plugin ? `an installed or checked-out ${target.plugin} plugin` : `a copy of the ${MARKETPLACE} repo`}`, dup });
  } else if (name === PLUGIN) {
    clashes.push({ p, st, why: `${p} exists`, maybe: true });
  }
}
if (!clashes.length) {
  ok(`no ${skillsDir} entry clashes with the ${MARKETPLACE} skills`);
}
for (const { p, st, why, dup, maybe } of clashes) {
  const rm = st.isDirectory() && !st.isSymbolicLink() ? "rm -r" : "rm";
  const effect = maybe
    ? `It may clash with the ${PLUGIN} skill in Codex, and the README advises against any ${PLUGIN} entry there`
    : `It creates a duplicate ${dup} skill name in Codex, which then loads neither copy`;
  warn(`${why}. ${effect}`, `${rm} ${shq(p)}`);
}

process.exitCode = failed ? 1 : 0;
