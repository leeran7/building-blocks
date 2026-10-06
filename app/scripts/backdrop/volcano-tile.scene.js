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
// The framed period plus enough either side for the tallest cone to reach
// into frame from a neighbouring copy.
const SPAN_Z = PERIOD + 44;
const SEG_X = 640;
const SEG_Z = 2400;
const SHADOWS = true;

const wrap = (z) => ((z % PERIOD) + PERIOD) % PERIOD;
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a, b, v) => smooth(clamp01((v - a) / (b - a)));

// --- Periodic value noise ----------------------------------------------------
// Lattice cells divide PERIOD exactly and z lattice indices wrap, so every
// octave repeats along z with the tile.
// Callers may scale coordinates only by whole numbers: noise(x * 2, z * 2)
// still repeats every PERIOD, noise(x * 1.5, z * 1.5) does not.
// Full avalanche (murmur3 finaliser per input): a weaker one-round mix left
// values correlated down each lattice column, which showed as vertical streaks.
function fmix(h) {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  return h ^ (h >>> 16);
}
function latticeHash(ix, iz, seed) {
  let h = fmix(Math.imul(seed, 0x9e3779b1) ^ Math.imul(ix, 0x85ebca77));
  h = fmix(h ^ Math.imul(iz, 0xc2b2ae3d));
  return (h >>> 0) / 4294967296;
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
    // Value-noise creases follow the lattice; a warp at the octave's own
    // scale bends each crease so none runs straight down a lattice column.
    const c = CELLS[o];
    const wx = x + 0.9 * c * (vnoise(x, z, c, seed + o * 17 + 5) - 0.5);
    const wz = z + 0.9 * c * (vnoise(x, z, c, seed + o * 17 + 9) - 0.5);
    sum += amp * (1 - Math.abs(2 * vnoise(wx, wz, c, seed + o * 17) - 1));
    norm += amp;
    amp *= 0.55;
  }
  return sum / norm;
}

// Periodic cellular noise: distance (world units) from the nearest cell edge.
// Small values trace a network of cracks; used for veins and lava crust.
function cellEdge(x, z, cell, seed) {
  // cell must divide PERIOD exactly, as for vnoise.
  const nz = Math.round(PERIOD / cell);
  const gx = x / cell, gz = wrap(z) / cell;
  const ix = Math.floor(gx), iz = Math.floor(gz);
  let f1 = 9, f2 = 9;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = ix + i, cz = iz + j;
      const wz = ((cz % nz) + nz) % nz;
      const px = cx + 0.1 + 0.8 * latticeHash(cx, wz, seed);
      const pz = cz + 0.1 + 0.8 * latticeHash(cx, wz, seed + 1);
      const d = Math.hypot(gx - px, gz - pz);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
  }
  return (f2 - f1) * cell;
}

// Domain-warped vein network: 1 on a crack, 0 away from it.
function veins(x, z, cell, width, seed) {
  const wx = x + cell * 1.3 * (fbm(x, z, seed + 3, 5) - 0.5);
  const wz = z + cell * 1.3 * (fbm(x, z, seed + 5, 5) - 0.5);
  return smoothstep(width, 0, cellEdge(wx, wz, cell, seed));
}

