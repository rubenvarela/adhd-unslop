import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { latestRateLimits } from "../tools/codex-usage.mjs";
import { repo, trackTemp } from "./helpers.mjs";

const reading = (primary, secondary) =>
  JSON.stringify({ type: "event_msg", payload: { type: "token_count", rate_limits: { primary: { used_percent: primary, window_minutes: 300, resets_at: 1790000000 }, secondary: { used_percent: secondary, window_minutes: 10080, resets_at: 1790500000 } } } });

function home(lines) {
  const dir = trackTemp(fs.mkdtempSync(path.join(os.tmpdir(), "adhd-unslop-usage-")));
  const day = path.join(dir, "sessions", "2026", "09", "26");
  fs.mkdirSync(day, { recursive: true });
  fs.writeFileSync(path.join(day, "rollout-a.jsonl"), lines.join("\n") + "\n");
  return dir;
}

const run = (codexHome, ...args) => spawnSync(process.execPath, [path.join(repo, "tools", "codex-usage.mjs"), ...args], { env: { PATH: process.env.PATH, CODEX_HOME: codexHome, HOME: "/nonexistent-home" }, encoding: "utf8" });

describe("codex usage", () => {
  test("reads the last rate_limits record in the newest log", () => {
    const dir = home(['{"type":"session_meta"}', reading(10, 20), "not json", reading(35, 40)]);
    const r = latestRateLimits(dir);
    assert.equal(r.primary.used_percent, 35);
    assert.equal(r.secondary.used_percent, 40);
  });

  test("the gate passes under the limit and exits 3 at or above it", () => {
    assert.equal(run(home([reading(79, 10)]), "--gate").status, 0);
    const high = run(home([reading(80, 10)]), "--gate");
    assert.equal(high.status, 3);
    assert.match(high.stdout, /pause Codex model runs/);
    assert.equal(run(home([reading(10, 85)]), "--gate").status, 3);
    assert.equal(run(home([reading(50, 10)]), "--gate", "--max", "40").status, 3);
  });

  test("no reading passes the gate", () => {
    const dir = trackTemp(fs.mkdtempSync(path.join(os.tmpdir(), "adhd-unslop-usage-")));
    const r = run(dir, "--gate");
    assert.equal(r.status, 0);
    assert.match(r.stdout, /no reading yet/);
  });
});
