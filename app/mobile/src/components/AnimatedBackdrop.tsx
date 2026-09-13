/**
 * Flat animated background — drifting soft gradients (NOT parallax), per the
 * project's background style. Pure CSS transforms so it's cheap on mobile GPUs
 * and unifies every screen behind the game shell.
 */
export function AnimatedBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-void">
      <div className="bd-blob bd-blob-a" />
      <div className="bd-blob bd-blob-b" />
      <div className="bd-grain" />
      <style>{`
        .bd-blob {
          position: absolute;
          border-radius: 9999px;
          filter: blur(72px);
          -webkit-filter: blur(72px);
          opacity: 0.32;
          will-change: transform;
          transform: translateZ(0);
          -webkit-transform: translateZ(0);
        }
        .bd-blob-a {
          width: 60vh; height: 60vh; left: -10vh; top: -8vh;
          background: radial-gradient(circle, #cbf24d 0%, transparent 70%);
          animation: bdDriftA 22s ease-in-out infinite alternate;
        }
        .bd-blob-b {
          width: 55vh; height: 55vh; right: -12vh; bottom: -10vh;
          background: radial-gradient(circle, #ff5a2c 0%, transparent 70%);
          animation: bdDriftB 28s ease-in-out infinite alternate;
        }
        .bd-grain {
          position: absolute; inset: 0;
          background:
            radial-gradient(circle at 50% 0%, rgba(255,255,255,0.03), transparent 60%);
        }
        @keyframes bdDriftA {
          from { transform: translate3d(0,0,0) scale(1); }
          to   { transform: translate3d(8vh,6vh,0) scale(1.12); }
        }
        @keyframes bdDriftB {
          from { transform: translate3d(0,0,0) scale(1.05); }
          to   { transform: translate3d(-7vh,-5vh,0) scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .bd-blob { animation: none; }
        }
      `}</style>
    </div>
  );
}
