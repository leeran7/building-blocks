import "./lib/patchFetch";

import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./contexts/AuthContext";
import { AppDataProvider } from "./contexts/AppDataContext";
import { LevelsProvider } from "./contexts/LevelsContext";
import { ShopProvider } from "./contexts/ShopContext";
import { setVolcanoTileSrc } from "@app/components/Game/climbBackground";
import volcanoTile from "@app/../public/climb/volcano-tile.jpg";
import { applyBundledClimberSheets } from "./lib/climberSheets";
import { API_BASE, IS_PREVIEW_BACKEND } from "./lib/api";
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

// A preview build is easy to mistake for the real app, so it wears a small
// badge naming the backend it talks to.
if (IS_PREVIEW_BACKEND) {
  const badge = document.createElement("div");
  badge.textContent = `PREVIEW · ${new URL(API_BASE).host}`;
  badge.style.cssText =
    "position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom) + 2px);transform:translateX(-50%);" +
    "z-index:2147483647;pointer-events:none;padding:2px 8px;border-radius:999px;max-width:92vw;" +
    "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:600 10px/1.4 monospace;" +
    "background:rgba(255,160,0,.9);color:#000;";
  document.body.appendChild(badge);
}

/*
  HashRouter (not BrowserRouter): the app is served from a file/capacitor
  scheme in the WebView where history-API path routing has no server to fall
  back on. Hash routing works offline from the bundle with zero config.
*/
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <AppDataProvider>
          <LevelsProvider>
            <ShopProvider>
              <App />
            </ShopProvider>
          </LevelsProvider>
        </AppDataProvider>
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>,
);
