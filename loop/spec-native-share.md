# Spec delta: Native share of exported climb video

**Product:** The Climb (building-blocks)  
**Goal ID:** replay-native-video-share  
**Parent:** `loop/spec.md` (replay-transport-export) + `loop/architecture.md`  
**Research:** `loop/research-native-video-share.md`  
**Status:** ready for architect  
**Date:** 2026-09-06

This is a **scoped delta** on the existing client-side export success path. It does not reopen transport ACs (AC-1…AC-12) or replace export encode ACs (AC-13…AC-19). Parent AC-15 (download + format-honest label) remains mandatory; this delta adds a **second action** after success.

---

## Goal

After a successful climb-replay video export and download, let the user open the **OS native share sheet** (iOS `UIActivityViewController` / Android system share) for that same video file via the Web Share API Level 2 files path — so they can AirDrop, Messages, Save Video to Photos, Drive, WhatsApp, etc. without leaving the replay surface.

---

## Scope

### In scope

1. After export **success**, retain the encoded video as a named `File` (or equivalent `Blob` + name + MIME) long enough for a subsequent user gesture.
2. When the UA supports file sharing for that MIME (`navigator.canShare({ files })`), show a **Share** control beside the existing “Downloaded MP4|WebM” success UI.
3. On Share tap/click (fresh user activation), call `navigator.share({ files: [File] })` with the retained file (same bytes/name/MIME as the download).
4. Treat user cancel of the sheet (`AbortError`) as a non-error (quiet dismiss of share attempt; success UI stays).
5. Hide Share entirely when file-share is unsupported (no dead control).
6. Keep the existing automatic download on encode complete (do not replace download with share-only).
7. Accessibility: Share is a ≥44×44 CSS-px target; announce share outcome via the existing `aria-live` pattern (monotonic suffix).

### Out of scope / non-goals

- Auto-opening the share sheet when encode finishes (no gesture → `NotAllowedError`)
- Replacing download with share-only on mobile
- Native apps, Capacitor, React Native bridges
- Server-hosted share URLs, CDN upload, or social Graph APIs
- Changing encode pipeline, MIME negotiation order, filename rule, progress/cancel, or visibility policy (parent AC-13…AC-19)
- Changing transport controls or live-play keyboard behavior
- Sharing before encode succeeds, or sharing a partial/cancelled blob
- Custom in-app share UI that lists destinations (OS sheet only)
- Resolving free-leaderboard trust boundary or other unrelated open questions

### Assumptions

- Parent export already produces a downloadable video (`useReplayExport` + `ReplayTransportBar` success: “Downloaded {label}”).
- Production is HTTPS / secure context (required for Web Share).
- MDN-listed shareable types include `video/mp4` and `video/webm`; WebM fallback from parent AC-15 must still be share-gated with `canShare` for that MIME.
- Design tokens remain ASCENT (`app/DESIGN.md`); no second visual language.
- “Share” means OS sheet via Web Share API files — not clipboard copy of a URL.

### Constraints

- `navigator.share` for files **must** run inside a click/tap handler after encode completes (encode is async and consumes the original Export gesture).
- Prefer probing `canShare` with **files only** (title/text in the probe can confuse some UAs). Optional `title`/`text` may be passed to `share()` itself; architect decides whether to include them — product requires files always.
- File must have a real filename + MIME matching the exported container (e.g. `climb-99m-20260906.mp4`, `type: "video/mp4"`).
- Package manager for `app/`: **pnpm**.
- No upload of video bytes to product APIs (parent NFR-6 still holds).

---

## Personas

### P1 — Climber sharer (mobile)

Finished a climb, opened their shared replay on iPhone/Android, exported a video, and wants to post it to Stories / WhatsApp / Messages or Save Video to Photos without hunting the Downloads folder.

### P2 — Spectator friend (mobile)

Watched a friend’s `?r=` replay, exported a clip to react in chat, and needs the OS share sheet after download.

### P3 — Desktop reviewer

Exports on Chrome/Edge desktop where file-share is often unavailable. Still needs the download; must not see a non-functional Share button.

---

## Stories

### S-NS-1 — Share after successful download

**As a** climber sharer, **I want** a Share action after the replay video finishes downloading, **so that** I can send or save it through my phone’s native share sheet.

- **Happy path:** Export succeeds → file downloads → Share is visible (when supported) → user taps Share → OS sheet opens with the video file → user completes a destination (or cancels — see failure).
- **Failure case:** User cancels the OS sheet → UI does not show an error; success state and retained file remain so they can tap Share again or Dismiss.

### S-NS-2 — Hide Share when unsupported

