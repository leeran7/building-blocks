#!/usr/bin/env node
/**
 * CLI for the learnings memory graph.
 *
 *   yarn memory stats
 *   yarn memory agent implementer
 *   yarn memory topic Security
 *   yarn memory file antiCheat.ts
 *   yarn memory path <fromInsightSubstring> <toInsightSubstring>
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  communityByTopic,
  formatGraphExcerpt,
  graphStats,
  learningsCitingFile,
  learningsForAgent,
  loadMemoryGraph,
  shortestPath,
} from "./memory-graph.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LOOP_DIR = join(ROOT, "loop");

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const graph = await loadMemoryGraph(LOOP_DIR);

  switch (command) {
    case "stats": {
      console.log(graphStats(graph));
      return;
    }
    case "agent": {
      const agent = args[0];
      if (!agent) throw new Error("usage: memory agent <name>");
      console.log(formatGraphExcerpt(graph, { agent }));
      return;
    }
    case "topic": {
      const topic = args.join(" ");
      if (!topic) throw new Error("usage: memory topic <name>");
      const nodes = communityByTopic(graph, topic);
      console.log(`topic=${topic} count=${nodes.length}`);
      for (const node of nodes) console.log(`- ${node.label}`);
      return;
    }
    case "file": {
      const file = args[0];
      if (!file) throw new Error("usage: memory file <path-fragment>");
      const nodes = learningsCitingFile(graph, file);
      console.log(`file~=${file} count=${nodes.length}`);
      for (const node of nodes) console.log(`- ${node.label}`);
      return;
    }
    case "path": {
      const [fromNeedle, toNeedle] = args;
      if (!fromNeedle || !toNeedle) {
        throw new Error("usage: memory path <from-substring> <to-substring>");
      }
      const from = findLearning(graph, fromNeedle);
      const to = findLearning(graph, toNeedle);
      if (!from || !to) {
        throw new Error("could not find one or both learnings by substring");
      }
      const path = shortestPath(graph, from.id, to.id);
      if (!path) {
        console.log("no path");
        return;
      }
      for (const id of path.nodes) {
        const node = graph.nodes.get(id)!;
        console.log(`${node.kind}: ${node.label}`);
      }
      return;
    }
    default:
      console.log(`usage:
  yarn memory stats
  yarn memory agent <name>
  yarn memory topic <name>
  yarn memory file <path-fragment>
  yarn memory path <from-substring> <to-substring>`);
      process.exit(command ? 1 : 0);
  }
}

function findLearning(
  graph: Awaited<ReturnType<typeof loadMemoryGraph>>,
  needle: string,
) {
  const lower = needle.toLowerCase();
  return [...graph.nodes.values()].find(
    (node) =>
      node.kind === "learning" && node.label.toLowerCase().includes(lower),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
