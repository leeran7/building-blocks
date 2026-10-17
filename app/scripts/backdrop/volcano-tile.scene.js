// Climb backdrop tile: a lava field on the volcano's slope at night, seen
// from above as you climb. Almost everything is black, rubbly rock; thin,
// braided rivulets of lava run down it, glowing hottest where they are
// narrowest and dimming to deep red under crust. Modelled on aerial night
// photos of Fagradalsfjall and Kilauea flows. Rendered offline with the
// render-3d skill into public/climb/volcano-tile.jpg (see public/climb/README.md).
//
// The tile repeats vertically in the game, so the scene is periodic: every
// height and colour is a function of z mod PERIOD, and an orthographic camera
// turns a z-shift of one PERIOD into a screen shift of exactly one frame
// height. There is no depth fog for the same reason.
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
// The framed period plus enough either side for raised rock and smoke to
// reach into frame from a neighbouring copy.
const SPAN_Z = PERIOD + 30;
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

// --- The lava field -----------------------------------------------------------
// Downhill is the bottom of the screen (+z), so rivulets run along z.

// The main flows: wide, slow channels with crusted surfaces.
const RIVERS = [
  { x: -2.4, amp: 1.2, k: 2, ph: 0.9, w: 0.3, seed: 201 },
  { x: 4.2, amp: 0.9, k: 1, ph: 3.3, w: 0.22, seed: 211 },
];
// Thin threads between the main flows. Seeded so the tile is reproducible.
const RIVULETS = [];
{
  const rand = mulberry32(777);
  for (let i = 0; i < 16; i++) {
    RIVULETS.push({
      x: -9 + 18 * (i + 0.5) / 16 + (rand() - 0.5) * 0.8,
      amp: 0.4 + rand() * 1.2, k: 1 + Math.floor(rand() * 3), ph: rand() * TAU,
      w: 0.03 + rand() * 0.04, seed: 300 + i * 10,
    });
  }
}
function riverX(r, z) {
  return r.x + r.amp * Math.sin((TAU * r.k * wrap(z)) / PERIOD + r.ph) + 2.0 * (fbm(r.x, z, r.seed, 4) - 0.5);
}

// Height plus the masks the colouring needs, for one point.
function sample(x, z) {
  const qx = x + 1.2 * (fbm(x, z, 13, 4) - 0.5), qz = z + 1.2 * (fbm(x, z, 17, 4) - 0.5);

  // Rubbly a'a field: gentle swells under blocky clinker.
  let h = 0.9 * fbm(x, z, 11, 4) + 0.35 * ridged(qx * 2, qz * 2, 23, 3, 4) + 0.12 * ridged(qx * 4, qz * 4, 29, 4, 3);
  // Older flow lobes: raised tongues of cooled rock, also running downhill.
  const lobe = smoothstep(0.48, 0.62, fbm(x * 2, z, 41, 5));
  h += 0.45 * lobe;

  // Braided rivulets: many thin threads wandering downhill, crossing and
  // splitting where their paths meet, each showing only in stretches.
  let lava = 0, heat = 0, hotness = 0;
  for (const r of RIVULETS) {
    const d = Math.abs(x - riverX(r, z));
    if (d > 0.6) continue;
    const on = smoothstep(0.4, 0.52, fbm(r.x, z, r.seed + 3, 3));
    if (on <= 0) continue;
    const w = r.w * (0.6 + 0.8 * fbm(x, z, r.seed + 5, 3));
    const f = smoothstep(w, w * 0.3, d) * on;
    lava = Math.max(lava, f);
    heat = Math.max(heat, smoothstep(w * 6, w, d) * on * 0.7);
    hotness = Math.max(hotness, f * smoothstep(0.5, 0.65, fbm(x * 2, z * 2, r.seed + 9, 4)));
  }

  for (const r of RIVERS) {
    const d = Math.abs(x - riverX(r, z));
    const w = r.w * (0.7 + 0.6 * fbm(x, z, r.seed + 7, 3));
    if (d > w * 8) continue;
    const chan = smoothstep(w * 2.5, w * 0.5, d);
    h += -0.3 * chan + 0.18 * (smoothstep(w * 5, w * 2.5, d) - chan);
    const c = smoothstep(w, w * 0.4, d);
    const plates = veins(x, z, 0.3125, 0.025, r.seed + 11);
    lava = Math.max(lava, c * Math.max(0.4, plates));
    hotness = Math.max(hotness, c * plates);
    heat = Math.max(heat, smoothstep(w * 6, w, d) * 0.8);
  }

  // A few hairline cracks glowing faintly through the clinker.
  const hair = veins(x, z, 0.625, 0.012, 167) * smoothstep(0.55, 0.7, fbm(x, z, 173, 3));
  lava = Math.max(lava, hair * 0.35);

  h -= lava * 0.12;
  return { h, lava, heat, hotness, lobe };
}

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070506);

