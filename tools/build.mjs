#!/usr/bin/env node
// Generate every shipped file from tools/plugins.json, tools/upstream.json,
// upstream/, and src/. Nothing under plugins/ is edited by hand.
//
// - both marketplace files, and each plugin's Claude Code and Codex manifests,
//   README.md, NOTICE.md, and LICENSES/
// - vendored plugins: the upstream SKILL.md byte for byte, plus agents/openai.yaml
// - authored plugins: src/<plugin>/skills/ and src/<plugin>/hooks/ copied, each
//   SKILL.md.tmpl rendered, and the always-on chunks with their manifest
//
//   node tools/build.mjs           write every generated file
//   node tools/build.mjs --check   exit 1 if a generated file is stale or missing,
//                                  or a stray file sits under a generated folder
//   node tools/build.mjs --prune   write, then delete stray files

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256, stripFrontmatter, TOTAL_CHUNKS } from "../src/adhd-unslop/hooks/lib.mjs";

export const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
// Folders whose every file the build owns.
export const GENERATED_ROOTS = ["plugins", ".claude-plugin", ".agents/plugins"];
// Files the operating system drops into folders; never shipped, never strays.
const IGNORED_NAMES = new Set([".DS_Store"]);

const read = (...p) => fs.readFileSync(path.join(repo, ...p), "utf8");
const json = (value) => JSON.stringify(value, null, 2) + "\n";
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const endsWithNewline = (s) => (s.endsWith("\n") ? s : s + "\n");

export function loadPins() {
  return JSON.parse(read("tools", "upstream.json")).upstreams;
}

export function loadConfig() {
  return JSON.parse(read("tools", "plugins.json"));
}

export const vendoredPlugins = (config = loadConfig()) => config.plugins.filter((p) => p.kind === "vendored");
export const authoredPlugins = (config = loadConfig()) => config.plugins.filter((p) => p.kind === "authored");

// Every upstream whose text a plugin ships: its mirror, the upstreams its skills
// embed, and its always-on chunks. sync.mjs raises the version of each such plugin.
export function upstreamsShipped(plugin) {
  const names = new Set();
  if (plugin.kind === "vendored") names.add(plugin.upstream);
  for (const skill of Object.values(plugin.skills ?? {})) for (const n of skill.upstreams ?? []) names.add(n);
  for (const chunk of plugin.alwaysOn ?? []) for (const part of chunk) if (part.upstream) names.add(part.upstream);
  return [...names];
}

export function markers(name, pins) {
  const pin = pins[name];
  return {
    begin: `<!-- BEGIN upstream ${name} ${pin.repo}/${pin.files["SKILL.md"].path} @${pin.commit} -->\n`,
    end: `<!-- END upstream ${name} -->\n`,
  };
}

// The upstream block (design/STRUCTURE-v2.md P1): the BEGIN line, the upstream
// SKILL.md without frontmatter and with a final newline, the END line. The same
// bytes go into a skill that embeds the upstream and into the always-on chunks.
export function upstreamBlock(name, pins) {
  const { begin, end } = markers(name, pins);
  return begin + endsWithNewline(stripFrontmatter(read("upstream", name, "SKILL.md"))) + end;
}

// True when upstream frontmatter sets disable-model-invocation: true. Accepts
// CRLF, since upstream files are kept byte for byte.
export function userOnly(skillText) {
  const m = skillText.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  return Boolean(m && /^disable-model-invocation:\s*true\s*$/m.test(m[1]));
}

export function openaiYaml({ displayName, shortDescription, defaultPrompt, allowImplicit }) {
  const lines = ["interface:", `  display_name: ${JSON.stringify(displayName)}`, `  short_description: ${JSON.stringify(shortDescription)}`];
  if (defaultPrompt) lines.push(`  default_prompt: ${JSON.stringify(defaultPrompt)}`);
  lines.push("", "policy:", `  allow_implicit_invocation: ${allowImplicit}`, "");
  return lines.join("\n");
}

// Template syntax, one directive per line:
//   {{include <path under src/<plugin>/>}}  inserts that file
//   {{upstream <name>}}                     inserts the pinned upstream block
// Any other line that starts with {{ fails the build, so a typo never ships.
const DIRECTIVE = /^\{\{(include|upstream) ([^{}]+)\}\}\r?$/;