**As a** desktop reviewer, **I want** Share hidden when my browser cannot share files, **so that** I am not offered a dead control.

- **Happy path:** `canShare({ files })` is false → success UI shows only “Downloaded …” + Dismiss (current chrome plus no Share).
- **Failure case:** `canShare` throws or is missing → treat as unsupported; Share is not mounted.

### S-NS-3 — WebM / MIME-honest share

**As a** climber sharer on a browser that encoded WebM, **I want** Share to use the same WebM file and MIME the download used, **so that** the sheet receives a valid shareable type (or Share stays hidden if that type cannot be shared).

- **Happy path:** Success label is WebM → retained `File` has `.webm` + `video/webm` → if `canShare` true, Share opens with that file.
- **Failure case:** Encoded MIME is not shareable per `canShare` → Share hidden; download still occurred.

---

## Acceptance criteria

Numbering: **AC-NS-*** (native-share delta). Parent AC-1…AC-20 unchanged.

### Presence & gating

**AC-NS-1.** Given export status is `success` with retained file MIME `M` and filename `F`, when `navigator.canShare` exists and `navigator.canShare({ files: [fileWith(F,M)] }) === true`, then a Share control is visible in the export success chrome alongside the “Downloaded {label}” text (label remains MP4 or WebM per parent AC-15).  
*(Negative: Given `canShare` is missing, throws, or returns false for that files payload, when success chrome is shown, then no Share control is mounted and Dismiss remains available.)*

**AC-NS-2.** Given a coarse-pointer viewport and Share is shown, when measuring the Share control hit target, then it is at least **44×44 CSS pixels**.

**AC-NS-3.** Given live play (`replaying === false`) or export status is not `success`, when the transport/export chrome is rendered, then no Share control for a replay video file is mounted.

### Gesture & share invocation

**AC-NS-4.** Given success chrome with Share visible and a retained `File`, when the user activates Share via a click/tap handler, then within that same activation the product calls `navigator.share` with a payload whose `files` array length is 1 and whose file `name` and `type` equal the export filename and MIME used for the download.  
*(Negative: Given encode completes successfully, when no subsequent user gesture occurs, then `navigator.share` is not invoked automatically.)*

**AC-NS-5.** Given Share was activated and the UA presents the share sheet, when the user cancels the sheet such that `share()` rejects with an error whose `name` is `AbortError`, then within 500 ms the UI shows **no** new error banner/message for that cancel, export status remains `success` (or an equivalent success chrome with Share still available if `canShare` still true), and transport controls remain usable.

**AC-NS-6.** Given Share was activated and `share()` rejects with a non-`AbortError` (e.g. `NotAllowedError`, `DataError`, `TypeError`), when the rejection is observed, then within 2 s the UI shows a dismissible error string that is not empty, and the retained file is not required to be cleared (user may Dismiss or retry Share if still shown).

### Retention, MIME, dismiss

**AC-NS-7.** Given a successful encode that triggers download of blob bytes `B` with MIME `M` and filename `F`, when success chrome is shown, then a retained shareable `File` (or Blob+name+type) is available such that its byte length equals `B.size`, `type` equals `M`, and `name` equals `F`, until the user dismisses success or starts a new export.  
*(Negative: Given user activates Dismiss on success, when success chrome unmounts, then the retained object URL / file reference is released and Share is no longer available until a new successful export.)*

**AC-NS-8.** Given parent export chose WebM (`label === "WebM"`, MIME `video/webm`, extension `.webm`), when evaluating Share visibility, then gating uses `canShare` on a file with that WebM MIME (not a forged `video/mp4` type). Given parent chose MP4, gating uses `video/mp4`.

**AC-NS-9.** Given success chrome with both download already completed and Share visible, when the user completes a share destination successfully (`share()` fulfills), then within 1 s an `aria-live` announcement indicates share completed (text contains “Shared” or “Share complete”, plus a monotonic suffix so repeats re-announce), and success chrome may remain until Dismiss.

### Regression

**AC-NS-10.** Given a successful export on a UA where Share is hidden, when success is shown, then the browser still received the download trigger per parent AC-15 (filename rule and format-honest label unchanged).  
*(Negative: Given Share is shown on a supporting mobile UA, when success is shown, then download still occurred; Share is additive, not a substitute for the download step.)*

---

## NFRs

