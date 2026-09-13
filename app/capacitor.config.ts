import type { CapacitorConfig } from "@capacitor/cli";

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
  },
};

export default config;
