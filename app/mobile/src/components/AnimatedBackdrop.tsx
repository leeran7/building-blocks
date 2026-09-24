import { useEffect, useMemo, useRef } from "react";
import { drawLava } from "@app/components/Game/lava";
import { prefersReducedMotion } from "../lib/motion";
import volcanoScene from "@app/../public/climb/volcano-tile.jpg";

/**
 * "Thermal Column" backdrop — dark tower above rising lava.
 *
 * Three gradient layers (no blur, no orbs): ember thermal bloom rising from
 * the lava band, a cool signal-lime summit corona at the top, and a barely-
 * visible amber haze strip mid-screen that breathes as one system.
 *
 * 12 ash spans drift horizontally — carried sideways by thermal convection,
 * not upward. This is the specific physics of the environment (not generic
 * particle systems). The lava canvas at the bottom is the game engine renderer.
 *
 * Backdrop does NOT re-key on navigation — it is the persistent world behind
 * the screens, not a page background.
 */
const ASH_COUNT = 12;
const LAVA_FPS = 30;

export function AnimatedBackdrop() {
  const ash = useMemo(
    () =>
      Array.from({ length: ASH_COUNT }, (_, i) => {
        const driftsRight = i < 8;
        const size = 1 + Math.round(Math.random() * 2);
        const isLime = i >= 9;
        return {
          key: i,
          top: 20 + Math.round(Math.random() * 55),
          left: driftsRight ? -2 : 102,
          size,
          dir: driftsRight ? 1 : -1,
          driftX: 40 + Math.round(Math.random() * 30),
          driftY: Math.round((Math.random() - 0.5) * 16),
          duration: 18 + Math.round(Math.random() * 20),
          delay: -Math.round(Math.random() * 35),
          color: isLime
            ? "rgba(203, 242, 77, 0.55)"
            : "rgba(244, 228, 196, 0.85)",
        };
      }),
    [],
  );

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-void">
      <div className="bd-scene" style={{ backgroundImage: `url(${volcanoScene})` }} />
      {/* Ember-orange thermal bloom rising from the lava band */}
      <div className="bd-thermal" />
      {/* Signal-lime summit corona — cold and stable at the top */}
      <div className="bd-summit" />
      {/* Barely-visible amber haze strip — imperceptible drift, one breathing system */}
      <div className="bd-haze" />

      {/* Real game lava, bottom */}
      <LavaCanvas />

      {/* Ash drifting horizontally via thermal convection */}
      <div className="bd-ash-field">
        {ash.map((a) => (
          <span
            key={a.key}
            className="bd-ash"
            style={
              {
                top: `${a.top}%`,
                left: `${a.left}%`,
                width: `${a.size}px`,
                height: `${a.size}px`,
                background: a.color,
                animationDuration: `${a.duration}s`,
                animationDelay: `${a.delay}s`,
                "--drift-x": `${a.driftX}vw`,
                "--drift-y": `${a.driftY}px`,
                "--dir": a.dir,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      {/* Full-edge radial vignette anchors all corners */}
      <div className="bd-vignette" />
      {/* Static SVG fractalNoise grain — texture without repaint cost */}
      <div className="bd-grain" />

      <style>{`
        .bd-scene {
          position: absolute; inset: 0;
          background-size: cover; background-position: center 30%;
          opacity: 0.75;
          filter: saturate(1.25) contrast(1.05);
          -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, #000 30%, #000 100%);
          mask-image: linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, #000 30%, #000 100%);
        }
        .bd-thermal {
          position: absolute; inset-inline: 0; bottom: 0; height: 80vh;
          background: radial-gradient(
            ellipse 90% 70% at 50% 105%,
            rgba(255, 90, 44, 0.28) 0%,
            rgba(255, 176, 32, 0.10) 38%,
            transparent 65%
          );
          animation: bdThermalPulse 11s ease-in-out infinite alternate;
          will-change: opacity;
        }
        .bd-summit {
          position: absolute; inset-inline: 0; top: 0; height: 55vh;
          background: radial-gradient(
            ellipse 75% 60% at 50% -5%,
            rgba(203, 242, 77, 0.13) 0%,
            rgba(203, 242, 77, 0.04) 45%,
            transparent 70%
          );
          animation: bdSummitBreathe 17s ease-in-out infinite alternate;
          will-change: opacity;
        }
        .bd-haze {
          position: absolute; inset-inline: 0; top: 38vh; height: 26vh;
          background: linear-gradient(to bottom,
            transparent 0%,
            rgba(255, 176, 32, 0.045) 40%,
            rgba(255, 176, 32, 0.055) 60%,
            transparent 100%
          );
          animation: bdHazeDrift 23s ease-in-out infinite alternate;
          will-change: transform, opacity;
        }

        .bd-lava-canvas {
          position: absolute; inset-inline: 0; bottom: 0;
          width: 100%; height: 26vh;
          display: block;
        }

        .bd-ash-field { position: absolute; inset: 0; overflow: hidden; }
        .bd-ash {
          position: absolute;
          border-radius: 9999px; opacity: 0;
          will-change: transform, opacity;
          animation-name: bdAshDrift;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }

        .bd-vignette {
          position: absolute; inset: 0;
          background: radial-gradient(
            ellipse 120% 110% at 50% 50%,
            transparent 40%,
            rgba(10, 10, 12, 0.35) 70%,
            rgba(10, 10, 12, 0.70) 100%
          );
        }
        .bd-grain {
          position: absolute; inset: 0; opacity: 0.028;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)'/%3E%3C/svg%3E");
          background-size: 180px 180px;
        }

        @keyframes bdThermalPulse {
          from { opacity: 0.82; }
          to   { opacity: 1.0;  }
        }
        @keyframes bdSummitBreathe {
          from { opacity: 0.80; }
          to   { opacity: 1.0;  }
        }
        @keyframes bdHazeDrift {
          from { opacity: 0.70; transform: translate3d(0, 0, 0); }
          to   { opacity: 1.0;  transform: translate3d(0, 4px, 0); }
        }
        @keyframes bdAshDrift {
          0%   { transform: translate3d(0, 0, 0); opacity: 0; }
          8%   { opacity: 0.55; }
          88%  { opacity: 0.30; }
          100% {
            transform: translate3d(
              calc(var(--drift-x) * var(--dir)),
              var(--drift-y),
              0
            );
            opacity: 0;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .bd-thermal, .bd-summit { animation: none; opacity: 1; }
          .bd-haze                { animation: none; opacity: 0.85; }
          .bd-ash                 { display: none; }
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

    const paint = (now: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      const tick = reduce ? 0 : (now - start) / (1000 / 30);
      const ui = Math.max(0.85, cssW / 420);
      const top = cssH * 0.44;
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

    const resize = () => {
      cssW = canvas.clientWidth;
      cssH = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(cssW * dpr));
      canvas.height = Math.max(1, Math.round(cssH * dpr));
      if (reduce) paint(0);
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
