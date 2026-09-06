# Research: native share of exported climb MP4 (Apple + Android)

## Mechanism
Use **Web Share API Level 2** — `navigator.share({ files: [File], title?, text? })`.
This opens the **OS share sheet**:
- **iOS / iPadOS Safari**: UIActivityViewController (Messages, Mail, AirDrop, Save Video → Photos, Instagram, etc.)
- **Android Chrome**: system share sheet (Drive, WhatsApp, Gmail, Nearby, Save to Files, etc.)

MDN lists `video/mp4` (`.mp4`, `.m4v`) and `video/webm` as usually-shareable file types.
Always gate with `navigator.canShare({ files })` before offering Share.

## Support (practical)
| Platform | File share |
|---|---|
| iOS Safari 15+ | Yes for video/mp4 |
| Android Chrome ~76+ | Yes for video/mp4 and video/webm |
| Desktop Chrome/Edge | Mixed; often canShare(files) === false → hide Share |
| Firefox desktop | Limited / no file share |

HTTPS (secure context) required.

## Critical constraints
1. **User activation**: `share()` must run inside a click/tap handler. Auto-opening the sheet when encode finishes will throw `NotAllowedError` (encode is async and consumes the gesture).
2. Therefore: keep download on encode complete; **retain the Blob/File**; show a **Share** button on success that the user taps.
3. User cancel → `AbortError` — treat as non-error (dismiss quietly).
4. iOS `<a download>` for blob URLs is flaky; Share is often the reliable way to get "Save Video" into Photos. Still keep download for desktop.
5. File must have a real name + MIME: `new File([blob], "climb-99m-20260906.mp4", { type: "video/mp4" })`.
6. Prefer sharing **only files** in canShare probe (title/text can confuse some UAs).

## Recommended product behavior
- After successful export: still download (current behavior).
- If `canShareVideoFile(mime)`: show **Share** beside "Downloaded …".
- Tap Share → native sheet with the same file already downloaded.
- If share unsupported: no Share button (download-only, no dead control).
- Do not replace download with share-only on mobile without an explicit product choice; user asked for share *after* download.

## Out of scope
- Native apps / Capacitor bridges
- Server-hosted share URLs
- Auto-share without a second tap
