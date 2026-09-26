// Runs several turns in one Claude Code print-mode process for
// tests/e2e/run.sh, so state held in memory, such as which skills were
// invoked, survives from turn to turn. Each prompt is sent as a stream-json
// user message after the previous turn's result event. Slash commands such as
// /compact work as prompts.
//
//   node tests/e2e/claude-turns.mjs <claude-bin> <log> <prompt>...
//
// Runs in the current directory with the caller's environment. Writes every
// stdout and stderr line to <log>. Exits 1 when the process ends before the
// last result or a turn takes longer than 5 minutes.

import { spawn } from "node:child_process";
import fs from "node:fs";

const [claude, log, ...prompts] = process.argv.slice(2);
if (!claude || !log || !prompts.length) {
  console.error("usage: claude-turns.mjs <claude-bin> <log> <prompt>...");
  process.exit(2);
}

const out = fs.createWriteStream(log);
const child = spawn(
  claude,
  ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--include-hook-events"],
  { stdio: ["pipe", "pipe", "pipe"] },
);
child.stderr.on("data", (d) => out.write(d));

let next = 0;
let timer;
function send() {
  clearTimeout(timer);
  if (next >= prompts.length) {
    child.stdin.end();
    return;
  }
  const content = prompts[next++];
  child.stdin.write(JSON.stringify({ type: "user", message: { role: "user", content } }) + "\n");
  timer = setTimeout(() => {
    out.write(`claude-turns.mjs: turn ${next} timed out\n`);
    child.kill("SIGTERM");
  }, 300000);
}

let buffer = "";
let results = 0;
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  out.write(chunk);
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, nl);
    buffer = buffer.slice(nl + 1);
    if (!line.startsWith("{")) continue;
    try {
      if (JSON.parse(line).type === "result") {
        results++;
        send();
      }
    } catch {
      // Not JSON; already logged.
    }
  }
});

child.on("exit", (code) => {
  clearTimeout(timer);
  out.end(() => process.exit(results >= prompts.length ? 0 : code || 1));
});

send();
