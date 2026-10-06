/**
 * The duel emote props, built from primitives at runtime.
 *
 * Every emote is a small 3D object that fits a unit sphere, with its own idle
 * animation: the crown spins under drifting sparkles, the skull's jaw
 * chatters, the rocket climbs on a flickering flame, the hourglass flips.
 * Nothing is loaded from disk, so the props cost no assets and no network;
 * the whole set is a few hundred triangles each.
 *
 * `buildEmoteModel(prop)` returns the object and an `animate(t)` that poses
 * it for an age of `t` seconds since it appeared. The pose at a given `t` is
 * pure in `t`, so both players see the same thing and a paused frame is
 * reproducible. The stage (emoteStage.ts) owns cameras, lights and the
 * pop-in / pop-out envelope.
 */

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { EmoteProp } from "../../../net/emotes";

export interface EmoteModel {
  /** Add this to a scene. Centred on the origin, roughly within radius 1. */
  group: THREE.Group;
  /** Pose the model for an age of `t` seconds. Pure in `t`. */
  animate(t: number): void;
  /** Release geometry and materials. */
  dispose(): void;
}

// ── Palette ────────────────────────────────────────────────────────────────
// The game's duotone (DESIGN.md): signal-lime is "you / ascent", ember is
// "the rising ground / danger". Everything else is a neutral so the two
// poles stay the loudest colours on screen.
const SIGNAL = 0xcbf24d;
const EMBER = 0xff5a2c;
const EMBER_DEEP = 0xc2300e;
const IVORY = 0xf4f2ec;
const GOLD = 0xf2c14e;
const GOLD_DEEP = 0xb8862b;
const STEEL = 0xd8dde6;
const CORE = 0x101012;
const ROSE = 0xff4f7a;
const SKY = 0x6bb8ff;

const TAU = Math.PI * 2;

/** Deterministic pseudo-noise in [-1, 1] from a time and a seed. */
function wobble(t: number, seed: number): number {
  return Math.sin(t * (7.3 + seed * 1.7) + seed * 12.9) * 0.6 + Math.sin(t * (13.1 + seed) + seed * 3.1) * 0.4;
}

/** Fraction of a repeating cycle, in [0, 1). */
function cycle(t: number, period: number, phase = 0): number {
  const x = t / period + phase;
  return x - Math.floor(x);
}

function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function standard(opts: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05, ...opts });
}

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(geometry, material);
}

/** Dispose every geometry and material under `root`. */
function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}

interface Particle {
  mesh: THREE.Mesh;
  seed: number;
}

/** `n` small meshes sharing a geometry, each with its own material so opacity can differ. */
function particles(n: number, geometry: THREE.BufferGeometry, material: () => THREE.Material, parent: THREE.Object3D): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < n; i++) {
    const m = mesh(geometry, material());
    parent.add(m);
    out.push({ mesh: m, seed: i / n });
  }
  return out;
}

