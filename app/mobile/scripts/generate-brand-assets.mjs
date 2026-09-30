/**
 * Generate all native app-icon + splash assets from the Doomstack app icon
 * (public/brand/doomstack-icon.svg: DOOM / STACK sinking into lava), so the icon, launch
 * splash, and adaptive icons all match the brand.
 *
 * Pure Node via @resvg/resvg-wasm (already vendored). Renders straight into the
 * iOS/Android projects, matching each existing file's exact pixel dimensions so
 * nothing in the native layout shifts. It also writes canonical source images
 * to mobile/assets/ so `@capacitor/assets` can regenerate later if desired.
 *
 * Run:  node mobile/scripts/generate-brand-assets.mjs   (from app/)
 */
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const wasm = fs.readFileSync(
  path.join(APP, "node_modules/@resvg/resvg-wasm/index_bg.wasm"),
);
await initWasm(wasm);

const VOID = "#0a0a0c";

// The app icon artwork (DOOM / STACK sinking into lava on a rounded void chip),
// 1024 coordinate space, text already converted to outlines. Single source of
// truth shared with public/logo-1024.* and the web favicon.
const ICON_SVG = fs.readFileSync(path.join(APP, "public/brand/doomstack-icon.svg"), "utf8");
const DEFS = ICON_SVG.match(/<defs>([\s\S]*)<\/defs>/)[1];
const BODY = ICON_SVG.match(/<\/defs>([\s\S]*)<\/svg>/)[1];
// The artwork without its background chip (the two full-size rects).
const ART = BODY.replace(/<rect width="1024" height="1024"[^>]*\/>/g, "");

const svgHead = (w, h) =>
  `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">`;

// Full-bleed app icon (the OS masks its own corners).
const iconSVG = () => ICON_SVG.replaceAll('rx="224"', 'rx="0"');

// Adaptive-icon foreground: the lettering only, scaled into the ~66% safe zone, transparent.
const foregroundSVG = () =>
  `${svgHead(1024, 1024)}<defs>${DEFS}</defs><g transform="translate(512 512) scale(0.62) translate(-512 -512)">${ART}</g></svg>`;

// Launch splash: the rounded icon as a chip centered on void.
const splashSVG = (w, h) => {
  const s = Math.round(Math.min(w, h) * 0.34);
  const x = (w - s) / 2;
  const y = (h - s) / 2;
  const k = s / 1024;
  return (
    `${svgHead(w, h)}<defs>${DEFS}</defs><rect width="${w}" height="${h}" fill="${VOID}"/>` +
    `<g transform="translate(${x} ${y}) scale(${k})">${BODY}</g></svg>`
  );
};

function render(svg, width) {
  const r = new Resvg(svg, { fitTo: { mode: "width", value: width } });
  return Buffer.from(r.render().asPng());
}

function write(file, buf) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  console.log("  ✓", path.relative(APP, file));
}

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const ios = (p) => path.join(APP, "ios/App/App/Assets.xcassets", p);
const and = (p) => path.join(APP, "android/app/src/main/res", p);

// ---- iOS icon ----
console.log("iOS icon:");
write(ios("AppIcon.appiconset/AppIcon-512@2x.png"), render(iconSVG(), 1024));

// ---- iOS splash (match existing dims) ----
console.log("iOS splash:");
for (const f of [
  "Splash.imageset/splash-2732x2732.png",
  "Splash.imageset/splash-2732x2732-1.png",
  "Splash.imageset/splash-2732x2732-2.png",
]) {
  const p = ios(f);
  const { w, h } = fs.existsSync(p) ? pngSize(p) : { w: 2732, h: 2732 };
  write(p, render(splashSVG(w, h), w));
}

// ---- Android launcher icons ----
console.log("Android icons:");
const ICON = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const FG = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
for (const [d, size] of Object.entries(ICON)) {
  const sq = render(iconSVG(), size);
  write(and(`mipmap-${d}/ic_launcher.png`), sq);
  write(and(`mipmap-${d}/ic_launcher_round.png`), sq);
  write(and(`mipmap-${d}/ic_launcher_foreground.png`), render(foregroundSVG(), FG[d]));
}

// ---- Android splash (match existing dims) ----
console.log("Android splash:");
const splashGlob = [];
const resDir = and("");
for (const dir of fs.readdirSync(resDir)) {
  const full = path.join(resDir, dir);
  if (fs.statSync(full).isDirectory() && dir.startsWith("drawable")) {
    const f = path.join(full, "splash.png");
    if (fs.existsSync(f)) splashGlob.push(f);
  }
}
for (const f of splashGlob) {
  const { w, h } = pngSize(f);
  write(f, render(splashSVG(w, h), w));
}

// ---- Canonical sources for future @capacitor/assets runs ----
console.log("Sources:");
write(path.join(APP, "mobile/assets/icon-only.png"), render(iconSVG(), 1024));
write(path.join(APP, "mobile/assets/icon-foreground.png"), render(foregroundSVG(), 1024));
write(path.join(APP, "mobile/assets/splash.png"), render(splashSVG(2732, 2732), 2732));
write(path.join(APP, "mobile/assets/splash-dark.png"), render(splashSVG(2732, 2732), 2732));

console.log("\nDone. Run `pnpm cap:sync` (or npx cap sync) to copy into the builds.");
