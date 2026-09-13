import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const read = (...p) => fs.readFileSync(path.join(repo, ...p), "utf8");

// Copy the runtime parts of the plugin into a temp root so tests can break them.
export function tempPlugin() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "adhd-unslop-plugin-"));
  for (const rel of ["hooks", "skills"]) fs.cpSync(path.join(repo, rel), path.join(root, rel), { recursive: true });
  return root;
}

export function tempConfigDirs() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "adhd-unslop-cfg-"));
  const claude = path.join(base, "claude");
  const codex = path.join(base, "codex");
  fs.mkdirSync(claude);
  fs.mkdirSync(codex);
  return { base, claude, codex };
}

// Strip fenced blocks, inline code spans, and HTML comments so lint only sees authored prose.
export function proseOnly(md) {
  return md
    .replace(/```[\s\S]*?```/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/`[^`\n]*`/g, "");
}
