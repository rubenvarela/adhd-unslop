import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { repo, read, proseOnly, trackTemp } from "./helpers.mjs";

const plugins = path.join(repo, "plugins");
const SCRIPT = path.join("skills", "doctor", "scripts", "doctor.mjs");
const FLAG = ".adhd-unslop-always";
const MIRRORS = ["au-i-have-adhd", "au-unslop"];
const versionOf = (dir) => JSON.parse(fs.readFileSync(path.join(dir, ".claude-plugin", "plugin.json"), "utf8")).version;

// A throwaway home with empty Claude Code and Codex config dirs.
function tempDirs() {
  const base = trackTemp(fs.mkdtempSync(path.join(os.tmpdir(), "adhd-unslop-doctor-")));
  const home = path.join(base, "home");
  const claude = path.join(home, ".claude");
  const codex = path.join(home, ".codex");
  for (const d of [claude, codex]) fs.mkdirSync(d, { recursive: true });
  return { base, home, claude, codex };
}

// Copy whole generated plugin dirs so a test can break them.
function copyPlugins(dest, names = ["adhd-unslop", ...MIRRORS]) {
  for (const n of names) fs.cpSync(path.join(plugins, n), path.join(dest, n), { recursive: true });
  return path.join(dest, "adhd-unslop");
}

function runDoctor(dirs, { root = path.join(plugins, "adhd-unslop"), env = {} } = {}) {
  const clean = { PATH: process.env.PATH, HOME: dirs.home, CLAUDE_CONFIG_DIR: dirs.claude, CODEX_HOME: dirs.codex, ...env };
  for (const [k, v] of Object.entries(clean)) if (v === undefined) delete clean[k];
  const r = spawnSync(process.execPath, [path.join(root, SCRIPT)], { env: clean, encoding: "utf8" });
  const lines = r.stdout.split("\n").filter(Boolean);
  return {
    ...r,
    lines,
    oks: lines.filter((l) => l.startsWith("OK   ")),
    warns: lines.filter((l) => l.startsWith("WARN ")),
    fails: lines.filter((l) => l.startsWith("FAIL ")),
    has: (re) => lines.some((l) => re.test(l)),
  };
}

// The line right after a WARN or FAIL line that matches `re`.
function fixFor(r, re) {
  const i = r.lines.findIndex((l) => /^(WARN|FAIL) /.test(l) && re.test(l));
  assert.ok(i >= 0, `no WARN or FAIL line matching ${re}:\n${r.stdout}`);
  assert.match(r.lines[i + 1] ?? "", /^ {5}fix: \S/);
  return r.lines[i + 1];
}

function snapshot(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      const st = fs.lstatSync(p);
      out.push(`${path.relative(dir, p)} ${st.size} ${st.mtimeMs}`);
      if (e.isDirectory()) walk(p);
    }
  };
  walk(dir);
  return out.sort();
}