// ── Crown ──────────────────────────────────────────────────────────────────
function buildCrown(): EmoteModel {
  const group = new THREE.Group();
  const gold = standard({ color: GOLD, metalness: 0.85, roughness: 0.28 });
  const velvet = standard({ color: 0x5a1a2a, roughness: 0.9 });

  const bandGold = standard({ color: GOLD, metalness: 0.85, roughness: 0.28, side: THREE.DoubleSide });
  const band = mesh(new THREE.CylinderGeometry(0.72, 0.62, 0.5, 10, 1, true), bandGold);
  group.add(band);
  const lining = mesh(new THREE.CylinderGeometry(0.66, 0.58, 0.46, 10), velvet);
  lining.position.y = -0.01;
  group.add(lining);
  const rim = mesh(new THREE.TorusGeometry(0.66, 0.06, 8, 24), gold);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -0.25;
  group.add(rim);

  const gemColors = [EMBER, SKY, SIGNAL, ROSE, SKY];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    const point = mesh(new THREE.ConeGeometry(0.22, 0.55, 4), gold);
    point.position.set(Math.cos(a) * 0.62, 0.45, Math.sin(a) * 0.62);
    point.rotation.z = -Math.cos(a) * 0.22;
    point.rotation.x = Math.sin(a) * 0.22;
    point.rotation.y = -a;
    group.add(point);
    const gem = mesh(new THREE.OctahedronGeometry(0.1), standard({ color: gemColors[i], emissive: gemColors[i], emissiveIntensity: 0.35, roughness: 0.2 }));
    gem.position.set(Math.cos(a) * 0.66, 0.78, Math.sin(a) * 0.66);
    group.add(gem);
  }
  const frontGem = mesh(new THREE.OctahedronGeometry(0.16), standard({ color: EMBER, emissive: EMBER, emissiveIntensity: 0.5, roughness: 0.15 }));
  frontGem.position.set(0, 0.02, 0.7);
  group.add(frontGem);

  const sparkles = particles(7, new THREE.OctahedronGeometry(0.06), () => standard({ color: IVORY, emissive: IVORY, emissiveIntensity: 1.2, transparent: true }), group);

  return {
    group,
    animate(t) {
      group.rotation.y = t * 1.1;
      group.rotation.x = 0.28 + Math.sin(t * 2.1) * 0.05;
      group.position.y = Math.sin(t * 2.6) * 0.05;
      frontGem.rotation.y = t * 2;
      for (const { mesh: m, seed } of sparkles) {
        const a = seed * TAU + t * 0.9;
        const life = cycle(t, 1.6, seed);
        m.position.set(Math.cos(a) * 1.05, -0.3 + life * 1.3, Math.sin(a) * 1.05);
        const s = Math.sin(life * Math.PI);
        m.scale.setScalar(0.4 + s * 1.1);
        m.rotation.set(t * 3 + seed, t * 2, 0);
        (m.material as THREE.MeshStandardMaterial).opacity = s;
      }
    },
    dispose: () => disposeTree(group),
  };
}

// ── Skull ──────────────────────────────────────────────────────────────────
function buildSkull(): EmoteModel {
  const group = new THREE.Group();
  const bone = standard({ color: 0xece6d6, roughness: 0.62 });
  const dark = standard({ color: CORE, roughness: 1 });

  const cranium = mesh(new THREE.SphereGeometry(0.68, 28, 20), bone);
  cranium.scale.set(1, 1.06, 1.08);
  cranium.position.y = 0.12;
  group.add(cranium);
  const cheeks = mesh(new THREE.BoxGeometry(1.0, 0.42, 0.9), bone);
  cheeks.position.set(0, -0.22, 0.05);
  group.add(cheeks);

  const eyeMats: THREE.MeshStandardMaterial[] = [];
  for (const sx of [-1, 1]) {
    const socket = mesh(new THREE.SphereGeometry(0.2, 18, 12), dark);
    socket.scale.set(1.15, 1, 0.5);
    socket.position.set(sx * 0.27, 0.12, 0.62);
    group.add(socket);
    const glow = standard({ color: EMBER, emissive: EMBER, emissiveIntensity: 1.4, roughness: 0.3 });
    eyeMats.push(glow);
    const eye = mesh(new THREE.SphereGeometry(0.085, 14, 10), glow);
    eye.position.set(sx * 0.27, 0.1, 0.7);
    group.add(eye);
  }
  const nose = mesh(new THREE.ConeGeometry(0.09, 0.17, 3), dark);
  nose.position.set(0, -0.15, 0.73);
  nose.rotation.x = Math.PI;
  group.add(nose);

  for (let i = 0; i < 4; i++) {
    const tooth = mesh(new THREE.BoxGeometry(0.13, 0.15, 0.1), bone);
    tooth.position.set(-0.24 + i * 0.16, -0.5, 0.5);
    group.add(tooth);
  }

  const jaw = new THREE.Group();
  jaw.position.set(0, -0.5, 0.05);
  const jawBone = mesh(new THREE.BoxGeometry(0.74, 0.24, 0.52), bone);
  jawBone.position.set(0, -0.14, 0.12);
  jaw.add(jawBone);
  for (let i = 0; i < 4; i++) {
    const tooth = mesh(new THREE.BoxGeometry(0.12, 0.12, 0.1), bone);
    tooth.position.set(-0.24 + i * 0.16, 0.04, 0.42);
    jaw.add(tooth);
  }
  group.add(jaw);

  const crack = mesh(new THREE.BoxGeometry(0.04, 0.5, 0.04), standard({ color: EMBER_DEEP, emissive: EMBER, emissiveIntensity: 0.6 }));
  crack.position.set(0.22, 0.5, 0.55);
  crack.rotation.set(0.5, 0, 0.4);
  group.add(crack);

  const embers = particles(6, new THREE.SphereGeometry(0.035, 8, 6), () => standard({ color: EMBER, emissive: EMBER, emissiveIntensity: 2, transparent: true }), group);

  return {
    group,
    animate(t) {
      // Laughing: a chattering jaw and a head that rocks with it.
      const laugh = Math.max(0, Math.sin(t * 9.5));
      jaw.rotation.x = laugh * 0.42;
      group.rotation.z = Math.sin(t * 4.75) * 0.11;
      group.rotation.y = Math.sin(t * 1.2) * 0.4;
      group.rotation.x = 0.08 + laugh * 0.06;
      group.position.y = laugh * 0.05;
      const glow = 1.1 + Math.sin(t * 6) * 0.5;
      for (const m of eyeMats) m.emissiveIntensity = glow;
      for (const { mesh: m, seed } of embers) {
        const life = cycle(t, 1.4, seed);
        const sx = seed < 0.5 ? -0.27 : 0.27;
        m.position.set(sx + wobble(t, seed) * 0.05, 0.12 + life * 0.7, 0.72 + life * 0.25);
        m.scale.setScalar(1 - life);
        (m.material as THREE.MeshStandardMaterial).opacity = (1 - life) * 0.9;
      }
    },
    dispose: () => disposeTree(group),
  };
}

