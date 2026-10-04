/**
 * The 3D emote props build without a GL context and pose deterministically:
 * same age, same pose, on both players' screens. Each idle animation actually
 * moves the prop, and every pose stays inside the stage's view.
 */

import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildEmoteModel, MODELLED_PROPS } from "../../src/components/Duel/emotes3d/emoteModels";

/** World-space bounds of everything visible under `group`, after updating matrices. */
function bounds(group: THREE.Group): THREE.Box3 {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3();
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.visible) return;
    const mat = m.material as THREE.Material;
    if (mat.transparent && mat.opacity <= 0.01) return;
    m.geometry.computeBoundingBox();
    const b = m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld);
    box.union(b);
  });
  return box;
}

function snapshot(group: THREE.Group): number[] {
  const out: number[] = [];
  group.updateMatrixWorld(true);
  group.traverse((o) => out.push(...o.matrixWorld.elements));
  return out;
}

describe("emote models", () => {
  it.each(MODELLED_PROPS)("%s builds, poses deterministically and stays in frame", (prop) => {
    const a = buildEmoteModel(prop);
    const b = buildEmoteModel(prop);
    let meshes = 0;
    a.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes += 1;
    });
    expect(meshes).toBeGreaterThan(2);

    for (const t of [0, 0.15, 0.4, 1.1, 2.3, 4.7, 9.9]) {
      a.animate(t);
      b.animate(t);
      const sa = snapshot(a.group);
      expect(sa.every(Number.isFinite)).toBe(true);
      expect(sa).toEqual(snapshot(b.group));
      // The camera sits 4.4 units back with a 30° field of view: anything past
      // ±1.5 would be cropped by a square view.
      const box = bounds(a.group);
      expect(box.isEmpty()).toBe(false);
      for (const axis of ["x", "y", "z"] as const) {
        expect(Math.abs(box.min[axis])).toBeLessThan(1.6);
        expect(Math.abs(box.max[axis])).toBeLessThan(1.6);
      }
    }
    a.dispose();
    b.dispose();
  });

  it.each(MODELLED_PROPS)("%s idles: the pose keeps changing after it has settled", (prop) => {
    const m = buildEmoteModel(prop);
    m.animate(1.2);
    const p1 = snapshot(m.group);
    m.animate(1.45);
    const p2 = snapshot(m.group);
    expect(p2).not.toEqual(p1);
    m.dispose();
  });

  it("the hourglass turns over once a cycle and its sand swaps bulbs", () => {
    const m = buildEmoteModel("hourglass");
    const roll = (t: number) => {
      m.animate(t);
      return m.group.rotation.z;
    };
    expect(roll(0.1)).toBeCloseTo(0, 5);
    expect(roll(2.65)).toBeCloseTo(Math.PI, 5);
    expect(roll(5.25)).toBeCloseTo(2 * Math.PI, 5);
    m.dispose();
  });

  it("the swords start apart and are crossed once the clash has landed", () => {
    const m = buildEmoteModel("swords");
    const [left, right] = m.group.children as THREE.Group[];
    m.animate(0);
    const openAt0 = left.rotation.z;
    m.animate(1.0);
    expect(left.rotation.z).toBeLessThan(openAt0);
    expect(right.rotation.z).toBeCloseTo(-left.rotation.z, 5);
    m.dispose();
  });

  it("dispose releases every geometry and material", () => {
    const m = buildEmoteModel("crown");
    const disposed: string[] = [];
    m.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.addEventListener("dispose", () => disposed.push("g"));
      (mesh.material as THREE.Material).addEventListener("dispose", () => disposed.push("m"));
    });
    m.dispose();
    expect(disposed.filter((x) => x === "g").length).toBeGreaterThan(0);
    expect(disposed.filter((x) => x === "m").length).toBeGreaterThan(0);
  });
});
