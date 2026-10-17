# Examples

Each example: prompt in, contract-conforming module out (abridged).
Full modules are produced by the backend; these show the shape.

## 1. Hero — "floating glass cubes over a sunset gradient"

```js
import * as THREE from 'three';

export const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x1a0b2e, 12, 30);

const skyGeo = new THREE.SphereGeometry(40, 32, 16);
const skyMat = new THREE.MeshBasicMaterial({
  side: THREE.BackSide,
  vertexColors: true,
});
// vertex colors painted as a vertical sunset gradient (abridged)
export const camera = new THREE.PerspectiveCamera(50, 1280 / 800, 0.1, 100);
camera.position.set(-4, 1.5, 10);
camera.lookAt(2, 0, 0);

const cubes = new THREE.InstancedMesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshPhysicalMaterial({ transmission: 0.9, roughness: 0.15 }),
  24,
);
// deterministic transforms (abridged)
scene.add(cubes);
scene.add(new THREE.HemisphereLight(0xffd9a0, 0x2a1650, 0.9));
```

Notes: instancing keeps it under the medium budget; calm left third for
the headline; fog gives depth.

## 2. Product — "matte ceramic vase, studio lighting"

```js
import * as THREE from 'three';

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf4f1ea);

const pts = [];
for (let i = 0; i <= 20; i++) {
  const t = i / 20;
  pts.push(new THREE.Vector2(0.6 + 0.5 * Math.sin(t * Math.PI), t * 2.4));
}
const vase = new THREE.Mesh(
  new THREE.LatheGeometry(pts, 48),
  new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.85 }),
);
scene.add(vase);

const key = new THREE.DirectionalLight(0xfff2df, 2.2);
key.position.set(4, 6, 4);
scene.add(key, new THREE.HemisphereLight(0xffffff, 0xd8cfc0, 0.7));
const rim = new THREE.DirectionalLight(0xdfe8ff, 1.1);
rim.position.set(-5, 3, -4);
scene.add(rim);

export const camera = new THREE.PerspectiveCamera(40, 1280 / 800, 0.1, 100);
camera.position.set(0, 2.6, 7.5);
camera.lookAt(0, 1.2, 0);
```

Notes: lathe geometry reads as "designed"; three-point lighting;
camera slightly above, vase fills ~60% of frame.

## 3. Background — "slow drifting particles, deep blue"

```js
import * as THREE from 'three';

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060d1f);

const N = 400;
const pos = new Float32Array(N * 3);
// deterministic pseudo-random fill (abridged)
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
scene.add(new THREE.Points(geo, new THREE.PointsMaterial({
  color: 0x4d7fff, size: 0.035, transparent: true, opacity: 0.7,
})));

export const camera = new THREE.PerspectiveCamera(60, 1280 / 800, 0.1, 100);
camera.position.set(0, 0, 6);
```

Notes: `budget: low` default for backgrounds; desaturated enough to sit
behind text.
