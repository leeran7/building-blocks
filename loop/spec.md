# Split free-climb leaderboard (mobile / desktop)

Scoped PRD for **The Climb** skill ranking only. Not a greenfield app. Does not choose stack, storage, or framework.

User intent: *Split leaderboard between mobile & desktop. Mobile is default.*

---

## Goal

Stop ranking incomparable free-climb peaks on one board.

Touch play fills the viewport and matches the device aspect. Keyboard play stays on a locked 9:16 stage. Visible tower metres scale with aspect (`(height / width) * tower width`), so a taller fill-stage sees further up the tower. That is a real edge on a shared ranking.

This change creates **two skill boards** — **Mobile** and **Desktop** — classified by **play surface**, with **Mobile as the default view**. Historical untagged peaks go to **Desktop** (the original 9:16 contract) so the featured Mobile board starts as a fair touch ranking.

Paid-stack Block altitude rankings do not change.

---

## Scope

### In scope

- Free-climb skill ranking only (today: `/climb`, landing `#free` teaser, dashboard free-climb card, signed-in persist of a free run).
- Two boards: **Mobile** and **Desktop**.
- Default **view**: `/climb` with no board query, landing teaser tab, dashboard list order.
- Default **write** when the client omits `board`: Mobile.
- Cutover of records that were stored **without** an explicit board: Desktop.
- Isolation of peaks, ranks, and totals per board.
- One account may hold a rank on both boards.
- Hero social proof after the split: distinct climbers across both boards; **Top climb** from the Mobile board only.
- Empty vs unavailable standings on **each** board, including the landing teaser.
- Copy/control so a visitor on an empty Mobile board can reach pre-split scores on Desktop.

### Out of scope

- Paid towers, Block altitude, Stripe, seasons, burial, `/stack/[category]`.
- Server re-simulation of `peakY` (existing F-1 / AC-17). This PR does not close that.
- A third “legacy” board.
- Splitting replay lists, share URLs, or `/play` by board beyond posting the matching board and linking back to it.
- User-Agent or viewport-width classification.
- Auto-selecting the landing tab from the visitor’s pointer.
- New payouts, anti-cheat beyond the existing height envelope, or auth model changes.

### Assumptions (resolved product questions)

| Question | Decision |
| --- | --- |
| Which leaderboard(s) split? | **Free climb skill board only.** Paid towers stay one ranking per stack. |
| What is “mobile” vs “desktop”? | **Play surface of that run**, the same classifier the canvas already uses to choose fill-stage vs 9:16. Coarse-pointer / fill-stage / touch controls → **Mobile**. Fine-pointer / framed 9:16 / keyboard → **Desktop**. Not CSS viewport width. Not User-Agent. |
| What does “mobile is default” mean? | **Default view** (`/climb` with no query, landing tab, dashboard order) **and default write** when `board` is omitted. **Not** the home for historical untagged scores. |
| Where do untagged scores go? | **Desktop.** Original locked play area was 9:16 (`360×640` baseline). Fill-stage is the newer, mechanically different mode (~2 days of mixed play vs ~4 days of 9:16-only before this split). Dumping mixed history onto the featured Mobile board recreates the unfairness this change exists to remove. A third legacy board is gold-plating. |
| Rank on both? | **Yes.** Separate monotonic peaks. A phone PB does not overwrite a keyboard PB. |
| Client-declared `board`? | **Yes**, for this non-payout board. Same spoof class as client `peakY`. Allow-list only; invalid → 400 and **no persist**. Omit/null → Mobile. This does **not** close the peak-height trust boundary. |

### Constraints

- Handles stay pseudonyms; emails never appear on either board.
- Peak height remains monotonic **per board**: a worse run cannot lower that board’s record.
- Anonymous play still runs; persist still requires a signed-in user with an email, as today.
- Existing height envelope on persist still applies; `board` does not bypass it.
- `/climb` must not treat a failed read as “no climbers yet” (already true for the single board; must remain true per board).
- Design tokens stay ASCENT (`app/DESIGN.md`): tab targets ≥ 44×44 px; WCAG 2.1 AA; `text-muted` is not the only affordance on a switcher.
- Kernel: invalid `board` values are **rejected**, never coerced onto a ranking. Omitted `board` is a documented product default (Mobile), not an invalid-value substitute.

---

## Personas

**Maya (touch climber).** Plays on a phone or tablet. Canvas is full-bleed fill-stage with on-screen controls. She wants the default `/climb` list to be other fill-stage peaks, not keyboard 9:16 scores that saw a different slice of tower.

**Drew (keyboard climber).** Plays on a laptop with a framed 9:16 stage. He wants a desktop board so a taller phone stage cannot out-see him on the same list.

