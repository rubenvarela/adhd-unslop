import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import os from "node:os";
import { pluginRoot, readPlugin, tempPlugin, tempConfigDirs } from "./helpers.mjs";
import { chunkHeader, chunkFooter, bundleId, renderChunk, flagPaths, estimateTokens, TOTAL_CHUNKS, FLAG_NAME, missingDependencies, runtimeOf, dependencyWarning } from "../plugins/adhd-unslop/hooks/lib.mjs";
import { compose } from "../tools/build.mjs";

const repo = pluginRoot;
const read = readPlugin;

const hooksJson = JSON.parse(read("hooks", "hooks.json"));
const [group, depGroup] = hooksJson.hooks.SessionStart;
const handlers = group.hooks;

function runHandler(n, { root, env = {}, rootVar = "CLAUDE_PLUGIN_ROOT" }) {
  const cmd = handlers[n - 1].command;
  const cleanEnv = { PATH: process.env.PATH, HOME: env.HOME ?? "/nonexistent-home", ...env };
  cleanEnv[rootVar] = root;
  const r = spawnSync("sh", ["-c", cmd], { env: cleanEnv, encoding: "utf8" });
  return r;
}

function optIn(dir) {
  fs.writeFileSync(path.join(dir, FLAG_NAME), "");
}

describe("hooks.json", () => {
  test("two SessionStart groups: always-on chunks, then the dependency check", () => {
    assert.equal(hooksJson.hooks.SessionStart.length, 2);
    assert.equal(depGroup.hooks.length, 1);
    assert.match(depGroup.matcher, /\bstartup\b/);
    assert.ok(depGroup.hooks[0].command.includes("check-deps.mjs"));
  });

  test("three synchronous handlers, one per chunk, all four start sources", () => {
    assert.equal(handlers.length, TOTAL_CHUNKS);
    for (const src of ["startup", "resume", "clear", "compact"]) assert.match(group.matcher, new RegExp(`\\b${src}\\b`));
    handlers.forEach((h, i) => {
      assert.equal(h.type, "command");
      assert.ok(h.command.includes(`ADHD_UNSLOP_CHUNK='${i + 1}'`), `handler ${i + 1} sets its chunk`);
      assert.ok(h.command.includes("process.env.CLAUDE_PLUGIN_ROOT") && h.command.includes("process.env.PLUGIN_ROOT"));
      assert.ok(h.command.includes("await import") && h.command.includes(".catch"));
      assert.notEqual(h.async, true);
      assert.equal(typeof h.additionalContextLimit, "number");
    });
  });

  test("each emitted value fits both runtime caps with fixed 120-char flag paths", () => {
    const fixture = ["/" + "c".repeat(119), "/" + "x".repeat(119)];
    handlers.forEach((h, i) => {
      const r = renderChunk(repo, i + 1, { flags: fixture, tokenLimit: h.additionalContextLimit });
      assert.ok(r.ok, r.reason);
      assert.ok(r.text.length < 9000, `chunk ${i + 1} is ${r.text.length} chars`);
      assert.ok(r.tokens < 4000, `chunk ${i + 1} is ~${r.tokens} tokens`);
      assert.ok(h.additionalContextLimit >= r.tokens * 1.25, `limit ${h.additionalContextLimit} vs ~${r.tokens} tokens`);
    });
  });

  test("oversized flag paths are rejected before any payload output", () => {
    const huge = ["/" + "c".repeat(1999), "/" + "x".repeat(1999)];
    const r = renderChunk(repo, 2, { flags: huge });
    assert.equal(r.ok, false);
    assert.match(r.reason, /over/);
  });
});