// ── Rocket ─────────────────────────────────────────────────────────────────
function buildRocket(): EmoteModel {
  const group = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(0.88);
  group.add(body);
  const hull = standard({ color: IVORY, roughness: 0.4, metalness: 0.1 });
  const ember = standard({ color: EMBER, roughness: 0.45 });

  body.add(mesh(new THREE.CylinderGeometry(0.27, 0.31, 1.0, 20), hull));
  const nose = mesh(new THREE.ConeGeometry(0.28, 0.52, 20), ember);
  nose.position.y = 0.76;
  body.add(nose);
  const ring = mesh(new THREE.TorusGeometry(0.13, 0.035, 10, 24), standard({ color: GOLD, metalness: 0.8, roughness: 0.3 }));
  ring.position.set(0, 0.16, 0.27);
  body.add(ring);
  const glass = mesh(new THREE.CircleGeometry(0.11, 20), standard({ color: SKY, emissive: SKY, emissiveIntensity: 0.6, roughness: 0.1 }));
  glass.position.set(0, 0.16, 0.285);
  body.add(glass);
  for (let i = 0; i < 3; i++) {
    const fin = mesh(new THREE.BoxGeometry(0.06, 0.42, 0.3), ember);
    const a = (i / 3) * TAU + Math.PI / 2;
    fin.position.set(Math.cos(a) * 0.36, -0.42, Math.sin(a) * 0.36);
    fin.rotation.y = -a;
    fin.rotation.z = 0.25 * Math.cos(a);
    fin.rotation.x = -0.25 * Math.sin(a);
    body.add(fin);
  }
  const nozzle = mesh(new THREE.CylinderGeometry(0.15, 0.22, 0.16, 16), standard({ color: 0x3a3540, metalness: 0.6, roughness: 0.4 }));
  nozzle.position.y = -0.56;
  body.add(nozzle);

  const flameOuter = mesh(new THREE.ConeGeometry(0.2, 0.7, 14), standard({ color: 0xffb020, emissive: EMBER, emissiveIntensity: 1.4, transparent: true, opacity: 0.9 }));
  flameOuter.rotation.x = Math.PI;
  flameOuter.position.y = -0.98;
  body.add(flameOuter);
  const flameInner = mesh(new THREE.ConeGeometry(0.1, 0.45, 10), standard({ color: 0xfff6c8, emissive: 0xfff2a8, emissiveIntensity: 1.8 }));
  flameInner.rotation.x = Math.PI;
  flameInner.position.y = -0.86;
  body.add(flameInner);

  const puffs = particles(7, new THREE.SphereGeometry(0.1, 10, 8), () => standard({ color: 0x9a948c, roughness: 1, transparent: true }), group);

  return {
    group,
    animate(t) {
      body.rotation.z = -0.38 + Math.sin(t * 1.3) * 0.05;
      body.rotation.y = Math.sin(t * 0.8) * 0.35;
      body.position.set(0.1, -0.1 + Math.sin(t * 5.2) * 0.035 + Math.min(0.25, t * 0.08), 0);
      const flick = 0.85 + Math.abs(wobble(t * 1.5, 1)) * 0.5;
      flameOuter.scale.set(1, flick, 1);
      flameInner.scale.set(1, 0.8 + flick * 0.4, 1);
      for (const { mesh: m, seed } of puffs) {
        const life = cycle(t, 1.3, seed);
        // Puffs leave the nozzle (down-left of the tilted body) and fall away.
        m.position.set(-0.3 - life * 0.7 + wobble(seed * 10, seed) * 0.08, -0.82 - life * 0.5, Math.sin(seed * TAU) * 0.2);
        m.scale.setScalar(0.4 + life * 1.6);
        (m.material as THREE.MeshStandardMaterial).opacity = (1 - life) * 0.55;
      }
    },
    dispose: () => disposeTree(group),
  };
}

