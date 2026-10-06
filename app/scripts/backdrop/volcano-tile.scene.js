// Climb backdrop tile: terraced basalt columns over a lava sea, seen from a
// high orthographic angle. Rendered offline with the render-3d skill into
// public/climb/volcano-tile.jpg (see public/climb/README.md).
//
// The tile repeats vertically in the game, so the scene is periodic: every
// height, river and light is a function of z mod PERIOD, the grid has a whole
// number of rows per period, and an orthographic camera turns a z-shift of one
// PERIOD into a screen shift of exactly one frame height. No fog (it depends
// on depth, which is not periodic).
import * as THREE from 'three';

// Seeded PRNG: the tile must render identically every time.
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

const PERIOD = 40;            // world units of z per tile repeat
const TILT = (52 * Math.PI) / 180; // camera pitch below horizontal
const ASPECT = 2 / 3;         // tile width / height (same as the old tile)
const SPACING = 0.6;          // hex column pitch
const ROWS = 78;              // rows per period (even, for the hex stagger)
const ROW_DZ = PERIOD / ROWS;
const PERIODS = 5;            // render copies above and below the frame
const TAU = Math.PI * 2;

const viewH = PERIOD * Math.sin(TILT);
const viewW = viewH * ASPECT;
const COLS = Math.ceil((viewW * 1.3) / SPACING);

// Periodic helpers: everything that varies along z goes through phase().
const phase = (z) => (((z % PERIOD) + PERIOD) % PERIOD) / PERIOD;

// Per-cell randomness keyed on the row within its period, so copies match.
function cellRand(col, rowInPeriod, salt) {
  const r = mulberry32((col * 7919) ^ (rowInPeriod * 104729) ^ (salt * 15485863));
  r();
  return r();
}

// Terraces rise away from the camera (so their cliff faces point at it) and
// drop back down behind the highest step, where the drop is hidden.
function terraceHeight(z) {
  const p = phase(z) * 4; // four terraces per period
  const local = p - Math.floor(p);
  return 1.0 + Math.floor(local * 3) * 1.25;
}

// Lava rivers meander across the terraces.
function riverDistance(x, z) {
  const t = phase(z) * TAU;
  const a = x - (-3.5 + 3.2 * Math.sin(t * 2 + 0.6) + 1.2 * Math.sin(t * 5 + 1.9));
  const b = x - (4.8 + 2.6 * Math.sin(t * 3 + 2.4) + 0.9 * Math.cos(t * 7 + 0.3));
  return Math.min(Math.abs(a), Math.abs(b));
}

// Spire clusters: a few tall rock peaks per period.
const SPIRES = [
  { x: -1.2, z: 0.16, r: 3.8, h: 11 },
  { x: 4.8, z: 0.44, r: 3.0, h: 8 },
  { x: -4.6, z: 0.69, r: 3.4, h: 9.5 },
  { x: 1.6, z: 0.92, r: 2.6, h: 6.5 },
];
function spireHeight(x, z) {
  const p = phase(z);
  let best = 0;
  for (const s of SPIRES) {
    let dz = Math.abs(p - s.z);
    dz = Math.min(dz, 1 - dz) * PERIOD;
    const d = Math.hypot(x - s.x, dz);
    if (d < s.r) best = Math.max(best, s.h * Math.pow(1 - d / s.r, 1.6));
  }
  return best;
}

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e0a0b);

// --- Lava sea (vertex-coloured, periodic) -------------------------------
{
  const zSpan = PERIOD * PERIODS;
  const geo = new THREE.PlaneGeometry(viewW * 1.6, zSpan, 60, ROWS * PERIODS);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const hot = new THREE.Color(0xffa040), mid = new THREE.Color(0xe8420e), cool = new THREE.Color(0x2a0a06);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const t = phase(z) * TAU;
    const n = 0.5 + 0.25 * Math.sin(x * 1.7 + t * 6) + 0.25 * Math.sin(x * 0.6 - t * 11 + 1.3);
    const river = Math.max(0, 1 - riverDistance(x, z) / 0.9);
    const heat = Math.min(1, n * 0.35 + river * 0.9);
    if (heat > 0.5) c.copy(mid).lerp(hot, (heat - 0.5) * 2);
    else c.copy(cool).lerp(mid, heat * 2);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const lava = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true }));
  lava.position.y = 0;
  scene.add(lava);
}

