#!/usr/bin/env node
// render-3d: prompt -> Three.js scene code + headless preview + integration snippet.
// Exits non-zero if generation or the preview gate fails.
import { renderScene, PLACEMENTS, BUDGETS } from "../lib/render.mjs";
import { parseArgs } from "../lib/args.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.prompt) {
    console.error(`usage: render-3d --prompt "..." [--placement ${PLACEMENTS.join("|")}] [--style "..."] [--budget ${BUDGETS.join("|")}] [--out ./out] [--backend openai|stub] [--width 1280] [--height 800] [--no-preview]`);
    process.exit(2);
  }
  try {
    const summary = await renderScene({
      prompt: args.prompt,
      placement: args.placement || "hero",
      style: args.style || "",
      budget: args.budget || "medium",
      outDir: args.out || "./render-3d-out",
      width: parseInt(args.width || "1280", 10),
      height: parseInt(args.height || "800", 10),
      doPreview: !args["no-preview"],
      backend: args.backend || undefined,
    });
    const { code, ...rest } = summary; // keep stdout lean; code is on disk
    console.log(JSON.stringify(rest, null, 2));
  } catch (e) {
    console.error(`render-3d failed: ${e.message}`);
    if (e.scenePath) console.error(`code left at ${e.scenePath} for inspection`);
    process.exit(1);
  }
}

main();
