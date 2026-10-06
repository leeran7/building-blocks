// Climb backdrop tile: the flank of one volcano, seen face-on as you climb
// it. Lava rivers pour down carved channels and over rock ledges, steam rises
// from sulphur-crusted vents, glowing cracks run through the rock, and the
// summit crater somewhere above warms every face that looks uphill. Rendered
// offline with the render-3d skill into public/climb/volcano-tile.jpg (see
// public/climb/README.md).
//
// The tile repeats vertically in the game, so the scene is periodic: every
// height, colour and plume is a function of z mod PERIOD, and an orthographic
// camera turns a z-shift of one PERIOD into a screen shift of exactly one
// frame height. There is no depth fog for the same reason.
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

// --- The flank ----------------------------------------------------------------
// One volcano's side, seen face-on as you climb it: uphill is up the screen
// (-z in the world), so lava runs down it towards the bottom of the frame.
// Everything below is a phase of z (0..1 of the period) or periodic in z.

// Lava rivers: meandering channels straight down the slope.
const RIVERS = [
  { x: -1.0, amp: 1.5, k: 2, ph: 0.3, w: 0.24, seed: 201 },
  { x: 3.6, amp: 1.0, k: 3, ph: 1.7, w: 0.16, seed: 211 },
  { x: -5.0, amp: 0.8, k: 1, ph: 4.1, w: 0.13, seed: 221 },
  { x: -8.3, amp: 0.5, k: 2, ph: 2.6, w: 0.09, seed: 231 },
];
function riverX(r, z) {
  return r.x + r.amp * Math.sin((TAU * r.k * wrap(z)) / PERIOD + r.ph) + 2.2 * (fbm(r.x, z, r.seed, 4) - 0.5);
}

// Fumaroles: small glowing vents with yellow sulphur crusts and steam.
const VENTS = [
  { x: 1.9, z: 0.14, r: 0.55 }, { x: -3.3, z: 0.37, r: 0.4 }, { x: 5.4, z: 0.61, r: 0.45 },
  { x: -7.2, z: 0.83, r: 0.35 }, { x: 2.8, z: 0.71, r: 0.3 }, { x: -2.2, z: 0.93, r: 0.32 },
];
// Signed z distance to a vent in the nearest period copy.
function ventDz(z, v) {
  let dz = wrap(z) - v.z * PERIOD;
  if (dz > PERIOD / 2) dz -= PERIOD;
  if (dz < -PERIOD / 2) dz += PERIOD;
  return dz;
}

// Rock ledges: the slope climbs in steps. BANDS steps per period.
const BANDS = 6;
const BAND = PERIOD / BANDS;