// ── Flame ──────────────────────────────────────────────────────────────────
/** A flame tongue: a teardrop lathe, base at y = -0.62, tip at the top. */
function tongueGeometry(height: number, width: number): THREE.BufferGeometry {
  const pts = [
    [0, 0], [0.62, 0.08], [0.9, 0.26], [1, 0.46], [0.86, 0.66], [0.56, 0.82], [0.26, 0.93], [0, 1],
  ].map(([r, y]) => new THREE.Vector2(r * width, -0.62 + y * height));
  return new THREE.LatheGeometry(pts, 20);
}

function buildFlame(): EmoteModel {
  const group = new THREE.Group();
  const tongues: { mesh: THREE.Mesh; seed: number; base: number }[] = [];
  const spec: [number, number, number, number, number, number][] = [
    // height, width, x offset, colour, emissive, opacity
    [1.5, 0.52, 0, EMBER, EMBER_DEEP, 0.95],
    [1.05, 0.36, 0.02, 0xffb020, EMBER, 1],
    [0.62, 0.2, -0.02, 0xfff2a8, 0xffe08a, 1],
    [0.78, 0.22, -0.4, EMBER, EMBER_DEEP, 0.9],
    [0.66, 0.2, 0.42, EMBER, EMBER_DEEP, 0.9],
  ];
  spec.forEach(([h, w, x, color, emissive, opacity], i) => {
    const tongue = mesh(tongueGeometry(h, w), standard({ color, emissive, emissiveIntensity: 0.8 + i * 0.3, transparent: opacity < 1, opacity, roughness: 0.85, depthWrite: opacity >= 1 }));
    tongue.position.x = x;
    group.add(tongue);
    tongues.push({ mesh: tongue, seed: i, base: x });
  });
  const coal = mesh(new THREE.DodecahedronGeometry(0.58, 0), standard({ color: 0x2a1410, emissive: EMBER_DEEP, emissiveIntensity: 0.4, roughness: 1, flatShading: true }));
  coal.scale.set(1.2, 0.36, 0.9);
  coal.position.y = -0.74;
  group.add(coal);

  const embers = particles(9, new THREE.TetrahedronGeometry(0.05), () => standard({ color: 0xffb020, emissive: EMBER, emissiveIntensity: 2.2, transparent: true }), group);

  return {
    group,
    animate(t) {
      group.rotation.y = Math.sin(t * 0.7) * 0.35;
      for (const { mesh: m, seed, base } of tongues) {
        const sy = 1 + wobble(t * 1.4, seed) * 0.14;
        const sx = 1 + wobble(t * 1.1, seed + 5) * 0.1;
        m.scale.set(sx, sy, sx);
        // The tongues lean with a slow gust and lick side to side at the tip.
        m.rotation.z = Math.sin(t * 1.7 + seed) * 0.08 + wobble(t * 0.8, seed + 9) * 0.06;
        m.position.x = base + wobble(t * 0.9, seed + 3) * 0.04;
        m.rotation.y = t * (0.5 + seed * 0.4);
      }
      for (const { mesh: m, seed } of embers) {
        const life = cycle(t, 1.5, seed);
        m.position.set(Math.sin(seed * TAU) * 0.3 + wobble(t, seed) * 0.1, -0.4 + life * 1.5, Math.cos(seed * TAU) * 0.25);
        m.scale.setScalar(1.2 - life);
        m.rotation.set(t * 4, t * 3 + seed, 0);
        (m.material as THREE.MeshStandardMaterial).opacity = Math.sin(life * Math.PI);
      }
    },
    dispose: () => disposeTree(group),
  };
}

