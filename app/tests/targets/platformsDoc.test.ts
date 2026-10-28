/**
 * context/platforms.md is the list of every platform Doomstack ships on. Its
 * feature table must match each target's real config.ts, and every target must
 * have a row, so the doc cannot drift from the builds.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TARGET_IDS, type TargetConfig, type TargetFeatures, type TargetId } from "../../mobile/src/targets/types";

const DOC = readFileSync(new URL("../../../context/platforms.md", import.meta.url), "utf8");

const CONFIGS: Record<TargetId, () => Promise<{ targetConfig: TargetConfig }>> = {
  app: () => import("../../mobile/src/targets/app/config"),
  web: () => import("../../mobile/src/targets/web/config"),
  crazygames: () => import("../../mobile/src/targets/crazygames/config"),
};

/** Rows of the markdown table under `heading`, keyed by the first cell (backticks stripped). */
function tableUnder(heading: string): { columns: string[]; rows: Map<string, string[]> } {
  const section = DOC.split(/^## /m).find((s) => s.startsWith(`${heading}\n`));
  if (!section) throw new Error(`no "## ${heading}" section`);
  const lines = section.split("\n").filter((l) => l.startsWith("|"));
  const cells = (l: string) => l.split("|").slice(1, -1).map((c) => c.trim().replace(/`/g, ""));
  const [header, , ...body] = lines;
  return { columns: cells(header), rows: new Map(body.map((l) => [cells(l)[0], cells(l)])) };
}

describe("context/platforms.md", () => {
  it.each([["Targets"], ["Features"]])("has exactly one %s row per build target", (heading) => {
    const { rows } = tableUnder(heading);
    expect([...rows.keys()].sort()).toEqual([...TARGET_IDS].sort());
  });

  it.each(TARGET_IDS.map((id) => [id]))("lists %s's features as its config.ts sets them", async (id) => {
    const { targetConfig } = await CONFIGS[id]();
    const { columns, rows } = tableUnder("Features");
    const row = rows.get(id)!;
    const names = Object.keys(targetConfig.features) as (keyof TargetFeatures)[];
    expect(columns.slice(1).sort()).toEqual([...names].sort());
    for (const name of names) {
      expect(`${name}: ${row[columns.indexOf(name)]}`).toBe(`${name}: ${targetConfig.features[name] ? "on" : "off"}`);
    }
  });
});
