import "./lib/patchFetch";

import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./contexts/AuthContext";
import { setVolcanoTileSrc } from "@app/components/Game/climbBackground";
import volcanoTile from "@app/../public/climb/volcano-tile.jpg";
import "./styles.css";

/*
  The climb backdrop asset lives in the web `public/` and is loaded by absolute
  path there. In the bundled native app there is no server root for "/climb/…",
  so we hand the game engine a Vite-bundled, relative asset URL instead — without
  this the tile 404s and the game shows a flat dark fill.
*/
setVolcanoTileSrc(volcanoTile);

/*
  HashRouter (not BrowserRouter): the app is served from a file/capacitor
  scheme in the WebView where history-API path routing has no server to fall
  back on. Hash routing works offline from the bundle with zero config.
*/
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>,
);
