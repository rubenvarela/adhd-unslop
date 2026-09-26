import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import {
  authoredPlugins,
  composeChunks,
  expectedFiles,
  loadConfig,
  loadPins,
  markers,
  prune,
  staleFiles,
  strayFiles,
  upstreamBlock,
  upstreamsShipped,
  userOnly,
  vendoredPlugins,
  renderTemplate,
  templateUpstreams,
} from "../tools/build.mjs";
import { sha256, stripFrontmatter, TOTAL_CHUNKS, estimateTokens } from "../src/adhd-unslop/hooks/lib.mjs";
import { dependencyHits } from "../tools/sync.mjs";
import { repo, read, readPlugin, pluginRoot } from "./helpers.mjs";

const config = loadConfig();
const pins = loadPins();
const composed = config.plugins.find((p) => p.name === "adhd-unslop");
const frontmatterOf = (text) => text.match(/^---\n([\s\S]*?)\n---\n/)[1];
const skillNamesOf = (p) => (p.kind === "vendored" ? [p.skill] : Object.keys(p.skills));

describe("generated files", () => {
  test("every generated file matches a fresh build", () => {
    assert.deepEqual(staleFiles(), []);
  });

  test("no stray files under generated folders", () => {
    assert.deepEqual(strayFiles(), []);
  });

  test("a stray file is reported, and --prune removes only strays", () => {
    const stray = path.join(repo, "plugins", "adhd-unslop", "skills", "adhd-unslop", "stray-test-file.md");
    fs.writeFileSync(stray, "stray\n");
    try {
      assert.ok(strayFiles().includes("plugins/adhd-unslop/skills/adhd-unslop/stray-test-file.md"));
      const removed = prune();
      assert.deepEqual(removed, ["plugins/adhd-unslop/skills/adhd-unslop/stray-test-file.md"]);
      assert.ok(!fs.existsSync(stray));
      assert.deepEqual(staleFiles(), []);
    } finally {
      fs.rmSync(stray, { force: true });
    }
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
    const dirs = fs.readdirSync(path.join(repo, "plugins")).filter((d) => !d.startsWith(".")).sort();
    assert.deepEqual(dirs, config.plugins.map((p) => p.name).sort());
  });

  test("every plugin ships at least one skill, and each listed skill ships a SKILL.md", () => {
    for (const p of config.plugins) {
      const names = skillNamesOf(p);
      assert.ok(names.length > 0, `${p.name} has no skills`);
      for (const s of names) assert.ok(fs.existsSync(path.join(repo, "plugins", p.name, "skills", s, "SKILL.md")), `${p.name}:${s}`);
    }
  });

  test("every upstream a plugin ships is pinned", () => {
    for (const p of config.plugins) for (const up of upstreamsShipped(p)) assert.ok(pins[up], `${p.name} ships unpinned upstream ${up}`);
  });

  test("no template syntax survives the build", () => {
    for (const [file, text] of expectedFiles()) {
      if (file.endsWith(".md")) assert.doesNotMatch(text, /^\{\{include /m, file);
      assert.ok(!file.endsWith(".tmpl"), `${file} shipped a template`);
    }
  });
});

describe("marketplaces and manifests", () => {
  const claude = JSON.parse(read(".claude-plugin", "marketplace.json"));
  const codex = JSON.parse(read(".agents", "plugins", "marketplace.json"));

  test("both marketplace files list every plugin at ./plugins/<name>", () => {
    assert.equal(claude.name, config.marketplace.name);
    assert.equal(codex.name, config.marketplace.name);
    assert.deepEqual(claude.plugins.map((e) => e.name), config.plugins.map((p) => p.name));
    assert.deepEqual(codex.plugins.map((e) => e.name), config.plugins.map((p) => p.name));
    for (const e of claude.plugins) assert.equal(e.source, `./plugins/${e.name}`);
    for (const e of codex.plugins) assert.deepEqual(e.source, { source: "local", path: `./plugins/${e.name}` });
  });

  test("Claude Code marketplace entries carry no version, so plugin.json is the only one", () => {
    for (const e of claude.plugins) assert.equal(e.version, undefined, e.name);
  });

  test("the Codex marketplace keeps the plugins to Codex", () => {
    for (const e of codex.plugins) {
      assert.deepEqual(e.policy.products, ["CODEX"], e.name);
      assert.equal(e.policy.installation, "AVAILABLE");
    }
  });

  test("each plugin's manifests carry its own version and no dependencies", () => {
    for (const p of config.plugins) {
      const cm = JSON.parse(read("plugins", p.name, ".claude-plugin", "plugin.json"));
      const xm = JSON.parse(read("plugins", p.name, ".codex-plugin", "plugin.json"));
      assert.equal(cm.version, p.version, `${p.name} claude`);
      assert.equal(xm.version, p.version, `${p.name} codex`);
      assert.equal(cm.dependencies, undefined, `${p.name} declares dependencies`);
      assert.equal(xm.skills, "./skills/");
      assert.equal(cm.homepage, config.homepage);
      assert.equal(cm.repository, config.repository);
      assert.ok(Array.isArray(cm.keywords) && cm.keywords.length > 0);
      assert.equal(cm.interface, undefined, "interface belongs in the Codex manifest only");
    }
    assert.equal(config.plugins.some((p) => "dependencies" in p), false);
  });

  test("the Codex manifest names the hooks file exactly when the plugin ships hooks", () => {
    for (const p of config.plugins) {
      const xm = JSON.parse(read("plugins", p.name, ".codex-plugin", "plugin.json"));
      const hasHooks = fs.existsSync(path.join(repo, "plugins", p.name, "hooks", "hooks.json"));
      assert.equal(xm.hooks, hasHooks ? "./hooks/hooks.json" : undefined, p.name);
    }
  });

  test("no root plugin.json, which Codex would read first and cut skills at 8,000 bytes", () => {
    assert.ok(!fs.existsSync(path.join(repo, "plugin.json")));
    for (const p of config.plugins) assert.ok(!fs.existsSync(path.join(repo, "plugins", p.name, "plugin.json")), p.name);
  });

  test("vendored plugins cannot collide with upstream plugin names", () => {
    for (const p of vendoredPlugins(config)) assert.notEqual(p.name, p.upstream);
  });

  test("each plugin ships a README, and a NOTICE and license for every upstream it ships", () => {
    for (const p of config.plugins) {
      assert.match(read("plugins", p.name, "README.md"), new RegExp(`claude plugin install ${p.name}@adhd-unslop`));
      for (const up of upstreamsShipped(p)) {
        assert.equal(read("plugins", p.name, "LICENSES", `${up}.LICENSE`), read("upstream", up, "LICENSE"));
        const notice = read("plugins", p.name, "NOTICE.md");
        assert.ok(notice.includes(pins[up].repo) && notice.includes(pins[up].commit), `${p.name} NOTICE names ${up}`);
      }
    }
  });

  test("short descriptions fit the strictest cap seen, 64 characters", () => {
    for (const [file, text] of expectedFiles()) {
      if (!file.endsWith("agents/openai.yaml")) continue;
      const m = text.match(/short_description: "(.*)"/);
      assert.ok(m && m[1].length <= 64, file);
    }
  });
});

describe("vendored mirrors", () => {
  for (const plugin of vendoredPlugins(config)) {
    const skillPath = ["plugins", plugin.name, "skills", plugin.skill];
    test(`${plugin.name}: SKILL.md is the upstream file byte for byte`, () => {
      assert.equal(read(...skillPath, "SKILL.md"), read("upstream", plugin.upstream, "SKILL.md"));
    });
    test(`${plugin.name}: the Codex policy matches the upstream invocation setting`, () => {
      const upstreamUserOnly = userOnly(read("upstream", plugin.upstream, "SKILL.md"));
      const yaml = read(...skillPath, "agents", "openai.yaml");
      assert.match(yaml, new RegExp(`allow_implicit_invocation: ${!upstreamUserOnly}`));
    });
    test(`${plugin.name}: the skill folder holds only SKILL.md and agents/openai.yaml`, () => {
      const files = [];
      const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : files.push(path.relative(path.join(repo, ...skillPath), path.join(d, e.name)))));
      walk(path.join(repo, ...skillPath));
      assert.deepEqual(files.sort(), ["SKILL.md", path.join("agents", "openai.yaml")].sort());
    });
  }

  test("userOnly reads only the frontmatter flag", () => {
    assert.equal(userOnly("---\nname: x\ndisable-model-invocation: true\n---\nbody\n"), true);
    assert.equal(userOnly("---\nname: x\n---\ndisable-model-invocation: true\n"), false);
    assert.equal(userOnly("---\nname: x\ndisable-model-invocation: false\n---\n"), false);
  });
});