**Riley (returning signed-in climber).** Already has a peak from before the split. She wants that height to still exist, and she wants a new Mobile rank only from a new Mobile run — not a silent copy of an incomparable old peak onto the featured board.

---

## Stories

### S1 — Featured board is Mobile

As a visitor, I want `/climb` with no query to show the Mobile board, so that the default ranking is the featured touch ranking.

- Happy path: open `/climb` → Mobile tab selected → only Mobile rows.
- Failure: `?board=tablet` (or empty/unknown) does not 404 and does not merge boards; it shows Mobile.

### S2 — Open the other board

As a visitor, I want to switch to Desktop and deep-link it, so that I can see the keyboard ranking without mixing lists.

- Happy path: Desktop tab or `/climb?board=desktop` → Desktop tab selected → only Desktop rows. Mobile tab restores the clean `/climb` URL.
- Failure: a Desktop-only rank-1 player does not appear on Mobile.

### S3 — A run ranks on the surface it was played on

As a signed-in climber, I want my peak applied only to the board that matches that run’s canvas, so that scores on a list were earned the same way.

- Happy path: fill-stage run persists to Mobile; 9:16 run persists to Desktop; response names the board; post-run “view leaderboard” opens that board.
- Failure: `board` not in `{mobile, desktop}` → 400, nothing persisted. Viewport width alone does not choose the board.

### S4 — One account, two peaks

As Riley, I want a separate PB on each board, so that playing on my phone cannot clobber my keyboard rank (or vice versa).

- Happy path: Mobile 10 m and Desktop 40 m produce two ranks, each vs that board only.
- Failure: a new Mobile 12 m leaves Desktop at 40 m. A first Mobile run that is lower than the Desktop PB creates a Mobile record at the new peak rather than taking `max` across boards.

### S5 — Pre-split peaks live on Desktop

As Riley, I want untagged historical peaks to land on Desktop, so that Mobile starts clean and my old height is not deleted.

- Happy path: after cutover, old rows list on Desktop only. A later Mobile run ranks from that run’s peak only.
- Failure: those old rows do not appear on Mobile. If Mobile is empty and Desktop is not, the Mobile empty state still offers a control to open Desktop (so the split does not look like a wipe).

### S6 — Landing teaser and hero proof

As a landing visitor, I want both skill boards with Mobile first, and hero numbers that do not pretend the two stages are one game.

- Happy path: `#free` shows both boards, Mobile selected; tab switch does not leave `/`. Climbers = distinct people across both boards.
- Failure: one board’s read failing does not render as “no climbers yet” while the other board is fine. Hero **Top climb** is the Mobile max, not `max(mobile, desktop)`.

### S7 — Dashboard shows each board I am on

As a signed-in climber, I want my dashboard to list every free-climb board I have a record on, Mobile first, so that I can see both ranks without guessing.

- Happy path: both records → two rows, Mobile first, each with rank / field size / peak, linking to that board’s `/climb`.
- Failure: Desktop-only user sees no fake Mobile row. No records → empty card, no invented rank.

### S8 — Paid towers stay one ranking

As a visitor to a paid stack, I want Block altitude to stay a single ranking, so that this split cannot fork a money board.

- Happy path: `/stack/[category]` (with or without `?board=`) still shows one altitude list.
- Failure: posting a free-climb result never writes paid altitude; paid landing stats/CTAs are unchanged.

---

## ACs

Numbered for mechanical QA. No taste. At least one negative per critical flow.

### S1 — Default view

**AC-1.** Given no `board` query, when a visitor GETs `/climb`, then the Mobile board is the selected board and the list contains only that board’s standings (top 50).

**AC-2.** Given `?board=desktop`, when a visitor GETs `/climb`, then the Desktop board is the selected board and the list contains only that board’s standings (top 50).

**AC-3.** Given `board` is `tablet`, `Mobile`, `1`, `""`, or another value not in `{mobile, desktop}`, when a visitor GETs `/climb`, then the response is HTTP 200 showing the Mobile board — not 4xx, not a merged list, not Desktop.

**AC-4.** Given the standings read for the selected board fails, when `/climb` renders, then the page shows standings-unavailable copy and does **not** show the empty-board “no climbers yet” copy.

### S2 — Switch and isolation

**AC-5.** Given `/climb` (Mobile), when the visitor activates the Desktop tab, then the URL is the Desktop board URL and the list is Desktop standings only.

**AC-6.** Given `/climb?board=desktop`, when the visitor activates the Mobile tab, then the URL is `/climb` with no `board` query and the list is Mobile standings only.

**AC-7.** Given player D is rank 1 on Desktop and has no Mobile record, when the visitor is on the Mobile board, then D is not in the Mobile list.

### S3 — Persist matches play surface

