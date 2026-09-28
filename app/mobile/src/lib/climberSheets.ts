import { setClimberSpriteSrc } from "@app/components/Game/climberSprite";

/*
  Every climber atlas in the web public/climb/, bundled by Vite. The native app
  has no server root for "/climb/…", so each character's sheets are pointed at
  these bundled URLs. Dropping `<id>-poses-192.png` / `<id>-climb-192.png` into
  public/climb/ is enough: no import to add here. Sheets for an id the registry
  still tints are ignored by setClimberSpriteSrc.

  No type argument: like avatarImages.ts, this file is typechecked by both the
  Vite SPA and the root Next tsconfig (via tests). Values are narrowed below.
*/
export const BUNDLED_SHEET_FILES: Record<string, unknown> = import.meta.glob(
  ["../../../public/climb/*-poses-192.png", "../../../public/climb/*-climb-192.png"],
  { eager: true, import: "default" },
);

const SHEET_FILE = /\/([a-z0-9]+)-(poses|climb)-192\.png$/;

type Sheets = { poses?: string; climb?: string };

/** Bundled sheet URLs per character id, from glob results (path → URL). */
export function climberSheetsFromFiles(files: Record<string, unknown>): Map<string, Sheets> {
  const out = new Map<string, Sheets>();
  for (const [path, url] of Object.entries(files)) {
    const m = SHEET_FILE.exec(path);
    if (!m || typeof url !== "string" || url === "") continue;
    const [, id, sheet] = m;
    const entry = out.get(id) ?? {};
    if (sheet === "poses") entry.poses = url;
    else entry.climb = url;
    out.set(id, entry);
  }
  return out;
}

/** Point every character with bundled sheets at them. Call once at startup. */
export function applyBundledClimberSheets(files: Record<string, unknown> = BUNDLED_SHEET_FILES): number {
  const sheets = climberSheetsFromFiles(files);
  sheets.forEach((s, id) => setClimberSpriteSrc(s, id));
  return sheets.size;
}