describe("always-on launcher", () => {
  test("silent without a flag", () => {
    const cfg = tempConfigDirs();
    for (let n = 1; n <= TOTAL_CHUNKS; n++) {
      const r = runHandler(n, { root: repo, env: { CLAUDE_CONFIG_DIR: cfg.claude, CODEX_HOME: cfg.codex } });
      assert.equal(r.status, 0);
      assert.equal(r.stdout, "");
      assert.equal(r.stderr, "");
    }
  });

  for (const which of ["claude", "codex"]) {
    test(`with the ${which} flag, the three values reproduce the composite body`, () => {
      const cfg = tempConfigDirs();
      optIn(cfg[which]);
      const env = { CLAUDE_CONFIG_DIR: cfg.claude, CODEX_HOME: cfg.codex };
      const manifest = JSON.parse(read("hooks", "chunks", "manifest.json"));
      const id = bundleId(manifest.compositeSha256);
      const flags = flagPaths(env, "/nonexistent-home");
      let joined = "";
      for (let n = 1; n <= TOTAL_CHUNKS; n++) {
        const r = runHandler(n, { root: repo, env });
        assert.equal(r.status, 0);
        assert.equal(r.stderr, "");
        const header = chunkHeader(n, id);
        const footer = chunkFooter(n, id, flags);
        assert.ok(r.stdout.startsWith(header), `chunk ${n} header`);
        assert.ok(r.stdout.endsWith(footer), `chunk ${n} footer`);
        assert.match(header, new RegExp(`Chunk ${n} of ${TOTAL_CHUNKS} from bundle ${id}`));
        assert.match(header, /Precedence\. On a direct reply ADHD wins/);
        assert.match(header, /Restore the latest known state/);
        assert.match(header, /do not activate from the partial set/);
        joined += r.stdout.slice(header.length, r.stdout.length - footer.length);
      }
      assert.equal(joined, compose().hookBody);
    });
  }

  test("works when only PLUGIN_ROOT is set (Codex)", () => {
    const cfg = tempConfigDirs();
    optIn(cfg.codex);
    const r = runHandler(1, { root: repo, env: { CLAUDE_CONFIG_DIR: cfg.claude, CODEX_HOME: cfg.codex }, rootVar: "PLUGIN_ROOT" });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /^ADHD-UNSLOP INSTRUCTIONS\. Chunk 1 of 3/);
  });

  test("with a flag and a broken install, prints one JSON systemMessage and no context", () => {
    const cases = [
      ["missing chunk file", (root) => fs.rmSync(path.join(root, "hooks", "chunks", "2.md")), 2, /chunk file 2\.md missing/],
      ["missing manifest", (root) => fs.rmSync(path.join(root, "hooks", "chunks", "manifest.json")), 1, /manifest missing/],
      ["hash mismatch", (root) => fs.appendFileSync(path.join(root, "hooks", "chunks", "3.md"), "tampered\n"), 3, /hash mismatch/],
    ];
    for (const [label, sabotage, n, expected] of cases) {
      const root = tempPlugin();
      const cfg = tempConfigDirs();
      optIn(cfg.claude);
      sabotage(root);
      const r = runHandler(n, { root, env: { CLAUDE_CONFIG_DIR: cfg.claude, CODEX_HOME: cfg.codex } });
      assert.equal(r.status, 0, label);
      const lines = r.stdout.trim().split("\n");
      assert.equal(lines.length, 1, `${label}: one line`);
      const obj = JSON.parse(lines[0]);
      assert.match(obj.systemMessage, expected, label);
      assert.equal(obj.additionalContext, undefined);
      assert.equal(obj.hookSpecificOutput, undefined);
    }
  });

  test("invalid chunk number with a flag reports, without a flag stays silent", () => {
    const cfg = tempConfigDirs();
    const env = { CLAUDE_CONFIG_DIR: cfg.claude, CODEX_HOME: cfg.codex };
    const bad = handlers[0].command.replace("ADHD_UNSLOP_CHUNK='1'", "ADHD_UNSLOP_CHUNK='9'");
    let r = spawnSync("sh", ["-c", bad], { env: { PATH: process.env.PATH, HOME: "/nonexistent-home", CLAUDE_PLUGIN_ROOT: repo, ...env }, encoding: "utf8" });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "");
    optIn(cfg.claude);
    r = spawnSync("sh", ["-c", bad], { env: { PATH: process.env.PATH, HOME: "/nonexistent-home", CLAUDE_PLUGIN_ROOT: repo, ...env }, encoding: "utf8" });
    assert.equal(r.status, 0);
    assert.match(JSON.parse(r.stdout).systemMessage, /invalid chunk index 9/);
  });

  test("missing plugin root or SKILL.md never fails the session", () => {
    const cfg = tempConfigDirs();
    optIn(cfg.claude);
    const r = runHandler(1, { root: path.join(repo, "does-not-exist"), env: { CLAUDE_CONFIG_DIR: cfg.claude, CODEX_HOME: cfg.codex } });
    assert.equal(r.status, 0);
    assert.equal(r.stderr, "");
  });

  test("token estimate is the shared function", () => {
    assert.equal(estimateTokens("abcd"), 1);
    assert.equal(estimateTokens("abcde"), 2);
  });
});

