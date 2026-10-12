// Rewrites the engine's relative /api/ calls to the backend with a Firebase
// token. First import, so it is in place before any module fetches.
import "../../lib/patchFetch";
import { App } from "../../App";
import { AuthProvider } from "../../contexts/AuthContext";
import { AppDataProvider } from "../../contexts/AppDataContext";
import { LevelsProvider } from "../../contexts/LevelsContext";
import { ShopProvider } from "../../contexts/ShopContext";

/** The full app: signed-in data, levels and the shop around the App shell. */
export function TargetRoot() {
  return (
    <AuthProvider>
      <AppDataProvider>
        <LevelsProvider>
          <ShopProvider>
            <App />
          </ShopProvider>
        </LevelsProvider>
      </AppDataProvider>
    </AuthProvider>
  );
}