| ID | Requirement | Measure |
| --- | --- | --- |
| NFR-NS-1 | Gesture safety | Zero automatic `navigator.share` calls from encode `onstop` / success transition without a new user activation (AC-NS-4 negative). |
| NFR-NS-2 | Share invoke latency | From Share click to `navigator.share` call start ≤ **100 ms** on a mid-tier phone (excludes OS sheet animation). |
| NFR-NS-3 | A11y | Share meets WCAG 2.1 AA contrast for its label; keyboard-reachable on desktop when shown; 44×44 target (AC-NS-2); live-region on success share (AC-NS-9). |
| NFR-NS-4 | Privacy | Share uses only the local File/Blob; no POST of video bytes to product APIs (parent NFR-6). |
| NFR-NS-5 | Auth | No login required to share an exported replay video (parent NFR-5). |
| NFR-NS-6 | Perf isolation | Live climb (`replaying === false`) pays no per-frame cost for share retention (parent NFR-8). |
| NFR-NS-7 | Secure context | Feature relies on existing HTTPS prod; no new insecure endpoint. |
| NFR-NS-8 | Memory | Retained File for one export at a time; released on Dismiss, new export start, or unmount (AC-NS-7 negative). |

---

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Encode completes without user activation → auto-share throws `NotAllowedError` | Broken UX / error noise | AC-NS-4 negative; Share button only |
| Desktop `canShare(files)` false | Confusion if Share shown dead | AC-NS-1 negative; hide control |
| Early `revokeObjectURL` / GC before Share | Share fails or empty file | AC-NS-7 retain until Dismiss/new export; architect owns revoke timing vs parent 1 s download revoke |
| WebM share support varies by UA | Share hidden or sheet rejects | AC-NS-8 MIME-honest gate; AC-NS-6 for non-abort errors |
| Probe including `title`/`text` falsely fails `canShare` | Share hidden on capable phones | Constraint: files-only probe |
| iOS blob `<a download>` flaky | User thinks export failed | Keep download + Share (“Save Video”) per research; do not remove download |
| Legal: sharing someone else’s climb clip | Low for v1 client-only | Out of scope; no server store |

---

## Edge cases (must handle)

1. **User cancels sheet** — `AbortError` → non-error (AC-NS-5).
2. **Unsupported UA** — hide Share (AC-NS-1 negative).
3. **WebM fallback MIME** — gate and share with `video/webm` (AC-NS-8).
4. **No gesture on encode complete** — never auto-share (AC-NS-4 negative).
5. **Dismiss then Share** — after Dismiss, Share gone until new export (AC-NS-7 negative).
6. **Second export** — new success replaces retained file; prior file released.
7. **Share while success showing, then Cancel export UI** — only Dismiss/idle clears retention; there is no in-progress encode during success.
8. **`canShare` true but `share` later fails** — AC-NS-6 dismissible error; download already done.
9. **Non-secure context (local http:// exception hosts)** — if `canShare`/share unavailable, hide Share; do not invent a polyfill.

---

## Open questions (non-blocking)

1. **Share copy:** Exact button label — product default **“Share”** (uppercase mono to match transport). Architect/design may use “Share video” if space allows; AC text matches visible accessible name containing “Share”.
2. **Optional `title`/`text` in `share()` payload** — allowed; must not be required for `canShare` probe.
3. **Whether success chrome auto-dismisses after a fulfilled share** — default **no** (user Dismisses); Future may auto-dismiss.
4. **Free-leaderboard trust boundary** — unrelated; remains open.

---

## Future

- Auto-dismiss success chrome after fulfilled share
- Share-only shortcut on iOS if download proves chronically broken (explicit product choice)
- Server-hosted MP4 + link share for desktop
- End-card / trim before share
- Native app share bridges

---

## Traceability

| Story | ACs |
| --- | --- |
| S-NS-1 Share after download | AC-NS-1, AC-NS-2, AC-NS-4, AC-NS-5, AC-NS-6, AC-NS-7, AC-NS-9, AC-NS-10 |
| S-NS-2 Hide when unsupported | AC-NS-1 negative, AC-NS-3, AC-NS-10 |
| S-NS-3 WebM MIME-honest | AC-NS-8, AC-NS-1 |

**Parent dependency:** AC-15 (download + honest label), AC-13 (encode), AC-17 (unsupported encode).  
**AC count (this delta):** 10 (AC-NS-1…AC-NS-10)

---

## Verification notes (for verifier / qa-acceptance)

- Prefer **invoked units** with injectable `canShare` / `share` fakes; do not prove Share by grepping source for `navigator.share`.
- Positive fixture: `canShare` → true mounts Share; negative: false/missing/throw → no Share.
- Abort fixture: reject with `{ name: "AbortError" }` → no error status.
- Non-abort fixture: reject with `{ name: "NotAllowedError" }` → error UI within 2 s.
- Gesture negative: success transition must not call the share fake.
- WebM fixture: file.type `video/webm` in both canShare probe and share payload.
