// Parsers for tests/e2e/run.sh. Each subcommand reads one log or transcript
// and prints what it found. Assertion subcommands exit 1 on failure.
//
//   bundle <claude|codex> <file> <bundle-id> <exact|atleast|none> [after-compact]
//     Counts each chunk's END line in the context records only: SessionStart
//     attachments in a Claude Code transcript (attachment.content), developer
//     messages in a Codex rollout. A Claude record also repeats the text in
//     stdout and rendered, so a plain grep would count every copy three times.
//     exact: each chunk once with <bundle-id>, and no END line from another
//     bundle. atleast: each chunk at least once with <bundle-id>. none: no END
//     line at all. after-compact counts only the context after the last
//     compaction: Claude Code records after the last compact_boundary, and
//     for Codex the replacement_history of the last compacted record plus
//     the developer messages after it. It fails when nothing was compacted.
//   skill-arrived <claude|codex> <file> <SKILL.md> <final-line> [whole]
//     One context record holds the skill text: the Claude Code skill message
//     or tool result in a transcript, the injected skill message in a Codex
//     rollout. It must carry both "<!-- BEGIN upstream" lines and <final-line>.
//     With "whole", it must also hold the SKILL.md body, everything after the
//     frontmatter, byte for byte.
//   compacted <transcript> <skill-name> <final-line>
//     After the last compact boundary of a Claude Code transcript, reports the
//     invoked_skills attachment for <skill-name>: its size, whether it was cut,
//     and whether it still holds <final-line>. Exits 0 only when it does.
//   no-skill <stream.jsonl>
//     No Skill tool call and no Read of a SKILL.md or references/ file.
//   session <stream.jsonl>
//     Prints the Claude Code session id.
//   plugins <claude|codex> <list.json>
//     Prints "id version" for each installed plugin, from `plugin list --json`.
//     Claude Code lines add the install path.
//   hooks-trusted <hooks.jsonl> <plugin-id> <version> <key>...
//     Every hook of <plugin-id> in `codex-hooks.mjs list` output is trusted,
//     comes from the <version> cache folder, and the keys are exactly <key>...

import fs from "node:fs";

const END = /END adhd-unslop chunk (\d) of 3 \(([0-9a-f]+)\)/g;

function jsonLines(file) {
  const out = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.startsWith("{")) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // Skip non-JSON lines such as CLI warnings.
    }
  }
  return out;
}

function texts(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(texts);
  if (value && typeof value === "object") {
    if (typeof value.text === "string") return [value.text];
    if ("content" in value) return texts(value.content);
  }
  return [];
}

function contextTexts(kind, file, scope) {
  let records = jsonLines(file);
  const afterCompact = scope === "after-compact";
  if (kind === "claude") {
    if (afterCompact) {
      const last = records.findLastIndex((r) => r.type === "system" && r.subtype === "compact_boundary");
      if (last < 0) throw new Error("no compact_boundary in the transcript");
      records = records.slice(last + 1);
    }
    return records
      .filter((r) => r.type === "attachment" && r.attachment?.hookEvent === "SessionStart")
      .map((r) => texts(r.attachment.content).join("\n"));
  }
  if (kind === "codex") {
    const developer = (item) => item?.type === "message" && item?.role === "developer";
    let kept = [];
    if (afterCompact) {
      const last = records.findLastIndex((r) => r.type === "compacted");
      if (last < 0) throw new Error("no compacted record in the rollout");
      kept = (records[last].payload?.replacement_history ?? []).filter(developer).map((i) => texts(i.content).join("\n"));
      records = records.slice(last + 1);
    }
    return kept.concat(
      records.filter((r) => r.type === "response_item" && developer(r.payload)).map((r) => texts(r.payload.content).join("\n")),
    );
  }
  throw new Error(`unknown runtime ${kind}`);
}

function bundle(kind, file, id, mode, scope) {
  const counts = { 1: 0, 2: 0, 3: 0 };
  const others = [];
  for (const text of contextTexts(kind, file, scope)) {
    for (const m of text.matchAll(END)) {
      if (m[2] === id && counts[m[1]] !== undefined) counts[m[1]]++;
      else others.push(`chunk ${m[1]} (${m[2]})`);
    }
  }
  const summary = `chunk 1: ${counts[1]}, chunk 2: ${counts[2]}, chunk 3: ${counts[3]} with ${id}; other END lines: ${others.length ? others.join(", ") : "none"}`;
  const all = [1, 2, 3].map((i) => counts[i]);
  let ok;
  if (mode === "exact") ok = all.every((n) => n === 1) && others.length === 0;
  else if (mode === "atleast") ok = all.every((n) => n >= 1);
  else if (mode === "none") ok = all.every((n) => n === 0) && others.length === 0;
  else throw new Error(`unknown mode ${mode}`);
  console.log(summary);
  return ok;
}

function toolUses(records) {
  const uses = [];
  for (const r of records) {
    if (r.type !== "assistant") continue;
    for (const c of r.message?.content ?? []) if (c.type === "tool_use") uses.push(c);
  }
  return uses;
}

const BEGIN_MARKERS = ["<!-- BEGIN upstream i-have-adhd", "<!-- BEGIN upstream unslop"];

function skillRecords(kind, file) {
  const records = jsonLines(file);
  if (kind === "claude") {
    const out = [];
    for (const r of records) {
      if (r.type === "user" && r.message) out.push({ where: r.isMeta ? "skill message" : "user message", text: texts(r.message.content).join("\n") });
      if (r.type === "attachment" && r.attachment && r.attachment.type !== "prompt_snapshot")
        out.push({ where: `${r.attachment.type} attachment`, text: texts(r.attachment.content ?? r.attachment.skills).join("\n") });
    }
    return out;
  }
  if (kind === "codex") {
    return records
      .filter((r) => r.type === "response_item" && r.payload?.type === "message")
      .map((r) => ({ where: `${r.payload.role} message`, text: texts(r.payload.content).join("\n") }));
  }
  throw new Error(`unknown runtime ${kind}`);
}

