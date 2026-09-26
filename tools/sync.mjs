#!/usr/bin/env node
// Keep upstream/ in step with the pins in tools/upstream.json.
//
//   node tools/sync.mjs --check                 verify upstream/ files against pinned sha256
//   node tools/sync.mjs --bump <name> <commit>  fetch <name> at <commit> into .sync-staging/,
//                                               check dependencies and rule citations, swap in,
//                                               raise plugin versions, build and test,
//                                               promote on success, restore on failure
//   node tools/sync.mjs --verify-remote         refetch every pinned file at its pinned commit and
//                                               compare it with the pinned sha256
//   node tools/sync.mjs --latest [--report <file>]
//                                               bump every upstream whose pinned files changed
//                                               on its default branch, write a Markdown report,
//                                               exit 1 if any bump failed
//
// Set GITHUB_TOKEN to avoid the unauthenticated GitHub API rate limit.
// No dependencies. Uses global fetch (Node 18 or later).

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256, stripFrontmatter } from "../src/adhd-unslop/hooks/lib.mjs";
import { GENERATED_ROOTS, upstreamsShipped } from "./build.mjs";

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pinsPath = path.join(repo, "tools", "upstream.json");
const staging = path.join(repo, ".sync-staging");
const overlayDir = path.join(repo, "src", "adhd-unslop", "overlay");

const read = (p) => fs.readFileSync(p, "utf8");
const readPins = () => JSON.parse(read(pinsPath));
const configPath = path.join(repo, "tools", "plugins.json");
const readConfig = () => JSON.parse(read(configPath));

export function checkPins(pins = readPins()) {
  const problems = [];
  for (const [name, pin] of Object.entries(pins.upstreams)) {
    for (const [file, meta] of Object.entries(pin.files)) {
      const local = path.join(repo, "upstream", name, file);
      if (!fs.existsSync(local)) { problems.push(`${name}/${file}: missing`); continue; }
      const actual = sha256(read(local));
      if (actual !== meta.sha256) problems.push(`${name}/${file}: sha256 ${actual} != pinned ${meta.sha256}`);
    }
  }
  return problems;
}

