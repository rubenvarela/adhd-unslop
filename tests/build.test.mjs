import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { compose, staleFiles, loadPins, loadConfig, markers, rewriteFrontmatter, vendoredPlugins, composedPlugin } from "../tools/build.mjs";
import { sha256, stripFrontmatter, TOTAL_CHUNKS, estimateTokens } from "../plugins/adhd-unslop/hooks/lib.mjs";
import { dependencyHits } from "../tools/sync.mjs";
import { repo, read, readPlugin, pluginRoot } from "./helpers.mjs";

const frontmatterOf = (text) => text.match(/^---\n([\s\S]*?)\n---\n/)[1];

describe("generated files", () => {
  test("every generated file matches a fresh build", () => {
    assert.deepEqual(staleFiles(), []);
  });

  test("no file under plugins/ is a symlink", () => {
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        assert.ok(!entry.isSymbolicLink(), `${path.relative(repo, abs)} is a symlink`);
        if (entry.isDirectory()) walk(abs);
      }
    };
    walk(path.join(repo, "plugins"));
  });

  test("plugins/ holds exactly the plugins in tools/plugins.json", () => {
    const names = loadConfig().plugins.map((p) => p.name).sort();
    const dirs = fs.readdirSync(path.join(repo, "plugins")).filter((d) => !d.startsWith(".")).sort();
    assert.deepEqual(dirs, names);
  });
});

describe("marketplaces and manifests", () => {
  const config = loadConfig();

  test("both marketplace files list every plugin at ./plugins/<name>", () => {
    const claude = JSON.parse(read(".claude-plugin", "marketplace.json"));
    const codex = JSON.parse(read(".agents", "plugins", "marketplace.json"));
    assert.equal(claude.name, config.marketplace.name);
    assert.equal(codex.name, config.marketplace.name);
    for (const p of config.plugins) {
      const c = claude.plugins.find((e) => e.name === p.name);
      assert.equal(c.source, `./plugins/${p.name}`);
      assert.equal(c.version, p.version);
      const x = codex.plugins.find((e) => e.name === p.name);
      assert.deepEqual(x.source, { source: "local", path: `./plugins/${p.name}` });
      assert.equal(x.policy.installation, "AVAILABLE");
    }
    assert.equal(claude.plugins.length, config.plugins.length);
    assert.equal(codex.plugins.length, config.plugins.length);
  });

  test("each plugin's manifests carry its own version", () => {
    for (const p of config.plugins) {
      assert.equal(JSON.parse(read("plugins", p.name, ".claude-plugin", "plugin.json")).version, p.version, `${p.name} claude`);
      const codex = JSON.parse(read("plugins", p.name, ".codex-plugin", "plugin.json"));
      assert.equal(codex.version, p.version, `${p.name} codex`);
      assert.equal(codex.skills, "./skills/");
    }
  });

  test("adhd-unslop declares the vendored plugins as Claude Code dependencies", () => {
    const composed = composedPlugin(config);
    const manifest = JSON.parse(readPlugin(".claude-plugin", "plugin.json"));
    assert.deepEqual(manifest.dependencies, composed.dependencies);
    assert.deepEqual([...composed.dependencies].sort(), vendoredPlugins(config).map((p) => p.name).sort());
    const listed = JSON.parse(readPlugin("hooks", "dependencies.json"));
    assert.deepEqual(listed, { marketplace: config.marketplace.name, plugins: composed.dependencies });
  });

  test("vendored plugins cannot collide with upstream plugin names", () => {
    for (const p of vendoredPlugins(config)) assert.notEqual(p.name, p.upstream);
  });
});