function skillArrived(kind, file, skillPath, finalLine, whole) {
  const markers = [...BEGIN_MARKERS, finalLine];
  const records = skillRecords(kind, file);
  const hit = records.find((r) => markers.every((m) => r.text.includes(m)));
  if (!hit) {
    const best = records
      .map((r) => ({ r, n: markers.filter((m) => r.text.includes(m)).length }))
      .sort((a, b) => b.n - a.n)[0];
    const found = best ? markers.filter((m) => best.r.text.includes(m)) : [];
    console.log(`no record holds all three markers; best: ${best ? `${best.r.where}, ${best.r.text.length} chars, with ${found.join(" | ") || "none"}` : "no records"}`);
    return false;
  }
  if (whole !== "whole") {
    console.log(`${hit.where}, ${hit.text.length} chars`);
    return true;
  }
  const body = fs.readFileSync(skillPath, "utf8").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
  if (hit.text.includes(body)) {
    console.log(`${hit.where} holds all ${body.length} characters of the SKILL.md body`);
    return true;
  }
  let n = 0;
  while (n < body.length && hit.text.includes(body.slice(0, n + 1))) n = Math.min(body.length, n + 256);
  console.log(`${hit.where} (${hit.text.length} chars) lacks part of the ${body.length}-character SKILL.md body; the first ${Math.max(0, n - 256)} characters match`);
  return false;
}

function compacted(file, skillName, finalLine) {
  const records = jsonLines(file);
  let boundary = -1;
  records.forEach((r, i) => {
    if (r.type === "system" && r.subtype === "compact_boundary") boundary = i;
  });
  if (boundary < 0) {
    console.log("no compact boundary in the transcript");
    return false;
  }
  const meta = records[boundary].compactMetadata ?? {};
  const after = records.slice(boundary + 1);
  const skills = after
    .filter((r) => r.type === "attachment" && r.attachment?.type === "invoked_skills")
    .flatMap((r) => r.attachment.skills ?? [])
    .filter((s) => s.name === skillName);
  const tokens = `${meta.preTokens ?? "?"} to ${meta.postTokens ?? "?"} tokens`;
  if (!skills.length) {
    console.log(`${meta.trigger ?? "?"} compaction, ${tokens}; no ${skillName} in an invoked_skills attachment after it`);
    return false;
  }
  const text = texts(skills[skills.length - 1].content).join("\n");
  const cut = text.includes("truncated for compaction");
  const has = text.includes(finalLine);
  const kept = BEGIN_MARKERS.filter((m) => text.includes(m)).map((m) => m.replace("<!-- BEGIN upstream ", ""));
  console.log(
    `${meta.trigger ?? "?"} compaction, ${tokens}; ${skillName} re-attached with ${text.length} chars${cut ? ", cut for compaction" : ""}; begins kept: ${kept.join(", ") || "none"}; final check line ${has ? "present" : "missing"}`,
  );
  return has;
}

function noSkill(file) {
  const bad = toolUses(jsonLines(file)).filter(
    (u) => u.name === "Skill" || (u.name === "Read" && /(SKILL\.md|\/references\/)/.test(String(u.input?.file_path ?? ""))),
  );
  for (const u of bad) console.log(`${u.name} ${JSON.stringify(u.input)}`);
  if (!bad.length) console.log("no Skill call and no skill file read");
  return bad.length === 0;
}

function session(file) {
  const init = jsonLines(file).find((r) => r.type === "system" && r.subtype === "init");
  if (!init?.session_id) return false;
  console.log(init.session_id);
  return true;
}

function plugins(kind, file) {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const list = kind === "claude" ? data : data.installed ?? [];
  for (const p of list) {
    if (kind === "claude") console.log(`${p.id} ${p.version} ${p.installPath ?? ""}`.trim());
    else console.log(`${p.pluginId} ${p.version}`);
  }
  return true;
}

function hooksTrusted(file, pluginId, version, keys) {
  const hooks = jsonLines(file).filter((h) => h.pluginId === pluginId);
  let ok = true;
  for (const h of hooks) {
    const inVersion = String(h.sourcePath ?? "").includes(`/${version}/hooks/`);
    console.log(`${h.key} ${h.trustStatus}${inVersion ? "" : ` from ${h.sourcePath}`}`);
    if (h.trustStatus !== "trusted" || !inVersion) ok = false;
  }
  const got = hooks.map((h) => h.key).sort().join(" ");
  if (got !== [...keys].sort().join(" ")) {
    console.log(`expected keys ${keys.join(" ")}`);
    ok = false;
  }
  return ok;
}

const [cmd, ...args] = process.argv.slice(2);
const commands = {
  bundle: () => bundle(args[0], args[1], args[2], args[3], args[4]),
  "skill-arrived": () => skillArrived(args[0], args[1], args[2], args[3], args[4]),
  compacted: () => compacted(args[0], args[1], args[2]),
  "no-skill": () => noSkill(args[0]),
  session: () => session(args[0]),
  plugins: () => plugins(args[0], args[1]),
  "hooks-trusted": () => hooksTrusted(args[0], args[1], args[2], args.slice(3)),
};
if (!commands[cmd]) {
  console.error(`usage: inspect.mjs ${Object.keys(commands).join("|")} ...`);
  process.exit(2);
}
let ok = false;
try {
  ok = commands[cmd]();
} catch (err) {
  console.log(`inspect.mjs ${cmd}: ${err.message}`);
}
process.exit(ok ? 0 : 1);
