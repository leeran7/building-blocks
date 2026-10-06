#!/usr/bin/env node
// Stand-in for the Codex CLI in tests. FAKE_CODEX_MODE picks the behavior;
// it records argv and stdin to FAKE_CODEX_LOG so tests can assert on them.
import { readFileSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const stdin = readFileSync(0, "utf8");
if (process.env.FAKE_CODEX_LOG) {
  writeFileSync(process.env.FAKE_CODEX_LOG, JSON.stringify({ args, stdin, cwd: process.cwd() }));
}
const out = args[args.indexOf("-o") + 1];
const mode = process.env.FAKE_CODEX_MODE || "ok";
if (mode === "unauth") {
  process.stderr.write("Error: Not logged in. Run codex login.\n");
  process.exit(1);
}
if (mode === "bad") {
  writeFileSync(out, "console.log('no scene here')");
  process.exit(0);
}
writeFileSync(out, "```js\n" + process.env.FAKE_CODEX_CODE + "\n```\n");
