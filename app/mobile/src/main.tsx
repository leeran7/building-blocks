import "./lib/patchFetch";

import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./contexts/AuthContext";
import { AppDataProvider } from "./contexts/AppDataContext";
import { LevelsProvider } from "./contexts/LevelsContext";
import { setVolcanoTileSrc } from "@app/components/Game/climbBackground";
import volcanoTile from "@app/../public/climb/volcano-tile.jpg";
import { applyBundledClimberSheets } from "./lib/climberSheets";
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
            <App />
          </LevelsProvider>
        </AppDataProvider>
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>,
);
