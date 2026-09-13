import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./contexts/AuthContext";
import "./styles.css";

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