// ── Thumbs up ──────────────────────────────────────────────────────────────
function buildThumbs(): EmoteModel {
  const group = new THREE.Group();
  const hand = new THREE.Group();
  group.add(hand);
  // A climbing glove rather than a hand: ivory with a lime cuff.
  const glove = standard({ color: IVORY, roughness: 0.78 });
  const cuff = standard({ color: CORE, roughness: 0.6 });
  const trim = standard({ color: SIGNAL, emissive: SIGNAL, emissiveIntensity: 0.25, roughness: 0.5 });

  const fist = mesh(new RoundedBoxGeometry(0.78, 0.74, 0.62, 4, 0.2), glove);
  fist.position.y = -0.08;
  hand.add(fist);
  // Four curled fingers across the front, each a fat capsule; the row reads as knuckles.
  for (let i = 0; i < 4; i++) {
    const finger = mesh(new THREE.CapsuleGeometry(0.115 - i * 0.006, 0.5, 4, 12), glove);
    finger.rotation.z = Math.PI / 2;
    finger.position.set(0.04, 0.17 - i * 0.185, 0.36);
    hand.add(finger);
    const crease = mesh(new THREE.TorusGeometry(0.1 - i * 0.005, 0.012, 6, 20), standard({ color: 0xcfc8ba, roughness: 0.9 }));
    crease.position.set(0.04, 0.17 - i * 0.185, 0.36);
    crease.rotation.y = Math.PI / 2;
    hand.add(crease);
  }
  // A short, thick thumb pointing up from the top-left corner.
  const thumb = mesh(new THREE.CapsuleGeometry(0.15, 0.26, 4, 14), glove);
  thumb.position.set(-0.3, 0.46, 0.08);
  thumb.rotation.z = 0.3;
  hand.add(thumb);
  const knuckle = mesh(new THREE.SphereGeometry(0.17, 14, 10), glove);
  knuckle.position.set(-0.22, 0.24, 0.1);
  hand.add(knuckle);
  const wrist = mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.34, 18), cuff);
  wrist.position.y = -0.6;
  hand.add(wrist);
  const band = mesh(new THREE.TorusGeometry(0.34, 0.045, 8, 28), trim);
  band.rotation.x = Math.PI / 2;
  band.position.y = -0.46;
  hand.add(band);
  hand.scale.setScalar(0.92);

  const stars = particles(6, new THREE.OctahedronGeometry(0.07), () => standard({ color: SIGNAL, emissive: SIGNAL, emissiveIntensity: 1.4, transparent: true }), group);

  return {
    group,
    animate(t) {
      // A punchy double bounce, then a settled nod. Turned a little so the knuckles catch the light.
      const bounce = Math.abs(Math.sin(t * 4.2)) * (t < 1.6 ? 0.14 : 0.06);
      hand.position.y = bounce - 0.02;
      hand.rotation.z = -0.2 + Math.sin(t * 4.2) * 0.08;
      hand.rotation.y = -0.55 + Math.sin(t * 1.4) * 0.25;
      hand.rotation.x = 0.12;
      for (const { mesh: m, seed } of stars) {
        const life = clamp01((t - seed * 0.25) / 0.9);
        const a = seed * TAU + 0.6;
        const r = 0.5 + life * 0.9;
        m.position.set(Math.cos(a) * r, 0.2 + Math.sin(a) * r * 0.7 + life * 0.2, 0.3);
        m.scale.setScalar(life <= 0 || life >= 1 ? 0.0001 : Math.sin(life * Math.PI) * 1.3);
        m.rotation.set(0, 0, t * 5 + seed);
        (m.material as THREE.MeshStandardMaterial).opacity = 1 - life;
      }
    },
    dispose: () => disposeTree(group),
  };
}

