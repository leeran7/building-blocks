import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { Keyboard } from "@capacitor/keyboard";
import { API_BASE } from "./api";
import { parentRoute, useBackOr } from "./navigation";

// Only links on our own verified origin are allowed to drive in-app routing.
const CANONICAL_HOST = new URL(API_BASE).host;

/**
 * Native shell wiring — makes the app behave like a native binary rather than
 * a web page:
 *  - hides the native splash once the SPA has painted (config keeps it up until
 *    we say so, so there's no flash of empty WebView);
 *  - dark, edge-to-edge status bar to match the ASCENT void background;
 *  - Android hardware back button: navigate back through the in-app history
 *    (or to the screen's parent on a deep link, where there is none), and only
 *    background the app from the home screen — never exit mid-run;
 *  - universal / app links: a shared https challenge link (…/duel/:id) opens
 *    straight into the in-app race room instead of the browser.
 */
export function useNativeShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const back = useBackOr(parentRoute(location.pathname));

  // Deep links (iOS Universal Links / Android App Links). The OS hands us the
  // full https URL that launched (or foregrounded) the app; we route the path
  // into the HashRouter. Only paths we own map to a screen — anything else is
  // ignored so a stray link can't push the shell somewhere broken.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let remove = () => {};
    CapApp.addListener("appUrlOpen", ({ url }) => {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return;
      }
      // Don't trust the OS association layer alone: only route https links on
      // our own host, so a link with a matching path on any other origin (or a
      // custom scheme) can't drive in-app navigation.
      if (parsed.protocol !== "https:" || parsed.host !== CANONICAL_HOST) return;
      const duel = parsed.pathname.match(/^\/duel\/([A-Za-z0-9_-]+)\/?$/);
      if (duel) navigate(`/duel/${duel[1]}`);
    }).then((handle) => {
      remove = () => handle.remove();
    });
    return () => remove();
  }, [navigate]);

  // One-time native chrome setup.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    void SplashScreen.hide();
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    if (Capacitor.getPlatform() === "android") {
      StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
    }
    // Kill the white iOS form-assistant bar (the ↑ ↓ Done toolbar) that appears
    // above the keyboard on every focused input — it clashes with the dark
    // theme and only shows a jarring white strip. iOS-only; no-ops elsewhere.
    if (Capacitor.getPlatform() === "ios") {
      Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {});
    }
  }, []);

  // Android hardware back button.
  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return;
    let remove = () => {};
    CapApp.addListener("backButton", () => {
      const atHome = location.pathname === "/";
      if (atHome) {
        void CapApp.minimizeApp();
      } else {
        back();
      }
    }).then((handle) => {
      remove = () => handle.remove();
    });
    return () => remove();
  }, [location.pathname, back]);
}