**AC-8.** Given a signed-in run whose canvas was fill-stage (the coarse-pointer / touch path), when POST `/api/climb/result` succeeds with `saved: true`, then the peak is applied only to the Mobile board, the JSON includes `board: "mobile"`, and a viewport width ≥ 1024 px does not move that run to Desktop.

**AC-9.** Given a signed-in run whose canvas was framed 9:16 (the fine-pointer / keyboard path), when POST `/api/climb/result` succeeds with `saved: true`, then the peak is applied only to the Desktop board, the JSON includes `board: "desktop"`, and a viewport width ≤ 390 px does not move that run to Mobile.

**AC-10.** Given an otherwise valid POST whose `board` field is omitted or JSON `null`, when persist runs, then the peak is applied to the Mobile board.

**AC-11.** Given a POST whose `board` is not exactly `mobile` or `desktop` (including `"Mobile"`, `"tablet"`, `1`, `{}`, `""`), when it is received, then the response is **400** with `code: "INVALID_BOARD"` and **no** run row and **no** peak write occurs — including before anonymous short-circuit. Invalid values are not stored as Mobile.

### S4 — Independent peaks

**AC-12.** Given user U has Mobile peak 10 and Desktop peak 40, when either board is listed, then rank and `totalClimbers` for U on that board count only records on that board.

**AC-13.** Given user U has Mobile 10 and Desktop 40, when U posts a Mobile peak of 12 that is accepted, then Mobile peak is 12 and Desktop peak remains 40.

**AC-14.** Given user U has Desktop 40 and no Mobile record, when U posts an accepted Mobile peak of 8, then a Mobile record exists at 8 and the Desktop record remains 40 (no cross-board `max`).

### S5 — Historical cutover

**AC-15.** Given skill records that existed with no explicit board assignment (pre-split), when the split is applied, then those records appear in Desktop standings and do **not** appear in Mobile standings.

**AC-16.** Given such a historical Desktop record of height H, when that user later posts an accepted Mobile run of peak P, then the Mobile peak is P (not `max(H, P)`) and the Desktop peak remains H.

**AC-17.** Given Mobile lists 0 climbers and Desktop lists ≥ 1, when the visitor is on the default Mobile board (`/climb` or landing Mobile tab), then the empty state includes a control that opens the Desktop board.

### S6 — Landing and hero

**AC-18.** Given the landing free-climb section, when it renders, then both boards are available, **Mobile** is the selected tab, Desktop is reachable without leaving `/`, and a “full leaderboard” control for the selected board goes to that board’s `/climb` URL.

**AC-19.** Given the Mobile teaser read fails and the Desktop teaser read succeeds (and the symmetric case), when the landing teaser renders, then the failed board shows standings-unavailable (not empty-board copy) and the successful board still lists its rows.

**AC-20.** Given users who have a free-climb record on one or both boards, when the hero **Climbers** stat is computed, then it equals the number of distinct users with at least one free-climb record (a user on both boards counts once).

**AC-21.** Given Desktop max peak D and Mobile max peak M, when the hero **Top climb** stat is computed, then the shown metres equal M (Mobile board only), not `max(D, M)`. If Mobile has no records, the stat is the empty marker `—` even when D is non-null.

### S7 — Dashboard

**AC-22.** Given a signed-in user with records on both boards, when GET `/api/dashboard` returns 200, then `freeClimb.boards` lists both standings, **Mobile first**, each with that board’s `rank`, `totalClimbers`, and `peakY`.

**AC-23.** Given a signed-in user with a Desktop record only, when the dashboard free-climb card renders, then only a Desktop row is shown (no Mobile row at peak 0 / rank of an empty board).

**AC-24.** Given a signed-in user with no free-climb records, when the dashboard renders, then the free-climb empty card is shown and no rank number is invented.

### S8 — Paid stacks

**AC-25.** Given any paid stack tower, when it is loaded with or without `?board=mobile` / `?board=desktop`, then the altitude ranking is the single paid ranking for that stack (not split, not filtered by skill board).

**AC-26.** Given POST `/api/climb/result` with a paid-stack `categorySlug`, when persist succeeds, then paid Block altitude is unchanged and the skill peak is written only to the free-climb board named by AC-8–AC-10.

**AC-27.** Given the landing paid directory and paid hero stats (block counts, claim price), when this split ships, then those paid figures and CTAs still reflect paid stacks only (they do not start counting skill-board rows).

---

## NFRs

