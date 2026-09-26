import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { pluginRoot, readPlugin, read, tempPlugin, tempConfigDirs } from "./helpers.mjs";
import {
  alwaysOnSetting,
  bundleId,
  chunkFooter,
  chunkHeader,
  estimateTokens,
  flagPaths,
  FLAG_NAME,
  optedIn,
  renderChunk,
  runtimeOf,
  shouldInject,
  TOTAL_CHUNKS,
} from "../src/adhd-unslop/hooks/lib.mjs";
import { composeChunks, loadConfig, loadPins } from "../tools/build.mjs";

const hooksJson = JSON.parse(readPlugin("hooks", "hooks.json"));
const [group] = hooksJson.hooks.SessionStart;
const handlers = group.hooks;
const { body: bundleBody } = composeChunks(loadConfig().plugins.find((p) => p.name === "adhd-unslop"), loadPins());

// Run chunk handler n the way a runtime does: Claude Code sets only
// CLAUDE_PLUGIN_ROOT; Codex sets PLUGIN_ROOT and CLAUDE_PLUGIN_ROOT.
function runHandler(n, { root = pluginRoot, env = {}, runtime = "claude", source = "startup", input } = {}) {
  const cleanEnv = { PATH: process.env.PATH, HOME: env.HOME ?? "/nonexistent-home", ...env, CLAUDE_PLUGIN_ROOT: root };
  if (runtime === "codex") cleanEnv.PLUGIN_ROOT = root;
  const stdin = input ?? JSON.stringify({ session_id: "t", hook_event_name: "SessionStart", source });
  return spawnSync("sh", ["-c", handlers[n - 1].command], { env: cleanEnv, encoding: "utf8", input: stdin });
}

function optIn(dir) {
  fs.writeFileSync(path.join(dir, FLAG_NAME), "");
}

function configEnv() {
  const cfg = tempConfigDirs();
  return { cfg, env: { CLAUDE_CONFIG_DIR: cfg.claude, CODEX_HOME: cfg.codex } };
}

describe("hooks.json", () => {
  test("one SessionStart group with three synchronous handlers, one per chunk, all four sources", () => {
    assert.equal(hooksJson.hooks.SessionStart.length, 1);
    assert.equal(handlers.length, TOTAL_CHUNKS);
    for (const src of ["startup", "resume", "clear", "compact"]) assert.match(group.matcher, new RegExp(`\\b${src}\\b`));
    handlers.forEach((h, i) => {
      assert.equal(h.type, "command");
      assert.ok(h.command.includes(`ADHD_UNSLOP_CHUNK='${i + 1}'`), `handler ${i + 1} sets its chunk`);
      assert.ok(h.command.includes("process.env.CLAUDE_PLUGIN_ROOT") && h.command.includes("process.env.PLUGIN_ROOT"));
      assert.notEqual(h.async, true);
      assert.equal(typeof h.additionalContextLimit, "number");
    });
  });

  test("the chunk handlers match the definitions Codex users trusted in 0.2.2", () => {
    // Codex keys trust by hooks file path, group, and handler index, and hashes
    // every handler field (design/research/07-tests-codex.md C3). Changing this
    // group sends every Codex user back to /hooks.
    assert.deepEqual(group, JSON.parse(read("tests", "fixtures", "trusted-session-start-group.json")));
  });

  test("each emitted value fits both runtime caps with fixed 120-char flag paths", () => {
    const fixture = ["/" + "c".repeat(119), "/" + "x".repeat(119)];
    handlers.forEach((h, i) => {
      const r = renderChunk(pluginRoot, i + 1, { flags: fixture, tokenLimit: h.additionalContextLimit });
      assert.ok(r.ok, r.reason);
      assert.ok(r.text.length < 9000, `chunk ${i + 1} is ${r.text.length} chars`);
      assert.ok(r.tokens <= 2500, `chunk ${i + 1} is ~${r.tokens} tokens, over the Codex default`);
    });
  });

  test("oversized flag paths are rejected before any payload output", () => {
    const huge = ["/" + "c".repeat(1999), "/" + "x".repeat(1999)];
    const r = renderChunk(pluginRoot, 2, { flags: huge });
    assert.equal(r.ok, false);
    assert.match(r.reason, /over/);
  });
});

