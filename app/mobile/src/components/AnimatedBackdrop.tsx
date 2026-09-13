import { useEffect, useMemo, useRef } from "react";
import { drawLava } from "@app/components/Game/lava";
import { prefersReducedMotion } from "../lib/motion";

/**
 * "Molten Ascent" backdrop — the game's signature identity, shared behind every
 * screen. It tells the Doomstack fantasy in one glance: cool lime *summit*
 * energy drifting at the top, real rising lava at the bottom, and faint embers
 * climbing through the void between them. You always feel like you're standing
 * above the same molten hazard you flee in the game.
 *
 * The lava is the game's actual renderer (`drawLava` from the engine) drawn on a
 * small bottom canvas, so the backdrop and gameplay share one look. Everything
 * else is flat + drifting (NOT parallax), pure CSS transforms, cheap on mobile
 * GPUs. All motion — canvas included — is disabled under prefers-reduced-motion.
 */
const EMBER_COUNT = 12;
const LAVA_FPS = 30; // throttle the canvas; the sim itself is 30Hz

export function AnimatedBackdrop() {
  const embers = useMemo(
    () =>
      Array.from({ length: EMBER_COUNT }, (_, i) => {
        const size = 2 + Math.round(Math.random() * 4);
        return {
          key: i,
          left: Math.round(Math.random() * 100),
          size,
          drift: Math.round((Math.random() - 0.5) * 12),
          duration: 9 + Math.round(Math.random() * 10),
          delay: -Math.round(Math.random() * 18),
          warm: Math.random() > 0.35,
        };
      }),
    [],
  );

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-void">
      {/* Cool summit energy, top */}
      <div className="bd-blob bd-blob-summit" />

      {/* Warm bloom so the lava's light bleeds up into the void */}
      <div className="bd-lava-bloom" />

      {/* Real game lava, bottom */}
      <LavaCanvas />

      {/* Embers rising through the void */}
      <div className="bd-embers">
        {embers.map((e) => (
          <span
            key={e.key}
            className="bd-ember"
            style={
              {
                left: `${e.left}%`,
                width: `${e.size}px`,
                height: `${e.size}px`,
                animationDuration: `${e.duration}s`,
                animationDelay: `${e.delay}s`,
                background: e.warm
                  ? "radial-gradient(circle, #ff7a45 0%, #ff5a2c 55%, transparent 100%)"
                  : "radial-gradient(circle, #dbff5c 0%, #cbf24d 55%, transparent 100%)",
                "--drift": `${e.drift}vw`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <div className="bd-sheen" />
      {/* Gentle bottom scrim keeps controls legible over the molten body while
          leaving the bright crest glow visible above it. */}
      <div className="bd-vignette" />

      <style>{`
        .bd-blob {
          position: absolute;
          border-radius: 9999px;
          filter: blur(80px);
          -webkit-filter: blur(80px);
          will-change: transform;
          transform: translateZ(0);
        }
        .bd-blob-summit {
          width: 60vh; height: 60vh; left: -14vh; top: -14vh;
          opacity: 0.26;
          background: radial-gradient(circle, #cbf24d 0%, transparent 70%);
          animation: bdDriftA 26s ease-in-out infinite alternate;
        }

        /* Lava canvas pinned to the bottom; the wavy glowing crest sits ~55% up
           the band and the void shows above it. */
        .bd-lava-canvas {
          position: absolute; inset-inline: 0; bottom: 0;
          width: 100%; height: 42vh;
          display: block;
        }
        /* Soft heat bloom under everything so the molten light feels emissive. */
        .bd-lava-bloom {
          position: absolute; inset-inline: 0; bottom: 0; height: 46vh;
          background: radial-gradient(130% 100% at 50% 120%, rgba(255,90,44,0.30) 0%, rgba(255,90,44,0.10) 34%, transparent 66%);
          animation: bdLavaBreathe 7s ease-in-out infinite alternate;
          will-change: opacity;
        }

        .bd-embers { position: absolute; inset: 0; overflow: hidden; }
        .bd-ember {
          position: absolute;
          bottom: -6vh;
          border-radius: 9999px;
          opacity: 0;
          will-change: transform, opacity;
          animation-name: bdEmberRise;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }

        .bd-sheen {
          position: absolute; inset: 0;
          background: radial-gradient(120% 60% at 50% -10%, rgba(244,242,236,0.05), transparent 60%);
        }
        .bd-vignette {
          position: absolute; inset: 0;
          background: linear-gradient(to top, rgba(10,10,12,0.5) 0%, transparent 26%);
        }

        @keyframes bdDriftA {
          from { transform: translate3d(0,0,0) scale(1); }
          to   { transform: translate3d(8vh,6vh,0) scale(1.12); }
        }
        @keyframes bdLavaBreathe {
          from { opacity: 0.8; }
          to   { opacity: 1; }
        }
        @keyframes bdEmberRise {
          0%   { transform: translate3d(0, 0, 0); opacity: 0; }
          12%  { opacity: 0.8; }
          85%  { opacity: 0.5; }
          100% { transform: translate3d(var(--drift), -108vh, 0); opacity: 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          .bd-blob, .bd-lava-bloom { animation: none; }
          .bd-embers { display: none; }
        }
      `}</style>
    </div>
  );
}

/**
 * Bottom lava band, drawn with the game's real `drawLava` so it matches the
 * hazard you flee in a run. Time-driven tick (30Hz-equivalent) keeps the crest
 * motion at gameplay speed; throttled + paused when hidden or reduced-motion.
 */
function LavaCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduce = prefersReducedMotion();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let cssW = 0;
    let cssH = 0;
    let raf = 0;
    let running = true;
    let last = 0;
    const start = performance.now();

    const resize = () => {
      cssW = canvas.clientWidth;
      cssH = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(cssW * dpr));
      canvas.height = Math.max(1, Math.round(cssH * dpr));
      if (reduce) paint(0); // redraw the static frame at the new size
    };

    const paint = (now: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      const tick = reduce ? 0 : (now - start) / (1000 / 30);
      const ui = Math.max(0.85, cssW / 420); // match the game's wave/ember scale
      const top = cssH * 0.44; // hazard line ~56% up the band; void above
      drawLava(ctx, {
        width: cssW,
        height: cssH,
        top,
        ui,
        tick,
        reducedMotion: reduce,
        slowed: false,
      });
    };

    const frame = (now: number) => {
      if (!running) return;
      if (now - last >= 1000 / LAVA_FPS) {
        last = now;
        paint(now);
      }
      raf = requestAnimationFrame(frame);
    };

    resize();
    window.addEventListener("resize", resize);

    if (reduce) {
      paint(0);
    } else {
      raf = requestAnimationFrame(frame);
    }

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!reduce && !running) {
        running = true;
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={ref} className="bd-lava-canvas" aria-hidden />;
}
