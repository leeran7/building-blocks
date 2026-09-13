import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { HomeScreen } from "./screens/HomeScreen";
import { ClimbScreen } from "./screens/ClimbScreen";
import { SignInScreen } from "./screens/SignInScreen";
import { LeaderboardScreen } from "./screens/LeaderboardScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { DuelRoomScreen } from "./screens/DuelRoomScreen";
import { AnimatedBackdrop } from "./components/AnimatedBackdrop";
import { RouteTransition } from "./components/RouteTransition";
import { useNativeShell } from "./lib/useNativeShell";
import { useAuth } from "./contexts/AuthContext";
import { LogoMark } from "./components/LogoMark";

/**
 * Root of the native game shell. The animated backdrop is persistent behind
 * every route — screens push over it as overlays so it always feels like
 * you're "inside the game," never navigating web pages.
 *
 * The app is fully auth-gated: until a real (non-anonymous) account is signed
 * in, the only reachable screen is Sign In. There is no guest play.
 */
export function App() {
  useNativeShell();
  const { user, loading, isAnonymous } = useAuth();
  const authed = Boolean(user) && !isAnonymous;

  // The Climb screen is a full-bleed opaque game surface. Unmounting the
  // decorative backdrop while it's covered stops its blur/ember animation from
  // burning GPU + battery during the most performance-sensitive moment.
  // NOTE: call useLocation() unconditionally — never behind a short-circuit, or
  // the hook count changes between the loading and authed renders and crashes.
  const location = useLocation();
  const onClimb = authed && location.pathname === "/climb";

  return (
    <div className="relative min-h-full w-full overflow-hidden bg-void">
      {!onClimb && <AnimatedBackdrop />}
      <div className="relative z-10 min-h-full">
        {loading ? (
          <AuthSplash />
        ) : !authed ? (
          // Auth gate — the only screen a signed-out user can reach.
          <SignInScreen />
        ) : (
          <Routes>
            {/* Climb and the challenge race room are full-bleed fixed game
                surfaces — they own their own entrance, so they stay outside
                the route push/fade wrapper. */}
            <Route path="/climb" element={<ClimbScreen />} />
            <Route path="/duel/:id" element={<DuelRoomScreen />} />
            <Route
              path="*"
              element={
                <RouteTransition>
                  <Routes>
                    <Route path="/" element={<HomeScreen />} />
                    <Route path="/leaderboard" element={<LeaderboardScreen />} />
                    <Route path="/profile" element={<ProfileScreen />} />
                    <Route path="/settings" element={<SettingsScreen />} />
                    {/* Signed in — /signin and any stray path go home. */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </RouteTransition>
              }
            />
          </Routes>
        )}
      </div>
    </div>
  );
}

/** Branded loader shown while the first auth state resolves. */
function AuthSplash() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="app-fade flex min-h-[100dvh] items-center justify-center"
    >
      <span className="auth-splash-mark">
        <LogoMark size={84} card />
      </span>
      <style>{`
        .auth-splash-mark { animation: splashPulse 1.8s ease-in-out infinite; }
        @keyframes splashPulse {
          0%, 100% { opacity: 0.55; transform: scale(0.97); }
          50%      { opacity: 1;    transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .auth-splash-mark { animation: none; opacity: 1; }
        }
      `}</style>
    </div>
  );
}