// --- Terrain -----------------------------------------------------------------
{
  const geo = new THREE.PlaneGeometry(SPAN_X, SPAN_Z, SEG_X, SEG_Z);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const rockCol = new Float32Array(pos.count * 3);
  const lavaCol = new Float32Array(pos.count * 4);
  const black = new THREE.Color(0x242022), grey = new THREE.Color(0x4e4648), scorch = new THREE.Color(0x3a1408);
  // Kept below full brightness so platforms and the climber stay the brightest
  // things on screen.
  const hot = new THREE.Color(0xf09038), mid = new THREE.Color(0xc0360a), dark = new THREE.Color(0x4a0c04);
  const c = new THREE.Color(), l = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const s = sample(x, z);
    pos.setY(i, s.h);
    // Rock: near-black clinker, the older lobes a shade greyer, warm only
    // right beside the lava.
    const grain = fbm(x * 4, z * 4, 97, 4);
    c.copy(black).lerp(grey, clamp01(s.lobe * 0.45 + (grain - 0.5) * 0.6));
    c.lerp(scorch, s.heat * 0.8);
    rockCol.set([c.r, c.g, c.b], i * 3);
    // Lava overlay: dull red under crust, orange where the core shows.
    const v = clamp01(s.lava * (0.35 + 0.65 * s.hotness));
    if (v > 0.5) l.copy(mid).lerp(hot, (v - 0.5) / 0.5);
    else l.copy(dark).lerp(mid, v / 0.5);
    lavaCol.set([l.r, l.g, l.b, 0.9 * smoothstep(0.08, 0.5, s.lava)], i * 4);
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

// --- Glow haze -----------------------------------------------------------------
// Faint orange haze hanging over the hottest lava, as in night photos where
// the fume above a flow is lit from below. Copied into every period.
{
  const puffGeo = new THREE.CircleGeometry(1, 40, 0, TAU);
  {
    const p = puffGeo.attributes.position;
    const col = new Float32Array(p.count * 4);
    for (let i = 0; i < p.count; i++) {
      const r = Math.hypot(p.getX(i), p.getY(i));
      col.set([1, 1, 1, Math.pow(1 - Math.min(1, r), 2.2)], i * 4);
    }
    puffGeo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  }
  const rand = mulberry32(1337);
  const puffs = [];
  for (let tries = 0; puffs.length < 70 && tries < 20000; tries++) {
    const x = (rand() - 0.5) * SPAN_X, z = rand() * PERIOD;
    const s = sample(x, z);
    if (s.lava * s.hotness < 0.35) continue;
    puffs.push({ x, y: s.h + 0.6 + rand() * 1.5, z, size: 0.9 + rand() * 1.6 });
  }
  const glow = new THREE.Color(0x8a3010);
  for (let copy = -2; copy <= 2; copy++) {
    for (const p of puffs) {
      const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({
        color: glow, vertexColors: true, transparent: true, opacity: 0.07, depthWrite: false,
        blending: THREE.AdditiveBlending,
      }));
      m.position.set(p.x, p.y, p.z + copy * PERIOD);
      m.scale.setScalar(p.size);
      m.quaternion.copy(camera.quaternion);
      m.renderOrder = 2;
      scene.add(m);
    }
  }
}

// --- Lights --------------------------------------------------------------------
// Night: a weak cool sky fill so the rubble just shows, and no sun.
scene.add(new THREE.HemisphereLight(0x5a5e70, 0x3a1608, 0.6));
{
  const moon = new THREE.DirectionalLight(0x9aa2c0, 0.85);
  moon.position.set(-20, 18, -6);
  moon.target.position.set(0, 0, 0);
  moon.castShadow = true;
  // The shadow box spans every period copy in frame, so shadows repeat too.
  moon.shadow.mapSize.set(8192, 8192);
  const half = PERIOD * 1.5;
  Object.assign(moon.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 140 });
  moon.shadow.bias = -0.0008;
  moon.shadow.normalBias = 0.08;
  scene.add(moon, moon.target);
}

// Shadows need to be on in the renderer the harness builds.
export function renderFrame(renderer, sc, cam) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.render(sc, cam);
}
