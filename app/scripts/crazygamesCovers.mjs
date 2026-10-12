/**
 * Render the three CrazyGames covers (docs/crazygames/covers/) from the real
 * CrazyGames build: start a run with the SDK blocked, drop every word the
 * canvas draws (covers may carry only the title), hide the HUD, and lay the
 * Doomstack logo over the tower.
 *
 *   pnpm portal:package crazygames && pnpm portal:covers
 */
import http from "node:http";
import { readFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { createRequire } from "node:module";

const APP = join(import.meta.dirname, "..");
const OUT = join(APP, "../docs/crazygames/covers");
const require = createRequire(join(APP, "package.json"));
const { chromium } = require("playwright");
const CHROMIUM = process.env.CHROMIUM_PATH; // e.g. /opt/pw-browsers/chromium; unset uses Playwright's own
const DIST = join(APP, "mobile/dist-crazygames");
const LOGO = readFileSync(join(APP, "public/brand/doomstack-logo.svg"), "utf8");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".mp3": "audio/mpeg" };
const server = http.createServer((req, res) => {
  let p = new URL(req.url, "http://x").pathname;
  if (p === "/") p = "/index.html";
  const file = normalize(join(DIST, p));
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;
mkdirSync(OUT, { recursive: true });
if (!existsSync(join(DIST, "index.html"))) throw new Error("No CrazyGames build: run pnpm portal:package crazygames first");
const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
const sizes = [["landscape", 1920, 1080, 0.42], ["portrait", 800, 1200, 0.78], ["square", 800, 800, 0.62]];
const climbMs = Number(process.env.CLIMB_MS ?? 6000);
for (const [name, w, h, logoW] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.route("**/sdk.crazygames.com/**", (r) => r.abort());
  // Covers may carry no text but the title: drop every word the canvas draws (height marks, power-up names).
  await page.addInitScript(() => {
    CanvasRenderingContext2D.prototype.fillText = function () {};
    CanvasRenderingContext2D.prototype.strokeText = function () {};
  });
  page.on("pageerror", (e) => console.error(name, "pageerror", e.message));
  await page.goto(base);
  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForTimeout(3600);
  // Climb: hold right then up so the climber is mid-tower, not on the floor.
  const keys = (process.env.KEYS ?? "ArrowRight:700,ArrowUp:1500,ArrowLeft:500,ArrowUp:1500").split(",");
  for (const k of keys) { const [key, ms] = k.split(":"); await page.keyboard.down(key); await page.waitForTimeout(Number(ms)); await page.keyboard.up(key); }
  await page.waitForTimeout(Math.max(0, climbMs - 4200));
  await page.keyboard.press("p");
  await page.waitForTimeout(300);
  const tile = (await page.evaluate(() => [...performance.getEntriesByType("resource")].map((e) => e.name).find((n) => n.includes("volcano-tile")))) ?? "";
  await page.addStyleTag({ content: `html{background:#0b0a0e url("${tile}") center/640px repeat!important}
    html::after{content:"";position:fixed;inset:0;background:linear-gradient(to bottom,rgba(8,6,10,.55),rgba(8,6,10,.35) 60%,rgba(255,80,20,.35));z-index:0}
    body{background:transparent!important}
    body *{visibility:hidden!important} canvas{visibility:visible!important;position:relative;z-index:1}
    #cover-logo{visibility:visible!important;position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:${Math.round(logoW * Math.min(w, h * 1.2))}px;filter:drop-shadow(0 12px 40px rgba(0,0,0,.85));z-index:99999}
    #cover-logo *{visibility:visible!important} #cover-logo svg{width:100%;height:auto;display:block}
    #cover-shade{visibility:visible!important;position:fixed;inset:0;background:radial-gradient(ellipse at center,rgba(0,0,0,.55) 0%,rgba(0,0,0,0) 70%);z-index:99998}` });
  await page.evaluate((svg) => {
    const shade = document.createElement("div"); shade.id = "cover-shade"; document.body.appendChild(shade);
    const d = document.createElement("div"); d.id = "cover-logo"; d.innerHTML = svg; document.body.appendChild(d);
  }, LOGO);
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, `cover-${name}-${w}x${h}.png`) });
  console.log("wrote", name);
  await ctx.close();
}
await browser.close();
server.close();