// --- Volcanoes -------------------------------------------------------------------
// z is a phase (0..1) of the period. Each cone has a crater and a few lava
// flows leaving its rim at fixed bearings (0 = towards the camera).
const CONES = [
  { x: -2.0, z: 0.22, r: 9.0, h: 13.5, crater: 1.1, flows: [0.25, -0.6, 0.95, -1.35, 0.55] },
  { x: 5.4, z: 0.56, r: 6.0, h: 8.5, crater: 0.75, flows: [-0.3, 0.6, -1.1] },
  { x: -5.6, z: 0.70, r: 4.8, h: 6.0, crater: 0.6, flows: [0.45, -0.5] },
  { x: 1.6, z: 0.92, r: 7.0, h: 10.0, crater: 0.9, flows: [-0.4, 0.55, 1.3, -1.15] },
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
  // Value-noise ridges crease along lattice lines; warping both axes bends
  // those creases so the rubble does not read as vertical stripes.
  const qx = x + 0.9 * (fbm(x, z, 13, 4) - 0.5), qz = z + 0.9 * (fbm(x, z, 17, 4) - 0.5);
  let h = 1.8 * fbm(x, z, 11, 4) + 0.7 * ridged(qx, qz, 23, 2, 5) + 0.2 * ridged(qx, qz, 29, 4, 3)
    + 0.07 * ridged(qx * 2, qz * 2, 31, 4, 3);
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
      + 0.25 * ridged(x * 2, z * 2, 53, 3, 4);
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
      const width = (0.08 + 0.2 * (d / c.r)) * (0.55 + 0.9 * fbm(x * 2, z * 2, seedB + 5, 4));
      if (d > c.crater * 1.2 && d < c.r * 1.15) {
        // Cools as it runs: bright at the vent, dull red at the toe.
        const f = smoothstep(width, width * 0.35, across) * smoothstep(c.r * 1.15, c.r * 0.85, d) * (1 - 0.55 * d / c.r);
        lava = Math.max(lava, f);
        ch -= f * 0.12;
      }
      heat = Math.max(heat, smoothstep(width * 4, width, across) * smoothstep(c.r * 1.3, c.r * 0.7, d));
    }
    // Hairline cracks radiating down the flanks, glowing from inside.
    if (d > c.crater * 1.3) {
      const radial = ridged(ang * 14 + 1.5 * fbm(x, z, 47, 4), d * 0.35, 49, 3, 2);
      const fl = smoothstep(0.93, 0.99, radial) * smoothstep(0.15, 0.6, t) * (0.5 + 0.5 * fbm(x * 2, z * 2, 51, 3));
      lava = Math.max(lava, fl * 0.75);
      ch -= fl * 0.05;
    }
    heat = Math.max(heat, smoothstep(c.crater * 2.6, c.crater, d));
    coneMask = Math.max(coneMask, t);
    h = Math.max(h, h * 0.6 + ch);
  }

  const open = Math.pow(1 - coneMask, 3);

  // Lava lakes fill the lowest ground: a flat molten surface broken into
  // dark crust plates, with the seams between plates glowing hottest.
  const LAKE = 1.42;
  const lake = smoothstep(LAKE + 0.06, LAKE - 0.12, h) * open;
  if (lake > 0) {
    const seams = veins(x, z, 0.8, 0.1, 131);
    const fine = veins(x, z, 0.3125, 0.035, 137);
    const plate = 0.28 + 0.2 * fbm(x * 3, z * 3, 139, 3);
    lava = Math.max(lava, lake * Math.max(plate, seams, fine * 0.8));
    heat = Math.max(heat, lake);
    h = h * (1 - lake) + (LAKE - 0.02) * lake;
  }

  // Vein networks over the whole basin: broad cracks, then finer ones in
  // patches, both fading as the ground rises onto the cones.
  const shore = smoothstep(LAKE + 0.9, LAKE + 0.05, h);
  const broad = veins(x, z, 2.5, 0.07, 141) * smoothstep(0.32, 0.55, fbm(x, z, 151, 3));
  const finer = veins(x, z, 1.25, 0.035, 157) * smoothstep(0.42, 0.62, fbm(x, z, 163, 3));
  const hair = veins(x, z, 0.625, 0.018, 167) * smoothstep(0.5, 0.68, fbm(x, z, 173, 3));
  const vein = Math.max(broad, finer * 0.85, hair * 0.6) * open * (0.55 + 0.45 * shore);
  lava = Math.max(lava, vein);
  heat = Math.max(heat, smoothstep(0, 1, Math.max(broad, finer)) * open * 0.6, shore * open * 0.35);
  h -= vein * 0.06;

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
    const grain = fbm(x * 3, z * 3, 97, 4);
    c.copy(basalt).lerp(ash, clamp01(smoothstep(2.5, 8, s.h) * 0.8 + (grain - 0.5) * 0.6));
    c.lerp(scorch, s.heat * 0.9);
    c.lerp(haze, smoothstep(1.4, 0.4, s.h) * 0.45);
    rockCol.set([c.r, c.g, c.b], i * 3);
    // Lava overlay: emissive colour, alpha = how molten this point is.
    const crust = smoothstep(0.62, 0.72, fbm(x * 3, z * 3, 113, 5));
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

// --- Embers --------------------------------------------------------------------
// Sparks hanging over the hottest ground. Positions are drawn once in phase
// space (one period) and copied into every period so they repeat with the tile.
{
  const rand = mulberry32(4242);
  const one = [];
  for (let tries = 0; one.length < 900 && tries < 60000; tries++) {
    const x = (rand() - 0.5) * SPAN_X;
    const z = rand() * PERIOD;
    const s = sample(x, z);
    if (s.lava < 0.45 && rand() > 0.02) continue;
    one.push({ x, z, y: s.h + 0.05 + Math.pow(rand(), 2.2) * 3.5, k: rand() });
  }
  const pos = [], col = [];
  const hot = new THREE.Color(0xffb050), warm = new THREE.Color(0xe8400c), c = new THREE.Color();
  for (let copy = -2; copy <= 1; copy++) {
    for (const e of one) {
      pos.push(e.x, e.y, e.z + copy * PERIOD);
      c.copy(warm).lerp(hot, e.k * e.k);
      col.push(c.r, c.g, c.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  // Soft round sprite (built in memory, no image file).
  const N = 32, px = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const r = Math.hypot(i - N / 2 + 0.5, j - N / 2 + 0.5) / (N / 2);
      const a = Math.round(255 * Math.pow(clamp01(1 - r), 2));
      px.set([255, 255, 255, a], (j * N + i) * 4);
    }
  }
  const dot = new THREE.DataTexture(px, N, N);
  dot.needsUpdate = true;
  const sparks = new THREE.Points(g, new THREE.PointsMaterial({
    size: 5.0, sizeAttenuation: false, vertexColors: true, map: dot,
    transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  sparks.renderOrder = 3;
  scene.add(sparks);
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
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.08;
  scene.add(sun, sun.target);
}

// Shadows need to be on in the renderer the harness builds.
export function renderFrame(renderer, sc, cam) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.render(sc, cam);
}