// ── Heart ──────────────────────────────────────────────────────────────────
function heartShape(): THREE.Shape {
  const s = new THREE.Shape();
  const x = 0, y = 0;
  s.moveTo(x + 5, y + 5);
  s.bezierCurveTo(x + 5, y + 5, x + 4, y, x, y);
  s.bezierCurveTo(x - 6, y, x - 6, y + 7, x - 6, y + 7);
  s.bezierCurveTo(x - 6, y + 11, x - 3, y + 15.4, x + 5, y + 19);
  s.bezierCurveTo(x + 12, y + 15.4, x + 16, y + 11, x + 16, y + 7);
  s.bezierCurveTo(x + 16, y + 7, x + 16, y, x + 10, y);
  s.bezierCurveTo(x + 7, y, x + 5, y + 5, x + 5, y + 5);
  return s;
}

function heartGeometry(size: number, depth: number): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(heartShape(), { depth, bevelEnabled: true, bevelThickness: depth * 0.5, bevelSize: depth * 0.45, bevelSegments: 4, curveSegments: 14 });
  // The path draws point-up with its centre near (5, 9.5); turn it the right
  // way up and centre it.
  geo.rotateZ(Math.PI);
  geo.translate(5, 9.5, -depth / 2);
  geo.scale(size / 12, size / 12, size / 12);
  return geo;
}

function buildHeart(): EmoteModel {
  const group = new THREE.Group();
  const rose = standard({ color: ROSE, emissive: 0x7a0a2a, emissiveIntensity: 0.35, roughness: 0.3 });
  const heart = mesh(heartGeometry(1.05, 0.3), rose);
  group.add(heart);
  const minis = particles(5, heartGeometry(0.22, 0.08), () => standard({ color: ROSE, emissive: ROSE, emissiveIntensity: 0.6, transparent: true }), group);

  return {
    group,
    animate(t) {
      // Lub-dub: two quick swells per beat.
      const p = cycle(t, 0.95);
      const beat = 1 + 0.16 * Math.exp(-Math.pow(p - 0.1, 2) * 320) + 0.1 * Math.exp(-Math.pow(p - 0.3, 2) * 320);
      heart.scale.set(beat, beat, beat);
      heart.rotation.y = Math.sin(t * 1.3) * 0.5;
      heart.rotation.z = Math.sin(t * 2.6) * 0.04;
      for (const { mesh: m, seed } of minis) {
        const life = cycle(t, 1.8, seed);
        m.position.set((seed - 0.5) * 1.4 + Math.sin(t * 2 + seed * 9) * 0.1, -0.2 + life * 1.5, -0.2 + seed * 0.3);
        m.rotation.y = t * 2 + seed * 5;
        m.scale.setScalar(0.6 + Math.sin(life * Math.PI) * 0.6);
        (m.material as THREE.MeshStandardMaterial).opacity = Math.sin(life * Math.PI) * 0.9;
      }
    },
    dispose: () => disposeTree(group),
  };
}

// ── Lightning bolt ─────────────────────────────────────────────────────────
function boltGeometry(depth: number): THREE.BufferGeometry {
  const pts: [number, number][] = [
    [-0.08, 1.0], [-0.56, 0.08], [-0.12, 0.08], [-0.36, -1.0], [0.56, -0.08], [0.1, -0.08], [0.36, 1.0],
  ];
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 2 });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

