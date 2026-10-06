// Climb backdrop tile: a volcanic range seen from high above. Ash-grey cones
// with glowing craters, lava flows running down their flanks into a cracked,
// smouldering basin, and smoke rising from every vent. Rendered offline with
// the render-3d skill into public/climb/volcano-tile.jpg (see
// public/climb/README.md).
//
// The tile repeats vertically in the game, so the scene is periodic: every
// height, colour and plume is a function of z mod PERIOD, and an orthographic
// camera turns a z-shift of one PERIOD into a screen shift of exactly one
// frame height. Haze is keyed on elevation, not depth, for the same reason.
import * as THREE from 'three';

// Seeded PRNG: the tile must render identically every time.
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

const PERIOD = 40;                      // world z per tile repeat
const TILT = (42 * Math.PI) / 180;      // camera pitch below horizontal
const ASPECT = 2 / 3;                   // tile width / height (same as the old tile)
const TAU = Math.PI * 2;

const viewH = PERIOD * Math.sin(TILT);
const viewW = viewH * ASPECT;
const SPAN_X = viewW * 1.25;
const SPAN_Z = PERIOD * 3;              // the framed period plus one each side
const SEG_X = 460;
const SEG_Z = 2400;
const SHADOWS = true;

const wrap = (z) => ((z % PERIOD) + PERIOD) % PERIOD;
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a, b, v) => smooth(clamp01((v - a) / (b - a)));

// --- Periodic value noise ----------------------------------------------------
// Lattice cells divide PERIOD exactly and z lattice indices wrap, so every
// octave repeats along z with the tile.
function latticeHash(ix, iz, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z, cell, seed) {
  const nz = Math.round(PERIOD / cell);
  const gx = x / cell, gz = wrap(z) / cell;
  const ix = Math.floor(gx), iz = Math.floor(gz);
  const fx = smooth(gx - ix), fz = smooth(gz - iz);
  const z0 = ((iz % nz) + nz) % nz, z1 = (z0 + 1) % nz;
  const a = latticeHash(ix, z0, seed), b = latticeHash(ix + 1, z0, seed);
  const c = latticeHash(ix, z1, seed), d = latticeHash(ix + 1, z1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
const CELLS = [10, 5, 2.5, 1.25, 0.625, 0.3125, 0.15625];
function fbm(x, z, seed, octaves = CELLS.length) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * vnoise(x, z, CELLS[o], seed + o * 31);
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}
function ridged(x, z, seed, from, octaves) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let o = from; o < from + octaves; o++) {
    sum += amp * (1 - Math.abs(2 * vnoise(x, z, CELLS[o], seed + o * 17) - 1));
    norm += amp;
    amp *= 0.55;
  }
  return sum / norm;
}

// --- Volcanoes -------------------------------------------------------------------
// z is a phase (0..1) of the period. Each cone has a crater and a few lava
// flows leaving its rim at fixed bearings (0 = towards the camera).
const CONES = [
  { x: -2.0, z: 0.22, r: 9.0, h: 13.5, crater: 1.1, flows: [0.25, -0.6] },
  { x: 5.4, z: 0.56, r: 6.0, h: 8.5, crater: 0.75, flows: [-0.3] },
  { x: -5.6, z: 0.70, r: 4.8, h: 6.0, crater: 0.6, flows: [0.45] },
  { x: 1.6, z: 0.92, r: 7.0, h: 10.0, crater: 0.9, flows: [-0.4, 0.55] },
];

// Signed z distance to a cone in the nearest period copy.
function coneDz(z, cone) {
  let dz = wrap(z) - cone.z * PERIOD;
  if (dz > PERIOD / 2) dz -= PERIOD;
  if (dz < -PERIOD / 2) dz += PERIOD;
  return dz;
}

