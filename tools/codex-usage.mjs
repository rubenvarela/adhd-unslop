#!/usr/bin/env node
// Report Codex plan usage from the newest session log, and gate model runs on it.
//
//   node tools/codex-usage.mjs            print the 5-hour and weekly usage
//   node tools/codex-usage.mjs --gate     also exit 3 when either window is at
//                                         or above the limit (default 80 percent)
//   node tools/codex-usage.mjs --gate --max 70
//
// Codex writes a rate_limits record into each session log under
// $CODEX_HOME/sessions (default ~/.codex). The newest one is the latest reading
// the plan reported. Runs in throwaway homes count against the same plan but
// leave their logs elsewhere, so run this after a model run in ~/.codex to
// refresh the reading. No reading counts as unknown, which passes the gate.
//
// No dependencies. Node 18 or later.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

function newestLogs(dir, limit = 20) {
  const out = [];
  const walk = (d) => {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".jsonl")) out.push({ p, mtime: fs.statSync(p).mtimeMs });
    }
  };
  walk(dir);
  return out.sort((a, b) => b.mtime - a.mtime).slice(0, limit).map((x) => x.p);
}

// The last rate_limits object in the newest log that has one.
export function latestRateLimits(codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex")) {
  for (const file of newestLogs(path.join(codexHome, "sessions"))) {
    const lines = fs.readFileSync(file, "utf8").trim().split("\n").reverse();
    for (const line of lines) {
      if (!line.includes('"rate_limits"')) continue;
      try {
        const found = findKey(JSON.parse(line), "rate_limits");
        if (found?.primary) return { ...found, file };
      } catch {
        // Skip a malformed line.
      }
    }
  }
  return null;
}

function findKey(value, key) {
  if (!value || typeof value !== "object") return null;
  if (key in value) return value[key];
  for (const v of Object.values(value)) {
    const hit = findKey(v, key);
    if (hit) return hit;
  }
  return null;
}

const describe = (w) => {
  if (!w) return "unknown";
  const hours = Math.round(w.window_minutes / 60);
  const resets = w.resets_at ? new Date(w.resets_at * 1000).toLocaleString() : "unknown";
  return `${w.used_percent}% of the ${hours >= 24 ? `${Math.round(hours / 24)}-day` : `${hours}-hour`} window, resets ${resets}`;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const gate = args.includes("--gate");
  const i = args.indexOf("--max");
  const max = i >= 0 ? Number(args[i + 1]) : 80;
  const limits = latestRateLimits();
  if (!limits) {
    console.log("codex usage: no reading yet");
    process.exit(0);
  }
  console.log(`codex usage: ${describe(limits.primary)}; ${describe(limits.secondary)}`);
  if (gate) {
    const over = [limits.primary, limits.secondary].filter((w) => w && w.used_percent >= max);
    if (over.length) {
      console.log(`codex usage is at or above ${max}%: pause Codex model runs until ${describe(over[0])}`);
      process.exit(3);
    }
  }
}