function buildBolt(): EmoteModel {
  const group = new THREE.Group();
  const yellow = standard({ color: 0xffe14d, emissive: 0xffc800, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.1 });
  const bolt = mesh(boltGeometry(0.22), yellow);
  group.add(bolt);
  const haloMat = standard({ color: 0xfff2a8, emissive: 0xffe14d, emissiveIntensity: 1, transparent: true, opacity: 0.22, depthWrite: false });
  const halo = mesh(boltGeometry(0.1), haloMat);
  halo.scale.set(1.35, 1.2, 1);
  halo.position.z = -0.2;
  group.add(halo);
  const sparks = particles(8, new THREE.TetrahedronGeometry(0.05), () => standard({ color: IVORY, emissive: 0xffe14d, emissiveIntensity: 2, transparent: true }), group);

  return {
    group,
    animate(t) {
      // Strikes on arrival and then every so often; otherwise a live hum.
      const strike = Math.max(0, 1 - cycle(t, 1.7) * 3.2);
      const hum = 0.75 + Math.abs(wobble(t * 2, 3)) * 0.5;
      yellow.emissiveIntensity = hum + strike * 1.6;
      haloMat.opacity = 0.14 + strike * 0.5;
      group.rotation.y = Math.sin(t * 1.9) * 0.55;
      group.rotation.z = -0.12 + wobble(t * 3, 7) * 0.03 * (1 + strike * 3);
      group.position.set(wobble(t * 4, 2) * 0.03 * (1 + strike * 4), 0.05, 0);
      const s = 1 + strike * 0.18;
      bolt.scale.set(s, s, s);
      for (const { mesh: m, seed } of sparks) {
        const life = cycle(t, 1.7, seed * 0.3);
        const a = seed * TAU;
        const r = 0.3 + life * 1.1;
        m.position.set(Math.cos(a) * r, Math.sin(a) * r * 1.2, 0.2);
        m.scale.setScalar(Math.max(0.0001, (1 - life) * 1.4));
        m.rotation.set(t * 6, t * 5 + seed, 0);
        (m.material as THREE.MeshStandardMaterial).opacity = (1 - life) * 0.9;
      }
    },
    dispose: () => disposeTree(group),
  };
}

// ── Hourglass ──────────────────────────────────────────────────────────────
function buildHourglass(): EmoteModel {
  const group = new THREE.Group();
  const frameMat = standard({ color: 0x3a2a24, roughness: 0.7 });
  const brass = standard({ color: GOLD_DEEP, metalness: 0.8, roughness: 0.35 });
  const sandMat = standard({ color: GOLD, roughness: 0.9 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.22, roughness: 0.08, metalness: 0, side: THREE.DoubleSide, depthWrite: false });

  const profile = [
    [0.44, -0.72], [0.46, -0.6], [0.3, -0.25], [0.08, -0.03], [0.08, 0.03], [0.3, 0.25], [0.46, 0.6], [0.44, 0.72],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const glass = mesh(new THREE.LatheGeometry(profile, 28), glassMat);
  group.add(glass);
  for (const sy of [-1, 1]) {
    const cap = mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.09, 24), frameMat);
    cap.position.y = sy * 0.77;
    group.add(cap);
    const lip = mesh(new THREE.TorusGeometry(0.56, 0.025, 8, 32), brass);
    lip.rotation.x = Math.PI / 2;
    lip.position.y = sy * 0.73;
    group.add(lip);
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + Math.PI / 6;
    const post = mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.56, 10), brass);
    post.position.set(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5);
    group.add(post);
  }
  // Two piles, one per bulb. `a` starts full at the top, `b` empty at the bottom.
  const pileA = mesh(new THREE.ConeGeometry(0.28, 0.36, 20), sandMat);
  pileA.rotation.x = Math.PI;
  pileA.position.y = 0.38;
  group.add(pileA);
  const pileB = mesh(new THREE.ConeGeometry(0.4, 0.3, 20), sandMat);
  pileB.position.y = -0.56;
  group.add(pileB);
  const streamDown = mesh(new THREE.CylinderGeometry(0.018, 0.03, 0.62, 8), sandMat);
  streamDown.position.y = -0.33;
  group.add(streamDown);
  const streamUp = mesh(new THREE.CylinderGeometry(0.03, 0.018, 0.62, 8), sandMat);
  streamUp.position.y = 0.33;
  group.add(streamUp);

  const PERIOD = 2.6;
  return {
    group,
    animate(t) {
      const n = Math.floor(t / PERIOD);
      const p = t / PERIOD - n;
      // The sand runs for most of the period, then the glass flips over.
      const run = clamp01(p / 0.82);
      const flip = p > 0.82 ? easeOutBack((p - 0.82) / 0.18) : 0;
      const odd = n % 2 === 1;
      // On even turns A drains and B fills; on odd turns, after a flip, the roles swap.
      const drain = odd ? 1 - run : run;
      const full = 1 - drain * 0.85;
      const empty = 0.15 + drain * 0.85;
      pileA.scale.set(full, full, full);
      pileB.scale.set(empty, empty, empty);
      // The stream always falls from the draining bulb toward the filling one.
      streamDown.visible = !odd && run < 1;
      streamUp.visible = odd && run < 1;
      group.rotation.z = Math.PI * (n + flip);
      group.rotation.y = Math.sin(t * 1.1) * 0.35;
      group.position.y = Math.sin(flip * Math.PI) * 0.12;
    },
    dispose: () => disposeTree(group),
  };
}