// Runtime dependencies the composite cannot ship: relative Markdown links and
// sibling directories a skill would read at run time.
export function dependencyHits(body) {
  const hits = [];
  body.split("\n").forEach((line, i) => {
    if (/\]\((?!https?:|#|mailto:)[^)]+\)/.test(line)) hits.push(`${i + 1}: relative link: ${line.trim()}`);
    if (/(^|[\s`(])(\.\/)?(references|scripts|agents)\//.test(line)) hits.push(`${i + 1}: sibling directory: ${line.trim()}`);
  });
  return hits;
}

// Numbered items in the section that starts with `heading`, up to the next `## `.
function listNumbers(body, heading) {
  const start = body.indexOf(`\n${heading}\n`);
  if (start < 0) return [];
  const rest = body.slice(start + heading.length + 2);
  const end = rest.search(/^## /m);
  const section = end < 0 ? rest : rest.slice(0, end);
  return [...section.matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
}

// Every citation label the overlay may use, the upstream it points into, and
// how to read the numbers that exist in that upstream body.
export const CITATION_KINDS = [
  { label: "ADHD rule", upstream: "i-have-adhd", numbers: (b) => [...b.matchAll(/^### (\d+)\. /gm)].map((m) => Number(m[1])) },
  { label: "ADHD exception", upstream: "i-have-adhd", numbers: (b) => listNumbers(b, "## When to break the rules") },
  { label: "ADHD check", upstream: "i-have-adhd", numbers: (b) => listNumbers(b, "## Pre-send check") },
  { label: "unslop rule", upstream: "unslop", numbers: (b) => [...b.matchAll(/^(\d+)\. \*\*/gm)].map((m) => Number(m[1])) },
  { label: "unslop process", upstream: "unslop", numbers: (b) => listNumbers(b, "## Process") },
];

const kindFor = (label) => CITATION_KINDS.find((k) => k.label === label);
const ruleLabel = (name) => (name === "unslop" ? "unslop rule" : "ADHD rule");

export function ruleNumbers(name, body) {
  return kindFor(ruleLabel(name)).numbers(body);
}

export function citedNumbers(label) {
  const text = fs.readdirSync(overlayDir).map((f) => read(path.join(overlayDir, f))).join("\n");
  const re = new RegExp(`${label}s? (\\d+)(?:(?:,| and| to) (\\d+))*`, "g");
  const cited = new Set();
  for (const m of text.matchAll(re)) {
    const nums = m[0].match(/\d+/g).map(Number);
    if (/ to /.test(m[0]) && nums.length === 2) for (let n = nums[0]; n <= nums[1]; n++) cited.add(n);
    else nums.forEach((n) => cited.add(n));
  }
  return cited;
}

export function overlayCitations(name) {
  return citedNumbers(ruleLabel(name));
}

export function citationReport(name, oldBody, newBody) {
  const warnings = [];
  const failures = [];
  for (const kind of CITATION_KINDS.filter((k) => k.upstream === name)) {
    const oldNums = new Set(kind.numbers(oldBody));
    const newNums = new Set(kind.numbers(newBody));
    const cited = citedNumbers(kind.label);
    if (kind.label === ruleLabel(name)) {
      warnings.push(...[...newNums].filter((n) => !oldNums.has(n) && !cited.has(n)).map((n) => `${kind.label} ${n} is new and not cited in the overlay`));
    }
    failures.push(...[...cited].filter((n) => !newNums.has(n)).map((n) => `the overlay cites ${kind.label} ${n}, which no longer exists upstream`));
  }
  return { warnings, failures };
}

function githubHeaders() {
  const h = { Accept: "application/vnd.github+json", "User-Agent": "adhd-unslop-sync" };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

async function fetchRaw(repoSlug, commit, filePath) {
  const url = `https://raw.githubusercontent.com/${repoSlug}/${commit}/${filePath}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
  return res.text();
}

// Newest commit on the default branch that touched any pinned file of this upstream.
export async function latestCommit(pin) {
  let newest = null;
  for (const meta of Object.values(pin.files)) {
    const url = `https://api.github.com/repos/${pin.repo}/commits?path=${encodeURIComponent(meta.path)}&per_page=1`;
    const res = await fetch(url, { headers: githubHeaders() });
    if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
    const [c] = await res.json();
    if (c && (!newest || c.commit.committer.date > newest.date)) newest = { sha: c.sha, date: c.commit.committer.date };
  }
  return newest?.sha ?? null;
}

export function bumpPatch(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) throw new Error(`cannot bump version ${version}`);
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

// Plugins whose shipped text includes one of these upstreams: its mirror, any
// skill that embeds it, and any always-on chunk that carries it.
export function pluginsEmbedding(config, names) {
  return config.plugins.filter((p) => upstreamsShipped(p).some((n) => names.includes(n))).map((p) => p.name);
}

// Raise each affected plugin's patch version once, however many upstreams changed.
export function raiseVersions(config, names) {
  const affected = pluginsEmbedding(config, names);
  for (const p of config.plugins) if (affected.includes(p.name)) p.version = bumpPatch(p.version);
  return config.plugins.filter((p) => affected.includes(p.name)).map((p) => `${p.name} ${p.version}`);
}

function run(cmd, args) {
  execFileSync(cmd, args, { cwd: repo, stdio: "inherit" });
}

function buildAndTest() {
  run("node", ["tools/build.mjs"]);
  run("node", ["--test", ...fs.readdirSync(path.join(repo, "tests")).filter((f) => f.endsWith(".test.mjs")).map((f) => path.join("tests", f))]);
}

const GENERATED = GENERATED_ROOTS;

// Copy everything a bump can change, and return a function that puts it back.
function snapshot(label) {
  const dir = path.join(staging, `${label}.backup`);
  fs.rmSync(dir, { recursive: true, force: true });
  for (const r of [...GENERATED, "upstream", "tools/upstream.json", "tools/plugins.json"]) {
    fs.cpSync(path.join(repo, r), path.join(dir, r), { recursive: true });
  }
  return {
    restore() {
      for (const r of [...GENERATED, "upstream", "tools/upstream.json", "tools/plugins.json"]) {
        fs.rmSync(path.join(repo, r), { recursive: true, force: true });
        fs.cpSync(path.join(dir, r), path.join(repo, r), { recursive: true });
      }
      fs.rmSync(dir, { recursive: true, force: true });
    },
    discard() {
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function fetchUpstream(pin, commit) {
  const fetched = {};
  for (const [file, meta] of Object.entries(pin.files)) fetched[file] = await fetchRaw(pin.repo, commit, meta.path);
  return fetched;
}

// Returns { name, from, to, warnings, versions }. Throws on refusal or failure,
// after restoring every file it touched.
export async function bump(name, commit, { versions = true, fetched } = {}) {
  const pins = readPins();
  const pin = pins.upstreams[name];
  if (!pin) throw new Error(`unknown upstream ${name}; known: ${Object.keys(pins.upstreams).join(", ")}`);
  const stageDir = path.join(staging, name);
  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.mkdirSync(stageDir, { recursive: true });

  fetched ??= await fetchUpstream(pin, commit);
  for (const [file, text] of Object.entries(fetched)) fs.writeFileSync(path.join(stageDir, file), text);
  const newBody = stripFrontmatter(fetched["SKILL.md"]);
  const deps = dependencyHits(newBody);
  if (deps.length) {
    throw new Error(`refusing to bump ${name}: new body has runtime dependencies the plugins do not ship:\n  ${deps.join("\n  ")}\nstaged files left in ${stageDir}`);
  }
  const oldBody = stripFrontmatter(read(path.join(repo, "upstream", name, "SKILL.md")));
  const { warnings, failures } = citationReport(name, oldBody, newBody);
  if (failures.length) throw new Error(`refusing to bump ${name}:\n  ${failures.join("\n  ")}\nstaged files left in ${stageDir}`);

  const backup = snapshot(name);
  const from = pin.commit;
  let raised = [];
  try {
    for (const [file, text] of Object.entries(fetched)) {
      fs.writeFileSync(path.join(repo, "upstream", name, file), text);
      pin.files[file].sha256 = sha256(text);
    }
    pin.commit = commit;
    fs.writeFileSync(pinsPath, JSON.stringify(pins, null, 2) + "\n");
    if (versions) {
      const config = readConfig();
      raised = raiseVersions(config, [name]);
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
    }
    buildAndTest();
  } catch (err) {
    backup.restore();
    throw new Error(`bump of ${name} failed and was rolled back (${err.message}). Staged files remain in ${stageDir}.`);
  }
  backup.discard();
  fs.rmSync(stageDir, { recursive: true, force: true });
  return { name, from, to: commit, warnings, versions: raised };
}

export async function latest() {
  const pins = readPins();
  const results = [];
  for (const [name, pin] of Object.entries(pins.upstreams)) {
    try {
      const sha = await latestCommit(pin);
      if (!sha || sha === pin.commit) {
        results.push({ name, status: "current" });
        continue;
      }
      const fetched = await fetchUpstream(pin, sha);
      const unchanged = Object.entries(pin.files).every(([file, meta]) => sha256(fetched[file]) === meta.sha256);
      if (unchanged) {
        results.push({ name, status: "unchanged", to: sha });
        continue;
      }
      const r = await bump(name, sha, { versions: false, fetched });
      results.push({ ...r, status: "bumped" });
    } catch (err) {
      results.push({ name, status: "failed", error: err.message });
    }
  }
  const bumped = results.filter((r) => r.status === "bumped").map((r) => r.name);
  let versions = [];
  if (bumped.length) {
    const config = readConfig();
    versions = raiseVersions(config, bumped);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
    buildAndTest();
  }
  return { results, versions };
}

export function reportMarkdown({ results, versions }, pins = readPins()) {
  const lines = ["# Upstream skill updates", "", "| Upstream | Result | Detail |", "| --- | --- | --- |"];
  for (const r of results) {
    const repoSlug = pins.upstreams[r.name].repo;
    if (r.status === "bumped") lines.push(`| ${r.name} | updated | [${r.from.slice(0, 7)}...${r.to.slice(0, 7)}](https://github.com/${repoSlug}/compare/${r.from}...${r.to}) |`);
    else if (r.status === "unchanged") lines.push(`| ${r.name} | no change | ${r.to.slice(0, 7)} changed no pinned file |`);
    else if (r.status === "current") lines.push(`| ${r.name} | no change | pinned commit is the latest |`);
    else lines.push(`| ${r.name} | failed | see below |`);
  }
  if (versions.length) {
    lines.push("", "## New plugin versions", "", ...versions.map((v) => `- ${v}`), "");
    lines.push("Installed copies update only when each plugin is updated. Neither `claude plugin update` nor Codex updates dependencies on their own.");
  }
  const warnings = results.flatMap((r) => r.warnings ?? []);
  if (warnings.length) lines.push("", "## Warnings", "", ...warnings.map((w) => `- ${w}`));
  const failed = results.filter((r) => r.status === "failed");
  if (failed.length) {
    lines.push("", "## Failures", "");
    for (const f of failed) lines.push(`### ${f.name}`, "", "```", f.error, "```", "");
    lines.push("A failure usually means upstream removed a rule the overlay cites. Update `src/adhd-unslop/overlay/`, then run `node tools/sync.mjs --bump <name> <commit>`.");
  }
  lines.push("", "Review the upstream diff for new conflicts and record them in the outcome table in `src/adhd-unslop/overlay/10-precedence.md`.", "");
  return lines.join("\n");
}

// Refetch each pinned file at its pinned commit and compare it with the pin.
// Catches a hand edit to upstream/ that also rewrote the sha256 in the pin.
export async function verifyRemote(pins = readPins()) {
  const problems = [];
  for (const [name, pin] of Object.entries(pins.upstreams)) {
    for (const [file, meta] of Object.entries(pin.files)) {
      const text = await fetchRaw(pin.repo, pin.commit, meta.path);
      const actual = sha256(text);
      if (actual !== meta.sha256) problems.push(`${name}/${file}: upstream at ${pin.commit} has sha256 ${actual}, pinned ${meta.sha256}`);
    }
  }
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , cmd, ...rest] = process.argv;
  try {
    if (cmd === "--check") {
      const problems = checkPins();
      if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
      console.log("upstream/ matches tools/upstream.json");
    } else if (cmd === "--verify-remote") {
      const problems = await verifyRemote();
      if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
      console.log("every pinned file matches its upstream commit");
    } else if (cmd === "--bump" && rest.length === 2) {
      const r = await bump(rest[0], rest[1]);
      r.warnings.forEach((w) => console.warn(`warning: ${w}`));
      console.log(`promoted ${r.name} to ${r.to}; new versions: ${r.versions.join(", ") || "none"}. Review: git diff`);
    } else if (cmd === "--latest") {
      const i = rest.indexOf("--report");
      const summary = await latest();
      const md = reportMarkdown(summary);
      if (i >= 0 && rest[i + 1]) fs.writeFileSync(rest[i + 1], md);
      console.log(md);
      if (summary.results.some((r) => r.status === "failed")) process.exit(1);
    } else {
      console.error("usage: node tools/sync.mjs --check | --verify-remote | --bump <name> <commit> | --latest [--report <file>]");
      process.exit(2);
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