// --- Basalt columns ------------------------------------------------------
{
  const geo = new THREE.CylinderGeometry(SPACING * 0.5, SPACING * 0.52, 1, 6, 4);
  geo.translate(0, 0.5, 0); // base at y=0, scaled upward
  // Lava glow at the foot of each column, fading up the shaft.
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const g = Math.pow(1 - y, 3);
    const g2 = g * g;
    col.set([0.32 + 0.68 * g2, 0.3 + 0.12 * g2, 0.34 - 0.2 * g2], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.0,
    flatShading: true,
  });

  const rowsTotal = ROWS * PERIODS;
  const z0 = -PERIOD * Math.floor(PERIODS / 2) - PERIOD / 2;
  const max = rowsTotal * COLS;
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  // River cells: the same columns, molten, sitting just below the terrace so
  // the flow shows on top and pours down each cliff face it crosses.
  const lavaGeo = new THREE.CylinderGeometry(SPACING * 0.53, SPACING * 0.53, 1, 6, 1);
  lavaGeo.translate(0, 0.5, 0);
  {
    // Crust darkens down the fall; the top surface stays molten.
    const lp = lavaGeo.attributes.position;
    const lc = new Float32Array(lp.count * 3);
    for (let i = 0; i < lp.count; i++) {
      const k = 0.35 + 0.65 * Math.pow(lp.getY(i), 0.6);
      lc.set([k, k * k, k * k * k], i * 3);
    }
    lavaGeo.setAttribute('color', new THREE.BufferAttribute(lc, 3));
  }
  const lavaMesh = new THREE.InstancedMesh(lavaGeo, new THREE.MeshBasicMaterial({ vertexColors: true }), max);
  const molten = new THREE.Color();
  const lavaHot = new THREE.Color(0xff8a24), lavaCool = new THREE.Color(0xc8260a);
  let nl = 0;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const shade = new THREE.Color();
  const ember = new THREE.Color(0xff6a2a);
  let n = 0;
  for (let row = 0; row < rowsTotal; row++) {
    const rowInPeriod = row % ROWS;
    const z = z0 + row * ROW_DZ;
    for (let ci = 0; ci < COLS; ci++) {
      const x = (ci - COLS / 2) * SPACING + (rowInPeriod % 2 ? SPACING / 2 : 0);
      const r1 = cellRand(ci, rowInPeriod, 1);
      const r2 = cellRand(ci, rowInPeriod, 2);
      // Rivers cut through; cliff edges crumble.
      const base = terraceHeight(z);
      const rd = riverDistance(x, z);
      if (rd < 0.3 + r1 * 0.22) {
        p.set(x, 0, z);
        q.identity();
        s.set(1, base - 0.28, 1);
        m.compose(p, q, s);
        lavaMesh.setMatrixAt(nl, m);
        molten.copy(lavaCool).lerp(lavaHot, Math.max(0, 1 - rd / 0.5) * (0.75 + 0.25 * r2));
        lavaMesh.setColorAt(nl++, molten);
        continue;
      }
      const edge = phase(z) * 12 - Math.floor(phase(z) * 12);
      if (edge > 0.9 && r2 < 0.35) continue;
      const broken = cellRand(ci, rowInPeriod, 4) < 0.06 ? 0.55 : 0;
      const h = base + spireHeight(x, z) + (r1 - 0.5) * 0.55 - broken;
      p.set(x, 0, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r2 * 0.4);
      s.set(0.92 + r2 * 0.12, Math.max(0.3, h), 0.92 + r1 * 0.12);
      m.compose(p, q, s);
      mesh.setMatrixAt(n, m);
      shade.setScalar(0.36 + 0.2 * cellRand(ci, rowInPeriod, 3));
      // Heat spill: columns on a river bank pick up its glow.
      const spill = Math.max(0, 1 - (rd - 0.3) / 1.2);
      shade.lerp(ember, spill * spill * 0.7);
      mesh.setColorAt(n++, shade);
    }
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  lavaMesh.count = nl;
  lavaMesh.instanceMatrix.needsUpdate = true;
  lavaMesh.instanceColor.needsUpdate = true;
  scene.add(mesh, lavaMesh);
}

// --- Lights --------------------------------------------------------------
// Hemisphere: cold ash sky above, molten glow from below on column sides.
scene.add(new THREE.HemisphereLight(0x2c2c38, 0xc8380e, 0.55));
{
  // Key light falls straight along -z/-y so its shadows are periodic too.
  const sun = new THREE.DirectionalLight(0xb8b4c8, 0.9);
  sun.position.set(-6, 30, 12);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const half = PERIOD * 1.4;
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 120 });
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
}

// --- Camera ----------------------------------------------------------------
export const camera = new THREE.OrthographicCamera(-viewW / 2, viewW / 2, viewH / 2, -viewH / 2, 0.1, 400);
{
  const dist = 120;
  camera.position.set(0, dist * Math.sin(TILT), dist * Math.cos(TILT));
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}

// Shadows need to be on in the renderer the harness builds.
export function renderFrame(renderer, sc, cam) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.render(sc, cam);
}
