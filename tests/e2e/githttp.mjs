// Smart-HTTP git server for tests/e2e/run.sh. Serves the bare repos under
// <root> on 127.0.0.1 by running `git http-backend` as CGI, so both CLIs can
// add a git marketplace with real clone and cache paths and no GitHub push.
// design/research/08-tests-claude.md has the method.
//
//   node tests/e2e/githttp.mjs <root> [port]
//
// Port 0, the default, picks a free port. The first stdout line is
// "listening <port>".

import http from "node:http";
import { spawn } from "node:child_process";

const root = process.argv[2];
const port = Number(process.argv[3] || 0);
if (!root) {
  console.error("usage: githttp.mjs <root> [port]");
  process.exit(2);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const env = {
    PATH: process.env.PATH,
    GIT_PROJECT_ROOT: root,
    GIT_HTTP_EXPORT_ALL: "1",
    PATH_INFO: url.pathname,
    QUERY_STRING: url.search.slice(1),
    REQUEST_METHOD: req.method,
    CONTENT_TYPE: req.headers["content-type"] || "",
    REMOTE_ADDR: "127.0.0.1",
  };
  if (req.headers["git-protocol"]) env.GIT_PROTOCOL = req.headers["git-protocol"];
  if (req.headers["content-encoding"]) env.HTTP_CONTENT_ENCODING = req.headers["content-encoding"];
  const git = spawn("git", ["http-backend"], { env });
  req.pipe(git.stdin);
  let head = Buffer.alloc(0);
  let headersDone = false;
  git.stdout.on("data", (chunk) => {
    if (headersDone) {
      res.write(chunk);
      return;
    }
    head = Buffer.concat([head, chunk]);
    let end = head.indexOf("\r\n\r\n");
    let sep = 4;
    if (end < 0) {
      end = head.indexOf("\n\n");
      sep = 2;
    }
    if (end < 0) return;
    let status = 200;
    for (const line of head.subarray(0, end).toString().replace(/\r/g, "").split("\n")) {
      const colon = line.indexOf(":");
      if (colon < 0) continue;
      const key = line.slice(0, colon).trim();
      const value = line.slice(colon + 1).trim();
      if (key.toLowerCase() === "status") status = Number.parseInt(value, 10);
      else res.setHeader(key, value);
    }
    res.writeHead(status);
    headersDone = true;
    res.write(head.subarray(end + sep));
  });
  git.stdout.on("end", () => res.end());
  git.stderr.on("data", (d) => process.stderr.write(d));
  git.on("error", () => {
    if (!headersDone) res.writeHead(500);
    res.end();
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`listening ${server.address().port}`);
});
