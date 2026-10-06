/**
 * One WebGL canvas, many little 3D views.
 *
 * The emote layer has up to a dozen props on screen at once (the tray's
 * tiles, the icon beside each quick message, a bubble per player). A WebGL
 * context each would blow past the mobile WebView's context limit, so the
 * layer owns a single transparent canvas over everything, and each view is a
 * plain DOM box the stage renders into with a scissor rect, the way the
 * three.js "multiple elements" example does. The DOM boxes keep their own
 * layout, hit-testing and focus; the canvas is pointer-events: none.
 *
 * Views are posed from their age, so the same prop looks the same on both
 * players' screens, and the pop-in / pop-out envelope lives here so every
 * model gets it for free.
 */

import * as THREE from "three";
import type { EmoteProp } from "../../../net/emotes";
import { buildEmoteModel, type EmoteModel } from "./emoteModels";

export type ViewSide = "me" | "them" | "tray";

export interface EmoteViewSpec {
  /** The box to draw into. Read each frame, so it may move or resize. */
  el: HTMLElement;
  prop: EmoteProp;
  /** Which rim light the prop gets: lime for me, blue for the opponent, neutral in the tray. */
  side: ViewSide;
  /** When the view appeared (performance.now() ms). The pose is a function of age. */
  startedAt: number;
  /** When set, the view shrinks away over its last 350 ms. */
  durationMs?: number;
  /** Hold a settled pose instead of animating (prefers-reduced-motion). */
  still?: boolean;
}

export interface EmoteViewHandle {
  remove(): void;
}

export interface EmoteStage {
  /** Register a view; the stage starts drawing it on the next frame. */
  add(spec: EmoteViewSpec): EmoteViewHandle;
  /** Stop everything and release the GL context. */
  dispose(): void;
  /** True once the context is lost; views should fall back to glyphs. */
  readonly lost: boolean;
}

const RIM: Record<ViewSide, number> = { me: 0xcbf24d, them: 0x6bb8ff, tray: 0xfff1c8 };
/** The pop-out at the end of a timed view. */
export const OUTRO_MS = 350;
/** The pop-in: a short overshoot. */
const INTRO_S = 0.42;
/** The pose a still view holds: props have settled (swords crossed, sparks gone). */
const STILL_T = 1.1;
/** Frames per second when only tray tiles are showing; bubbles run at the display rate. */
const TRAY_FPS = 30;

interface View {
  spec: EmoteViewSpec;
  scene: THREE.Scene;
  model: EmoteModel;
  rim: THREE.PointLight;
}

function intro(age: number): number {
  if (age >= INTRO_S) return 1;
  const x = age / INTRO_S;
  // Overshoot to ~1.12 and settle.
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

/**
 * Create the stage on `canvas`, or null when WebGL is unavailable. The canvas
 * must be positioned over the area the views live in; `host` is the element
 * whose box the canvas fills.
 */
export function createEmoteStage(canvas: HTMLCanvasElement, host: HTMLElement): EmoteStage | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: "low-power" });
  } catch {
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setScissorTest(true);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  camera.position.set(0, 0.12, 4.4);
  camera.lookAt(0, 0, 0);

  const views = new Set<View>();
  let raf = 0;
  let lost = false;
  let disposed = false;
  let lastFrame = 0;
  let sizedW = 0;
  let sizedH = 0;

  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
    stop();
  };
  canvas.addEventListener("webglcontextlost", onLost);

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function schedule() {
    if (!raf && !lost && !disposed && views.size > 0) raf = requestAnimationFrame(frame);
  }

  function frame(now: number) {
    raf = 0;
    if (lost || disposed) return;
    const hostRect = host.getBoundingClientRect();
    const w = Math.max(1, Math.round(hostRect.width));
    const h = Math.max(1, Math.round(hostRect.height));
    if (w !== sizedW || h !== sizedH) {
      renderer.setSize(w, h, false);
      sizedW = w;
      sizedH = h;
    }

    let anyBubble = false;
    for (const v of views) if (v.spec.side !== "tray") anyBubble = true;
    const minGap = anyBubble ? 0 : 1000 / TRAY_FPS - 2;
    if (now - lastFrame >= minGap) {
      lastFrame = now;
      renderer.setScissor(0, 0, w, h);
      renderer.clear();
      for (const v of views) {
        const r = v.spec.el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        const x = r.left - hostRect.left;
        const yTop = r.top - hostRect.top;
        // Off the host entirely: skip (a tray scrolled out of view, for example).
        if (x + r.width < 0 || yTop + r.height < 0 || x > w || yTop > h) continue;
        const y = h - (yTop + r.height);
        renderer.setViewport(x, y, r.width, r.height);
        renderer.setScissor(x, y, r.width, r.height);
        camera.aspect = r.width / r.height;
        camera.updateProjectionMatrix();

        const ageMs = now - v.spec.startedAt;
        const t = v.spec.still ? STILL_T : Math.max(0, ageMs / 1000);
        v.model.animate(t);
        let s = v.spec.still ? 1 : intro(t);
        let lift = 0;
        if (v.spec.durationMs !== undefined) {
          const left = v.spec.durationMs - ageMs;
          if (left < OUTRO_MS) {
            const k = Math.max(0, left / OUTRO_MS);
            s *= 0.55 + 0.45 * k;
            lift = (1 - k) * 0.5;
          }
        }
        v.model.group.scale.multiplyScalar(s);
        v.model.group.position.y += lift;
        renderer.render(v.scene, camera);
        // Undo the envelope so the model's own animate() starts clean next frame.
        v.model.group.scale.multiplyScalar(1 / s);
        v.model.group.position.y -= lift;
      }
    }
    schedule();
  }

  const stage: EmoteStage = {
    get lost() {
      return lost;
    },
    add(spec) {
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xfff6e8, 0x1a1420, 1.25));
      const key = new THREE.DirectionalLight(0xffffff, 2.4);
      key.position.set(2.2, 3, 4);
      scene.add(key);
      const rim = new THREE.PointLight(RIM[spec.side], 9, 8, 1.6);
      rim.position.set(-2.2, 1.2, 1.6);
      scene.add(rim);
      const model = buildEmoteModel(spec.prop);
      scene.add(model.group);
      const view: View = { spec, scene, model, rim };
      views.add(view);
      schedule();
      return {
        remove() {
          if (!views.has(view)) return;
          views.delete(view);
          model.dispose();
          if (views.size === 0) stop();
        },
      };
    },
    dispose() {
      disposed = true;
      stop();
      for (const v of views) v.model.dispose();
      views.clear();
      canvas.removeEventListener("webglcontextlost", onLost);
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
  return stage;
}
