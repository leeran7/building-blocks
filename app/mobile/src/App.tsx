import { Routes, Route } from "react-router-dom";
import { HomeScreen } from "./screens/HomeScreen";
import { ClimbScreen } from "./screens/ClimbScreen";
import { SignInScreen } from "./screens/SignInScreen";
import { LeaderboardScreen } from "./screens/LeaderboardScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { AnimatedBackdrop } from "./components/AnimatedBackdrop";
import { useNativeShell } from "./lib/useNativeShell";

/**
 * Root of the native game shell. The animated backdrop is persistent behind
 * every route — screens push over it as overlays so it always feels like
 * you're "inside the game," never navigating web pages.
 */
export function App() {
  useNativeShell();
  return (
    <div className="relative min-h-full w-full overflow-hidden bg-void">
      <AnimatedBackdrop />
      <div className="relative z-10 min-h-full">
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/climb" element={<ClimbScreen />} />
          <Route path="/signin" element={<SignInScreen />} />
          <Route path="/leaderboard" element={<LeaderboardScreen />} />
          <Route path="/profile" element={<ProfileScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
        </Routes>
      </div>
    </div>
  );
}