describe("embedded upstreams", () => {
  const { chunks } = composeChunks(composed, pins);

  for (const plugin of authoredPlugins(config)) {
    for (const [skill, spec] of Object.entries(plugin.skills)) {
      for (const up of spec.upstreams ?? []) {
        test(`${plugin.name}:${skill} embeds the pinned ${up} block exactly once`, () => {
          const text = read("plugins", plugin.name, "skills", skill, "SKILL.md");
          const { begin, end } = markers(up, pins);
          let body = stripFrontmatter(read("upstream", up, "SKILL.md"));
          if (!body.endsWith("\n")) body += "\n";
          const block = begin + body + end;
          assert.equal(block, upstreamBlock(up, pins));
          assert.equal(text.split(block).length - 1, 1);
        });
        test(`${plugin.name}:${skill} carries the same ${up} bytes as the always-on chunk`, () => {
          const carrying = chunks.filter((c) => c.includes(markers(up, pins).begin));
          assert.equal(carrying.length, 1);
          assert.ok(carrying[0].includes(upstreamBlock(up, pins)));
        });
      }
    }
  }

  test("a template whose upstream directives disagree with tools/plugins.json fails the build", () => {
    assert.deepEqual(templateUpstreams("a\n{{upstream unslop}}\nb\n{{upstream i-have-adhd}}\n"), ["unslop", "i-have-adhd"]);
    assert.throws(() => renderTemplate("adhd-unslop", "{{upstream not-pinned}}\n"), /unpinned upstream not-pinned/);
  });
});

