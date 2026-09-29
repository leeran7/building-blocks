import { useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { HomeScreen } from "./screens/HomeScreen";
import { ClimbScreen } from "./screens/ClimbScreen";
import { SignInScreen } from "./screens/SignInScreen";
import { LeaderboardScreen } from "./screens/LeaderboardScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { EditProfileScreen } from "./screens/EditProfileScreen";
import { AvatarPickerScreen } from "./screens/AvatarPickerScreen";
import { DuelRoomScreen } from "./screens/DuelRoomScreen";
import { ChallengeScreen } from "./screens/ChallengeScreen";
import { LevelMapScreen } from "./screens/LevelMapScreen";
import { LevelPlayScreen } from "./screens/LevelPlayScreen";
import { ShopScreen } from "./screens/ShopScreen";
import { SkinDetailsScreen } from "./screens/SkinDetailsScreen";
import { AnimatedBackdrop } from "./components/AnimatedBackdrop";
import { RouteTransition } from "./components/RouteTransition";
import { BottomNav, isTabRoot } from "./components/BottomNav";
import { useNativeShell } from "./lib/useNativeShell";
import { useAuth } from "./contexts/AuthContext";
import { useLevels } from "./contexts/LevelsContext";
import { launchReady, useLaunchSplash } from "./lib/launchSplash";
import { GuestShell } from "./components/GuestShell";
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
  const levels = useLevels();
  // Hold the splash until the level map (home) has its season, so launch
  // never shows a "Loading levels…" screen.
  const launched = useLaunchSplash(
    launchReady({
      authLoading: loading,
      authed,
      seasonLoaded: levels.season !== null,
      seasonError: levels.error,
    }),
  );

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
  const onClimb = authed && (location.pathname === "/climb" || isLevelPlay(location.pathname));
  const showNav = authed && isTabRoot(location.pathname);
  const guestActive = guestMode && !authed;

  return (
    <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-void">
      {!onClimb && !guestActive && <AnimatedBackdrop />}
      <div className="relative z-10 flex-1 overflow-hidden">
        {loading || !launched ? (
          <AuthSplash />
        ) : authed ? (
          <Routes>
            <Route path="/climb" element={<ClimbScreen />} />
            {/* Keyed by entry so "Practice this level" from a result starts fresh. */}
            <Route path="/levels/:level/play" element={<LevelPlayScreen key={location.key} />} />
            <Route path="/duel/:id" element={<DuelRoomScreen />} />
            <Route
              path="*"
              element={
                <RouteTransition>
                  <Routes>
                    {/* Levels are the main game: the map is home (design doc §2).
                        Endless, Daily, Quick Play and Challenge live on Modes. */}
                    <Route path="/" element={<LevelMapScreen />} />
                    <Route path="/modes" element={<HomeScreen />} />
                    <Route path="/leaderboard" element={<LeaderboardScreen />} />
                    <Route path="/profile" element={<ProfileScreen />} />
                    <Route path="/profile/edit" element={<EditProfileScreen />} />
                    <Route path="/profile/avatar" element={<AvatarPickerScreen />} />
                    <Route path="/challenge" element={<ChallengeScreen />} />
                    <Route path="/shop" element={<ShopScreen />} />
                    <Route path="/shop/:characterId" element={<SkinDetailsScreen />} />
                    {/* Settings live on Edit Profile — keep the path as a redirect
                        for any stray deep links / bookmarks. */}
                    <Route path="/settings" element={<Navigate to="/profile/edit" replace />} />
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

/** The full-screen level run, which like /climb hides the backdrop. */
function isLevelPlay(pathname: string): boolean {
  return /^\/levels\/\d+\/play$/.test(pathname);
}

/** Branded loader shown until the first screen is ready (useLaunchSplash). */
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