// ── Crossed swords ─────────────────────────────────────────────────────────
function bladeGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.065, -0.62);
  s.lineTo(0.065, -0.62);
  s.lineTo(0.065, 0.5);
  s.lineTo(0, 0.74);
  s.lineTo(-0.065, 0.5);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.02, bevelSegments: 2 });
  geo.translate(0, 0, -0.0175);
  return geo;
}

function buildSword(steel: THREE.Material, gold: THREE.Material, grip: THREE.Material): THREE.Group {
  const sword = new THREE.Group();
  const blade = mesh(bladeGeometry(), steel);
  blade.position.y = 0.25;
  sword.add(blade);
  const guard = mesh(new THREE.BoxGeometry(0.42, 0.07, 0.11), gold);
  guard.position.y = -0.4;
  sword.add(guard);
  const handle = mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.34, 12), grip);
  handle.position.y = -0.62;
  sword.add(handle);
  const pommel = mesh(new THREE.SphereGeometry(0.075, 14, 10), gold);
  pommel.position.y = -0.83;
  sword.add(pommel);
  return sword;
}

function buildSwords(): EmoteModel {
  const group = new THREE.Group();
  const steel = standard({ color: STEEL, metalness: 0.9, roughness: 0.22 });
  const gold = standard({ color: GOLD, metalness: 0.85, roughness: 0.3 });
  const grip = standard({ color: 0x3a2a24, roughness: 0.8 });
  const left = buildSword(steel, gold, grip);
  const right = buildSword(steel, gold, grip);
  left.position.set(-0.05, 0, 0.08);
  right.position.set(0.05, 0, -0.08);
  group.add(left, right);
  const sparks = particles(10, new THREE.TetrahedronGeometry(0.045), () => standard({ color: IVORY, emissive: 0xffe14d, emissiveIntensity: 2.4, transparent: true }), group);

  const REST = 0.62;
  return {
    group,
    animate(t) {
      // Swing in from the sides and clash at ~0.3 s, then rest crossed with a slow sway.
      const swing = easeOutBack(clamp01(t / 0.32));
      const open = 1.35 - (1.35 - REST) * swing;
      const sway = Math.sin(t * 1.7) * 0.04;
      left.rotation.z = open + sway;
      right.rotation.z = -open - sway;
      group.rotation.y = Math.sin(t * 1.2) * 0.45;
      group.position.y = 0.05 + Math.sin(t * 2.4) * 0.03;
      const clashAge = t - 0.28;
      for (const { mesh: m, seed } of sparks) {
        const life = clamp01(clashAge / 0.75);
        const a = seed * TAU + 0.3;
        const r = life * (0.6 + seed * 0.8);
        m.position.set(Math.cos(a) * r, 0.12 + Math.sin(a) * r - life * life * 0.5, 0.15);
        const alive = clashAge > 0 && life < 1;
        m.scale.setScalar(alive ? (1 - life) * 1.3 : 0.0001);
        m.rotation.set(t * 7 + seed, t * 5, 0);
        (m.material as THREE.MeshStandardMaterial).opacity = alive ? 1 - life : 0;
      }
    },
    dispose: () => disposeTree(group),
  };
}

// ── Registry ───────────────────────────────────────────────────────────────
const BUILDERS: Record<EmoteProp, () => EmoteModel> = {
  crown: buildCrown,
  skull: buildSkull,
  rocket: buildRocket,
  flame: buildFlame,
  thumbs: buildThumbs,
  heart: buildHeart,
  bolt: buildBolt,
  hourglass: buildHourglass,
  swords: buildSwords,
};

/** Every prop with a model, in catalog order. A test pins this against the catalog. */
export const MODELLED_PROPS = Object.keys(BUILDERS) as EmoteProp[];

/** Build a fresh model for `prop`. Each call returns its own object tree. */
export function buildEmoteModel(prop: EmoteProp): EmoteModel {
  return BUILDERS[prop]();
}