export function templateUpstreams(text) {
  return text.split("\n").map((line) => line.match(DIRECTIVE)).filter((m) => m && m[1] === "upstream").map((m) => m[2]);
}

export function renderTemplate(pluginName, text, pins = loadPins()) {
  return text
    .split("\n")
    .map((raw) => {
      const line = raw.replace(/\r$/, "");
      if (line.startsWith("{{") && !DIRECTIVE.test(line)) throw new Error(`${pluginName}: unknown template line: ${line}`);
      const inc = line.match(/^\{\{include (.+)\}\}$/);
      if (inc) return read("src", pluginName, inc[1]).replace(/\n$/, "");
      const up = line.match(/^\{\{upstream (.+)\}\}$/);
      if (up) {
        if (!pins[up[1]]) throw new Error(`${pluginName}: template embeds unpinned upstream ${up[1]}`);
        return upstreamBlock(up[1], pins).replace(/\n$/, "");
      }
      return line;
    })
    .join("\n");
}

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_NAMES.has(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs));
    else out.push(abs);
  }
  return out;
}

// The always-on chunks: each chunk is its parts joined by a blank line.
export function composeChunks(plugin, pins) {
  const chunks = (plugin.alwaysOn ?? []).map((parts) =>
    parts
      .map((part) => (part.upstream ? upstreamBlock(part.upstream, pins) : endsWithNewline(read("src", plugin.name, part.file))))
      .join("\n"),
  );
  const body = chunks.join("");
  const manifest = {
    generatedBy: "tools/build.mjs",
    compositeSha256: sha256(body),
    chunks: chunks.map((c, i) => ({
      index: i + 1,
      file: `${i + 1}.md`,
      sha256: sha256(c),
      bytes: Buffer.byteLength(c, "utf8"),
      utf16Units: c.length,
    })),
  };
  return { chunks, body, manifest };
}

function claudePluginJson(plugin, config) {
  return {
    name: plugin.name,
    version: plugin.version,
    description: plugin.description,
    author: config.author,
    homepage: config.homepage,
    repository: config.repository,
    license: "MIT",
    keywords: plugin.keywords ?? [],
  };
}

function codexPluginJson(plugin, config, hasHooks) {
  const i = plugin.codexInterface;
  return {
    name: plugin.name,
    version: plugin.version,
    description: plugin.description,
    author: config.author,
    license: "MIT",
    keywords: plugin.keywords ?? [],
    skills: "./skills/",
    ...(hasHooks ? { hooks: "./hooks/hooks.json" } : {}),
    interface: {
      displayName: i.displayName,
      shortDescription: i.shortDescription,
      longDescription: i.longDescription,
      developerName: config.author.name,
      category: capitalize(plugin.category),
      capabilities: i.capabilities ?? ["Instructions"],
      ...(i.defaultPrompt ? { defaultPrompt: i.defaultPrompt } : {}),
      ...(i.brandColor ? { brandColor: i.brandColor } : {}),
    },
  };
}

function claudeMarketplace(config) {
  // Entries carry no version: plugin.json holds it, and the docs say not to set both.
  return {
    $schema: "https://www.schemastore.org/claude-code-marketplace.json",
    name: config.marketplace.name,
    description: config.marketplace.description,
    owner: config.marketplace.owner,
    plugins: config.plugins.map((p) => ({
      name: p.name,
      description: p.marketplaceDescription ?? p.description,
      source: `./plugins/${p.name}`,
      category: p.category,
    })),
  };
}

function codexMarketplace(config) {
  return {
    name: config.marketplace.name,
    interface: { displayName: config.marketplace.displayName },
    plugins: config.plugins.map((p) => ({
      name: p.name,
      source: { source: "local", path: `./plugins/${p.name}` },
      policy: { installation: "AVAILABLE", authentication: "ON_INSTALL", products: ["CODEX"] },
      category: capitalize(p.category),
    })),
  };
}

function skillNames(plugin) {
  return plugin.kind === "vendored" ? [plugin.skill] : Object.keys(plugin.skills ?? {});
}

