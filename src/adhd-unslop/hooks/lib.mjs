// Shared helpers for the build, the always-on launcher, and the tests.
// No dependencies. Runs on Node 18 or later.

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const TOTAL_CHUNKS = 3;
export const FLAG_NAME = ".adhd-unslop-always";
// Claude Code caps each hook context value at 10,000 characters.
export const MAX_CHARS = 10000;
// Codex allows about 2,500 tokens per handler by default; hooks.json sets 5000.
export const DEFAULT_TOKEN_LIMIT = 5000;
export const BUNDLE_ID_LENGTH = 12;

export function sha256(text) {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

// One estimate for everything: ceil(UTF-16 code units / 4).
export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

export function stripFrontmatter(text) {
  return text.replace(/^---[^\S\r\n]*\r?\n[\s\S]*?\r?\n---[^\S\r\n]*(?:\r?\n|$)/, "");
}

export function flagPaths(env = process.env, home = os.homedir()) {
  const claudeDir = env.CLAUDE_CONFIG_DIR || path.join(home, ".claude");
  const codexDir = env.CODEX_HOME || path.join(home, ".codex");
  return [path.join(claudeDir, FLAG_NAME), path.join(codexDir, FLAG_NAME)];
}

// ADHD_UNSLOP_ALWAYS overrides the flag files for one process.
// Unset or empty: the flag files decide. 0, false, off: off. 1, true, on: on.
// Any other value counts as unset, and the doctor reports it.
export function alwaysOnSetting(env = process.env) {
  const raw = env.ADHD_UNSLOP_ALWAYS;
  if (raw === undefined || raw === "") return { mode: "unset", raw };
  const value = raw.trim().toLowerCase();
  if (["0", "false", "off"].includes(value)) return { mode: "off", raw };
  if (["1", "true", "on"].includes(value)) return { mode: "on", raw };
  return { mode: "invalid", raw };
}

export function flagExists(env = process.env, home = os.homedir()) {
  return flagPaths(env, home).some((p) => {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  });
}

export function optedIn(env = process.env, home = os.homedir()) {
  const { mode } = alwaysOnSetting(env);
  if (mode === "off") return false;
  if (mode === "on") return true;
  return flagExists(env, home);
}

// Codex sets PLUGIN_ROOT for plugin hooks and Claude Code never does
// (design/research/10-tests-hook-env.md). Returns "codex", "claude", or null.
export function runtimeOf(env = process.env) {
  if (env.PLUGIN_ROOT) return "codex";
  if (env.CLAUDE_PLUGIN_ROOT) return "claude";
  return null;
}

// Claude Code keeps the earlier injection in a resumed session, so a resume
// would add a second copy. Codex can resume with no copy after a compaction,
// so it keeps injecting on resume (design/STRUCTURE-v2.md P3). An unknown
// runtime or source injects.
export function shouldInject(source, runtime) {
  return !(source === "resume" && runtime === "claude");
}

// Read the SessionStart payload from stdin. Resolves to the parsed object, or
// null when stdin is a TTY, empty, invalid, or silent for timeoutMs.
export function readHookInput(stream = process.stdin, timeoutMs = 1000) {
  return new Promise((resolve) => {
    if (!stream || stream.isTTY) {
      resolve(null);
      return;
    }
    let data = "";
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        resolve(data.trim() ? JSON.parse(data) : null);
      } catch {
        resolve(null);
      }
    };
    const timer = setTimeout(finish, timeoutMs);
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      data += chunk;
    });
    stream.on("end", finish);
    stream.on("error", finish);
  });
}

export function bundleId(compositeSha) {
  return compositeSha.slice(0, BUNDLE_ID_LENGTH);
}

export function chunkHeader(index, id) {
  return [
    `ADHD-UNSLOP INSTRUCTIONS. Chunk ${index} of ${TOTAL_CHUNKS} from bundle ${id}.`,
    `These instructions come from the adhd-unslop always-on hook, which the user turned on. A bundle is complete when all ${TOTAL_CHUNKS} chunks with the same bundle id are present, each ending with its END line. Until a bundle is complete, the previously selected complete bundle and the current mode states stay in effect, the missing chunk is named once, and nothing activates from the partial set.`,
    "A repeated chunk with the same bundle id and index is a repeat, not a new activation. Chunks from different bundle ids are never combined. A newly completed bundle replaces its rules without resetting mode states. Chunks from an older bundle do not select that bundle again.",
    "Receiving instructions does not change mode state. The latest known state of the ADHD mode and the unslop mode in this session stays in effect. Once a complete bundle is available, each unknown mode defaults to active.",
    "Precedence. On a direct reply ADHD wins a conflict. Elsewhere unslop wins.",
    "",
  ].join("\n");
}

export function chunkFooter(index, id, flags) {
  return [
    "",
    `END adhd-unslop chunk ${index} of ${TOTAL_CHUNKS} (${id}). Always-on stops when every opt-in flag is removed (${flags.join(", ")}) or when ADHD_UNSLOP_ALWAYS=0 is set. "normal mode" turns both modes off for this session.`,
    "",
  ].join("\n");
}

// Assemble and validate one chunk. Returns { ok: true, text } or { ok: false, reason }.
// `root` is the plugin root that contains hooks/chunks/.
export function renderChunk(root, index, { flags, tokenLimit = DEFAULT_TOKEN_LIMIT } = {}) {
  if (!Number.isInteger(index) || index < 1 || index > TOTAL_CHUNKS) {
    return { ok: false, reason: `invalid chunk index ${String(index)}` };
  }
  const dir = path.join(root, "hooks", "chunks");
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  } catch {
    return { ok: false, reason: "manifest missing or unreadable" };
  }
  const entry = manifest?.chunks?.[index - 1];
  if (!entry || typeof manifest.compositeSha256 !== "string") {
    return { ok: false, reason: "manifest malformed" };
  }
  let payload;
  try {
    payload = fs.readFileSync(path.join(dir, `${index}.md`), "utf8");
  } catch {
    return { ok: false, reason: `chunk file ${index}.md missing` };
  }
  if (sha256(payload) !== entry.sha256) {
    return { ok: false, reason: `chunk ${index} hash mismatch` };
  }
  const id = bundleId(manifest.compositeSha256);
  const text = chunkHeader(index, id) + payload + chunkFooter(index, id, flags);
  if (text.length > MAX_CHARS) {
    return { ok: false, reason: `chunk ${index} is ${text.length} characters, over ${MAX_CHARS}` };
  }
  const tokens = estimateTokens(text);
  if (tokens > tokenLimit) {
    return { ok: false, reason: `chunk ${index} is about ${tokens} tokens, over ${tokenLimit}` };
  }
  return { ok: true, text, tokens };
}
