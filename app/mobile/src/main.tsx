import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { TargetRoot } from "@target/root";
import { targetConfig } from "@target/config";
import { setVolcanoTileSrc } from "@app/components/Game/climbBackground";
import volcanoTile from "@app/../public/climb/volcano-tile.jpg";
import { Capacitor } from "@capacitor/core";
import { applyBundledClimberSheets } from "./lib/climberSheets";
import { WEB_BUILD } from "./lib/buildTarget";
import { webStartRoute } from "./lib/webEntry";
// Brand fonts ship inside the bundle (no Google Fonts request), so the native
// app matches the web type and still renders correctly offline.
import "@fontsource-variable/bricolage-grotesque/wght.css";
import "@fontsource-variable/hanken-grotesk/wght.css";
import "@fontsource/space-mono/latin-400.css";
import "@fontsource/space-mono/latin-700.css";
import "./styles.css";

/*
  The climb backdrop asset lives in the web `public/` and is loaded by absolute
  path there. In the bundled native app there is no server root for "/climb/…",
  so we hand the game engine a Vite-bundled, relative asset URL instead — without
  this the tile 404s and the game shows a flat dark fill.
*/
setVolcanoTileSrc(volcanoTile);
// Same for every character's climber atlases (drawn from "/climb/…" on the
// web): each <id>-poses-192.png / <id>-climb-192.png is bundled and registered.
applyBundledClimberSheets();

// Browser builds (web, CrazyGames and the other portals) let players zoom:
// index.html blocks it for the native app, where the WebView should feel like
// an app. The game's canvas and touch controls set touch-action: none, so a
// pinch there still never zooms mid-climb.
if (!Capacitor.isNativePlatform()) {
  document
    .querySelector('meta[name="viewport"]')
    ?.setAttribute("content", "width=device-width, initial-scale=1.0, viewport-fit=cover");
}

// The website opens the app on the screen its page is for (/daily, back from
// Checkout), before the router reads the hash.
if (WEB_BUILD) {
  const route = webStartRoute(window.location.pathname, window.location.search, window.location.hash);
  if (route !== null) window.location.hash = route;
}

// The host SDK loads before the first render; init() resolves even when the
// SDK is blocked, so the game always starts.
void targetConfig.platform.init();

/*
  The build target (vite.config.mts --mode) decides what renders: the full app
  or the Free-Climb-only portal shell.

  HashRouter (not BrowserRouter): the app is served from a file/capacitor
  scheme in the WebView where history-API path routing has no server to fall
  back on. Hash routing works offline from the bundle with zero config.
*/
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <TargetRoot />
    </HashRouter>
  </React.StrictMode>,
);
