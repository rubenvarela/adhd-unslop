import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { compareSemver, evaluate, gate, parseSemver } from "../tools/version-gate.mjs";

const config = (versions) => ({ plugins: Object.entries(versions).map(([name, version]) => ({ name, version })) });
const byName = (results) => Object.fromEntries(results.map((r) => [r.name, r]));

describe("semver comparison", () => {
  test("compares numbers, not strings", () => {
    assert.equal(compareSemver("0.10.0", "0.9.0"), 1);
    assert.equal(compareSemver("0.9.0", "0.10.0"), -1);
    assert.equal(compareSemver("1.0.0", "0.99.99"), 1);
    assert.equal(compareSemver("0.2.10", "0.2.9"), 1);
    assert.equal(compareSemver("0.3.0", "0.3.0"), 0);
  });

  test("a prerelease sorts before its release", () => {
    assert.equal(compareSemver("1.0.0-rc.1", "1.0.0"), -1);
    assert.equal(compareSemver("1.0.0", "1.0.0-rc.1"), 1);
    assert.equal(compareSemver("1.0.0-rc.2", "1.0.0-rc.10"), -1);
    assert.equal(compareSemver("1.0.0-alpha", "1.0.0-beta"), -1);
    assert.equal(compareSemver("1.0.0-1", "1.0.0-alpha"), -1);
    assert.equal(compareSemver("1.0.0-alpha", "1.0.0-alpha.1"), -1);
  });

  test("build metadata is ignored", () => {
    assert.equal(compareSemver("1.0.0+build.2", "1.0.0+build.1"), 0);
  });

  test("rejects versions that are not semver", () => {
    for (const bad of ["1.0", "v1.0.0", "01.0.0", "1.0.0-", "", null, undefined, 1]) assert.equal(parseSemver(bad), null, String(bad));
    assert.throws(() => compareSemver("1.0", "1.0.0"), /not a semver version/);
  });
});

describe("gate logic", () => {
  test("changed files with a raised version pass", () => {
    const [r] = evaluate({ head: config({ a: "0.3.1" }), base: config({ a: "0.3.0" }), changed: { a: ["plugins/a/x.md"] } });
    assert.equal(r.ok, true);
    assert.match(r.message, /0\.3\.0 -> 0\.3\.1/);
  });

  test("changed files without a version change fail", () => {
    const [r] = evaluate({ head: config({ a: "0.3.0" }), base: config({ a: "0.3.0" }), changed: { a: ["plugins/a/x.md"] } });
    assert.equal(r.ok, false);
    assert.match(r.message, /must rise above 0\.3\.0/);
  });

  test("a lowered version fails", () => {
    const [r] = evaluate({ head: config({ a: "0.2.9" }), base: config({ a: "0.3.0" }), changed: { a: ["plugins/a/x.md"] } });
    assert.equal(r.ok, false);
  });

  test("0.10.0 counts as a raise over 0.9.0", () => {
    const [r] = evaluate({ head: config({ a: "0.10.0" }), base: config({ a: "0.9.0" }), changed: { a: ["plugins/a/x.md"] } });
    assert.equal(r.ok, true);
  });

  test("an unchanged plugin passes without a raise", () => {
    const [r] = evaluate({ head: config({ a: "0.3.0" }), base: config({ a: "0.3.0" }), changed: {} });
    assert.equal(r.ok, true);
    assert.match(r.message, /no changes/);
  });

  test("a plugin absent at the base passes", () => {
    const [r] = evaluate({ head: config({ a: "0.1.0" }), base: config({}), changed: { a: ["plugins/a/x.md"] } });
    assert.equal(r.ok, true);
    assert.match(r.message, /new plugin/);
  });

  test("a base without tools/plugins.json treats every plugin as new", () => {
    const results = evaluate({ head: config({ a: "0.1.0", b: "0.1.0" }), base: null, changed: { a: ["plugins/a/x.md"], b: ["plugins/b/y.md"] } });
    assert.deepEqual(results.map((r) => r.ok), [true, true]);
  });

  test("a version that is not semver fails when files changed", () => {
    const [r] = evaluate({ head: config({ a: "0.4" }), base: config({ a: "0.3.0" }), changed: { a: ["plugins/a/x.md"] } });
    assert.equal(r.ok, false);
    assert.match(r.message, /not semver/);
  });

  test("each plugin is judged on its own files", () => {
    const results = byName(evaluate({
      head: config({ a: "0.3.1", b: "0.2.0", c: "0.2.0" }),
      base: config({ a: "0.3.0", b: "0.2.0", c: "0.2.0" }),
      changed: new Map([["a", ["plugins/a/x.md"]], ["b", ["plugins/b/y.md"]], ["c", []]]),
    }));
    assert.equal(results.a.ok, true);
    assert.equal(results.b.ok, false);
    assert.equal(results.c.ok, true);
  });
});

