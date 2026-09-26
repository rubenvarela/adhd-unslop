#!/usr/bin/env node
// Fail when a plugin's shipped files changed but its version did not rise.
//
//   node tools/version-gate.mjs --base <git-ref>
//
// For each plugin in tools/plugins.json at HEAD: when
// `git diff --name-only <base>...HEAD -- plugins/<name>/` lists any file
// (changed, added, or removed), the plugin's version at HEAD must be greater,
// by semver, than its version in tools/plugins.json at <base>. A plugin absent
// at <base> passes. Installed copies update only on a version change, so this
// enforces the rule in AGENTS.md.
//
// Exits 1 when a plugin fails, and 2 on a usage or git error.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

// Parse a semver 2.0.0 version, or return null.
export function parseSemver(version) {
  const m = typeof version === "string" ? version.match(SEMVER) : null;
  if (!m) return null;
  return { core: [BigInt(m[1]), BigInt(m[2]), BigInt(m[3])], pre: m[4] ? m[4].split(".") : [] };
}

// Semver precedence: -1, 0, or 1. Build metadata is ignored. Throws on an invalid version.
export function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa) throw new Error(`not a semver version: ${JSON.stringify(a)}`);
  if (!pb) throw new Error(`not a semver version: ${JSON.stringify(b)}`);
  for (let i = 0; i < 3; i++) {
    if (pa.core[i] !== pb.core[i]) return pa.core[i] < pb.core[i] ? -1 : 1;
  }
  // A version with a prerelease sorts before the same version without one.
  if (!pa.pre.length || !pb.pre.length) return pa.pre.length === pb.pre.length ? 0 : pa.pre.length ? -1 : 1;
  for (let i = 0; i < Math.max(pa.pre.length, pb.pre.length); i++) {
    const x = pa.pre[i];
    const y = pb.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const xNum = /^\d+$/.test(x);
    const yNum = /^\d+$/.test(y);
    if (xNum && yNum) return BigInt(x) < BigInt(y) ? -1 : 1;
    if (xNum !== yNum) return xNum ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

// Versions by plugin name from a parsed tools/plugins.json.
export function versionsOf(config) {
  const out = new Map();
  for (const p of config?.plugins ?? []) out.set(p.name, p.version);
  return out;
}

// The gate itself, with no git.
//   head:    parsed tools/plugins.json at HEAD
//   base:    parsed tools/plugins.json at the base, or null when the base has none
//   changed: plugin name -> files changed under plugins/<name>/
// Returns one result per plugin at HEAD: { name, ok, message }.
export function evaluate({ head, base, changed }) {
  const baseVersions = versionsOf(base);
  return (head?.plugins ?? []).map(({ name, version }) => {
    const files = changed.get?.(name) ?? changed[name] ?? [];
    const result = (ok, message) => ({ name, ok, message });
    if (!files.length) return result(true, `no changes under plugins/${name}/ (${version})`);
    const count = `${files.length} file${files.length === 1 ? "" : "s"} changed`;
    if (!parseSemver(version)) return result(false, `${count}, but the version at HEAD, ${JSON.stringify(version)}, is not semver`);
    if (!baseVersions.has(name)) return result(true, `${count}, new plugin at ${version}`);
    const before = baseVersions.get(name);
    if (!parseSemver(before)) return result(false, `${count}, but the version at the base, ${JSON.stringify(before)}, is not semver`);
    if (compareSemver(version, before) > 0) return result(true, `${count}, version ${before} -> ${version}`);
    return result(false, `${count}, but the version is ${version} and must rise above ${before} in tools/plugins.json`);
  });
}

function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new Error(`git ${args.join(" ")}: ${r.error.message}`);
  return { ok: r.status === 0, stdout: r.stdout, stderr: r.stderr.trim() };
}

function mustGit(cwd, args) {
  const r = git(cwd, args);
  if (!r.ok) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout;
}

// Read the inputs from git in `cwd` and evaluate them.
export function gate({ base, cwd }) {
  if (!git(cwd, ["rev-parse", "--verify", "--quiet", `${base}^{commit}`]).ok) {
    throw new Error(`base ${base} is not a commit here (a shallow clone needs fetch-depth: 0)`);
  }
  const head = JSON.parse(mustGit(cwd, ["show", "HEAD:tools/plugins.json"]));
  const atBase = git(cwd, ["cat-file", "-e", `${base}:tools/plugins.json`]).ok
    ? JSON.parse(mustGit(cwd, ["show", `${base}:tools/plugins.json`]))
    : null;
  const changed = new Map();
  for (const { name } of head.plugins ?? []) {
    const out = mustGit(cwd, ["diff", "--name-only", "--no-renames", `${base}...HEAD`, "--", `plugins/${name}/`]);
    changed.set(name, out.split("\n").filter(Boolean));
  }
  return { results: evaluate({ head, base: atBase, changed }), changed, baseHasConfig: atBase !== null };
}

// True when this file is the script node was asked to run. Compares real paths,
// so a run through a symlinked checkout still counts.
function isMain() {
  try {
    return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--base");
  const base = i >= 0 ? args[i + 1] : undefined;
  if (!base || base.startsWith("--") || args.length !== 2) {
    console.error("usage: node tools/version-gate.mjs --base <git-ref>");
    process.exit(2);
  }
  const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  let outcome;
  try {
    outcome = gate({ base, cwd: repo });
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  if (!outcome.baseHasConfig) console.log(`${base} has no tools/plugins.json; every plugin counts as new`);
  for (const r of outcome.results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}: ${r.message}`);
    if (!r.ok) for (const f of outcome.changed.get(r.name).slice(0, 20)) console.log(`      ${f}`);
  }
  if (!outcome.results.length) {
    console.log("FAIL  tools/plugins.json at HEAD lists no plugins");
    process.exit(1);
  }
  process.exit(outcome.results.every((r) => r.ok) ? 0 : 1);
}