describe("opt-in and runtime helpers", () => {
  test("ADHD_UNSLOP_ALWAYS values", () => {
    for (const v of ["0", "false", "off", "OFF", " Off "]) assert.equal(alwaysOnSetting({ ADHD_UNSLOP_ALWAYS: v }).mode, "off", v);
    for (const v of ["1", "true", "on", "ON"]) assert.equal(alwaysOnSetting({ ADHD_UNSLOP_ALWAYS: v }).mode, "on", v);
    for (const v of [undefined, ""]) assert.equal(alwaysOnSetting({ ADHD_UNSLOP_ALWAYS: v }).mode, "unset");
    for (const v of ["yes", "2", "bogus"]) assert.equal(alwaysOnSetting({ ADHD_UNSLOP_ALWAYS: v }).mode, "invalid", v);
  });

  test("the switch overrides the flag files, and an invalid value falls back to them", () => {
    const { cfg, env } = configEnv();
    assert.equal(optedIn(env, "/nonexistent-home"), false);
    assert.equal(optedIn({ ...env, ADHD_UNSLOP_ALWAYS: "1" }, "/nonexistent-home"), true);
    optIn(cfg.claude);
    assert.equal(optedIn(env, "/nonexistent-home"), true);
    assert.equal(optedIn({ ...env, ADHD_UNSLOP_ALWAYS: "0" }, "/nonexistent-home"), false);
    assert.equal(optedIn({ ...env, ADHD_UNSLOP_ALWAYS: "bogus" }, "/nonexistent-home"), true);
  });

  test("runtime detection and the resume rule", () => {
    assert.equal(runtimeOf({ PLUGIN_ROOT: "/p", CLAUDE_PLUGIN_ROOT: "/p" }), "codex");
    assert.equal(runtimeOf({ CLAUDE_PLUGIN_ROOT: "/p" }), "claude");
    assert.equal(runtimeOf({}), null);
    assert.equal(shouldInject("resume", "claude"), false);
    assert.equal(shouldInject("resume", "codex"), true);
    assert.equal(shouldInject("resume", null), true);
    for (const s of ["startup", "clear", "compact", undefined]) assert.equal(shouldInject(s, "claude"), true, String(s));
  });

  test("the footer names both ways to switch always-on off", () => {
    const footer = chunkFooter(1, "abc", ["/a/.adhd-unslop-always", "/b/.adhd-unslop-always"]);
    assert.match(footer, /\/a\/\.adhd-unslop-always, \/b\/\.adhd-unslop-always/);
    assert.match(footer, /ADHD_UNSLOP_ALWAYS=0/);
    assert.match(footer, /"normal mode" turns both modes off/);
  });

  test("the header states the bundle rules as facts", () => {
    const header = chunkHeader(2, "abc");
    assert.match(header, /Chunk 2 of 3 from bundle abc/);
    assert.match(header, /each ending with its END line/);
    assert.match(header, /nothing activates from the partial set/);
    assert.match(header, /latest known state of the ADHD mode and the unslop mode/);
    assert.match(header, /Precedence\. On a direct reply ADHD wins/);
  });
});