describe("vendored skills", () => {
  const pins = loadPins();
  for (const plugin of vendoredPlugins()) {
    const skillPath = ["plugins", plugin.name, "skills", plugin.skill];
    test(`${plugin.name}: body is byte-for-byte upstream`, () => {
      const upstream = read("upstream", plugin.upstream, "SKILL.md");
      const shipped = read(...skillPath, "SKILL.md");
      assert.equal(stripFrontmatter(shipped), stripFrontmatter(upstream));
    });
    test(`${plugin.name}: frontmatter lets other skills load it`, () => {
      const fm = frontmatterOf(read(...skillPath, "SKILL.md"));
      assert.match(fm, new RegExp(`^name: ${plugin.skill}$`, "m"));
      assert.doesNotMatch(fm, /disable-model-invocation/);
      assert.ok(fm.includes(plugin.skillDescription.replace(/'/g, "''")), "narrow description");
      const yaml = read(...skillPath, "agents", "openai.yaml");
      assert.match(yaml, /allow_implicit_invocation: true/);
      assert.doesNotMatch(yaml, /allow_implicit_invocation: false/);
    });
    test(`${plugin.name}: license and notice ship with the plugin`, () => {
      assert.equal(read(...skillPath, "LICENSE"), read("upstream", plugin.upstream, "LICENSE"));
      const notice = read("plugins", plugin.name, "NOTICE.md");
      assert.ok(notice.includes(pins[plugin.upstream].repo) && notice.includes(pins[plugin.upstream].commit));
    });
  }

  test("frontmatter rewrite keeps other keys and rejects multi-line descriptions", () => {
    const src = "---\nname: x\ndescription: old\ndisable-model-invocation: true\nlicense: MIT\n---\nBody\n";
    assert.equal(rewriteFrontmatter(src, "it's new"), "---\nname: x\ndescription: 'it''s new'\nlicense: MIT\n---\nBody\n");
    assert.throws(() => rewriteFrontmatter("---\nname: x\ndescription: >\n  folded\n---\n", "n"), /multi-line/);
  });
});

describe("composed skill and hook chunks", () => {
  test("the skill loads the upstream texts instead of embedding them", () => {
    const { skill, pins } = compose();
    for (const name of Object.keys(pins)) assert.ok(!skill.includes(markers(name, pins).begin), `${name} not embedded`);
    assert.match(skill, /## Load the upstream skills/);
    for (const p of vendoredPlugins()) assert.ok(skill.includes(`\`${p.name}:${p.skill}\``), `names ${p.name}:${p.skill}`);
    assert.ok(skill.length < 12000, `skill is ${skill.length} chars`);
  });

  test("each upstream body sits byte-for-byte between its markers in the hook bundle", () => {
    const { hookBody, pins } = compose();
    for (const name of Object.keys(pins)) {
      const { begin, end } = markers(name, pins);
      const start = hookBody.indexOf(begin);
      const stop = hookBody.indexOf(end);
      assert.ok(start >= 0 && stop > start, `${name} markers present`);
      let expected = stripFrontmatter(read("upstream", name, "SKILL.md"));
      if (!expected.endsWith("\n")) expected += "\n";
      assert.equal(hookBody.slice(start + begin.length, stop), expected, `${name} body is verbatim`);
      assert.equal(hookBody.split(begin).length - 1, 1, `${name} appears once`);
    }
  });

  test("the hook bundle omits the load step", () => {
    const { hookBody } = compose();
    assert.doesNotMatch(hookBody, /## Load the upstream skills/);
  });

  test("chunks concatenated in index order reproduce the hook bundle", () => {
    const { hookBody, manifest } = compose();
    const chunks = manifest.chunks.map((m) => readPlugin("hooks", "chunks", m.file));
    assert.equal(chunks.length, TOTAL_CHUNKS);
    assert.equal(chunks.join(""), hookBody);
    chunks.forEach((c, i) => {
      assert.equal(sha256(c), manifest.chunks[i].sha256);
      assert.equal(Buffer.byteLength(c, "utf8"), manifest.chunks[i].bytes);
      assert.equal(c.length, manifest.chunks[i].utf16Units);
    });
    assert.equal(sha256(hookBody), manifest.compositeSha256);
    assert.deepEqual(JSON.parse(readPlugin("hooks", "chunks", "manifest.json")), manifest);
  });

  test("chunk boundaries follow the plan's partition", () => {
    const { chunks, pins } = compose();
    const adhd = markers("i-have-adhd", pins);
    const unslop = markers("unslop", pins);
    assert.ok(chunks[0].includes("## Lifecycle") && !chunks[0].includes(adhd.begin), "chunk 1 ends before the ADHD block");
    assert.ok(chunks[1].startsWith(adhd.begin) && chunks[1].includes(adhd.end), "chunk 2 is the ADHD block");
    assert.ok(chunks[2].startsWith(unslop.begin) && chunks[2].includes("## Final check"), "chunk 3 is unslop plus final check");
  });

  test("frontmatter is valid for Claude Code and the Codex policy is explicit", () => {
    const fm = frontmatterOf(readPlugin("skills", "adhd-unslop", "SKILL.md"));
    assert.match(fm, /^name: adhd-unslop$/m);
    assert.match(fm, /^disable-model-invocation: true$/m);
    const desc = fm.match(/^description: '(.*)'$/m)[1];
    assert.ok(desc.length < 1024, "description under 1024 chars");
    const yaml = readPlugin("skills", "adhd-unslop", "agents", "openai.yaml");
    assert.match(yaml, /allow_implicit_invocation: false/);
    assert.match(yaml, /\$adhd-unslop:adhd-unslop/);
  });

  test("licenses and notice ship inside the skill directory", () => {
    const pins = loadPins();
    const notice = readPlugin("skills", "adhd-unslop", "LICENSES", "NOTICE.md");
    for (const [name, pin] of Object.entries(pins)) {
      const lic = readPlugin("skills", "adhd-unslop", "LICENSES", `${name}.LICENSE`);
      assert.equal(lic, read("upstream", name, "LICENSE"));
      assert.match(lic, /MIT License/);
      assert.ok(notice.includes(pin.repo) && notice.includes(pin.commit), `NOTICE names ${name}`);
    }
  });

  test("no runtime dependency in the hook bundle points outside the plugin", () => {
    assert.deepEqual(dependencyHits(compose().hookBody), []);
  });

  test("dependency scan catches what it should and ignores illustrative paths", () => {
    assert.equal(dependencyHits("Open `src/auth.ts` and edit line 42.").length, 0);
    assert.equal(dependencyHits("See [the rubric](references/rubric.md).").length > 0, true);
    assert.equal(dependencyHits("Run scripts/check.sh first.").length > 0, true);
    assert.equal(dependencyHits("See [docs](https://example.com/docs).").length, 0);
  });

  test("hook bundle exceeds a single hook cap, which is why it is chunked", () => {
    const { hookBody } = compose();
    assert.ok(hookBody.length > 10000, `bundle is ${hookBody.length} chars`);
    assert.ok(estimateTokens(hookBody) > 2500);
  });
});

describe("upstream pins", () => {
  test("upstream/ files match tools/upstream.json sha256", () => {
    const pins = loadPins();
    for (const [name, pin] of Object.entries(pins)) {
      for (const [file, meta] of Object.entries(pin.files)) {
        assert.equal(sha256(read("upstream", name, file)), meta.sha256, `${name}/${file}`);
      }
      assert.match(pin.commit, /^[0-9a-f]{40}$/);
    }
  });

  test("reference clones, when present, still match the pinned upstream files", { skip: !fs.existsSync(path.join(repo, "i-have-adhd--repo")) }, () => {
    assert.equal(read("i-have-adhd--repo", "skills", "i-have-adhd", "SKILL.md"), read("upstream", "i-have-adhd", "SKILL.md"));
    assert.equal(read("pstack-claude--repo", "plugins", "pstack", "skills", "unslop", "SKILL.md"), read("upstream", "unslop", "SKILL.md"));
  });

  test("plugin root constant points at the composed plugin", () => {
    assert.ok(fs.existsSync(path.join(pluginRoot, "hooks", "hooks.json")));
  });
});
