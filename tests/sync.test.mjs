import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { bumpPatch, pluginsEmbedding, raiseVersions, reportMarkdown, citationReport } from "../tools/sync.mjs";
import { stripFrontmatter } from "../plugins/adhd-unslop/hooks/lib.mjs";
import { read } from "./helpers.mjs";

const config = () => JSON.parse(read("tools", "plugins.json"));
const pins = () => JSON.parse(read("tools", "upstream.json"));

describe("version bumps", () => {
  test("patch bump", () => {
    assert.equal(bumpPatch("0.2.9"), "0.2.10");
    assert.throws(() => bumpPatch("1.0"), /cannot bump/);
  });

  test("an upstream change bumps its vendored copy and the composed plugin", () => {
    assert.deepEqual(pluginsEmbedding(config(), ["unslop"]).sort(), ["adhd-unslop", "au-unslop"]);
    assert.deepEqual(pluginsEmbedding(config(), ["i-have-adhd"]).sort(), ["adhd-unslop", "au-i-have-adhd"]);
  });

  test("two upstream changes in one run bump the composed plugin once", () => {
    const c = config();
    const before = Object.fromEntries(c.plugins.map((p) => [p.name, p.version]));
    raiseVersions(c, ["unslop", "i-have-adhd"]);
    for (const p of c.plugins) assert.equal(p.version, bumpPatch(before[p.name]), p.name);
  });
});

describe("citation gate", () => {
  test("removing a cited unslop process step fails the bump", () => {
    const body = stripFrontmatter(read("upstream", "unslop", "SKILL.md"));
    const { failures } = citationReport("unslop", body, body.replace(/^3\. Self-audit.*\n/m, ""));
    assert.deepEqual(failures, ["the overlay cites unslop process 3, which no longer exists upstream"]);
  });

  test("removing a cited ADHD exception fails the bump", () => {
    const body = stripFrontmatter(read("upstream", "i-have-adhd", "SKILL.md"));
    const { failures } = citationReport("i-have-adhd", body, body.replace(/^6\. A rule fights the harness.*\n/m, ""));
    assert.deepEqual(failures, ["the overlay cites ADHD exception 6, which no longer exists upstream"]);
  });

  test("an unchanged body passes", () => {
    for (const name of ["unslop", "i-have-adhd"]) {
      const body = stripFrontmatter(read("upstream", name, "SKILL.md"));
      assert.deepEqual(citationReport(name, body, body), { warnings: [], failures: [] });
    }
  });
});

describe("report", () => {
  test("lists updates, new versions, and failures", () => {
    const p = pins();
    const from = p.upstreams.unslop.commit;
    const md = reportMarkdown({
      results: [
        { name: "i-have-adhd", status: "failed", error: "refusing to bump i-have-adhd" },
        { name: "unslop", status: "bumped", from, to: "a".repeat(40), warnings: ["unslop rule 34 is new and not cited in the overlay"] },
      ],
      versions: ["au-unslop 0.1.1", "adhd-unslop 0.2.1"],
    }, p);
    assert.match(md, /\| unslop \| updated \|/);
    assert.ok(md.includes(`compare/${from}...${"a".repeat(40)}`));
    assert.match(md, /- adhd-unslop 0\.2\.1/);
    assert.match(md, /unslop rule 34 is new/);
    assert.match(md, /### i-have-adhd\n\n```\nrefusing to bump i-have-adhd\n```/);
  });
});