describe("doctor output", () => {
  test("clean checkout: exit 0, no WARN or FAIL, every line in the report format", () => {
    const r = runDoctor(tempDirs());
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(r.stderr, "");
    assert.deepEqual(r.fails, []);
    assert.deepEqual(r.warns, []);
    for (const l of r.lines) assert.match(l, /^(OK {3}|WARN |FAIL | {5}fix: | {5}then: )\S/, l);
    assert.ok(r.has(/^OK {3}runtime: unknown \(source checkout\?\)$/), r.stdout);
    assert.ok(r.has(new RegExp(`^OK {3}plugin root: .*plugins[/\\\\]adhd-unslop$`)), r.stdout);
    assert.ok(r.has(new RegExp(`^OK {3}adhd-unslop version ${versionOf(path.join(plugins, "adhd-unslop")).replace(/\./g, "\\.")}$`)));
    for (const m of MIRRORS) assert.ok(r.has(new RegExp(`^OK {3}${m}: installed \\(${versionOf(path.join(plugins, m)).replace(/\./g, "\\.")}\\)$`)), m);
    for (const i of [1, 2, 3]) assert.ok(r.has(new RegExp(`^OK {3}chunk ${i} of 3: hash matches, \\d+ of 10000 characters`)), `chunk ${i}`);
    assert.ok(r.has(/^OK {3}always-on is off: no flag file/));
    assert.ok(!r.has(/Codex hooks|SessionStart/), "no Codex checks without a Codex runtime or config.toml");
  });

  test("a flag file turns always-on on and is listed", () => {
    const dirs = tempDirs();
    const flag = path.join(dirs.claude, FLAG);
    fs.writeFileSync(flag, "");
    const r = runDoctor(dirs);
    assert.equal(r.status, 0);
    assert.ok(r.lines.includes(`OK   flag file present: ${flag}`), r.stdout);
    assert.ok(r.lines.includes(`OK   flag file absent: ${path.join(dirs.codex, FLAG)}`), r.stdout);
    assert.ok(r.has(/^OK {3}always-on is on: flag file /), r.stdout);
    assert.deepEqual(r.warns, []);
  });

  test("ADHD_UNSLOP_ALWAYS=0 turns it off even with a flag file", () => {
    const dirs = tempDirs();
    fs.writeFileSync(path.join(dirs.codex, FLAG), "");
    const r = runDoctor(dirs, { env: { ADHD_UNSLOP_ALWAYS: "0" } });
    assert.equal(r.status, 0);
    assert.ok(r.has(/^OK {3}always-on is off: ADHD_UNSLOP_ALWAYS=0 .*even with a flag file$/), r.stdout);
    assert.deepEqual(r.warns, []);
  });

  for (const value of ["1", "true", "ON"]) {
    test(`ADHD_UNSLOP_ALWAYS=${value} turns it on without a flag file`, () => {
      const r = runDoctor(tempDirs(), { env: { ADHD_UNSLOP_ALWAYS: value } });
      assert.equal(r.status, 0);
      assert.ok(r.has(new RegExp(`^OK {3}always-on is on: ADHD_UNSLOP_ALWAYS=${value} `)), r.stdout);
      assert.deepEqual(r.warns, []);
    });
  }

  test("an unrecognized ADHD_UNSLOP_ALWAYS value is a WARN with the accepted values", () => {
    const r = runDoctor(tempDirs(), { env: { ADHD_UNSLOP_ALWAYS: "bogus" } });
    assert.equal(r.status, 0);
    assert.equal(r.warns.length, 1, r.stdout);
    const fix = fixFor(r, /ADHD_UNSLOP_ALWAYS="bogus" is not a recognized value/);
    assert.match(fix, /1, true, or on/);
    assert.match(fix, /0, false, or off/);
    assert.ok(r.has(/^OK {3}always-on is off: no flag file/), "falls back to the flag files");
    assert.deepEqual(r.fails, []);
  });
});

describe("doctor failures", () => {
  test("a tampered chunk is a FAIL and exit 1", () => {
    const root = copyPlugins(tempDirs().base);
    fs.appendFileSync(path.join(root, "hooks", "chunks", "2.md"), "tampered\n");
    const r = runDoctor(tempDirs(), { root });
    assert.equal(r.status, 1, r.stdout);
    assert.equal(r.fails.length, 1, r.stdout);
    assert.match(fixFor(r, /^FAIL chunk 2 of 3: chunk 2 hash mismatch$/), /node tools\/build\.mjs|reinstall/);
    assert.ok(r.has(/^OK {3}chunk 1 of 3: hash matches/));
    assert.ok(r.has(/^OK {3}chunk 3 of 3: hash matches/));
  });

  test("a missing hooks/lib.mjs is a FAIL, not a crash", () => {
    const root = copyPlugins(tempDirs().base, ["adhd-unslop"]);
    fs.rmSync(path.join(root, "hooks", "lib.mjs"));
    const r = runDoctor(tempDirs(), { root });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.equal(r.stderr, "");
    fixFor(r, /^FAIL cannot load .*lib\.mjs \(missing\)/);
    assert.ok(r.has(/^OK {3}adhd-unslop version /), "later checks still run");
  });

  test("missing au- mirrors never produce WARN or FAIL", () => {
    const root = copyPlugins(tempDirs().base, ["adhd-unslop"]);
    const r = runDoctor(tempDirs(), { root });
    assert.equal(r.status, 0, r.stdout);
    for (const m of MIRRORS) assert.ok(r.lines.includes(`OK   ${m}: not installed (optional)`), r.stdout);
    assert.deepEqual(r.warns, []);
    assert.deepEqual(r.fails, []);
  });

  test("the doctor changes nothing on disk", () => {
    const dirs = tempDirs();
    const root = copyPlugins(dirs.base);
    fs.writeFileSync(path.join(dirs.claude, FLAG), "");
    fs.writeFileSync(path.join(dirs.codex, "config.toml"), "[features]\nhooks = false\n");
    fs.mkdirSync(path.join(dirs.home, ".agents", "skills"), { recursive: true });
    fs.symlinkSync(path.join(dirs.base, "gone"), path.join(dirs.home, ".agents", "skills", "adhd-unslop"));
    const before = snapshot(dirs.base);
    runDoctor(dirs, { root });
    assert.deepEqual(snapshot(dirs.base), before);
  });
});

