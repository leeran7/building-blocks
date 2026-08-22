#!/usr/bin/env node
import { runLoop } from "./loop.js";

const goal = process.argv.slice(2).join(" ").trim();

if (!goal) {
  console.error("Usage: yarn loop \"Build a todo app with auth\"");
  process.exit(1);
}

runLoop({ goal })
  .then((state) => {
    console.log("\n[loop] finished");
    console.log(JSON.stringify(state, null, 2));
    process.exit(state.status === "complete" ? 0 : 1);
  })
  .catch((err) => {
    console.error("[loop] fatal:", err);
    process.exit(1);
  });