// Height plus the masks the colouring needs, for one point.
function sample(x, z) {
  const qx = x + 0.9 * (fbm(x, z, 13, 4) - 0.5), qz = z + 0.9 * (fbm(x, z, 17, 4) - 0.5);

  // The mountain's body: it bulges towards you in the middle and curves away
  // at the sides, so the frame reads as one peak's flank.
  let h = -0.05 * x * x + 1.2 * fbm(x, z, 11, 4);

  // Ribs and gullies running downhill: ridged noise stretched along z
  // (x scaled up, z left alone, so it stays periodic).
  const ribs = ridged(qx * 3, qz, 23, 1, 5);
  h += 1.1 * ribs + 0.25 * ridged(qx, qz, 29, 3, 4) + 0.07 * ridged(qx * 2, qz * 2, 31, 4, 3);

  // Ledges: a steep rock step facing you, then a near-level shelf behind it.
  // The step line wanders and tilts across the slope and fades in and out.
  const u = -z + 0.22 * x + 3.2 * (fbm(x, z, 301, 4) - 0.5);
  const p = (((u % BAND) + BAND) % BAND) / BAND;
  const RISE = 0.3;
  const step = p < RISE ? smoothstep(0, RISE, p) : 1 - (p - RISE) / (1 - RISE);
  const ledgeAmp = 0.9 * smoothstep(0.3, 0.62, fbm(x, z, 311, 3));
  h += ledgeAmp * step;
  const cliff = (p < RISE ? 1 : 0) * smoothstep(0, 0.5, ledgeAmp);
  const shelf = ledgeAmp * smoothstep(RISE, RISE + 0.12, p) * smoothstep(0.8, 0.5, p);

  let lava = 0, heat = 0, sulphur = 0, river = 0;

  // The mountain's right-hand skyline: past it the rock falls away out of
  // sight and there is only smoky sky.
  const edge = 6.3 + 4.5 * (fbm(6.3, z, 401, 5) - 0.5) + 2.2 * (vnoise(6.3, z, 2.5, 405) - 0.5)
    - 0.45 * ridged(6.3, z, 403, 4, 3);
  const sky = smoothstep(edge, edge + 0.12, x);
  const rim = smoothstep(edge - 0.6, edge, x) * (1 - sky);

  // Lava rivers in carved channels, with low levees either side.
  for (const r of RIVERS) {
    const d = Math.abs(x - riverX(r, z));
    const w = r.w * (0.7 + 0.6 * fbm(x, z, r.seed + 7, 3));
    if (d > w * 6) continue;
    const chan = smoothstep(w * 2.2, w * 0.4, d);
    const levee = smoothstep(w * 4, w * 2.2, d) - chan;
    h += -0.55 * chan + 0.22 * levee;
    // Molten core with a crust of plates whose seams glow brightest.
    const core = smoothstep(w, w * 0.45, d);
    const plates = veins(x, z, 0.625, 0.05, r.seed + 11);
    const surf = Math.max(0.18 + 0.35 * fbm(x * 3, z * 3, r.seed + 13, 3), plates);
    // Hotter where it pours over a ledge.
    const fall = cliff * smoothstep(w * 1.4, w * 0.3, d);
    lava = Math.max(lava, core * surf, fall);
    river = Math.max(river, core);
    heat = Math.max(heat, smoothstep(w * 5, w, d));
  }

  // Lava pooled on shelves beside the rivers spills into glowing ponds.
  const pond = shelf * smoothstep(0.62, 0.7, fbm(x, z, 321, 4)) * smoothstep(0.55, 1, heat);
  if (pond > 0) {
    const crust = veins(x, z, 0.3125, 0.03, 331);
    lava = Math.max(lava, pond * Math.max(0.35, crust));
    h -= pond * 0.15;
  }

  // Fumaroles.
  for (const v of VENTS) {
    const d = Math.hypot(x - v.x, ventDz(z, v));
    if (d > v.r * 5) continue;
    const rim = smoothstep(v.r * 1.6, v.r, d) - smoothstep(v.r, v.r * 0.5, d);
    h += 0.35 * rim - 0.5 * smoothstep(v.r * 0.8, 0, d);
    lava = Math.max(lava, smoothstep(v.r * 0.7, v.r * 0.2, d));
    heat = Math.max(heat, smoothstep(v.r * 3, v.r, d));
    sulphur = Math.max(sulphur, smoothstep(v.r * 4.5, v.r * 1.2, d) * (0.4 + 0.6 * fbm(x * 3, z * 3, 341, 4)));
  }

  // Glowing cracks through the rock at three scales, densest on the shelves
  // and fading where the rock bulges out.
  const away = 1 - river;
  const broad = veins(x, z, 2.5, 0.06, 141) * smoothstep(0.38, 0.6, fbm(x, z, 151, 3));
  const finer = veins(x, z, 1.25, 0.03, 157) * smoothstep(0.45, 0.64, fbm(x, z, 163, 3));
  const hair = veins(x, z, 0.625, 0.016, 167) * smoothstep(0.5, 0.68, fbm(x, z, 173, 3));
  // Cracks down the ribs: thin glowing seams along the gullies.
  const seam = smoothstep(0.965, 0.995, ridged(qx * 3, qz, 179, 2, 2)) * smoothstep(0.4, 0.6, fbm(x, z, 181, 3));
  const vein = Math.max(broad * 0.7, finer * 0.55, hair * 0.4, seam * 0.45) * away;
  lava = Math.max(lava, vein);
  heat = Math.max(heat, Math.max(broad, finer) * 0.6);
  h -= vein * 0.05;

  lava *= 1 - sky;
  return { h, lava, heat, sulphur, shelf, cliff, sky, rim, past: x - edge };
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
  const ash = new THREE.Color(0x8a807a), basalt = new THREE.Color(0x353031), scorch = new THREE.Color(0x5a2416);
  const sulphurCol = new THREE.Color(0xc9b03a), rust = new THREE.Color(0x6a3a26), shade = new THREE.Color(0x140e0f);
  // Kept below full brightness so platforms and the climber stay the brightest
  // things on screen.
  const hot = new THREE.Color(0xf08a34), mid = new THREE.Color(0xc8380c), dark = new THREE.Color(0x5a0e04);
  const rimCol = new THREE.Color(0x8a3416), skyLow = new THREE.Color(0x160d10), skyHigh = new THREE.Color(0x33181a);
  const skyGlow = new THREE.Color(0x7a2c14);
  const c = new THREE.Color(), l = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const s = sample(x, z);
    pos.setY(i, s.h);
    // Rock: dark basalt, ash settled on the shelves, rusty oxidised streaks,
    // sulphur round the vents, scorched near heat, darker as the flank
    // curves away at the sides.
    const grain = fbm(x * 3, z * 3, 97, 4);
    c.copy(basalt).lerp(ash, clamp01(s.shelf * 0.3 + (grain - 0.5) * 0.45));
    c.lerp(rust, smoothstep(0.55, 0.75, fbm(x * 4, z, 103, 4)) * 0.45);
    c.lerp(scorch, s.heat * 0.85);
    c.lerp(sulphurCol, s.sulphur * 0.85);
    c.lerp(shade, smoothstep(4, 9.5, -x) * 0.8);
    rockCol.set([c.r, c.g, c.b], i * 3);
    // Lava overlay: emissive colour, alpha = how molten this point is.
    const crust = smoothstep(0.62, 0.72, fbm(x * 3, z * 3, 113, 5));
    const v = clamp01(s.lava * (0.7 + 0.6 * fbm(x * 2, z * 2, 101, 4)) * (1 - crust * 0.6));
    if (v > 0.55) l.copy(mid).lerp(hot, (v - 0.55) / 0.45);
    else l.copy(dark).lerp(mid, v / 0.55);
    let a = 0.85 * smoothstep(0.1, 0.6, s.lava) * (1 - crust * 0.4);
    // Sky past the skyline, and the crater's glow catching the rock's edge.
    if (s.rim > 0 && a < s.rim * 0.55) { l.copy(rimCol); a = s.rim * 0.55; }
    if (s.sky > 0) {
      // Dark sky, smoke drifting across it, lit from below near the slope.
      l.copy(skyLow).lerp(skyHigh, smoothstep(0.35, 0.75, fbm(x, z * 2, 409, 5)));
      l.lerp(skyGlow, Math.exp(-s.past / 0.8) * 0.45);
      a = Math.max(a * (1 - s.sky), s.sky);
    }
    lavaCol.set([l.r, l.g, l.b, a], i * 4);
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
// Soft discs facing the camera: a steam column per vent, and low ash drifting
// across the face. Each puff is placed in every period copy so the tile stays
// seamless.
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
  const puffs = [];
  for (const v of VENTS) {
    const base = sample(v.x, v.z * PERIOD).h;
    const n = 18;
    for (let k = 0; k < n; k++) {
      const t = k / n;
      puffs.push({
        x: v.x + t * t * 2.5 + (rand() - 0.5) * 0.5 * t,
        y: base + 0.2 + t * 6,
        z: v.z * PERIOD - t * 1.5,
        size: 0.3 + t * 1.8 + rand() * 0.3,
        alpha: 0.09 * (1 - t) + 0.02,
        warm: Math.max(0, 1 - t * 4),
        steam: true,
      });
    }
  }
  // Ash haze hanging over the rivers.
  for (let k = 0; k < 40; k++) {
    const r = RIVERS[k % RIVERS.length];
    const z = rand() * PERIOD;
    const x = riverX(r, z) + (rand() - 0.5) * 2;
    puffs.push({ x, y: sample(x, z).h + 1 + rand() * 2, z, size: 1.2 + rand() * 1.8, alpha: 0.035, warm: 0.6, steam: false });
  }
  const steamCol = new THREE.Color(0x9a9294), ashCol = new THREE.Color(0x4e4442), lit = new THREE.Color(0xe0682a);
  for (let copy = -2; copy <= 2; copy++) {
    for (const p of puffs) {
      const mat = new THREE.MeshBasicMaterial({
        color: (p.steam ? steamCol : ashCol).clone().lerp(lit, p.warm * 0.8),
        vertexColors: true, transparent: true, opacity: p.alpha, depthWrite: false,
      });
      const m = new THREE.Mesh(puffGeo, mat);
      m.position.set(p.x, p.y, p.z + copy * PERIOD);
      m.scale.setScalar(p.size);
      m.quaternion.copy(camera.quaternion);
      m.renderOrder = 2;
      scene.add(m);
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
scene.add(new THREE.HemisphereLight(0x8a8a9c, 0x5a2210, 0.5));
{
  // Cool, low key light from the left: the rock steps and ribs cast shadows.
  const sun = new THREE.DirectionalLight(0xcfc8d8, 1.0);
  sun.position.set(-20, 16, -4);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  // The shadow box spans every period copy in frame, so shadows repeat too.
  sun.shadow.mapSize.set(8192, 8192);
  const half = PERIOD * 1.5;
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 140 });
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.08;
  scene.add(sun, sun.target);
  // Warm glow from uphill: the summit crater, somewhere above the frame,
  // lights every face that looks up the slope.
  const crater = new THREE.DirectionalLight(0xff6a24, 0.5);
  crater.position.set(2, 6, -30);
  crater.target.position.set(0, 0, 0);
  scene.add(crater, crater.target);
}

// Shadows need to be on in the renderer the harness builds.
export function renderFrame(renderer, sc, cam) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.render(sc, cam);
}
