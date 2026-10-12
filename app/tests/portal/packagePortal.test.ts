/**
 * Portal zip checks (scripts/packagePortal.ts) against fixture build folders:
 * a clean build passes; root-absolute asset URLs, the API origin, Firebase,
 * a missing root index.html, too many files or too many bytes fail it.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  MAX_FILES,
  MB,
  checkPortalDist,
  parsePortalTarget,
  sizeVerdict,
  zipDist,
  zipEntries,
} from "../../scripts/packagePortal";

const CLEAN_HTML = `<!doctype html><html><head>
<script type="module" crossorigin src="./assets/index-abc.js"></script>
<link rel="stylesheet" href="./assets/index-abc.css">
<script src="https://www.youtube.com/game_api/v1"></script>
</head><body><div id="root"></div></body></html>`;
const CLEAN_CSS = `@font-face{src:url(./font.woff2)}body{background:url(data:image/png;base64,AAAA)}`;
const CLEAN_JS = `const a=new URL("./tile.jpg",import.meta.url).href;const b="https://sdk.crazygames.com/crazygames-sdk-v3.js";`;

const dirs: string[] = [];

function fixture(files: Record<string, string | Buffer>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "portal-dist-"));
  dirs.push(dir);
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(dir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  return dir;
}

function clean(overrides: Record<string, string | Buffer> = {}): string {
  return fixture({
    "index.html": CLEAN_HTML,
    "assets/index-abc.css": CLEAN_CSS,
    "assets/index-abc.js": CLEAN_JS,
    ...overrides,
  });
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("checkPortalDist", () => {
  it("passes a clean build and counts its files and bytes", () => {
    const report = checkPortalDist(clean(), "crazygames");
    expect(report.errors).toEqual([]);
    expect(report.files).toBe(3);
    expect(report.totalBytes).toBe(CLEAN_HTML.length + CLEAN_CSS.length + CLEAN_JS.length);
  });

  it("fails a root-absolute script or stylesheet in index.html", () => {
    const report = checkPortalDist(
      clean({ "index.html": CLEAN_HTML.replace('src="./assets/index-abc.js"', 'src="/assets/index-abc.js"') }),
      "itch",
    );
    expect(report.errors).toEqual(["index.html has a root-absolute asset URL /assets/index-abc.js (must be relative)"]);
  });

  it("fails a root-absolute url() in CSS", () => {
    const report = checkPortalDist(clean({ "assets/index-abc.css": "a{background:url('/assets/x.png')}" }), "itch");
    expect(report.errors).toEqual(["assets/index-abc.css has a root-absolute asset URL /assets/x.png (must be relative)"]);
  });

  it("fails a root-absolute /assets/ path in JS", () => {
    const report = checkPortalDist(clean({ "assets/index-abc.js": 'const t="/assets/tile-1.jpg";' }), "itch");
    expect(report.errors).toEqual(["assets/index-abc.js has a root-absolute asset URL /assets/tile-1.jpg (must be relative)"]);
  });

  it("fails a reference to the Doomstack API origin", () => {
    const report = checkPortalDist(
      clean({ "assets/index-abc.js": 'fetch("https://www.doomstack.lol/api/climb/result")' }),
      "youtube",
    );
    expect(report.errors).toEqual(["assets/index-abc.js references doomstack.lol"]);
  });

  it("fails Firebase Auth hosts", () => {
    const report = checkPortalDist(
      clean({ "assets/vendor.js": 'a="tower.firebaseapp.com";b="https://identitytoolkit.googleapis.com"' }),
      "crazygames",
    );
    expect(report.errors).toEqual([
      "assets/vendor.js references firebaseapp.com",
      "assets/vendor.js references identitytoolkit",
    ]);
  });

  it("fails when index.html is not at the root", () => {
    const dir = fixture({ "game/index.html": CLEAN_HTML, "game/assets/index-abc.js": CLEAN_JS });
    expect(checkPortalDist(dir, "itch").errors).toEqual(["index.html is not at the root of the build"]);
  });

  it("fails a missing build folder", () => {
    expect(checkPortalDist(path.join(tmpdir(), "no-such-portal-dist"), "itch").errors).toHaveLength(1);
  });

  it(`fails more than ${MAX_FILES} files`, () => {
    const many: Record<string, string> = {};
    for (let i = 0; i < MAX_FILES; i++) many[`assets/f${i}.bin`] = "x";
    const report = checkPortalDist(clean(many), "itch");
    expect(report.files).toBe(MAX_FILES + 3);
    expect(report.errors).toEqual([`${MAX_FILES + 3} files is over the ${MAX_FILES}-file limit`]);
  });

  it("fails a build over the target's size limit", () => {
    const big = Buffer.alloc(30 * MB);
    const report = checkPortalDist(clean({ "assets/big.bin": big }), "youtube");
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toMatch(/at or over the youtube limit of 30\.00 MB/);
    expect(checkPortalDist(clean({ "assets/big.bin": big }), "itch").errors).toEqual([]);
  });
});

describe("sizeVerdict", () => {
  it("CrazyGames: fails over 50 MB, warns over 20 MB", () => {
    expect(sizeVerdict("crazygames", 20 * MB)).toEqual({ error: null, warning: null });
    expect(sizeVerdict("crazygames", 20 * MB + 1).warning).toMatch(/mobile homepage/);
    expect(sizeVerdict("crazygames", 50 * MB).error).toBeNull();
    expect(sizeVerdict("crazygames", 50 * MB + 1).error).toMatch(/over the crazygames limit/);
  });

  it("YouTube: fails at 30 MB or more", () => {
    expect(sizeVerdict("youtube", 30 * MB - 1).error).toBeNull();
    expect(sizeVerdict("youtube", 30 * MB).error).toMatch(/at or over/);
  });

  it("itch: no limit", () => {
    expect(sizeVerdict("itch", 10_000 * MB)).toEqual({ error: null, warning: null });
  });
});

describe("parsePortalTarget", () => {
  it("allows only the three portals", () => {
    expect(parsePortalTarget("crazygames")).toBe("crazygames");
    expect(parsePortalTarget("youtube")).toBe("youtube");
    expect(parsePortalTarget("itch")).toBe("itch");
    for (const bad of ["app", "telegram", "", undefined, "constructor"]) expect(parsePortalTarget(bad)).toBeNull();
  });
});

describe("zipDist", () => {
  it("puts index.html at the zip root", () => {
    const dir = clean();
    const zip = path.join(fixture({}), "out", "portal.zip");
    const bytes = zipDist(dir, zip);
    expect(bytes).toBeGreaterThan(0);
    const entries = zipEntries(zip);
    expect(entries).toContain("index.html");
    expect(entries).toContain("assets/index-abc.js");
    expect(entries.some((e) => e.endsWith("/index.html"))).toBe(false);
  });

  it("refuses a build whose index.html is not at the root", () => {
    const dir = fixture({ "game/index.html": CLEAN_HTML });
    const zip = path.join(fixture({}), "portal.zip");
    expect(() => zipDist(dir, zip)).toThrow(/index.html is not at the root of the zip/);
  });
});
