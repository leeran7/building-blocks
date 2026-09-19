import { useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { HomeScreen } from "./screens/HomeScreen";
import { ClimbScreen } from "./screens/ClimbScreen";
import { SignInScreen } from "./screens/SignInScreen";
import { LeaderboardScreen } from "./screens/LeaderboardScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { DuelRoomScreen } from "./screens/DuelRoomScreen";
import { ChallengeScreen } from "./screens/ChallengeScreen";
import { AnimatedBackdrop } from "./components/AnimatedBackdrop";
import { RouteTransition } from "./components/RouteTransition";
import { BottomNav } from "./components/BottomNav";
import { useNativeShell } from "./lib/useNativeShell";
import { useAuth } from "./contexts/AuthContext";
import { GuestShell } from "./components/GuestShell";
import { LogoMark } from "./components/LogoMark";

const NAV_ROUTES = new Set(["/", "/leaderboard", "/profile"]);

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

  const [guestMode, setGuestMode] = useState(() => {
    try { return sessionStorage.getItem("doomstack:guest") === "1"; } catch { return false; }
  });
  const enterGuest = () => {
    setGuestMode(true);
    try { sessionStorage.setItem("doomstack:guest", "1"); } catch {}
  };
  const exitGuest = () => {
    setGuestMode(false);
    try { sessionStorage.removeItem("doomstack:guest"); } catch {}
  };

  // NOTE: call useLocation() unconditionally — never behind a short-circuit.
  const location = useLocation();
  const onClimb = authed && location.pathname === "/climb";
  const showNav = authed && NAV_ROUTES.has(location.pathname);
  const guestActive = guestMode && !authed;

  return (
    <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-void">
      {!onClimb && !guestActive && <AnimatedBackdrop />}
      <div className="relative z-10 flex-1 overflow-hidden">
        {loading ? (
          <AuthSplash />
        ) : authed ? (
          <Routes>
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
                    <Route path="/challenge" element={<ChallengeScreen />} />
                    {/* Settings merged into Profile — keep the path as a redirect
                        for any stray deep links / bookmarks. */}
                    <Route path="/settings" element={<Navigate to="/profile" replace />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </RouteTransition>
              }
            />
          </Routes>
        ) : guestActive ? (
          <GuestShell onSignIn={exitGuest} />
        ) : (
          <SignInScreen onGuestContinue={enterGuest} />
        )}
      </div>
      {/* Single BottomNav instance — never unmounts on hub route changes */}
      {showNav && <BottomNav />}
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
