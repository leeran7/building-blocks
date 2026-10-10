#!/usr/bin/env node
// preview-scene: render existing scene-module code headlessly.
// Exits 0 with the screenshot path on success, non-zero on any JS error.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateContract } from "../lib/scaffold.mjs";
import { preview } from "../lib/chrome.mjs";
import { parseArgs } from "../lib/args.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.code) {
    console.error("usage: preview-scene --code ./scene.js [--out ./preview.png] [--width 1280] [--height 800]");
    process.exit(2);
  }
  const codePath = resolve(args.code);
  const code = await readFile(codePath, "utf8");

  const contract = validateContract(code);
  if (!contract.ok) {
    console.error(`contract failed: ${contract.errors.join("; ")}`);
    process.exit(1);
  }

  const result = await preview(code, {
    width: parseInt(args.width || "1280", 10),
    height: parseInt(args.height || "800", 10),
    outPath: args.out ? resolve(args.out) : undefined,
  });
  if (!result.ok) {
    console.error(`preview FAILED: ${result.error}`);
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, preview: result.previewPath }));
}

main().catch((e) => { console.error(`preview-scene failed: ${e.message}`); process.exit(1); });
