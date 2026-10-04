import { Navigate, Routes, Route } from "react-router-dom";
import { ClimbScreen } from "../screens/ClimbScreen";
import { LevelMapScreen } from "../screens/LevelMapScreen";
import { LevelPlayScreen } from "../screens/LevelPlayScreen";
import { TrainingScreen } from "../screens/TrainingScreen";
import { LevelsProvider } from "../contexts/LevelsContext";
import { GuestProvider } from "../contexts/GuestContext";
import { AnimatedBackdrop } from "./AnimatedBackdrop";
import { RouteTransition } from "./RouteTransition";

/**
 * Guest mode: the same Play screen as an account (the level map), with
 * Endless and a levels taster (levels 1 to GUEST_LEVEL_CAP) on the device,
 * and Sign In always one tap away. The account-only parts (star chest, gems,
 * mode rail, tab bar) are left out rather than shown locked (Leeran,
 * 2026-10-04). The map runs under a guest LevelsProvider, whose client is
 * device-only: nothing a guest earns reaches the server.
 */
export function GuestShell({ onSignIn }: { onSignIn: () => void }) {
  return (
    <GuestProvider onSignIn={onSignIn}>
      <LevelsProvider guest>
        <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-void">
          <AnimatedBackdrop />
          <div className="relative z-10 flex-1 overflow-hidden">
            <RouteTransition>
              {(routeLocation) => (
                <Routes location={routeLocation}>
                  {/* Home is the level map, as for an account. It opens the
                      training climb for a new guest. */}
                  <Route path="/" element={<LevelMapScreen />} />
                  <Route path="/climb" element={<ClimbScreen onSignIn={onSignIn} />} />
                  {/* Keyed by entry so "Practice this level" from a result starts fresh. */}
                  <Route path="/levels/:level/play" element={<LevelPlayScreen key={routeLocation.key} />} />
                  <Route path="/tutorial" element={<TrainingScreen />} />
                  {/* Includes the old /levels taster path. */}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              )}
            </RouteTransition>
          </div>
        </div>
      </LevelsProvider>
    </GuestProvider>
  );
}
