#!/usr/bin/env node
// Keep upstream/ in step with the pins in tools/upstream.json.
//
//   node tools/sync.mjs --check                 verify upstream/ files against pinned sha256
//   node tools/sync.mjs --bump <name> <commit>  fetch <name> at <commit> into .sync-staging/,
//                                               check dependencies and rule citations, swap in,
//                                               build and test, promote on success, restore on failure
//
// No dependencies. Uses global fetch (Node 18 or later).

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256, stripFrontmatter } from "../hooks/lib.mjs";

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pinsPath = path.join(repo, "tools", "upstream.json");
const staging = path.join(repo, ".sync-staging");

const read = (p) => fs.readFileSync(p, "utf8");
const readPins = () => JSON.parse(read(pinsPath));

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

export function ruleNumbers(name, body) {
  const re = name === "unslop" ? /^(\d+)\. \*\*/gm : /^### (\d+)\. /gm;
  return [...body.matchAll(re)].map((m) => Number(m[1]));
}

export function overlayCitations(name) {
  const label = name === "unslop" ? "unslop rule" : "ADHD rule";
  const text = fs.readdirSync(path.join(repo, "overlay")).map((f) => read(path.join(repo, "overlay", f))).join("\n");
  const re = new RegExp(`${label}s? (\\d+)(?:(?:,| and| to) (\\d+))*`, "g");
  const cited = new Set();
  for (const m of text.matchAll(re)) {
    const nums = m[0].match(/\d+/g).map(Number);
    if (/ to /.test(m[0]) && nums.length === 2) for (let n = nums[0]; n <= nums[1]; n++) cited.add(n);
    else nums.forEach((n) => cited.add(n));
  }
  return cited;
}

export function citationReport(name, oldBody, newBody) {
  const oldRules = new Set(ruleNumbers(name, oldBody));
  const newRules = new Set(ruleNumbers(name, newBody));
  const cited = overlayCitations(name);
  const warnings = [...newRules].filter((n) => !oldRules.has(n) && !cited.has(n)).map((n) => `${name} rule ${n} is new and not cited in overlay/`);
  const failures = [...cited].filter((n) => !newRules.has(n)).map((n) => `overlay/ cites ${name} rule ${n}, which no longer exists upstream`);
  return { warnings, failures };
}

async function fetchRaw(repoSlug, commit, filePath) {
  const url = `https://raw.githubusercontent.com/${repoSlug}/${commit}/${filePath}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
  return res.text();
}

function run(cmd, args) {
  execFileSync(cmd, args, { cwd: repo, stdio: "inherit" });
}

export async function bump(name, commit) {
  const pins = readPins();
  const pin = pins.upstreams[name];
  if (!pin) throw new Error(`unknown upstream ${name}; known: ${Object.keys(pins.upstreams).join(", ")}`);
  const stageDir = path.join(staging, name);
  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.mkdirSync(stageDir, { recursive: true });

  const fetched = {};
  for (const [file, meta] of Object.entries(pin.files)) {
    fetched[file] = await fetchRaw(pin.repo, commit, meta.path);
    fs.writeFileSync(path.join(stageDir, file), fetched[file]);
  }
  const newBody = stripFrontmatter(fetched["SKILL.md"]);
  const deps = dependencyHits(newBody);
  if (deps.length) {
    console.error(`refusing to bump ${name}: new body has runtime dependencies the composite does not ship:\n  ${deps.join("\n  ")}`);
    console.error(`staged files left in ${stageDir}`);
    process.exit(1);
  }
  const oldBody = stripFrontmatter(read(path.join(repo, "upstream", name, "SKILL.md")));
  const { warnings, failures } = citationReport(name, oldBody, newBody);
  warnings.forEach((w) => console.warn(`warning: ${w}`));
  if (failures.length) {
    console.error(`refusing to bump ${name}:\n  ${failures.join("\n  ")}\nstaged files left in ${stageDir}`);
    process.exit(1);
  }

  // Back up canonical files, swap staged files in, build and test, then promote or restore.
  const backupDir = path.join(staging, `${name}.backup`);
  fs.rmSync(backupDir, { recursive: true, force: true });
  fs.cpSync(path.join(repo, "upstream", name), backupDir, { recursive: true });
  const pinsBackup = read(pinsPath);
  const generated = ["skills/adhd-unslop", "hooks/chunks", ".claude-plugin", ".codex-plugin"].map((r) => path.join(repo, r));
  const generatedBackup = path.join(staging, `${name}.generated-backup`);
  fs.rmSync(generatedBackup, { recursive: true, force: true });
  for (const g of generated) fs.cpSync(g, path.join(generatedBackup, path.relative(repo, g)), { recursive: true });

  try {
    for (const [file, text] of Object.entries(fetched)) {
      fs.writeFileSync(path.join(repo, "upstream", name, file), text);
      pin.files[file].sha256 = sha256(text);
    }
    pin.commit = commit;
    fs.writeFileSync(pinsPath, JSON.stringify(pins, null, 2) + "\n");
    run("node", ["tools/build.mjs"]);
    run("node", ["--test", ...fs.readdirSync(path.join(repo, "tests")).filter((f) => f.endsWith(".test.mjs")).map((f) => path.join("tests", f))]);
  } catch (err) {
    console.error(`bump failed; restoring canonical files. Staged files remain in ${stageDir}.`);
    fs.rmSync(path.join(repo, "upstream", name), { recursive: true, force: true });
    fs.cpSync(backupDir, path.join(repo, "upstream", name), { recursive: true });
    fs.writeFileSync(pinsPath, pinsBackup);
    for (const g of generated) {
      fs.rmSync(g, { recursive: true, force: true });
      fs.cpSync(path.join(generatedBackup, path.relative(repo, g)), g, { recursive: true });
    }
    process.exit(1);
  }
  fs.rmSync(backupDir, { recursive: true, force: true });
  fs.rmSync(generatedBackup, { recursive: true, force: true });
  fs.rmSync(stageDir, { recursive: true, force: true });
  console.log(`promoted ${name} to ${commit}. Review: git diff upstream/ skills/ hooks/chunks/ tools/upstream.json`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , cmd, name, commit] = process.argv;
  if (cmd === "--check") {
    const problems = checkPins();
    if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
    console.log("upstream/ matches tools/upstream.json");
  } else if (cmd === "--bump" && name && commit) {
    await bump(name, commit);
  } else {
    console.error("usage: node tools/sync.mjs --check | --bump <name> <commit>");
    process.exit(2);
  }
}
