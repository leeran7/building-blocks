import { parseAvatarId } from "@app/lib/avatars";

const FILES = import.meta.glob<string>("../assets/avatars/*.webp", { eager: true, import: "default" });

const FILE_ID = /\/([^/]+)\.webp$/;

/** Bundled image URL per file stem (the stem is the catalogue id). */
export const AVATAR_IMAGES: ReadonlyMap<string, string> = new Map(
  Object.entries(FILES).flatMap(([path, src]) => {
    const id = FILE_ID.exec(path)?.[1];
    return id ? [[id, src] as const] : [];
  }),
);

/** Image URL for a catalogue avatar id; null when unset, retired, or missing art. */
export function avatarSrc(id: string | null | undefined): string | null {
  const valid = parseAvatarId(id);
  return valid === null ? null : (AVATAR_IMAGES.get(valid) ?? null);
}
