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
// Codex default is about 2,500 tokens; hooks.json raises it per handler.
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

export function optedIn(env = process.env, home = os.homedir()) {
  return flagPaths(env, home).some((p) => {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  });
}

export function bundleId(compositeSha) {
  return compositeSha.slice(0, BUNDLE_ID_LENGTH);
}

export function chunkHeader(index, id) {
  return [
    `ADHD-UNSLOP INSTRUCTIONS. Chunk ${index} of ${TOTAL_CHUNKS} from bundle ${id}.`,
    `Apply this bundle only once all ${TOTAL_CHUNKS} chunks with this bundle id have arrived. If one is missing, keep the previously selected complete bundle and the current mode states, say once which chunk is missing, and do not activate from the partial set.`,
    "A repeated chunk with the same bundle id and index is a repeat, not a new activation. Never combine chunks from different bundle ids. A newly completed bundle replaces its rules without resetting mode states. Chunks from an older bundle do not select that bundle again.",
    "Receiving instructions does not change mode state. Restore the latest known state of the ADHD mode and the unslop mode in this session. Once a complete bundle is available, default each unknown mode to active.",
    "Precedence. On a direct reply ADHD wins a conflict. Elsewhere unslop wins.",
    "",
  ].join("\n");
}

export function chunkFooter(index, id, flags) {
  return [
    "",
    `END adhd-unslop chunk ${index} of ${TOTAL_CHUNKS} (${id}). To stop always-on injection remove every opt-in flag: ${flags.join(", ")}. "normal mode" turns both modes off for this session.`,
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