describe("doctor runtime detection and installed layouts", () => {
  test("a Claude Code cache install: runtime claude, mirror versions from the install record, no Codex checks", () => {
    const dirs = tempDirs();
    const cache = path.join(dirs.claude, "plugins", "cache", "adhd-unslop");
    const version = versionOf(path.join(plugins, "adhd-unslop"));
    const root = path.join(cache, "adhd-unslop", version);
    fs.cpSync(path.join(plugins, "adhd-unslop"), root, { recursive: true });
    const mirror = path.join(cache, "au-unslop");
    fs.cpSync(path.join(plugins, "au-unslop"), path.join(mirror, "0.1.1"), { recursive: true });
    fs.cpSync(path.join(plugins, "au-unslop"), path.join(mirror, "9.9.9"), { recursive: true });
    for (const m of [".claude-plugin", ".codex-plugin"]) {
      const p = path.join(mirror, "9.9.9", m, "plugin.json");
      fs.writeFileSync(p, JSON.stringify({ ...JSON.parse(fs.readFileSync(p, "utf8")), version: "9.9.9" }));
    }
    fs.writeFileSync(path.join(mirror, "9.9.9", ".orphaned_at"), "1");
    // The record, not the newest cache folder, decides what is installed.
    fs.writeFileSync(path.join(dirs.claude, "plugins", "installed_plugins.json"), JSON.stringify({
      version: 2,
      plugins: { "adhd-unslop@adhd-unslop": [{ scope: "user", version }], "au-unslop@adhd-unslop": [{ scope: "user", version: versionOf(path.join(plugins, "au-unslop")) }] },
    }));
    fs.writeFileSync(path.join(dirs.codex, "config.toml"), "[features]\nhooks = false\n");
    const r = runDoctor(dirs, { root });
    assert.equal(r.status, 0, r.stdout);
    assert.ok(r.has(/^OK {3}runtime: Claude Code \(plugin root is under /), r.stdout);
    assert.ok(r.lines.includes(`OK   au-unslop: installed (${versionOf(path.join(plugins, "au-unslop"))})`), r.stdout);
    assert.ok(r.lines.includes("OK   au-i-have-adhd: not installed (optional)"), r.stdout);
    assert.ok(!r.has(/Codex hooks|SessionStart/), "Codex checks skipped in Claude Code");
    assert.deepEqual(r.warns, []);
  });

  test("a Codex cache install: runtime codex, hooks feature on by default, handler count", () => {
    const dirs = tempDirs();
    const root = path.join(dirs.codex, "plugins", "cache", "adhd-unslop", "adhd-unslop", "0.3.0");
    fs.cpSync(path.join(plugins, "adhd-unslop"), root, { recursive: true });
    const r = runDoctor(dirs, { root });
    assert.equal(r.status, 0, r.stdout);
    assert.ok(r.has(/^OK {3}runtime: Codex \(plugin root is under /), r.stdout);
    assert.ok(r.lines.includes("OK   Codex hooks feature on (default)"), r.stdout);
    assert.ok(r.has(/^OK {3}.*hooks\.json defines 3 SessionStart handlers\. .*\/hooks/), r.stdout);
    assert.ok(r.has(/^OK {3}always-on is off: .*touch .*\.codex[/\\]\.adhd-unslop-always$/), "suggests the Codex flag");
  });

  test("PLUGIN_ROOT and CLAUDE_PLUGIN_ROOT name the runtime when set", () => {
    assert.ok(runDoctor(tempDirs(), { env: { PLUGIN_ROOT: "/x" } }).has(/^OK {3}runtime: Codex \(PLUGIN_ROOT is set\)$/));
    assert.ok(runDoctor(tempDirs(), { env: { CLAUDE_PLUGIN_ROOT: "/x" } }).has(/^OK {3}runtime: Claude Code \(CLAUDE_PLUGIN_ROOT is set\)$/));
  });
});

describe("doctor optional mirrors", () => {
  // A Claude Code cache: <config>/plugins/cache/adhd-unslop/<plugin>/<version>/.
  const claudeCache = (dirs) => {
    const cache = path.join(dirs.claude, "plugins", "cache", "adhd-unslop");
    for (const n of ["adhd-unslop", ...MIRRORS]) fs.cpSync(path.join(plugins, n), path.join(cache, n, versionOf(path.join(plugins, n))), { recursive: true });
    return path.join(cache, "adhd-unslop", versionOf(path.join(plugins, "adhd-unslop")));
  };
  const record = (dirs, names) => {
    const entries = Object.fromEntries(names.map((n) => [`${n}@adhd-unslop`, [{ scope: "user", version: versionOf(path.join(plugins, n)) }]]));
    fs.writeFileSync(path.join(dirs.claude, "plugins", "installed_plugins.json"), JSON.stringify({ version: 2, plugins: entries }));
  };

  test("Claude Code: cache folders alone do not count as installed", () => {
    const dirs = tempDirs();
    const root = claudeCache(dirs);
    record(dirs, ["adhd-unslop"]);
    const r = runDoctor(dirs, { root });
    assert.ok(r.has(/^OK {3}runtime: Claude Code/), r.stdout);
    for (const m of MIRRORS) assert.ok(r.lines.includes(`OK   ${m}: not installed (optional)`), r.stdout);
    assert.deepEqual(r.warns, []);
  });

  for (const [label, content] of [
    ["absent", null],
    ["invalid JSON", "{not json"],
    ["plugins: null", JSON.stringify({ version: 2, plugins: null })],
    ["plugins as an array", JSON.stringify({ version: 2, plugins: [] })],
  ]) {
    test(`Claude Code: an ${label} install record makes the mirrors unknown, not installed`, () => {
      const dirs = tempDirs();
      const root = claudeCache(dirs);
      const file = path.join(dirs.claude, "plugins", "installed_plugins.json");
      if (content !== null) fs.writeFileSync(file, content);
      const r = runDoctor(dirs, { root });
      assert.equal(r.status, 0, r.stdout + r.stderr);
      assert.equal(r.stderr, "");
      for (const m of MIRRORS) assert.ok(r.has(new RegExp(`^OK {3}${m}: unknown, because the Claude Code install record .* is missing or unreadable \\(optional\\)$`)), r.stdout);
      assert.deepEqual(r.warns, []);
      assert.deepEqual(r.fails, []);
    });
  }

  test("Claude Code: the install record lists an installed mirror", () => {
    const dirs = tempDirs();
    const root = claudeCache(dirs);
    record(dirs, ["adhd-unslop", "au-unslop"]);
    const r = runDoctor(dirs, { root });
    assert.ok(r.has(new RegExp(`^OK {3}au-unslop: installed \\(${versionOf(path.join(plugins, "au-unslop")).replace(/\./g, "\\.")}\\)$`)), r.stdout);
    assert.ok(r.lines.includes("OK   au-i-have-adhd: not installed (optional)"), r.stdout);
  });
});

describe("doctor Codex features", () => {
  const withConfig = (toml) => {
    const dirs = tempDirs();
    fs.writeFileSync(path.join(dirs.codex, "config.toml"), toml);
    return runDoctor(dirs);
  };

  test("[features] hooks = false is a WARN", () => {
    const r = withConfig("[features]\nhooks = false\n");
    assert.equal(r.status, 0);
    assert.equal(r.warns.length, 1, r.stdout);
    assert.match(fixFor(r, /^WARN Codex hooks are off/), /hooks = true/);
    const i = r.lines.findIndex((l) => /^WARN Codex hooks are off/.test(l));
    assert.equal(r.lines[i + 2], "     then: start a new Codex session");
    assert.ok(r.has(/^OK {3}.*defines 3 SessionStart handlers/), r.stdout);
  });

  for (const [label, toml] of [
    ["no spaces and a comment", "model = 'x'\n[features]\njs_repl = false\nhooks=false # off\n"],
    ["a dotted key at the top level", "features.hooks = false\n[other]\nx = 1\n"],
    ["an inline table", "features = { js_repl = true, hooks = false }\n"],
  ]) {
    test(`hooks = false with ${label} is a WARN`, () => {
      assert.equal(withConfig(toml).warns.length, 1);
    });
  }

  for (const [label, toml] of [
    ["another table", "[features]\njs_repl = false\n[profiles.x.features]\nhooks = false\n"],
    ["a comment", "[features]\n# hooks = false\n"],
    ["an array of tables", "[[features]]\nhooks = false\n"],
  ]) {
    test(`hooks = false in ${label} is not a WARN`, () => {
      const r = withConfig(toml);
      assert.deepEqual(r.warns, [], r.stdout);
      assert.ok(r.lines.includes("OK   Codex hooks feature on (default)"), r.stdout);
    });
  }

  test("hooks = true is reported as set", () => {
    const r = withConfig("[features]\nhooks = true\n");
    assert.deepEqual(r.warns, []);
    assert.ok(r.has(/^OK {3}Codex hooks feature on \(hooks = true in /), r.stdout);
  });
});

describe("doctor name clash in ~/.agents/skills", () => {
  const skillsIn = (dirs) => {
    const d = path.join(dirs.home, ".agents", "skills");
    fs.mkdirSync(d, { recursive: true });
    return d;
  };

  test("a dangling adhd-unslop symlink is a WARN with an rm fix", () => {
    const dirs = tempDirs();
    const link = path.join(skillsIn(dirs), "adhd-unslop");
    fs.symlinkSync(path.join(dirs.base, "does-not-exist"), link);
    const r = runDoctor(dirs);
    assert.equal(r.status, 0);
    assert.equal(r.warns.length, 1, r.stdout);
    assert.equal(fixFor(r, /exists\. It may clash with the adhd-unslop skill in Codex/), `     fix: rm ${link}`);
  });

  test("a real adhd-unslop directory gets rm -r", () => {
    const dirs = tempDirs();
    const dir = path.join(skillsIn(dirs), "adhd-unslop");
    fs.mkdirSync(dir);
    assert.equal(fixFor(runDoctor(dirs), /exists/), `     fix: rm -r ${dir}`);
  });

  test("a link under another name into a copy of this repo is a WARN", () => {
    const dirs = tempDirs();
    const link = path.join(skillsIn(dirs), "my-skill");
    fs.symlinkSync(path.join(repo, "plugins", "adhd-unslop", "skills", "adhd-unslop"), link);
    const r = runDoctor(dirs);
    assert.equal(r.warns.length, 1, r.stdout);
    assert.equal(fixFor(r, /links into an installed or checked-out adhd-unslop plugin\. It creates a duplicate adhd-unslop:adhd-unslop skill name/), `     fix: rm ${link}`);
  });

  test("a link into an installed plugin cache is a WARN naming the duplicated skill", () => {
    const dirs = tempDirs();
    const cache = path.join(dirs.codex, "plugins", "cache", "adhd-unslop");
    copyPlugins(cache, ["au-unslop"]);
    const link = path.join(skillsIn(dirs), "unslop-link");
    fs.symlinkSync(path.join(cache, "au-unslop", "skills", "unslop"), link);
    const r = runDoctor(dirs);
    assert.equal(r.warns.length, 1, r.stdout);
    assert.equal(fixFor(r, /links into an installed or checked-out au-unslop plugin\. It creates a duplicate au-unslop:unslop skill name/), `     fix: rm ${link}`);
  });

  test("a link into a marketplace checkout outside any plugin still warns", () => {
    const dirs = tempDirs();
    const link = path.join(skillsIn(dirs), "repo-link");
    fs.symlinkSync(path.join(repo, "design"), link);
    const r = runDoctor(dirs);
    assert.equal(r.warns.length, 1, r.stdout);
    assert.equal(fixFor(r, /links into a copy of the adhd-unslop repo/), `     fix: rm ${link}`);
  });

  test("unrelated entries and links are fine", () => {
    const dirs = tempDirs();
    const skills = skillsIn(dirs);
    fs.mkdirSync(path.join(skills, "other"));
    fs.mkdirSync(path.join(dirs.base, "elsewhere"));
    fs.symlinkSync(path.join(dirs.base, "elsewhere"), path.join(skills, "linked"));
    const r = runDoctor(dirs);
    assert.deepEqual(r.warns, [], r.stdout);
    assert.ok(r.has(/^OK {3}no .* entry clashes with the adhd-unslop skills$/));
  });
});

describe("doctor skill files", () => {
  const dir = ["src", "adhd-unslop", "skills", "doctor"];
  const skill = read(...dir, "SKILL.md");
  const yaml = read(...dir, "agents", "openai.yaml");

  test("frontmatter keeps the skill user-only", () => {
    const fm = skill.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? "";
    assert.match(fm, /^name: doctor$/m);
    assert.match(fm, /^description: '[^']*adhd-unslop install[^']*only when the user invokes it[^']*'$/m);
    assert.match(fm, /^disable-model-invocation: true$/m);
    assert.match(fm, /^license: MIT$/m);
    assert.match(yaml, /^ {2}allow_implicit_invocation: false$/m);
    assert.match(yaml, /^ {2}display_name: "adhd-unslop doctor"$/m);
    const short = yaml.match(/^ {2}short_description: "([^"]*)"$/m)?.[1];
    assert.ok(short && short.length <= 64, `short_description: ${short}`);
  });

  test("body names both run commands and asks before each fix", () => {
    assert.ok(skill.includes('node "${CLAUDE_SKILL_DIR}/scripts/doctor.mjs"'));
    assert.match(skill, /In Codex, run `node "<dir>\/scripts\/doctor\.mjs"`/);
    assert.match(skill, /unchanged/);
    assert.match(skill, /Never run a fix without asking/);
  });

  test("body prose passes the mechanical unslop checks", () => {
    const prose = proseOnly(skill.replace(/^---\n[\s\S]*?\n---\n/, ""));
    assert.doesNotMatch(prose, /—/);
    assert.doesNotMatch(prose, /[“”‘’]/);
    assert.doesNotMatch(prose, /\bnot just\b/i);
    for (const w of ["additionally", "crucial", "delve", "enhance", "pivotal", "showcase", "underscore", "vibrant"]) assert.doesNotMatch(prose, new RegExp(`\\b${w}\\b`, "i"), w);
    for (const line of prose.split("\n").filter((l) => /^#+\s/.test(l))) {
      assert.deepEqual(line.replace(/^#+\s+\S+\s*/, "").match(/\b[A-Z][a-z]+/g) ?? [], [], `title case: ${line}`);
    }
  });

  test("the generated copy matches the source", () => {
    for (const rel of ["SKILL.md", "agents/openai.yaml", "scripts/doctor.mjs"]) {
      assert.equal(read("plugins", "adhd-unslop", "skills", "doctor", rel), read(...dir, rel), rel);
    }
  });
});
