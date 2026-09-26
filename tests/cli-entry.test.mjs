import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { repo, trackTemp } from "./helpers.mjs";

// Each tool must run when node reaches it through a symlinked checkout, as in
// ~/Development pointing into another folder. A failed entry check makes a
// tool exit 0 without doing anything, which would pass a check silently.
describe("tools run through a symlinked checkout", () => {
  const dir = trackTemp(fs.mkdtempSync(path.join(os.tmpdir(), "adhd-unslop-link-")));
  const link = path.join(dir, "checkout");
  fs.symlinkSync(repo, link);
  const run = (...args) => spawnSync(process.execPath, args, { cwd: link, encoding: "utf8", env: { PATH: process.env.PATH, HOME: dir, CODEX_HOME: path.join(dir, "codex") } });

  test("build.mjs --check", () => {
    const r = run(path.join(link, "tools", "build.mjs"), "--check");
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /generated files are current/);
  });

  test("sync.mjs --check", () => {
    const r = run(path.join(link, "tools", "sync.mjs"), "--check");
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /upstream\/ matches tools\/upstream\.json/);
  });

  test("codex-usage.mjs", () => {
    const r = run(path.join(link, "tools", "codex-usage.mjs"));
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /codex usage: /);
  });

  test("version-gate.mjs prints its usage without --base", () => {
    const r = run(path.join(link, "tools", "version-gate.mjs"));
    assert.notEqual(r.stdout + r.stderr, "", "the tool ran and printed something");
  });

  test("load-check.mjs --help", () => {
    const r = run(path.join(link, "tools", "load-check.mjs"), "--help");
    assert.notEqual(r.stdout + r.stderr, "", "the tool ran and printed something");
  });
});
