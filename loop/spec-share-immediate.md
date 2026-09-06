# Spec delta: share-first export (no download prompt when shareable)

## Goal
When the device can open a native file share sheet for the exported video, **do not** trigger a browser download. Prefer `navigator.share({ files })` as the delivery path.

## In scope
1. After encode succeeds, probe `canShareVideoFile(file)`.
2. If **true**: skip `downloadBlob`; retain File; **attempt** `shareVideoFile` immediately in the success path; keep Share control if the attempt returns `unsupported` / `error` with NotAllowed / or leave Share for retry / abort.
3. If **false**: keep today’s download behavior (desktop fallback).
4. Success copy: when share-first, show “Ready to share {label}” (not “Downloaded …”). After a fulfilled share, announce “Share complete”.
5. Share button still present whenever `canShareVideoFile` is true so the user can retry after a lost user-activation or cancel.

## Out of scope
- Changing encode/MIME pipeline
- Server upload
- Forcing share on desktop when canShare is false

## Acceptance criteria
**AC-SI-1.** Given canShare({files:[file]})===true after encode, when success runs, then downloadBlob / `<a download>` is **not** invoked.
**AC-SI-2.** Given canShare===false, when success runs, then download still occurs (prior AC-NS-10 download path).
**AC-SI-3.** Given canShare===true, when success runs, then shareVideoFile is invoked once as a continuation of the Export/Share click async function (await encode, then share) when possible — not as a fire-and-forget from MediaRecorder.onstop alone. If it returns aborted/error/unsupported due to missing gesture, success chrome remains with Share button (≥44×44).
**AC-SI-4.** Given Share button click after share-first success, when user completes OS share, then aria-live announces Share complete (prior AC-NS-9).
**AC-SI-5.** WebM/MP4 MIME honesty unchanged (AC-NS-8).