function pluginReadme(plugin, config) {
  const mkt = config.marketplace.name;
  const id = `${plugin.name}@${mkt}`;
  const skills = skillNames(plugin);
  const lines = [
    `# ${plugin.name}`,
    "",
    "<!-- GENERATED by tools/build.mjs from tools/plugins.json. -->",
    "",
    plugin.description,
    "",
    "## Install",
    "",
    "```bash",
    `claude plugin marketplace add ${config.repository.replace("https://github.com/", "")}`,
    `claude plugin install ${id}`,
    "",
    `codex plugin marketplace add ${config.repository.replace("https://github.com/", "")} --ref main`,
    `codex plugin add ${id}`,
    "```",
    "",
    "## Skills",
    "",
    ...skills.map((s) => `- \`/${plugin.name}:${s}\` in Claude Code, \`$${plugin.name}:${s}\` in Codex`),
    "",
    `See the repository README for details: ${config.homepage}`,
    "",
  ];
  return lines.join("\n");
}

function noticeText(plugin, pins) {
  const shipped = upstreamsShipped(plugin);
  if (!shipped.length) return null;
  const lines = [
    "# Notice",
    "",
    plugin.kind === "vendored"
      ? "This plugin ships an upstream skill file unchanged, byte for byte."
      : "This plugin ships upstream skill text unchanged after removing its YAML frontmatter, in its skill and in the always-on hook chunks.",
    "Each upstream keeps its own MIT license in `LICENSES/`.",
    "",
    "| Upstream | Repository | Commit | File | License file |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const name of shipped) {
    const pin = pins[name];
    lines.push(`| ${name} | https://github.com/${pin.repo} | ${pin.commit} | ${pin.files["SKILL.md"].path} | LICENSES/${name}.LICENSE |`);
  }
  if (shipped.includes("unslop")) lines.push("", "The unslop skill in pstack-claude is a port of Lauren Tan's pstack for Cursor.");
  lines.push("");
  return lines.join("\n");
}

export function expectedFiles() {
  const config = loadConfig();
  const pins = loadPins();
  const files = new Map();
  files.set(".claude-plugin/marketplace.json", json(claudeMarketplace(config)));
  files.set(".agents/plugins/marketplace.json", json(codexMarketplace(config)));

  for (const plugin of config.plugins) {
    const root = `plugins/${plugin.name}`;
    let hasHooks = false;

    if (plugin.kind === "vendored") {
      const text = read("upstream", plugin.upstream, "SKILL.md");
      const skillDir = `${root}/skills/${plugin.skill}`;
      files.set(`${skillDir}/SKILL.md`, text);
      files.set(`${skillDir}/agents/openai.yaml`, openaiYaml({
        displayName: plugin.codexInterface.displayName,
        shortDescription: plugin.codexInterface.shortDescription,
        allowImplicit: !userOnly(text),
      }));
    } else if (plugin.kind === "authored") {
      const srcSkills = path.join(repo, "src", plugin.name, "skills");
      const onDisk = fs.existsSync(srcSkills) ? fs.readdirSync(srcSkills).filter((d) => !IGNORED_NAMES.has(d)) : [];
      const listed = Object.keys(plugin.skills ?? {});
      const unlisted = onDisk.filter((d) => !listed.includes(d));
      const missing = listed.filter((d) => !onDisk.includes(d));
      if (unlisted.length || missing.length) {
        throw new Error(`${plugin.name}: skills in tools/plugins.json and src/${plugin.name}/skills/ differ (unlisted: ${unlisted.join(", ") || "none"}; missing: ${missing.join(", ") || "none"})`);
      }
      for (const [skill, spec] of Object.entries(plugin.skills ?? {})) {
        const srcDir = path.join(srcSkills, skill);
        let embedded = [];
        for (const abs of walk(srcDir)) {
          const rel = path.relative(srcDir, abs).split(path.sep).join("/");
          const out = `${root}/skills/${skill}/`;
          if (rel === "SKILL.md.tmpl") {
            const tmpl = fs.readFileSync(abs, "utf8");
            embedded = templateUpstreams(tmpl);
            files.set(out + "SKILL.md", renderTemplate(plugin.name, tmpl, pins));
          } else {
            files.set(out + rel, fs.readFileSync(abs, "utf8"));
          }
        }
        const listed = spec.upstreams ?? [];
        if (embedded.join() !== listed.join()) {
          throw new Error(`${plugin.name}:${skill}: the template embeds [${embedded.join(", ")}] but tools/plugins.json lists upstreams [${listed.join(", ")}]`);
        }
      }
      const srcHooks = path.join(repo, "src", plugin.name, "hooks");
      for (const abs of walk(srcHooks)) {
        hasHooks = true;
        files.set(`${root}/hooks/${path.relative(srcHooks, abs).split(path.sep).join("/")}`, fs.readFileSync(abs, "utf8"));
      }
      if (plugin.alwaysOn) {
        const { chunks, manifest } = composeChunks(plugin, pins);
        if (chunks.length !== TOTAL_CHUNKS) throw new Error(`${plugin.name}: alwaysOn lists ${chunks.length} chunks; the launcher expects ${TOTAL_CHUNKS}`);
        chunks.forEach((c, i) => files.set(`${root}/hooks/chunks/${i + 1}.md`, c));
        files.set(`${root}/hooks/chunks/manifest.json`, json(manifest));
      }
    } else {
      throw new Error(`${plugin.name}: unknown kind ${plugin.kind}`);
    }

    files.set(`${root}/.claude-plugin/plugin.json`, json(claudePluginJson(plugin, config)));
    files.set(`${root}/.codex-plugin/plugin.json`, json(codexPluginJson(plugin, config, hasHooks)));
    files.set(`${root}/README.md`, pluginReadme(plugin, config));
    const notice = noticeText(plugin, pins);
    if (notice) files.set(`${root}/NOTICE.md`, notice);
    for (const up of upstreamsShipped(plugin)) files.set(`${root}/LICENSES/${up}.LICENSE`, read("upstream", up, "LICENSE"));
  }
  return files;
}