describe("always-on launcher", () => {
  test("silent without a flag", () => {
    const { env } = configEnv();
    for (let n = 1; n <= TOTAL_CHUNKS; n++) {
      const r = runHandler(n, { env });
      assert.equal(r.status, 0);
      assert.equal(r.stdout, "");
      assert.equal(r.stderr, "");
    }
  });

  for (const which of ["claude", "codex"]) {
    test(`with the ${which} flag, the three values reproduce the bundle`, () => {
      const { cfg, env } = configEnv();
      optIn(cfg[which]);
      const manifest = JSON.parse(readPlugin("hooks", "chunks", "manifest.json"));
      const id = bundleId(manifest.compositeSha256);
      const flags = flagPaths(env, "/nonexistent-home");
      let joined = "";
      for (let n = 1; n <= TOTAL_CHUNKS; n++) {
        const r = runHandler(n, { env, runtime: which });
        assert.equal(r.status, 0);
        assert.equal(r.stderr, "");
        const header = chunkHeader(n, id);
        const footer = chunkFooter(n, id, flags);
        assert.ok(r.stdout.startsWith(header), `chunk ${n} header`);
        assert.ok(r.stdout.endsWith(footer), `chunk ${n} footer`);
        joined += r.stdout.slice(header.length, r.stdout.length - footer.length);
      }
      assert.equal(joined, bundleBody);
    });
  }

  test("a Claude Code resume prints nothing, a Codex resume injects", () => {
    const { cfg, env } = configEnv();
    optIn(cfg.claude);
    for (let n = 1; n <= TOTAL_CHUNKS; n++) {
      assert.equal(runHandler(n, { env, runtime: "claude", source: "resume" }).stdout, "", `claude chunk ${n}`);
      assert.match(runHandler(n, { env, runtime: "codex", source: "resume" }).stdout, new RegExp(`^ADHD-UNSLOP INSTRUCTIONS\\. Chunk ${n} of 3`));
    }
    for (const source of ["startup", "clear", "compact"]) {
      assert.match(runHandler(1, { env, runtime: "claude", source }).stdout, /^ADHD-UNSLOP INSTRUCTIONS/, source);
    }
  });

  test("an empty or invalid payload injects", () => {
    const { cfg, env } = configEnv();
    optIn(cfg.claude);
    for (const input of ["", "not json", "{\"source\":"]) {
      assert.match(runHandler(1, { env, input }).stdout, /^ADHD-UNSLOP INSTRUCTIONS/, JSON.stringify(input));
    }
  });

  test("stdin that never closes still finishes within the read timeout", async () => {
    const { cfg, env } = configEnv();
    optIn(cfg.claude);
    const started = Date.now();
    const child = spawn("sh", ["-c", handlers[0].command], {
      env: { PATH: process.env.PATH, HOME: "/nonexistent-home", ...env, CLAUDE_PLUGIN_ROOT: pluginRoot },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    const code = await new Promise((resolve) => child.on("exit", resolve));
    child.stdin.destroy();
    assert.equal(code, 0);
    assert.match(out, /^ADHD-UNSLOP INSTRUCTIONS/);
    assert.ok(Date.now() - started < 8000, `took ${Date.now() - started} ms`);
  });

  test("ADHD_UNSLOP_ALWAYS=0 silences a flagged install, =1 turns on an unflagged one", () => {
    const { cfg, env } = configEnv();
    assert.match(runHandler(1, { env: { ...env, ADHD_UNSLOP_ALWAYS: "1" } }).stdout, /^ADHD-UNSLOP INSTRUCTIONS/);
    optIn(cfg.codex);
    assert.equal(runHandler(1, { env: { ...env, ADHD_UNSLOP_ALWAYS: "0" } }).stdout, "");
    assert.equal(runHandler(1, { env: { ...env, ADHD_UNSLOP_ALWAYS: "off" } }).stdout, "");
  });

  test("with a flag and a broken install, prints one JSON systemMessage and no context", () => {
    const cases = [
      ["missing chunk file", (root) => fs.rmSync(path.join(root, "hooks", "chunks", "2.md")), 2, /chunk file 2\.md missing/],
      ["missing manifest", (root) => fs.rmSync(path.join(root, "hooks", "chunks", "manifest.json")), 1, /manifest missing/],
      ["hash mismatch", (root) => fs.appendFileSync(path.join(root, "hooks", "chunks", "3.md"), "tampered\n"), 3, /hash mismatch/],
    ];
    for (const [label, sabotage, n, expected] of cases) {
      const root = tempPlugin();
      const { cfg, env } = configEnv();
      optIn(cfg.claude);
      sabotage(root);
      const r = runHandler(n, { root, env });
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
    const { cfg, env } = configEnv();
    const bad = handlers[0].command.replace("ADHD_UNSLOP_CHUNK='1'", "ADHD_UNSLOP_CHUNK='9'");
    const run = () => spawnSync("sh", ["-c", bad], { env: { PATH: process.env.PATH, HOME: "/nonexistent-home", CLAUDE_PLUGIN_ROOT: pluginRoot, ...env }, encoding: "utf8", input: "{}" });
    assert.equal(run().stdout, "");
    optIn(cfg.claude);
    const r = run();
    assert.equal(r.status, 0);
    assert.match(JSON.parse(r.stdout).systemMessage, /invalid chunk index 9/);
  });

  test("a missing plugin root never fails the session", () => {
    const { cfg, env } = configEnv();
    optIn(cfg.claude);
    const r = runHandler(1, { root: path.join(pluginRoot, "does-not-exist"), env });
    assert.equal(r.status, 0);
    assert.equal(r.stderr, "");
  });

  test("token estimate is the shared function", () => {
    assert.equal(estimateTokens("abcd"), 1);
    assert.equal(estimateTokens("abcde"), 2);
  });
});