// Height plus the masks the colouring needs, for one point.
function sample(x, z) {
  // Rolling, eroded ground.
  // Lava-field ground: broad swells, blocky ridged rubble on top.
  let h = 1.8 * fbm(x, z, 11, 4) + 0.7 * ridged(x, z, 23, 2, 5) + 0.25 * ridged(x, z, 29, 4, 3);
  let lava = 0;
  let heat = 0;
  let coneMask = 0;

  for (const c of CONES) {
    const dx = x - c.x, dz = coneDz(z, c);
    const d = Math.hypot(dx, dz);
    if (d > c.r * 1.25) continue;
    const ang = Math.atan2(dx, dz);
    // Gullies carve the flanks: ridged noise in polar coordinates, so the
    // ridges run downhill. (The seam at the back of each cone is hidden.)
    const gully = 0.45 * ridged(ang * 7 + 0.8 * fbm(x, z, 43, 3), d * 0.6, 41, 2, 4)
      + 0.25 * ridged(x * 1.4, z * 1.4, 53, 3, 4);
    const t = clamp01(1 - d / c.r);
    let ch = c.h * Math.pow(t, 1.35) * (1 - gully * t * 0.5);
    // Crater: a bowl inside the rim, with a molten floor.
    if (d < c.crater * 1.6) {
      const rim = c.h * Math.pow(1 - (c.crater * 1.6) / c.r, 1.35);
      const k = d / (c.crater * 1.6);
      const bowl = rim + 0.35 - (1 - k * k) * 1.4;
      ch = Math.min(ch, bowl);
      if (d < c.crater) {
        lava = Math.max(lava, smoothstep(c.crater, c.crater * 0.6, d));
      }
    }
    // Lava flows: narrow channels down the flank at each bearing, wandering.
    for (const b of c.flows) {
      // Lateral offset in world units: wanders more the further it runs.
      const seedB = 61 + Math.round(b * 10);
      const wander = (d / c.r) * (1.1 * Math.sin(d * 0.9 + b * 7) + 2.0 * (fbm(x, z, seedB, 4) - 0.5));
      let da = ang - b;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      const across = Math.abs(da * d - wander);
      const width = (0.08 + 0.2 * (d / c.r)) * (0.55 + 0.9 * fbm(x * 1.5, z * 1.5, seedB + 5, 4));
      if (d > c.crater * 1.2 && d < c.r * 1.15) {
        // Cools as it runs: bright at the vent, dull red at the toe.
        const f = smoothstep(width, width * 0.35, across) * smoothstep(c.r * 1.15, c.r * 0.85, d) * (1 - 0.55 * d / c.r);
        lava = Math.max(lava, f);
        ch -= f * 0.12;
      }
      heat = Math.max(heat, smoothstep(width * 4, width, across) * smoothstep(c.r * 1.3, c.r * 0.7, d));
    }
    heat = Math.max(heat, smoothstep(c.crater * 2.6, c.crater, d));
    coneMask = Math.max(coneMask, t);
    h = Math.max(h, h * 0.6 + ch);
  }

  // Cracked, smouldering basin: lava glows through fissures in low ground.
  const crack = 1 - Math.abs(2 * vnoise(x + 2.2 * (fbm(x, z, 71, 4) - 0.5), z + 2.2 * (fbm(x, z, 73, 4) - 0.5), 2.5, 83) - 1);
  const crackFine = 1 - Math.abs(2 * vnoise(x + 1.2 * (fbm(x, z, 77, 4) - 0.5), z + 1.2 * (fbm(x, z, 79, 4) - 0.5), 1.25, 89) - 1);
  const low = smoothstep(2.9, 1.9, h) * (1 - coneMask);
  const fissure = Math.max(smoothstep(0.965, 0.995, crack), 0.6 * smoothstep(0.975, 0.997, crackFine)) * low * smoothstep(0.45, 0.65, fbm(x, z, 107, 3));
  lava = Math.max(lava, fissure);
  heat = Math.max(heat, smoothstep(0.75, 0.98, crack) * low * 0.8);
  h -= fissure * 0.08;

  return { h, lava, heat };
}

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0a0b);