// Build a fake plugin cache: <base>/<marketplace>/<plugin>/<version>/ for each name.
function fakeCache(base, names) {
  const mkt = path.join(base, "plugins", "cache", "adhd-unslop");
  for (const name of names) fs.mkdirSync(path.join(mkt, name, "0.1.0"), { recursive: true });
  const root = path.join(mkt, "adhd-unslop", "0.2.0");
  fs.cpSync(path.join(pluginRoot, "hooks"), path.join(root, "hooks"), { recursive: true });
  return root;
}

function runDepCheck(root, env = {}) {
  const cleanEnv = { PATH: process.env.PATH, HOME: "/nonexistent-home", PLUGIN_ROOT: root, ...env };
  return spawnSync("sh", ["-c", depGroup.hooks[0].command], { env: cleanEnv, encoding: "utf8" });
}

describe("dependency check", () => {
  const deps = JSON.parse(read("hooks", "dependencies.json")).plugins;

  test("silent in this checkout, where siblings sit next to the plugin", () => {
    assert.deepEqual(missingDependencies(pluginRoot).plugins, []);
    const r = runDepCheck(pluginRoot);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "");
  });

  for (const runtime of ["codex", "claude"]) {
    test(`${runtime} cache: silent when present, warns with the ${runtime} command when missing`, () => {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), "adhd-unslop-deps-"));
      const configDir = path.join(home, runtime === "codex" ? ".codex" : ".claude");
      const env = runtime === "codex" ? { CODEX_HOME: configDir } : { CLAUDE_CONFIG_DIR: configDir };

      const full = fakeCache(configDir, deps);
      let r = runDepCheck(full, env);
      assert.equal(r.status, 0);
      assert.equal(r.stdout, "");

      fs.rmSync(path.join(full, "..", "..", deps[0]), { recursive: true });
      r = runDepCheck(full, env);
      assert.equal(r.status, 0);
      const out = JSON.parse(r.stdout);
      const msg = out.systemMessage;
      assert.equal(out.hookSpecificOutput.hookEventName, "SessionStart");
      assert.ok(out.hookSpecificOutput.additionalContext.endsWith(msg));
      assert.ok(msg.includes(deps[0]) && !msg.includes(deps[1]), msg);
      const cmd = runtime === "codex" ? `codex plugin add ${deps[0]}@adhd-unslop` : `claude plugin install ${deps[0]}@adhd-unslop`;
      assert.ok(msg.includes(cmd), msg);
      assert.equal(runtimeOf(full, env, "/nonexistent-home"), runtime);
    });
  }

  test("unknown runtime lists both install commands", () => {
    const msg = dependencyWarning("/somewhere/else", { marketplace: "adhd-unslop", plugins: ["au-unslop"] }, {}, "/h");
    assert.match(msg, /claude plugin install au-unslop@adhd-unslop/);
    assert.match(msg, /codex plugin add au-unslop@adhd-unslop/);
  });

  test("a broken install never fails the session", () => {
    const root = tempPlugin();
    fs.rmSync(path.join(root, "hooks", "dependencies.json"));
    const r = runDepCheck(root);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "");
    assert.equal(runDepCheck(path.join(root, "nope")).status, 0);
  });
});