// Files under a generated folder that the build would not write. `root` lets
// tests run against a copy instead of the working tree.
export function strayFiles(expected = expectedFiles(), root = repo) {
  const strays = [];
  for (const top of GENERATED_ROOTS) {
    for (const abs of walk(path.join(root, top))) {
      const rel = path.relative(root, abs).split(path.sep).join("/");
      if (!expected.has(rel)) strays.push(rel);
    }
  }
  return strays.sort();
}

export function staleFiles(expected = expectedFiles()) {
  const stale = [];
  for (const [file, text] of expected) {
    let current = null;
    try { current = read(file); } catch { /* missing */ }
    if (current !== text) stale.push(file);
  }
  return stale;
}

export function writeAll(expected = expectedFiles()) {
  for (const [file, text] of expected) {
    const abs = path.join(repo, file);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    if (!fs.existsSync(abs) || fs.readFileSync(abs, "utf8") !== text) fs.writeFileSync(abs, text);
  }
}

function removeEmptyDirs(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) removeEmptyDirs(path.join(dir, entry.name));
  }
  if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
}

export function prune(expected = expectedFiles(), root = repo) {
  const strays = strayFiles(expected, root);
  for (const rel of strays) fs.rmSync(path.join(root, rel));
  for (const top of GENERATED_ROOTS) removeEmptyDirs(path.join(root, top));
  return strays;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const expected = expectedFiles();
    if (process.argv.includes("--check")) {
      const stale = staleFiles(expected);
      const strays = strayFiles(expected);
      if (stale.length) console.error("stale or missing generated files:\n  " + stale.join("\n  "));
      if (strays.length) console.error("stray files under generated folders (run node tools/build.mjs --prune):\n  " + strays.join("\n  "));
      if (stale.length || strays.length) process.exit(1);
      console.log("generated files are current");
    } else {
      writeAll(expected);
      console.log(`wrote ${expected.size} generated files`);
      if (process.argv.includes("--prune")) {
        for (const rel of prune(expected)) console.log(`deleted stray ${rel}`);
      } else {
        const strays = strayFiles(expected);
        if (strays.length) console.warn("stray files under generated folders (delete with --prune):\n  " + strays.join("\n  "));
      }
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