// A local fixture repo, with no remote, to test the git plumbing.
describe("gate on a fixture repo", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adhd-unslop-gate-"));
  after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const quiet = ["-c", "init.defaultBranch=main", "-c", "user.name=gate", "-c", "user.email=gate@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null"];
  const git = (...args) => {
    const r = spawnSync("git", [...quiet, ...args], { cwd: dir, encoding: "utf8" });
    assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
    return r.stdout;
  };
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  };
  const writeConfig = (versions) => write("tools/plugins.json", JSON.stringify(config(versions), null, 2) + "\n");
  const commit = (message) => {
    git("add", "-A");
    git("commit", "-q", "-m", message);
  };

  git("init", "-q");
  write("README.md", "fixture\n");
  commit("before plugins.json");
  git("tag", "no-config");
  writeConfig({ a: "0.1.0", b: "0.1.0" });
  write("plugins/a/SKILL.md", "a\n");
  write("plugins/b/SKILL.md", "b\n");
  write("plugins/b/old.md", "old\n");
  commit("base");

  test("a change without a raise fails, and a raise passes", () => {
    git("checkout", "-q", "-b", "no-raise", "main");
    write("plugins/a/SKILL.md", "a changed\n");
    commit("edit a");
    const r1 = byName(gate({ base: "main", cwd: dir }).results);
    assert.equal(r1.a.ok, false);
    assert.equal(r1.b.ok, true);

    writeConfig({ a: "0.1.1", b: "0.1.0" });
    commit("raise a");
    const r2 = byName(gate({ base: "main", cwd: dir }).results);
    assert.equal(r2.a.ok, true);
  });

  test("a removed file counts as a change", () => {
    git("checkout", "-q", "-b", "remove", "main");
    fs.rmSync(path.join(dir, "plugins/b/old.md"));
    commit("remove from b");
    const { results, changed } = gate({ base: "main", cwd: dir });
    assert.deepEqual(changed.get("b"), ["plugins/b/old.md"]);
    assert.equal(byName(results).b.ok, false);
  });

  test("a change on the base after the branch point is not blamed on the branch", () => {
    git("checkout", "-q", "-b", "side", "main");
    write("NOTES.md", "unrelated\n");
    commit("unrelated");
    git("checkout", "-q", "main");
    write("plugins/a/SKILL.md", "a changed on main\n");
    writeConfig({ a: "0.2.0", b: "0.1.0" });
    commit("main moves on");
    git("checkout", "-q", "side");
    const { results, changed } = gate({ base: "main", cwd: dir });
    assert.deepEqual(changed.get("a"), []);
    assert.equal(results.every((r) => r.ok), true);
  });

  test("a base with no tools/plugins.json passes a new plugin", () => {
    git("checkout", "-q", "main");
    const { results, baseHasConfig } = gate({ base: "no-config", cwd: dir });
    assert.equal(baseHasConfig, false);
    assert.equal(results.every((r) => r.ok), true);
  });

  test("an unknown base is an error", () => {
    assert.throws(() => gate({ base: "does-not-exist", cwd: dir }), /not a commit/);
  });
});