// --- Terrain -----------------------------------------------------------------
{
  const geo = new THREE.PlaneGeometry(SPAN_X, SPAN_Z, SEG_X, SEG_Z);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const rockCol = new Float32Array(pos.count * 3);
  const lavaCol = new Float32Array(pos.count * 4);
  const ash = new THREE.Color(0x8a807a), basalt = new THREE.Color(0x3a3434), scorch = new THREE.Color(0x5a2416);
  const haze = new THREE.Color(0x3a2626);
  const hot = new THREE.Color(0xffa83a), mid = new THREE.Color(0xff4a0c), dark = new THREE.Color(0x8a1404);
  const c = new THREE.Color(), l = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const s = sample(x, z);
    pos.setY(i, s.h);
    // Rock: dark basalt, ash dusting on high ground, scorched near heat,
    // warm haze pooling in the low basin.
    const grain = fbm(x * 3.1, z * 3.1, 97, 5);
    c.copy(basalt).lerp(ash, clamp01(smoothstep(2.5, 8, s.h) * 0.8 + (grain - 0.5) * 0.6));
    c.lerp(scorch, s.heat * 0.85);
    c.lerp(haze, smoothstep(1.4, 0.4, s.h) * 0.45);
    rockCol.set([c.r, c.g, c.b], i * 3);
    // Lava overlay: emissive colour, alpha = how molten this point is.
    const crust = smoothstep(0.62, 0.72, fbm(x * 2.5, z * 2.5, 113, 5));
    const v = clamp01(s.lava * (0.7 + 0.6 * fbm(x * 2, z * 2, 101, 4)) * (1 - crust * 0.75));
    if (v > 0.55) l.copy(mid).lerp(hot, (v - 0.55) / 0.45);
    else l.copy(dark).lerp(mid, v / 0.55);
    lavaCol.set([l.r, l.g, l.b, smoothstep(0.1, 0.6, s.lava) * (1 - crust * 0.5)], i * 4);
  }
  geo.computeVertexNormals();
  geo.setAttribute('color', new THREE.BufferAttribute(rockCol, 3));
  const rock = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.95, metalness: 0,
  }));
  rock.castShadow = SHADOWS;
  rock.receiveShadow = SHADOWS;
  scene.add(rock);

  const lavaGeo = geo.clone();
  lavaGeo.setAttribute('color', new THREE.BufferAttribute(lavaCol, 4));
  const lava = new THREE.Mesh(lavaGeo, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  scene.add(lava);
}

// --- Camera --------------------------------------------------------------------
export const camera = new THREE.OrthographicCamera(-viewW / 2, viewW / 2, viewH / 2, -viewH / 2, 0.1, 400);
{
  const dist = 140;
  camera.position.set(0, dist * Math.sin(TILT), dist * Math.cos(TILT));
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}

// --- Smoke -------------------------------------------------------------------
// Soft discs facing the camera, stacked into a drifting column per crater.
// Each plume is placed in every period copy so the tile stays seamless.
{
  const puffGeo = new THREE.CircleGeometry(1, 40, 0, TAU);
  {
    const p = puffGeo.attributes.position;
    const col = new Float32Array(p.count * 4);
    for (let i = 0; i < p.count; i++) {
      const r = Math.hypot(p.getX(i), p.getY(i));
      col.set([1, 1, 1, Math.pow(1 - Math.min(1, r), 1.8)], i * 4);
    }
    puffGeo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  }
  const rand = mulberry32(1337);
  const plumes = CONES.map((c) => {
    const puffs = [];
    const n = 22 + Math.round(c.h);
    for (let k = 0; k < n; k++) {
      const t = k / n;
      puffs.push({
        up: c.h * 0.86 + t * 9,
        drift: t * t * 4 + (rand() - 0.5) * 0.4 * t,
        side: (rand() - 0.5) * 0.6 * (0.3 + t),
        size: 0.45 + t * 2.4 + rand() * 0.4,
        alpha: 0.2 * (1 - t) + 0.05,
        warm: Math.max(0, 1 - t * 3),
      });
    }
    return { c, puffs };
  });
  const smokeGrey = new THREE.Color(0x5e5452), smokeLit = new THREE.Color(0xd8622a);
  for (let copy = -2; copy <= 2; copy++) {
    for (const { c, puffs } of plumes) {
      const z0 = c.z * PERIOD + copy * PERIOD;
      for (const p of puffs) {
        const mat = new THREE.MeshBasicMaterial({
          color: smokeGrey.clone().lerp(smokeLit, p.warm * 0.8),
          vertexColors: true, transparent: true, opacity: p.alpha, depthWrite: false,
        });
        const m = new THREE.Mesh(puffGeo, mat);
        m.position.set(c.x + p.drift + p.side, p.up, z0 - p.drift * 0.4);
        m.scale.setScalar(p.size);
        m.quaternion.copy(camera.quaternion);
        m.renderOrder = 2;
        scene.add(m);
      }
    }
  }
}

// --- Lights --------------------------------------------------------------------
scene.add(new THREE.HemisphereLight(0x8a8a9c, 0x5a2210, 0.75));
{
  // Cool, low key light from upper left: long shadows off every cone.
  const sun = new THREE.DirectionalLight(0xcfc8d8, 1.6);
  sun.position.set(-18, 22, -8);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  // The shadow box spans every period copy in frame, so shadows repeat too.
  sun.shadow.mapSize.set(8192, 8192);
  const half = PERIOD * 1.5;
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 140 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
}

// Shadows need to be on in the renderer the harness builds.
export function renderFrame(renderer, sc, cam) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.render(sc, cam);
}