describe("composed skill and hook chunks", () => {
  const skill = readPlugin("skills", "adhd-unslop", "SKILL.md");
  const { chunks, body, manifest } = composeChunks(composed, pins);

  test("the skill body is the hook bundle, byte for byte", () => {
    const note = "<!-- GENERATED by tools/build.mjs from src/adhd-unslop/. Edit the sources, then rebuild. -->\n";
    const afterFrontmatter = skill.replace(/^---\n[\s\S]*?\n---\n/, "");
    assert.ok(afterFrontmatter.startsWith(note));
    assert.equal(afterFrontmatter.slice(note.length), body);
  });

  test("skill size against Claude Code's 20,000-character re-attach budget after compaction", (t) => {
    // Claude Code 2.1.283 re-attaches an invoked skill after /compact cut to
    // 20,000 characters (design/research/11-tests-e2e.md). The skill is over
    // it by design (DECISIONS D9); this keeps the gap visible in the output.
    const over = skill.length - 20000;
    t.diagnostic(`adhd-unslop SKILL.md is ${skill.length} characters, ${over > 0 ? `${over} over` : `${-over} under`} the re-attach budget`);
    assert.ok(skill.length < 30000, "the skill grew far past the documented size");
  });

  test("the skill reads no files and names no references folder", () => {
    assert.doesNotMatch(skill, /references\//);
    assert.ok(!fs.existsSync(path.join(pluginRoot, "skills", "adhd-unslop", "references")));
  });

  test("chunks on disk reproduce the bundle and match the manifest", () => {
    const onDisk = manifest.chunks.map((m) => readPlugin("hooks", "chunks", m.file));
    assert.equal(onDisk.length, TOTAL_CHUNKS);
    assert.equal(onDisk.join(""), body);
    onDisk.forEach((c, i) => {
      assert.equal(c, chunks[i]);
      assert.equal(sha256(c), manifest.chunks[i].sha256);
      assert.equal(Buffer.byteLength(c, "utf8"), manifest.chunks[i].bytes);
      assert.equal(c.length, manifest.chunks[i].utf16Units);
    });
    assert.equal(sha256(body), manifest.compositeSha256);
    assert.deepEqual(JSON.parse(readPlugin("hooks", "chunks", "manifest.json")), manifest);
  });

  test("chunk boundaries follow the plan's partition", () => {
    const adhd = markers("i-have-adhd", pins);
    const unslop = markers("unslop", pins);
    assert.ok(chunks[0].includes("## Lifecycle") && !chunks[0].includes(adhd.begin), "chunk 1 ends before the ADHD block");
    assert.ok(chunks[1].startsWith(adhd.begin) && chunks[1].includes(adhd.end), "chunk 2 is the ADHD block");
    assert.ok(chunks[2].startsWith(unslop.begin) && chunks[2].includes("## Final check"), "chunk 3 is unslop plus final check");
  });

  test("frontmatter is valid for Claude Code and the Codex policy is explicit", () => {
    const fm = frontmatterOf(skill);
    assert.match(fm, /^name: adhd-unslop$/m);
    assert.match(fm, /^disable-model-invocation: true$/m);
    const desc = fm.match(/^description: '(.*)'$/m)[1];
    assert.ok(desc.length < 1024, "description under 1024 chars");
    const yaml = readPlugin("skills", "adhd-unslop", "agents", "openai.yaml");
    assert.match(yaml, /allow_implicit_invocation: false/);
    assert.match(yaml, /\$adhd-unslop:adhd-unslop/);
  });

  test("the doctor skill runs only when the user invokes it", () => {
    const fm = frontmatterOf(readPlugin("skills", "doctor", "SKILL.md"));
    assert.match(fm, /^name: doctor$/m);
    assert.match(fm, /^disable-model-invocation: true$/m);
    assert.match(readPlugin("skills", "doctor", "agents", "openai.yaml"), /allow_implicit_invocation: false/);
  });

  test("no upstream text depends on files the plugins do not ship", () => {
    for (const name of Object.keys(pins)) assert.deepEqual(dependencyHits(stripFrontmatter(read("upstream", name, "SKILL.md"))), [], name);
  });

  test("dependency scan catches what it should and ignores illustrative paths", () => {
    assert.equal(dependencyHits("Open `src/auth.ts` and edit line 42.").length, 0);
    assert.equal(dependencyHits("See [the rubric](references/rubric.md).").length > 0, true);
    assert.equal(dependencyHits("Run scripts/check.sh first.").length > 0, true);
    assert.equal(dependencyHits("See [docs](https://example.com/docs).").length, 0);
  });

  test("the bundle exceeds a single hook cap, which is why it is chunked", () => {
    assert.ok(body.length > 10000, `bundle is ${body.length} chars`);
    assert.ok(estimateTokens(body) > 2500);
  });
});

describe("upstream pins", () => {
  test("upstream/ files match tools/upstream.json sha256", () => {
    for (const [name, pin] of Object.entries(pins)) {
      for (const [file, meta] of Object.entries(pin.files)) assert.equal(sha256(read("upstream", name, file)), meta.sha256, `${name}/${file}`);
      assert.match(pin.commit, /^[0-9a-f]{40}$/);
    }
  });

  test("upstreamsShipped covers mirrors, embedded upstreams, and always-on chunks", () => {
    assert.deepEqual(upstreamsShipped(config.plugins.find((p) => p.name === "au-unslop")), ["unslop"]);
    assert.deepEqual(upstreamsShipped(composed).sort(), ["i-have-adhd", "unslop"]);
    assert.deepEqual(upstreamsShipped({ kind: "authored", skills: { x: { upstreams: ["i-have-adhd"] } } }), ["i-have-adhd"]);
  });

  test("reference clones, when present, still match the pinned upstream files", { skip: !fs.existsSync(path.join(repo, "i-have-adhd--repo")) }, () => {
    assert.equal(read("i-have-adhd--repo", "skills", "i-have-adhd", "SKILL.md"), read("upstream", "i-have-adhd", "SKILL.md"));
    assert.equal(read("pstack-claude--repo", "plugins", "pstack", "skills", "unslop", "SKILL.md"), read("upstream", "unslop", "SKILL.md"));
  });

  test("plugin root constant points at the composed plugin", () => {
    assert.ok(fs.existsSync(path.join(pluginRoot, "hooks", "hooks.json")));
  });
});
