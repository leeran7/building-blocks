import { avatarEntry, parseAvatarId } from "@app/lib/avatars";

// No type argument: this file is typechecked by both the Vite SPA (vite/client
// types) and the root Next tsconfig via tests (Next's non-generic
// ImportMeta.glob). The value is narrowed to a string URL below instead.
const FILES: Record<string, unknown> = import.meta.glob("../assets/avatars/*.webp", {
  eager: true,
  import: "default",
});

const FILE_ID = /\/([^/]+)\.webp$/;

/** Bundled image URL per file stem (the stem is the catalogue id). */
export const AVATAR_IMAGES: ReadonlyMap<string, string> = new Map(
  Object.entries(FILES).flatMap(([path, src]) => {
    const id = FILE_ID.exec(path)?.[1];
    return id && typeof src === "string" ? [[id, src] as const] : [];
  }),
);

/**
 * Image URL for a catalogue avatar id; null when unset, retired, or missing
 * art. A skin without its own portrait yet shows its character's.
 */
export function avatarSrc(id: string | null | undefined): string | null {
  const valid = parseAvatarId(id);
  if (valid === null) return null;
  const skinOf = avatarEntry(valid)?.skinOf;
  return AVATAR_IMAGES.get(valid) ?? (skinOf ? (AVATAR_IMAGES.get(skinOf) ?? null) : null);
}
