/**
 * The avatar art and the catalogue are two lists kept in step by hand: an
 * image dropped in with a typo, or a catalogue line added without its file,
 * would silently render initials in the app. This pins them to each other and
 * to what is actually on disk (the bundler glob only sees *.webp).
 */

import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AVATARS } from "../../src/lib/avatars";
import { AVATAR_IMAGES, avatarSrc } from "../../mobile/src/lib/avatarImages";

const ASSET_DIR = resolve(import.meta.dirname, "../../mobile/src/assets/avatars");

describe("mobile avatar images", () => {
  it("resolves every catalogue id to a bundled image", () => {
    let checked = 0;
    for (const a of AVATARS) {
      const src = avatarSrc(a.id);
      expect(src, `missing image for ${a.id}`).toEqual(expect.stringMatching(new RegExp(`${a.id}\\.webp`)));
      checked++;
    }
    expect(checked).toBe(AVATARS.length);
    expect(checked).toBeGreaterThan(0);
  });

  it("maps every bundled image to a catalogue id", () => {
    const catalogue = new Set(AVATARS.map((a) => a.id));
    let checked = 0;
    for (const id of AVATAR_IMAGES.keys()) {
      expect(catalogue.has(id), `image ${id}.webp has no catalogue entry`).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("bundles every file in the avatars folder (none in a format the glob skips)", () => {
    const onDisk = readdirSync(ASSET_DIR).filter((f) => !f.startsWith("."));
    expect(onDisk.length).toBeGreaterThan(0);
    expect(onDisk.every((f) => f.endsWith(".webp"))).toBe(true);
    expect([...AVATAR_IMAGES.keys()].sort()).toEqual(onDisk.map((f) => f.replace(/\.webp$/, "")).sort());
  });

  it("returns null for no avatar, a retired id, or an inherited key", () => {
    expect(avatarSrc(null)).toBeNull();
    expect(avatarSrc(undefined)).toBeNull();
    expect(avatarSrc("retired-avatar")).toBeNull();
    expect(avatarSrc("constructor")).toBeNull();
  });
});
