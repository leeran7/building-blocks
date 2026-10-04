import { useEffect, type ReactNode } from "react";
import { AnimatePresence, MotionConfig, motion, useIsPresent } from "motion/react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ClimbScreen } from "./screens/ClimbScreen";
import { SignInScreen } from "./screens/SignInScreen";
import { LeaderboardScreen } from "./screens/LeaderboardScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { EditProfileScreen } from "./screens/EditProfileScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { AvatarPickerScreen } from "./screens/AvatarPickerScreen";
import { DuelRoomScreen } from "./screens/DuelRoomScreen";
import { ChallengeScreen } from "./screens/ChallengeScreen";
import { LevelMapScreen } from "./screens/LevelMapScreen";
import { LevelPlayScreen } from "./screens/LevelPlayScreen";
import { ShopScreen } from "./screens/ShopScreen";
import { TrainingScreen } from "./screens/TrainingScreen";
import { SkinDetailsScreen } from "./screens/SkinDetailsScreen";
import { AnimatedBackdrop } from "./components/AnimatedBackdrop";
import { RouteTransition } from "./components/RouteTransition";
import { BottomNavDock, isTabRoot } from "./components/BottomNav";
import { useNativeShell } from "./lib/useNativeShell";
import { useAuth } from "./contexts/AuthContext";
import { useLevels } from "./contexts/LevelsContext";
import { launchReady, useLaunchSplash } from "./lib/launchSplash";
import { GuestShell } from "./components/GuestShell";
import { LogoMark } from "./components/LogoMark";
import { useGuestMode } from "./lib/guestMode";
import { isGameRoute } from "./lib/navigation";
import { duration, ease } from "./lib/motionTokens";

/** How the backdrop and the app's top-level states (splash, Sign In, guest, the app) come and go. */
const SHELL_FADE = {
  className: "absolute inset-0",
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: duration.base, ease: ease.out } },
  exit: { opacity: 0, transition: { duration: duration.fast, ease: ease.in } },
} as const;

/**
 * Root of the native game shell. The animated backdrop is persistent behind
 * every route — screens push over it as overlays so it always feels like
 * you're "inside the game," never navigating web pages.
 *
 * Until a real (non-anonymous) account is signed in, the app shows Sign In,
 * or the guest shell (Endless, the training climb and levels 1 to 3 on the
 * device) once the player chose "Continue as Guest". Guest mode is kept on
 * the device across launches until the guest taps Sign In.
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

  const { guestMode, enterGuest, exitGuest } = useGuestMode();
  // Signed in: guest mode is over, so a later sign-out lands on Sign In.
  useEffect(() => {
    if (authed && guestMode) exitGuest();
  }, [authed, guestMode, exitGuest]);

  // NOTE: call useLocation() unconditionally — never behind a short-circuit.
  const location = useLocation();
  // A run draws its own world, so the backdrop fades away under it (duels keep it).
  const onClimb = authed && isGameRoute(location.pathname) && !location.pathname.startsWith("/duel/");
  const showNav = authed && isTabRoot(location.pathname);
  const guestActive = guestMode && !authed;
  const shell = loading || !launched ? "splash" : authed ? "app" : guestActive ? "guest" : "signin";

  return (
    // One motion policy for the app: Motion drops movement (keeps fades) when
    // the OS asks for reduced motion.
    <MotionConfig reducedMotion="user">
    <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-void">
      <AnimatePresence initial={false}>
        {!onClimb && !guestActive && (
          <motion.div key="backdrop" {...SHELL_FADE}>
            <AnimatedBackdrop />
          </motion.div>
        )}
      </AnimatePresence>
      <div className="relative z-10 flex-1 overflow-hidden">
        {/* Splash, Sign In, guest mode and the app cross-fade into each other. */}
        <AnimatePresence>
          <ShellLayer key={shell}>
            {shell === "splash" ? (
              <AuthSplash />
            ) : shell === "app" ? (
              <RouteTransition>
                {(routeLocation) => (
                  <Routes location={routeLocation}>
                    {/* Levels are the main game: the map is home (design doc §2).
                        Endless sits on its Play bar; Daily, Versus and Ranks on its mode rail. */}
                    <Route path="/" element={<LevelMapScreen />} />
                    {/* The full-screen runs: they zoom in and out (RouteTransition's launch / land). */}
                    <Route path="/climb" element={<ClimbScreen />} />
                    {/* Keyed by entry so "Practice this level" from a result starts fresh. */}
                    <Route path="/levels/:level/play" element={<LevelPlayScreen key={routeLocation.key} />} />
                    <Route path="/duel/:id" element={<DuelRoomScreen />} />
                    {/* First-run tutorial: opened by the map on a first launch, and from Profile. */}
                    <Route path="/tutorial" element={<TrainingScreen />} />
                    <Route path="/leaderboard" element={<LeaderboardScreen />} />
                    <Route path="/profile" element={<ProfileScreen />} />
                    <Route path="/profile/edit" element={<EditProfileScreen />} />
                    <Route path="/profile/avatar" element={<AvatarPickerScreen />} />
                    <Route path="/challenge" element={<ChallengeScreen />} />
                    <Route path="/shop" element={<ShopScreen />} />
                    <Route path="/shop/:characterId" element={<SkinDetailsScreen />} />
                    <Route path="/settings" element={<SettingsScreen />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                )}
              </RouteTransition>
            ) : shell === "guest" ? (
              <GuestShell onSignIn={exitGuest} />
            ) : (
              <SignInScreen onGuestContinue={enterGuest} />
            )}
          </ShellLayer>
        </AnimatePresence>
      </div>
      {/* Single BottomNav instance — never unmounts on hub route changes, and
          slides away (or back) with the screen when leaving a tab. */}
      {authed && <BottomNavDock show={showNav} />}
    </div>
    </MotionConfig>
  );
}

/** One of the app's top-level states, inert once it starts fading out. */
function ShellLayer({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  return (
    <motion.div {...SHELL_FADE} inert={!present} aria-hidden={!present || undefined}>
      {children}
    </motion.div>
  );
}

/** Branded loader shown until the first screen is ready (useLaunchSplash). */
function AuthSplash() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="flex min-h-[100dvh] items-center justify-center"
    >
      <span className="auth-splash-mark">
        <LogoMark size={96} />
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