| ID | Requirement |
| --- | --- |
| NFR-1 | **Auth.** POST persist still optional: no/invalid token → `saved: false` (after `board` validation). Dashboard still requires a valid Firebase Bearer. Public GET `/climb` and `/` stay unauthenticated. |
| NFR-2 | **Privacy.** Neither board lists email. Display remains handle / moderated display name as today. |
| NFR-3 | **Integrity envelope.** Existing persist height/tick bound still rejects implausible `peakY` (400 `IMPLAUSIBLE_RESULT`) regardless of `board`. `board` is not a bypass. |
| NFR-4 | **Rate limit.** Climb persist stays capped at **60** requests / **60 s** / client IP, fail-open. The cap stays **global**, not 60 per board (partitioning the ranking does not double the abuse budget). |
| NFR-5 | **Freshness.** `/climb` remains request-fresh (not a build-time snapshot). After `saved: true` on board X, the next GET of that board’s `/climb` includes the peak if it is in the top 50. Landing may stay ISR ≤ **60 s** provided persist triggers revalidation of `/` and `/climb`. |
| NFR-6 | **Latency.** GET `/climb` p95 TTFB ≤ **1.0 s** for one board of 50 rows. The two landing teaser reads run concurrently; combined wall time ≤ **1.5×** a single teaser read at the same N. Dashboard adds at most **2** extra standing queries vs today’s single free-climb read, still within the route’s existing query budget class. |
| NFR-7 | **Scale envelope.** Top **50** on `/climb`, top **8** on the landing teaser, per board. Design for **10 000** records per board without changing those caps. Rank is 1-based among that board’s records; ties stay peak desc, earlier update first, **per board**. |
| NFR-8 | **A11y.** WCAG 2.1 AA. Board switcher is a `tablist`; selected tab `aria-selected="true"`; each tab minimum **44×44** px; the list’s accessible name includes the board (e.g. “Mobile skill climb leaderboard”). Do not use `text-muted` as the only text on a selected tab. `prefers-reduced-motion` unchanged. |
| NFR-9 | **Classifier stability.** Board for a run is the play-surface classifier in effect for **that run’s canvas**, not a later pointer change after persist. Hybrid laptops follow the canvas path they actually used. |

---

## Risks

| Risk | Severity | Notes |
| --- | --- | --- |
| Client-spoofed `board` | Medium | A keyboard player can POST `mobile` and enter the featured list with a 9:16 peak. Same class as spoofed `peakY`. Acceptable because this board **does not pay out**. Allow-list + 400 is the control; not User-Agent. |
| Historical → Desktop looks like a wipe | Medium | Featured `/climb` may go empty. **AC-17** is the mitigation. |
| Omit → Mobile during old-client window | Low | Open tabs that omit `board` write fill-or-9:16 peaks onto Mobile and nibble at cleanliness. Short-lived if client and API ship together. Invalid strings must still 400. |
| Combined **Top climb** | Medium if ignored | `max` across boards is a scalar aggregate on a partitioned ranking (kernel: a partitioned resource cannot keep the old global scalar). **AC-21** forbids it. |
| Landing failed-read → empty | Medium | Two teaser reads double the chance of swallowing an error into “no climbers yet”. **AC-19**. |
| F-1 peak trust unchanged | High (pre-existing) | `peakY` is still client-reported and monotonic per board. Splitting boards **doubles** the irreversible write targets. This spec does **not** add server-derived peaks. See Open Questions. |
| Hybrid pointer vs fill mismatch | Low | Product rule is “match the canvas,” not “match the device marketing name.” |
| Paid-stack accidental split | Critical if it happens | **S8**. Skill `board` must not appear on Block altitude writes or tower queries. |
| Rate-limit partition | Low | Do not raise the persist cap to 60 per board (**NFR-4**). |

Shipped-code mismatches (not ACs; for architect / implementer) are listed in the product-spec handoff `divergences` array.

---

## Open Questions

None blocking. The six product questions are decided under Assumptions.

**Not this PR (remains open at product level):**

- **F-1 / AC-17.** The free skill board is reputation-adjacent (landing, next to paid stacks) and still accepts client `peakY` inside a damage cap. **This change explicitly does not require server-derived peaks.** Re-sim stays a future ranked/verified climb. Do not treat `board` allow-listing or a tighter envelope as closing F-1.

Reversible without rewriting the rest of the spec (human override only):

- If production evidence shows almost all pre-split play was fill-stage, a human may redirect **AC-15** to Mobile. Default in *this* spec stays Desktop. Do not add a third board without a new intent.

---

## Future

- Server-derived `peakY` from seed + input log (AC-17) for any public skill ranking shown next to paid stacks.
- Third “legacy / pre-split” board if Desktop-as-history is too noisy after cutover.
- Device-split paid towers (explicitly rejected now).
- Per-board replay lists and share cards.
- Landing tab auto-selected from the visitor’s pointer (shared screens make this surprising).
- Requiring `board` on every POST (400 on omit) once old clients are gone — stricter than AC-10, not required to ship the split.
