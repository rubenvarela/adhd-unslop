import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { repo, read, proseOnly } from "./helpers.mjs";
import { ruleNumbers, overlayCitations } from "../tools/sync.mjs";
import { stripFrontmatter } from "../hooks/lib.mjs";

const overlayFiles = fs.readdirSync(path.join(repo, "overlay")).filter((f) => f.endsWith(".md")).sort();
const overlayText = overlayFiles.map((f) => read("overlay", f)).join("\n");
const prose = proseOnly(overlayText);

const RULE7 = ["additionally", "crucial", "delve", "enduring", "enhance", "fostering", "garner", "interplay", "intricate", "landscape", "pivotal", "showcase", "tapestry", "testament", "underscore", "vibrant"];
const HEADING_ALLOW = new Set(["ADHD", "AI", "Claude", "Code", "Codex", "README", "PR", "JSON", "URL", "URLs", "Lifecycle"]);

describe("overlay prose passes the mechanical unslop checks", () => {
  test("no em dash, no en dash as a dash, no curly quotes", () => {
    assert.doesNotMatch(prose, /—/, "em dash");
    assert.doesNotMatch(prose, /\s–\s/, "en dash as dash");
    assert.doesNotMatch(prose, /[“”‘’]/, "curly quotes");
  });
  test('no "not just X, but Y" framing', () => {
    assert.doesNotMatch(prose, /\bnot just\b/i);
  });
  test("no unslop rule 7 vocabulary", () => {
    for (const w of RULE7) assert.doesNotMatch(prose, new RegExp(`\\b${w}\\b`, "i"), w);
  });
  test("headings are sentence case", () => {
    for (const line of prose.split("\n")) {
      const m = line.match(/^#+\s+(.*)$/);
      if (!m) continue;
      const words = m[1].split(/\s+/).slice(1);
      const capitalised = words.filter((w) => /^[A-Z][a-z]+/.test(w) && !HEADING_ALLOW.has(w.replace(/[^A-Za-z]/g, "")));
      assert.equal(capitalised.length, 0, `title case heading: ${line}`);
    }
  });
  test("no decorative emoji", () => {
    assert.doesNotMatch(prose, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });
});

describe("precedence and lifecycle content", () => {
  const precedence = read("overlay", "10-precedence.md");
  const lifecycle = read("overlay", "20-lifecycle.md");
  test("names both surfaces and the tie-breaker", () => {
    assert.match(precedence, /Direct reply\./);
    assert.match(precedence, /Other writing\./);
    assert.match(precedence, /ADHD wins for a direct reply/);
    assert.match(precedence, /Unslop wins for other writing/);
  });
  test("outcome table has one row per interaction", () => {
    const interactions = JSON.parse(read("tests", "interactions.json"));
    for (const { id, name } of interactions) {
      const rows = precedence.split("\n").filter((l) => l.startsWith(`| ${id} ${name} |`));
      assert.equal(rows.length, 1, `row for ${id} ${name}`);
      assert.equal(rows[0].split("|").length - 2, 3, `row ${id} has three cells`);
    }
  });
  test("carries the unslop always-apply mandate and all three switches", () => {
    assert.match(precedence, /Must always apply/);
    for (const phrase of ['"stop adhd mode"', '"stop unslop"', '"normal mode"']) assert.ok(lifecycle.includes(phrase), phrase);
    assert.match(lifecycle, /Invoking the skill again enables both/);
    assert.match(lifecycle, /Known limitation/);
  });
  test("every rule the overlay cites exists upstream", () => {
    for (const name of ["i-have-adhd", "unslop"]) {
      const body = stripFrontmatter(read("upstream", name, "SKILL.md"));
      const existing = new Set(ruleNumbers(name, body));
      for (const n of overlayCitations(name)) assert.ok(existing.has(n), `${name} rule ${n} cited but missing upstream`);
    }
  });
  test("cites the conflicts the plan identified", () => {
    const cited = overlayCitations("unslop");
    for (const n of [7, 13]) assert.ok(cited.has(n), `unslop rule ${n}`);
  });
});
