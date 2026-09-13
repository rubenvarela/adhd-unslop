import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { compose, staleFiles, loadPins, markers } from "../tools/build.mjs";
import { sha256, stripFrontmatter, TOTAL_CHUNKS, estimateTokens } from "../hooks/lib.mjs";
import { dependencyHits } from "../tools/sync.mjs";
import { repo, read } from "./helpers.mjs";

describe("generated composite", () => {
  test("every generated file matches a fresh build", () => {
    assert.deepEqual(staleFiles(), []);
  });

  test("each upstream body sits byte-for-byte between its markers", () => {
    const { body, pins } = compose();
    for (const name of Object.keys(pins)) {
      const { begin, end } = markers(name, pins);
      const start = body.indexOf(begin);
      const stop = body.indexOf(end);
      assert.ok(start >= 0 && stop > start, `${name} markers present`);
      const between = body.slice(start + begin.length, stop);
      let expected = stripFrontmatter(read("upstream", name, "SKILL.md"));
      if (!expected.endsWith("\n")) expected += "\n";
      assert.equal(between, expected, `${name} body is verbatim`);
      assert.equal(body.split(begin).length - 1, 1, `${name} appears once`);
    }
  });

  test("chunks concatenated in index order reproduce the composite body", () => {
    const { body, manifest } = compose();
    const chunks = manifest.chunks.map((m) => read("hooks", "chunks", m.file));
    assert.equal(chunks.length, TOTAL_CHUNKS);
    assert.equal(chunks.join(""), body);
    chunks.forEach((c, i) => {
      assert.equal(sha256(c), manifest.chunks[i].sha256);
      assert.equal(Buffer.byteLength(c, "utf8"), manifest.chunks[i].bytes);
      assert.equal(c.length, manifest.chunks[i].utf16Units);
    });
    assert.equal(sha256(body), manifest.compositeSha256);
    const onDisk = JSON.parse(read("hooks", "chunks", "manifest.json"));
    assert.deepEqual(onDisk, manifest);
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
    const skill = read("skills", "adhd-unslop", "SKILL.md");
    const fm = skill.match(/^---\n([\s\S]*?)\n---\n/)[1];
    assert.match(fm, /^name: adhd-unslop$/m);
    assert.equal(path.basename(path.join(repo, "skills", "adhd-unslop")), "adhd-unslop");
    assert.match(fm, /^disable-model-invocation: true$/m);
    const desc = fm.match(/^description: '(.*)'$/m)[1];
    assert.ok(desc.length < 1024, "description under 1024 chars");
    const yaml = read("skills", "adhd-unslop", "agents", "openai.yaml");
    assert.match(yaml, /allow_implicit_invocation: false/);
  });

  test("manifests carry VERSION", () => {
    const version = read("VERSION").trim();
    assert.equal(JSON.parse(read(".claude-plugin", "plugin.json")).version, version);
    assert.equal(JSON.parse(read(".codex-plugin", "plugin.json")).version, version);
    for (const p of JSON.parse(read(".claude-plugin", "marketplace.json")).plugins) assert.equal(p.version, version);
    assert.equal(JSON.parse(read(".codex-plugin", "plugin.json")).skills, "./skills/");
  });

  test("licenses and notice ship inside the skill directory", () => {
    const pins = loadPins();
    const notice = read("skills", "adhd-unslop", "LICENSES", "NOTICE.md");
    for (const [name, pin] of Object.entries(pins)) {
      const lic = read("skills", "adhd-unslop", "LICENSES", `${name}.LICENSE`);
      assert.equal(lic, read("upstream", name, "LICENSE"));
      assert.match(lic, /MIT License/);
      assert.ok(notice.includes(pin.repo) && notice.includes(pin.commit), `NOTICE names ${name}`);
    }
  });

  test("no runtime dependency in the composite points outside the skill directory", () => {
    const { body } = compose();
    assert.deepEqual(dependencyHits(body), []);
  });

  test("dependency scan catches what it should and ignores illustrative paths", () => {
    assert.equal(dependencyHits("Open `src/auth.ts` and edit line 42.").length, 0);
    assert.equal(dependencyHits("See [the rubric](references/rubric.md).").length > 0, true);
    assert.equal(dependencyHits("Run scripts/check.sh first.").length > 0, true);
    assert.equal(dependencyHits("See [docs](https://example.com/docs).").length, 0);
  });

  test("composite exceeds a single hook cap, which is why it is chunked", () => {
    const { body } = compose();
    assert.ok(body.length > 10000, `body is ${body.length} chars`);
    assert.ok(estimateTokens(body) > 2500);
  });
});

describe("upstream pins", () => {
  test("upstream/ files match tools/upstream.json sha256", () => {
    const pins = loadPins();
    for (const [name, pin] of Object.entries(pins)) {
      for (const [file, meta] of Object.entries(pin.files)) {
        const actual = sha256(read("upstream", name, file));
        assert.equal(actual, meta.sha256, `${name}/${file}`);
      }
      assert.match(pin.commit, /^[0-9a-f]{40}$/);
    }
  });

  test("reference clones, when present, still match the pinned upstream files", { skip: !fs.existsSync(path.join(repo, "i-have-adhd--repo")) }, () => {
    assert.equal(read("i-have-adhd--repo", "skills", "i-have-adhd", "SKILL.md"), read("upstream", "i-have-adhd", "SKILL.md"));
    assert.equal(read("pstack-claude--repo", "plugins", "pstack", "skills", "unslop", "SKILL.md"), read("upstream", "unslop", "SKILL.md"));
  });
});
