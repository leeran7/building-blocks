import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize, KeyboardStyle } from "@capacitor/keyboard";

/**
 * Capacitor config for the Doomstack native game shell.
 *
 * webDir points at the BUNDLED Vite SPA build (mobile/dist) — deliberately no
 * `server.url`, so the app ships its UI in the binary and boots instantly
 * from a native splash rather than loading www.doomstack.lol in a WebView.
 *
 * CapacitorHttp is enabled so the SPA's calls to the doomstack API use native
 * HTTP (bypassing browser CORS and letting us attach the Firebase Bearer token
 * from a cross-origin client).
 */
const config: CapacitorConfig = {
  appId: "lol.doomstack.app",
  appName: "Doomstack",
  webDir: "mobile/dist",
  // Dark native WebView/window background (matches --color-void). Without this
  // the native view under the WebView defaults to white, so it shows through as
  // a white strip whenever `Keyboard.resize: native` shrinks the WebView above
  // the keyboard, and during the splash→first-paint hand-off. Keep in sync with
  // --color-void in mobile/src/styles.css and the splash backgroundColor below.
  backgroundColor: "#0a0a0c",
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: "#0a0a0c",
      showSpinner: false,
    },
    // Native Sign in with Apple + Google via Firebase. `skipNativeAuth: false`
    // signs into the native Firebase SDK on device (and the JS SDK on web), so
    // getIdToken() yields a Bearer token for the Doomstack API. Requires the
    // native Firebase config files to be added (see mobile/README.md).
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ["apple.com", "google.com"],
    },
    FirebaseMessaging: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    // Keep the keyboard on-brand app-wide so no white ever shows at the bottom:
    //  - DARK keyboard (never the white system default);
    //  - resize Native so the WebView shrinks with the keyboard instead of the
    //    dark layout being covered by a white gap;
    //  - autoBackdropColor "dom" tints the area behind the keyboard from the
    //    app's dark body background, killing the white flash during the
    //    show/hide transition.
    // The white iOS form-assistant bar (the ↑ ↓ Done toolbar) has no config
    // flag in Capacitor 8 — it's hidden at runtime in useNativeShell.
    Keyboard: {
      style: KeyboardStyle.Dark,
      resize: KeyboardResize.Native,
      autoBackdropColor: "dom",
    },
  },
};

export default config;
