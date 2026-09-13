import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";

/**
 * Native shell wiring — makes the app behave like a native binary rather than
 * a web page:
 *  - hides the native splash once the SPA has painted (config keeps it up until
 *    we say so, so there's no flash of empty WebView);
 *  - dark, edge-to-edge status bar to match the ASCENT void background;
 *  - Android hardware back button: navigate back through the in-app history,
 *    and only background the app from the home screen — never exit mid-run.
 */
export function useNativeShell() {
  const navigate = useNavigate();
  const location = useLocation();

  // One-time native chrome setup.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    void SplashScreen.hide();
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    if (Capacitor.getPlatform() === "android") {
      StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
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
        navigate(-1);
      }
    }).then((handle) => {
      remove = () => handle.remove();
    });
    return () => remove();
  }, [location.pathname, navigate]);
}
