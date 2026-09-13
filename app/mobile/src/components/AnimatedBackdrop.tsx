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
const EMBER_COUNT = 18;
const DUST_COUNT = 10;
const LAVA_FPS = 30;

export function AnimatedBackdrop() {
  const embers = useMemo(
    () =>
      Array.from({ length: EMBER_COUNT }, (_, i) => {
        const size = 2 + Math.round(Math.random() * 5);
        return {
          key: i,
          left: Math.round(Math.random() * 100),
          size,
          drift: Math.round((Math.random() - 0.5) * 16),
          duration: 8 + Math.round(Math.random() * 11),
          delay: -Math.round(Math.random() * 22),
          warm: Math.random() > 0.3,
        };
      }),
    [],
  );

  // Slow, tiny dust particles — no color, very dim, reinforce the sense of depth
  const dust = useMemo(
    () =>
      Array.from({ length: DUST_COUNT }, (_, i) => ({
        key: i,
        left: Math.round(Math.random() * 100),
        drift: Math.round((Math.random() - 0.5) * 8),
        duration: 18 + Math.round(Math.random() * 16),
        delay: -Math.round(Math.random() * 30),
      })),
    [],
  );

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-void">
      {/* Cool summit energy, top-left — breathes gently */}
      <div className="bd-blob bd-blob-summit" />

      {/* Warm mid-right bloom — second focal point */}
      <div className="bd-blob bd-blob-warm" />

      {/* Warm bloom so the lava's light bleeds up into the void */}
      <div className="bd-lava-bloom" />

      {/* Real game lava, bottom */}
      <LavaCanvas />

      {/* Rising embers */}
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

        {/* Slow dust particles — 1 px, neutral, very dim */}
        {dust.map((d) => (
          <span
            key={`d${d.key}`}
            className="bd-dust"
            style={
              {
                left: `${d.left}%`,
                animationDuration: `${d.duration}s`,
                animationDelay: `${d.delay}s`,
                "--drift": `${d.drift}vw`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      {/* Top surface sheen */}
      <div className="bd-sheen" />
      {/* Grain overlay — static SVG noise for texture without repaints */}
      <div className="bd-grain" />
      {/* Bottom scrim keeps controls legible */}
      <div className="bd-vignette" />

      <style>{`
        .bd-blob {
          position: absolute;
          border-radius: 9999px;
          filter: blur(80px);
          -webkit-filter: blur(80px);
          will-change: transform, opacity;
          transform: translateZ(0);
        }
        .bd-blob-summit {
          width: 65vh; height: 65vh; left: -16vh; top: -16vh;
          background: radial-gradient(circle, #cbf24d 0%, transparent 70%);
          animation: bdDriftA 28s ease-in-out infinite alternate, bdBreathe 9s ease-in-out infinite alternate;
        }
        /* Warm secondary blob — amber, lower-right, drifts on its own cycle */
        .bd-blob-warm {
          width: 50vh; height: 50vh; right: -18vh; top: 28vh;
          background: radial-gradient(circle, rgba(255,120,50,0.7) 0%, transparent 70%);
          opacity: 0.14;
          animation: bdDriftB 34s ease-in-out infinite alternate, bdBreathe 11s ease-in-out 3s infinite alternate;
        }

        .bd-lava-canvas {
          position: absolute; inset-inline: 0; bottom: 0;
          width: 100%; height: 42vh;
          display: block;
        }
        .bd-lava-bloom {
          position: absolute; inset-inline: 0; bottom: 0; height: 50vh;
          background: radial-gradient(130% 100% at 50% 120%, rgba(255,90,44,0.32) 0%, rgba(255,90,44,0.10) 34%, transparent 66%);
          animation: bdLavaBreathe 7s ease-in-out infinite alternate;
          will-change: opacity;
        }

        .bd-embers { position: absolute; inset: 0; overflow: hidden; }
        .bd-ember {
          position: absolute; bottom: -6vh;
          border-radius: 9999px; opacity: 0;
          will-change: transform, opacity;
          animation-name: bdEmberRise;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
        .bd-dust {
          position: absolute; bottom: -4vh;
          width: 1.5px; height: 1.5px;
          border-radius: 9999px; opacity: 0;
          background: rgba(200,196,210,0.6);
          will-change: transform, opacity;
          animation-name: bdDustRise;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }

        .bd-sheen {
          position: absolute; inset: 0;
          background: radial-gradient(120% 60% at 50% -10%, rgba(244,242,236,0.05), transparent 60%);
        }
        /* Static SVG noise — no repaint cost, just a texture layer */
        .bd-grain {
          position: absolute; inset: 0; opacity: 0.032;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)'/%3E%3C/svg%3E");
          background-size: 180px 180px;
        }
        .bd-vignette {
          position: absolute; inset: 0;
          background: linear-gradient(to top, rgba(10,10,12,0.52) 0%, transparent 28%);
        }

        @keyframes bdDriftA {
          from { transform: translate3d(0,0,0) scale(1); }
          to   { transform: translate3d(9vh,7vh,0) scale(1.14); }
        }
        @keyframes bdDriftB {
          from { transform: translate3d(0,0,0) scale(1); }
          to   { transform: translate3d(-10vh,-8vh,0) scale(1.18); }
        }
        @keyframes bdBreathe {
          from { opacity: 0.22; }
          to   { opacity: 0.32; }
        }
        @keyframes bdLavaBreathe {
          from { opacity: 0.8; }
          to   { opacity: 1; }
        }
        @keyframes bdEmberRise {
          0%   { transform: translate3d(0,0,0); opacity: 0; }
          10%  { opacity: 0.85; }
          82%  { opacity: 0.45; }
          100% { transform: translate3d(var(--drift), -110vh, 0); opacity: 0; }
        }
        @keyframes bdDustRise {
          0%   { transform: translate3d(0,0,0); opacity: 0; }
          15%  { opacity: 0.35; }
          80%  { opacity: 0.18; }
          100% { transform: translate3d(var(--drift), -105vh, 0); opacity: 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          .bd-blob, .bd-lava-bloom { animation: none; }
          .bd-blob-summit { opacity: 0.22; }
          .bd-blob-warm   { opacity: 0.12; }
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
