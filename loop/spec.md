# Spec: Climb-recording share SEO (X, TikTok, YouTube)

**Product:** The Climb / Doomstack (`app/`).
**Goal owner:** product-spec
**Status:** buildable (assumptions recorded; not blocked)
**Canonical public origin (production):** `https://www.doomstack.lol` (`PUBLIC_CONFIG.siteUrl` / `resolveBaseUrl()`)

This spec makes a finished climb **recording** (a persisted `ClimbRun` with a `replay_token`) shareable as a **short, stable, crawler-unfurlable link**, and gives the marketing agent a **machine-readable share payload** it can consume without inventing copy or silently overflowing platform limits.

It does **not** choose a stack, database, or framework. It names existing product units only where architects and testers must call them.

---

## Goal

When a climb recording is shared as a **link** on **X, TikTok, or YouTube**:

1. The URL is short, stable, and canonical (today’s `/play?r={huge-token}` burns X’s 280 characters and is hostile to crawlers).
2. Platform crawlers receive **unique** `og:title`, `og:description`, `og:image`, `og:url`, and `twitter:card=summary_large_image` (TikTok uses Open Graph the same way).
3. A **public JSON share payload** exists so a marketing agent (unmerged sibling `origin/cursor/ai-social-media-agent-133a`, PR #11) can fill `title` / `caption` / `description` / `hashtags` / `cta` without inventing copy or overflowing limits. **PR #11 must not be required to merge.**
4. Human share UI (`ShareRun` + dashboard `ClimbReplaysSection`) offers **X / TikTok / YouTube** actions that consume **that same payload** — not a tweet-only button.
5. Permanent listing pages (`/b/[slug]`) get the **same class** of OG/Twitter cards. Climb recordings are the primary story.

---

## Scope

### In scope

- Canonical short recording URLs for **persisted** runs (`ClimbRun` with a non-null `replay_token`).
- Per-recording metadata: title, description, canonical URL, Open Graph, Twitter card.
- Dynamic OG images in **ASCENT tokens only** (void / signal / ember from `app/DESIGN.md`): landscape **1200×630** for X/OG; square **1080×1080** variant for TikTok previews. Do not invent a second palette.
- Restyle existing listing card `GET /api/og` to the same ASCENT tokens so homepage shares do not look like a different product (today: sky-blue `#0ea5e9` “DOOMSTACK” card).
- Public JSON share payload for a recording, plus a **pure builder** the social agent can import later. Overlapping field names match the agent’s draft fields: `title`, `caption`, `description`, `hashtags`, `cta`, plus `canonicalUrl` and `imageUrl`.
- Share UI: X tweet **web intent**; copy TikTok caption; copy YouTube title+description. TikTok and YouTube have **no** public “compose a post with this URL” web intent — do not fake one; report `UNSUPPORTED_BY_PLATFORM` the same way the social agent does.
- `robots.txt` + sitemap of **public marketing URLs**: home, `/play`, `/climb`, `/b/[slug]` for existing blocks. **Do not** dump climb recordings into the sitemap.
- JSON-LD `WebPage` on recording pages (and record pages). `VideoObject` **only if** a real hosted video or embed URL exists — we do not host an MP4 today, so **do not claim VideoObject**.
- Bot UA additions for TikTok / ByteDance (`tiktok`, `bytespider`, `bytedance`) so they are not counted as paid-stack views **and** still receive the HTML document.
- Record-page (`/b/[slug]`) `openGraph` + `twitter` metadata and a matching ASCENT OG image.
- Additive `POST /api/climb/result` field so the client can build the short URL after save (`runId`). `recordClimb` keeps all existing return fields.

### Out of scope (this change)

- Merging or modifying the social-agent Prisma schema, OAuth, or publish pipeline (PR #11).
- Encoding canvas gameplay to MP4 / uploading video (`prepare_video_upload` on the social agent).
- Changing the climb score trust model (server-derived `peakY` / AC-17 re-sim). Share cards display the **already persisted** `peak_y`.
- Instagram, LinkedIn, Facebook-as-a-target (Facebook’s crawler may still hit OG tags; we do not add compose actions).
- New paid-stack view-credit paths for `/r/{id}` (recordings are not listings).
- Rewriting landing-page grid / background ACs (stale comments on `app/app/page.tsx` AC-27 / AC-32 are a separate rewrite).

### Future

- Twitter player cards / iframe autoplay embeds.
- oEmbed.
- 9:16 (1080×1920) OG variant.
- `X_THREAD` / `YOUTUBE_LONGFORM` payload variants.
- Unique OG cards for anonymous `/play?r=` token URLs (would require server-side token decode).
- Sitemap of recordings (privacy review required — short ids are enumerable).
- Wiring this builder into PR #11 generation so brand CTAs + avoid-terms run on recording copy.
- Server-derived peaks for the free leaderboard (open question F-1 — **not closed here**).

---

## Assumptions (ADR-style — prefer these over blocking)

**A-1. Marketing canonical is persisted `/r/{recordingId}` only.**  
Anonymous and unsaved runs keep working as playback via `/play?r={token}`. SEO, unique OG, share payload, and marketing CTAs attach **only** to a persisted `ClimbRun` that has a `replay_token`. `{recordingId}` is that row’s identifier. Architect may encode the identifier but the public path prefix is `/r/`.

**A-2. `/play?r=` does not get unique cards.**  
Decoding a replay token on the server for every crawler hit is out of budget for this change. `/play` (with or without `?r=`) keeps **generic play metadata**. Token links remain valid for **human playback**.

**A-3. Default payload content types** (link-unfurl, not video upload): `X_POST`, `TIKTOK_VIDEO`, `YOUTUBE_SHORT`. No thread generation in v1.

**A-4. Character counting matches the social agent.**  
Limits use JavaScript `.length` (UTF-16 code units), same as `validateCaptionLength` on PR #11 — not Twitter’s weighted cram count. Limits: X caption **280**, TikTok caption **2200**, YouTube title **100**, YouTube description **5000**.

**A-5. Over-limit ⇒ invalid, never slice.**  
Mirrors social-agent AC-17. A builder that would exceed a limit returns `ok: false` / `VALIDATION_ERROR` and does **not** return a truncated string.

**A-6. Hashtags live in `hashtags[]`; they are not auto-appended to the X caption.**  
Appending them could overflow 280 and would be silent truncation if we dropped extras. The agent may add tags later; YouTube publish uses `tags = hashtags`.

**A-7. Share JSON is public-if-you-have-the-id**, same threat model as today’s token link. It is **not** listed in the sitemap. It **must not** include `replay_token`, `seed`, email, or auth secrets.

**A-8. Peak height on cards is display text**, the persisted `peak_y`, rounded to integer metres. This spec does **not** authenticate that value.

**A-9. Record-page `SharePost` UI stays X + copy-text** (payment-success listing share). This change upgrades **metadata + OG image** on `/b/[slug]`, not listing compose-to-TikTok/YouTube.

**A-10. Square 1080×1080 is the TikTok preview variant.** 9:16 is Future.

**A-11. Production canonical origin is never the request `Host` header.** Callers pass `resolveBaseUrl()` / `PUBLIC_CONFIG.siteUrl`. Tests pass a fixture origin; when that fixture is `https://www.doomstack.lol`, output URLs must start with that origin.

**A-12. Listing OG (`/api/og`) may keep today’s missing-param defaults** (`name` → `"Stack"`, `alt` → `"0"`, `rank` → `"1"`) because the homepage always needs a card. **Recording** OG/metadata **must not** default to that homepage card — unknown id ⇒ **404**.

**A-13. Bot classification and document access are separate.** Bots skip paid-stack **view credit**; they still get HTTP 200 HTML for valid public pages (middleware already returns `next()` for bots). Adding TikTok UAs must not start blocking the document.

---

## Constraints

- Kernel gates (`skills/closed-loop/gates.md`): tests **invoke production units and assert output**. Never grep source text as proof. Every new helper has a non-test caller. Reject, never substitute a default, for **resource identity** (recording id, block slug).
- `recordClimb` / `POST /api/climb/result`: **additive only**. Existing JSON keys (`saved`, `peakY`, `improved`, `rank`, `totalClimbers`, `handle`, `reason`) stay. Anonymous still `{ saved: false, reason: "anonymous" }` with **no** `runId`.
- Do not forward secrets to URLs derived from request `Host` / `Origin`.
- OG image query params are **attacker-controlled display text**: length-cap, strip/escape markup, never 500 on junk input.
- Accessibility: WCAG 2.1 AA. Share controls **≥ 44×44 CSS pixels**, named, keyboard-activatable. Do not use `text-muted` on void for share-button labels (4.11:1 — standing contrast lesson).
- Design tokens: `app/DESIGN.md` only (void `#0a0a0c`, signal `#cbf24d`, ember `#ff5a2c`, text-primary `#f4f2ec`, surface `#121116`).
- Do not require PR #11 to be merged. The share payload is a **standalone contract** the agent can import later.
- Do not bulk-list recordings. Token URLs were unguessable; short ids are enumerable — treat `/r/{id}` as capability-by-id, not a directory.

---

## Personas

### P1 — Maya (climber)

Just finished a run on `/play`. Wants friends on X / TikTok / YouTube to **open the replay** and see a preview that is **her height**, not the generic homepage card. If she is signed in and the run saved, she wants a **short** link that fits in a tweet. If the run did not save (anonymous / too long to encode), she still wants honest UI — not a silently chopped tweet.

### P2 — Atlas (marketing agent)

Automation described on PR #11. Platforms: **TIKTOK, X, YOUTUBE only**. It stores drafts with `title`, `hook`, `script`, `caption`, `description`, `hashtags[]`, `cta`, `visualDirection`, `threadParts[]`. Caption limits are **flagged, never truncated**. Brand CTAs live on `SocialBrandProfile` but **today nothing injects a canonical recording URL**. Atlas needs: absolute `canonicalUrl`, platform-native copy already under limits, `imageUrl`, and compose limitations as `UNSUPPORTED_BY_PLATFORM` — without this change importing Prisma models from PR #11.

### P3 — Unfurl crawler

`Twitterbot`, TikTok/`Bytespider`/`ByteDance`, `Googlebot` (YouTube). Fetches the recording URL, must see unique OG/Twitter tags and an image of the stated dimensions, must **not** increment paid-stack `views_k`.

---

## Stories

### S1 — Canonical short URL after a saved run

**As** Maya, **I want** a short stable URL when my run is persisted with a replay, **so that** I can share it on X without burning 280 characters on a token.

- **Happy path:** Signed-in climber finishes an encodable run. `POST /api/climb/result` returns `saved: true` plus existing fields **and** `runId`. Client/share builder produces `https://www.doomstack.lol/r/{runId}` in production.
- **Failure:** Anonymous or invalid-token POST still returns `saved: false` and **does not** invent a `runId` or a fake canonical recording URL.

### S2 — Reject unknown or unreplayable recordings

**As** a crawler or Maya, **I want** missing recordings to 404, **so that** I never unfurl a generic homepage card for a dead id.

- **Happy path:** Existing `ClimbRun` with `replay_token` serves the recording page, OG image, and share JSON.
- **Failure:** Unknown id, malformed id, or row with `replay_token == null` → **404** for page, OG, and share JSON. No homepage OG fallback.

### S3 — Unique preview vs generic fallback

**As** Unfurl crawler, **I want** metadata that is unique to this recording, **so that** a feed preview is not the stale homepage card.

- **Happy path:** Recording metadata title/description include that run’s integer peak metres; `og:url` and `og:image` URLs differ across recording ids; `twitter:card` is `summary_large_image`.
- **Failure:** `/play` and `/play?r={token}` keep generic play metadata and do **not** decode the token to fake a unique card.

### S4 — Machine-readable share payload

**As** Atlas, **I want** JSON whose field names match my draft fields plus `canonicalUrl` and `imageUrl`, **so that** I can fill X/TikTok/YouTube drafts without inventing copy.

- **Happy path:** Given a valid recording id, builder/handler returns `ok: true` with the shape in AC-12.
- **Failure:** Unknown id → not a successful payload (404 / `NOT_FOUND`). Payload never contains `replay_token`, `seed`, or email.

### S5 — Platform limits (never silently truncate)

**As** Atlas, **I want** captions/titles that are already legal for each platform, **so that** my validator flags overflow instead of shipping sliced text.

- **Happy path:** X caption `.length ≤ 280` **and** contains `canonicalUrl`; TikTok caption ≤ 2200 and contains `canonicalUrl`; YouTube title ≤ 100; YouTube description ≤ 5000 and contains `canonicalUrl`.
- **Failure:** If composition would exceed a limit, builder returns invalid and the would-be string is **not** sliced to fit.

### S6 — ASCENT OG images (recording + listing)

**As** Unfurl crawler, **I want** a 1200×630 (and TikTok square) image in ASCENT tokens, **so that** X/TikTok/homepage shares look like the same product.

- **Happy path:** Recording landscape image is 1200×630; square variant is 1080×1080; listing `/api/og` also 1200×630 using the same palette constants (void/signal/ember/text-primary).
- **Failure:** Junk/HTML/overlong OG query params do not XSS and do not 500; recording OG without a valid id is 404, not the listing card.

### S7 — Canonical origin is not the Host header

**As** a security reviewer, **I want** production canonical/OG/share URLs to use `resolveBaseUrl()` / `PUBLIC_CONFIG.siteUrl`, **so that** a spoofed Host cannot mint `https://evil.example/...` links (and never carry secrets).

- **Happy path:** With origin fixture `https://www.doomstack.lol`, every absolute URL in metadata and payload starts with `https://www.doomstack.lol`.
- **Failure:** Passing `Host: evil.example` into a canonical helper does not produce `https://evil.example/...`.

### S8 — Human share actions for X, TikTok, YouTube

**As** Maya, **I want** three platform actions that use the same payload Atlas uses, **so that** I am not stuck with a tweet-only button.

- **Happy path:** X opens a tweet intent whose `text` query param decodes to the payload X `caption`. TikTok copies the TikTok `caption`. YouTube copies `title` + blank line + `description`.
- **Failure:** TikTok and YouTube **do not** get a invented compose URL; their compose mode is `UNSUPPORTED_BY_PLATFORM` with a non-empty `detail`. If the only URL is a token URL that would make X caption length > 280, X is **not** offered as a truncated tweet — it is invalid/disabled with a reason.

### S9 — Dashboard + a11y share controls

**As** Maya, **I want** dashboard replay share to use the short canonical URL and usable controls, **so that** old token copy-links stop shipping huge `?r=` URLs, and I can operate share with keyboard / touch.

- **Happy path:** For a replay row with `id` + `replayToken`, copy/share uses `/r/{id}` (production origin per A-11), not `/play?r={token}`. Watch/playback may still load the replay. Controls are ≥ 44×44, named, keyboard-activatable.
- **Failure:** Rows with `replayToken == null` expose no recording share/copy that claims a canonical `/r/{id}` preview.

### S10 — Record page OG/Twitter

**As** Unfurl crawler, **I want** `/b/{slug}` to unfurl a unique ASCENT card, **so that** listing shares are not title-only and not the homepage sky-blue card.

- **Happy path:** Existing slug: `openGraph` + `twitter.card=summary_large_image`, title/description include `display_name`, image 1200×630, `og:url` is `https://www.doomstack.lol/b/{slug}` in production.
- **Failure:** Unknown slug → 404; metadata is not the homepage listing card.

### S11 — robots, sitemap, JSON-LD

**As** Atlas / Googlebot, **I want** marketing URLs discoverable and recordings **not** bulk-listed, **so that** we can share ids without publishing a directory of every climber.

- **Happy path:** Sitemap includes `/`, `/play`, `/climb`, and `/b/{slug}` for existing blocks. JSON-LD `@type` is `WebPage` with `url` equal to the page canonical.
- **Failure:** Sitemap contains **zero** `/r/` recording URLs. JSON-LD `@type` is not `VideoObject`.

### S12 — Crawler UAs are bots, and still get the page

**As** the paid-stack, **I want** TikTok/ByteDance/Twitter/Google crawlers classified as bots, **so that** unfurls do not credit `views_k`, while they still receive the recording HTML.

- **Happy path:** `isBot` is true for the positive UA fixtures in AC-38; view pipeline credits 0 for those UAs; `GET` of a valid recording URL still 200.
- **Failure:** A normal desktop Chrome UA is not classified as a bot (regression).

---

## ACs

Numbered globally. Each is mechanically testable by **calling a production unit** (pure builder, route handler, metadata helper, `isBot`, `recordClimb` / `POST` handler). Grepping source is not proof (kernel gate 2).

### S1 — Canonical short URL after save

**AC-1.** Given a signed-in POST to `/api/climb/result` that persists a run with a `replayToken`, when the handler returns 200, then `saved === true` and the JSON includes a non-empty string `runId`, **and** still includes `peakY`, `improved`, `rank`, `totalClimbers`, and `handle`.

**AC-2.** Given `PUBLIC_CONFIG.siteUrl` (`https://www.doomstack.lol`) as the origin argument, when the canonical URL builder is invoked with recording id `rec_test_1`, then the result is exactly `https://www.doomstack.lol/r/rec_test_1` (no trailing slash, no query string).

**AC-3.** Given `recordClimb`’s return type/object, when a run is recorded, then the result contains every pre-existing field (`peakY`, `improved`, `rank`, `totalClimbers`, `handle`) and **may** contain `runId` as an addition — testers assert existing keys are present, not that the key set is frozen.

**AC-4.** *(negative)* Given POST `/api/climb/result` with no `Authorization` header and a valid body, when the handler returns 200, then `saved === false`, `reason === "anonymous"`, and the body has **no** own property `runId`.

### S2 — Reject unknown / unreplayable

**AC-5.** *(negative)* Given a recording id that does not exist, when the recording page metadata helper, recording OG handler, and share-payload builder/handler are invoked, then each fails with **404** / `NOT_FOUND` and none return homepage metadata whose `og:title` is `Doomstack — Altitude is permanent`.

**AC-6.** *(negative)* Given a persisted run whose `replay_token` is null, when those same units are invoked with that run’s id, then each fails with **404** / `NOT_FOUND`.

**AC-7.** *(negative)* Given an id that fails the allow-list parser (empty, whitespace, containing `/` or `..`, or otherwise rejected), when those units are invoked, then the result is 404 / `NOT_FOUND` — not a substituted “demo” recording and not HTTP 500.

### S3 — Unique metadata vs fallback

**AC-8.** Given two recordings with different ids and different `peak_y` (e.g. 100 and 250), when the recording metadata helper runs for each, then `openGraph.url` values differ, `openGraph.images[0].url` values differ, and each title **and** description contain that recording’s integer peak metres (`100` vs `250`).

**AC-9.** Given any valid recording, when metadata is produced, then `twitter.card === "summary_large_image"`, `openGraph.title` is not `Doomstack — Altitude is permanent`, and `openGraph.url` equals the canonical URL from AC-2’s builder.

**AC-10.** *(negative / fallback)* Given `/play` metadata (with `searchParams.r` absent **and** present as a non-empty token), when the play metadata unit is invoked, then it does **not** call replay decode and the title/description equal the generic play copy (not a per-recording peak). Token playback for humans remains a separate client path.

**AC-11.** *(negative)* Given an unknown recording id, when metadata is produced, then the result is 404 / `notFound` — **not** the homepage OG image URL (listing `/api/og?...`).

### S4 — Share payload JSON

**AC-12.** Given a valid recording, when the share-payload builder returns `ok: true`, then `data` has:

| Field | Rule |
| --- | --- |
| `recordingId` | string, equals the id asked |
| `canonicalUrl` | absolute URL from AC-2 builder |
| `imageUrl` | absolute URL for the **landscape** OG image |
| `imageUrlSquare` | absolute URL for the **square** OG image |
| `peakY` | finite number, the persisted peak |
| `handle` | string or `null` (never an email — no `@`) |
| `platforms.X` / `platforms.TIKTOK` / `platforms.YOUTUBE` | each a platform object |

Each platform object has: `platform` (`X` \| `TIKTOK` \| `YOUTUBE`), `contentType` (`X_POST` \| `TIKTOK_VIDEO` \| `YOUTUBE_SHORT` respectively), `title` (string), `caption` (string), `description` (string), `hashtags` (array of strings **without** a leading `#`), `cta` (string containing `canonicalUrl`), `canonicalUrl`, `imageUrl` (X/YouTube: landscape; TikTok: square), and `compose` as in AC-14.

**AC-13.** *(negative)* Given a valid recording, when the payload is produced, then JSON.stringify(data) does not contain `replay_token`, `replayToken`, a `seed` key, or the substring `INTERNAL_TOKEN`. `handle` does not match `/@/`.

**AC-14.** Given a valid payload, when inspecting `compose`: `platforms.X.compose.mode === "web_intent"` and `platforms.X.compose.url` starts with `https://twitter.com/intent/tweet?` (or `https://x.com/intent/tweet?`) and the decoded `text` param equals `platforms.X.caption`; `platforms.TIKTOK.compose.mode === "UNSUPPORTED_BY_PLATFORM"` with non-empty `detail`; `platforms.YOUTUBE.compose.mode === "UNSUPPORTED_BY_PLATFORM"` with non-empty `detail`. Neither TikTok nor YouTube `compose` has a `url` that the UI would treat as a web intent.

**AC-15.** *(negative)* Given an unknown id, when the share-payload builder/handler runs, then `ok === false` and `reason === "NOT_FOUND"` (or HTTP 404), and no `data.platforms` object is returned.

### S5 — Character limits

**AC-16.** Given a valid recording, when the payload is `ok: true`, then `platforms.X.caption.length ≤ 280` **and** `platforms.X.caption.includes(data.canonicalUrl) === true`.

**AC-17.** *(negative)* Given a composition fixture whose caption length is `281` for X (or `2201` for TikTok, or title `101` for YouTube), when the **same** length validator the builder uses is invoked, then `valid === false`, `length` equals the input’s `.length`, and the returned object does **not** include a sliced string of length 280/2200/100. (Prove with a positive over-limit fixture, kernel gate 6.)

**AC-18.** Given a valid recording payload, then `platforms.TIKTOK.caption.length ≤ 2200` and it includes `canonicalUrl`; `platforms.YOUTUBE.title.length ≤ 100`; `platforms.YOUTUBE.description.length ≤ 5000` and it includes `canonicalUrl`.

**AC-19.** Given the production limit table used by the builder, when read as numbers, then X caption limit is `280`, TikTok caption limit is `2200`, YouTube title limit is `100`, YouTube description limit is `5000`. (These match PR #11 `PLATFORM_CAPTION_LIMITS` plus the YouTube title cap of 100. Do not import PR #11.)

### S6 — OG images

**AC-20.** Given a valid recording id, when the landscape OG image unit is invoked, then the image is **1200×630** (width/height on the response or ImageResponse options).

**AC-21.** Given a valid recording id, when the square OG image unit is invoked, then the image is **1080×1080**.

**AC-22.** Given production OG palette constants, when tests import them, then they equal DESIGN tokens `void #0a0a0c`, `signal #cbf24d`, `ember #ff5a2c`, `text-primary #f4f2ec`. When the **listing** OG generator (`/api/og`) is invoked, it uses those constants (assert via the exported palette / generator inputs — not by grepping `route.tsx`). The listing generator still returns 1200×630.

**AC-23.** *(negative)* Given OG query params `name=<script>alert(1)</script>` repeated to >500 chars, `alt=not-a-number`, `rank=<img>`, when the listing OG handler runs, then status is **200** (sanitized display) **or** **400** — never **500** — and the sanitized name string passed into the image does not contain `<script` or `<img`. Given recording OG with a missing/invalid id, status is **404**, not 200 with the listing homepage card.

### S7 — Canonical origin

**AC-24.** Given `NODE_ENV=production` and no overriding `BASE_URL`, when `resolveBaseUrl()` is called, then it equals `https://www.doomstack.lol`. Metadata/payload builders that take an origin, when passed that value, emit only absolute URLs with that origin.

**AC-25.** *(negative)* Given a canonical-URL builder, when the origin argument is `https://www.doomstack.lol` and a spoof `Host` of `evil.example` is also supplied to any wrapper, then no returned URL starts with `https://evil.example`. Builders must not read `request.headers.get("host")` to form canonical/OG/share URLs. (Assert by calling the production builder with an explicit origin fixture; do not grep middleware.)

### S8 — Human share UI (three platforms)

**AC-26.** Given a valid payload, when the share-actions builder (consumed by `ShareRun`) is invoked, then the X action `href` equals `platforms.X.compose.url` from AC-14.

**AC-27.** Given a valid payload, when the share-actions builder is invoked, then the TikTok action type is `copy` with `text === platforms.TIKTOK.caption`, and `unsupportedReason` is `UNSUPPORTED_BY_PLATFORM`.

**AC-28.** Given a valid payload, when the share-actions builder is invoked, then the YouTube action type is `copy` with `text === platforms.YOUTUBE.title + "\n\n" + platforms.YOUTUBE.description`, and `unsupportedReason` is `UNSUPPORTED_BY_PLATFORM`.

### S9 — Dashboard + a11y

**AC-29.** Given a dashboard replay `{ id, replayToken }` with both set, when the dashboard share URL builder is invoked with production origin, then the copy/share URL is `https://www.doomstack.lol/r/{id}` and is **not** `/play?r={replayToken}`.

**AC-30.** *(negative)* Given a dashboard replay with `replayToken: null`, when the share-actions builder is invoked, then it returns no X/TikTok/YouTube share actions and no canonical `/r/{id}` copy action that would 404 per AC-6.

**AC-31.** Given rendered share controls (or a layout helper they use), when measured, then each of X, TikTok, YouTube, and Copy-link is a real `<a>` or `<button>` (or component that renders one), has an accessible name (`Share on X`, `Copy TikTok caption`, `Copy YouTube title and description`, `Copy link`), and a hit target **≥ 44×44 CSS pixels**. Native controls are keyboard-activatable (no `tabIndex={-1}` and no `pointer-events: none` on the control).

### S10 — Record page OG

**AC-32.** Given an existing block slug, when `generateMetadata` for `/b/[slug]` (or its helper) runs, then it sets `openGraph.title`, `openGraph.description` (including `display_name`), `openGraph.url` equal to `https://www.doomstack.lol/b/{slug}` when origin is production siteUrl, `openGraph.images[0]` width 1200 height 630, and `twitter.card === "summary_large_image"`.

**AC-33.** Given that block, when the record OG image unit is invoked, then it is 1200×630 and uses the same palette constants as AC-22.

**AC-34.** *(negative)* Given a slug that `getBlockBySlug` would not resolve, when metadata runs, then the page is 404 / `notFound` and does not emit homepage `og:title` `Doomstack — Altitude is permanent`.

### S11 — robots, sitemap, JSON-LD

**AC-35.** Given the production `robots` unit, when invoked, then it allows `/`, `/play`, `/climb`, `/b/`, `/r/`, and `/api/og` (crawlers must fetch pages and OG images they are given). It does not `Disallow: /r/`.

**AC-36.** *(negative)* Given the production `sitemap` unit, when invoked, then the URL list includes `{origin}/`, `{origin}/play`, `{origin}/climb`, and `{origin}/b/{slug}` for each existing block slug, **and** no sitemap entry path starts with `/r/`.

**AC-37.** Given a valid recording (and a valid record page), when the JSON-LD builder is invoked, then the object has `@context` including `schema.org`, `@type === "WebPage"`, and `url` equal to that page’s canonical URL. `@type` is not `VideoObject` and there is no `contentUrl` pointing at an MP4 we do not host.

### S12 — Bot UAs

**AC-38.** Given production `isBot`, when called with each fixture below, then it returns `true`:

| Fixture | Notes |
| --- | --- |
| `Mozilla/5.0 (compatible; Twitterbot/1.0)` | already in list; regression |
| `Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)` | regression |
| `TikTok` | must match **without** relying on `bot/` |
| `Mozilla/5.0 (Linux; Android 8.0) Bytespider` | must match **without** relying on generic `spider` remaining forever — add explicit `bytespider` |
| `ByteDance` | explicit `bytedance` |

**AC-39.** Given `runViewPipeline` (or the production view-credit gate that calls `isBot`) with `ua` set to the TikTok, Bytespider, and ByteDance fixtures in AC-38, when a stack/record view would otherwise qualify, then `credited === 0` and `qualified === 0`.

**AC-40.** Given a valid recording URL, when fetched as a document request, then HTTP status is **200** for both a Twitterbot UA and a Bytespider UA (bots are not 403/401’d). Classification as bot must not hide the HTML.

---

## Test map (qa-acceptance / verifier)

Every AC maps to a **callable** production symbol. Architect names the modules; this table is the contract for “do not grep”.

| ACs | Invoke |
| --- | --- |
| 1, 3, 4 | `POST` handler of `/api/climb/result` + `recordClimb` return |
| 2, 24, 25, 29 | canonical URL pure builder |
| 5–11, 32, 34 | metadata helpers used by the pages (non-test callers: the pages) |
| 12–19, 26–28, 30 | share-payload builder + share-actions builder + length validator |
| 20–23, 33 | OG generators + sanitizer + palette constants |
| 35–37 | `robots` / `sitemap` / JSON-LD builders |
| 38–39 | `isBot` and `runViewPipeline` |
| 40 | HTTP GET of recording page (or route handler) with UA header |
| 31 | component test measuring style/min size **or** a layout helper the buttons use |

---

## NFRs

| ID | Requirement | Number |
| --- | --- | --- |
| NFR-1 | Share-payload builder, given a loaded recording row (no extra network), completes in **< 50 ms** p95 in unit tests on CI. | 50 ms |
| NFR-2 | Recording OG image generation (uncached) p95 **< 2000 ms**. Listing OG remains cacheable; recording OG `Cache-Control` `s-maxage` **≥ 3600** (peak/handle do not change). Listing OG may stay `s-maxage=60`. | 2000 ms / 3600 s |
| NFR-3 | Metadata helper for a recording, given a loaded row, **< 200 ms** and **must not** decode `replay_token`. | 200 ms |
| NFR-4 | Auth: GET recording page, OG images, share JSON, robots, sitemap are **unauthenticated**. POST save remains existing auth. | public GET |
| NFR-5 | Accessibility: **WCAG 2.1 AA**. Share targets **≥ 44×44 CSS px**. Contrast: share labels `text-primary` (`#f4f2ec`) or `text-void` on `signal` — not `text-muted` (`#74707e`) on void. | AA / 44 px |
| NFR-6 | Scale envelope: sitemap size is **O(blocks)**, **0** recording URLs. Do not allocate an in-memory Map keyed by unbounded recording ids without eviction (kernel gate 19). | 0 `/r/` sitemap rows |
| NFR-7 | `isBot` over the AC-38 fixtures **< 1 ms** each. | 1 ms |
| NFR-8 | No secrets in client-visible payload (AC-13). Canonical URLs do not use request Host (AC-25). | — |
| NFR-9 | Locale: copy is English. Peak display uses integer metres with suffix `m`. | en / integer m |

---

## Risks

| ID | Risk | Impact | Mitigation in this spec |
| --- | --- | --- | --- |
| R-1 | Short `/r/{id}` ids are **enumerable**; old token URLs were unguessable. | Privacy: third parties can probe ids and watch replays. | No sitemap/directory; 404 unknown; payload omits token/seed/email; accept capability-by-id (A-7). Architect may add rate limits (not required to ship unique OG). |
| R-2 | PR #11 is unmerged. Coupling to its Prisma models would block this work. | Agent cannot consume payload if we wait. | Standalone JSON + pure builder; field **names** aligned; no import of social schema. |
| R-3 | TikTok in-app captions often **do not make URLs clickable**. | Discovery-only, not a reliable click-through. | Still include URL (A-4/AC-16/18); UI reports `UNSUPPORTED_BY_PLATFORM` for compose; do not fake an intent. |
| R-4 | Dual bot lists (`app/src/views/botList.ts` vs `app/middleware.ts` `BOT_PATTERNS`) can diverge. | TikTok might skip view credit in one path and not the other. | AC-38/39 bind to `isBot` + view pipeline. Architect should unify middleware with that unit (implementation), not a second pattern list. |
| R-5 | Middleware still forwards `INTERNAL_TOKEN` to `request.nextUrl.origin` for view credit. | Unrelated Host-header secret forward (trust.md #4). | **Do not copy** that pattern for OG/canonical/share URLs (AC-25). Fixing middleware is not this story. |
| R-6 | OG `ImageResponse` text from query params. | XSS / unexpected 500. | AC-23 sanitizer; reject-or-cap; recording id 404. |
| R-7 | Share cards display client-reported `peak_y` (open F-1). | Marketing a fraudulent height. | Out of scope; cards are display-only (A-8). Do not claim verified score. |
| R-8 | `POST /api/climb/result` clients that freeze key sets. | Additive `runId` could confuse a naive client. | Additive; anonymous path unchanged (AC-4). |
| R-9 | Suddenly adding sitemap `/b/*` + robots. | Indexing of buried/hidden listings that already return 200. | Those pages are already public (AC-37 on record pages). Accept indexing of existing public listings. |
| R-10 | Homepage OG restyle is a **visible brand change**. | Old sky-blue unfurls in caches until TTL. | Listing cache `s-maxage=60` already; palette constants testable (AC-22). |
| R-11 | Legal: user-generated handles on OG images. | Offensive display names on cards. | Length-cap + strip markup (AC-23). No extra moderation in this change. |

---

## Open Questions

Answered with assumptions so this stage is **not blocked**:

1. **Anonymous token SEO?** → A-2: generic `/play` metadata; unique cards only on `/r/{recordingId}`.
2. **Free leaderboard trust boundary (F-1)?** → **Remains open.** This spec does **not** add server-derived peaks. Security-reviewer ping is acknowledged and deferred (user: “Changing climb score trust model” is out of scope).
3. **Power-up one-slot vs stacking?** → Not this change.
4. **Unscoped `/api/tower`?** → Not this change. Homepage `generateMetadata` may keep fetching it for listing OG cache-bust `?v=`.
5. **Landing AC-27 (6 vs 7 cards) / AC-32 `#0a0a0f` vs void `#0a0a0c`?** → Separate rewrite. This spec only restyles **OG images** to void `#0a0a0c` (qa-acceptance 2026-08-30 ping applied for OG, not the featured grid).
6. **Should avoid-terms from `SocialBrandProfile` run here?** → Not until PR #11 is mergeable. Builder emits deterministic climb copy; agent applies avoid-terms later.

No remaining question requires the user before architect.

---

## Future

- Merge PR #11 and import the share-payload builder into content generation so every draft’s `cta` includes `canonicalUrl`.
- `prepare_video_upload`: canvas → MP4 for TikTok / YouTube / X native video.
- Twitter `player` card / embeddable replay iframe.
- oEmbed endpoint.
- 9:16 OG (1080×1920).
- `X_THREAD` / longform YouTube payload.
- Unique OG for `/play?r=` if token decode is cheap enough server-side.
- Recording sitemap after an explicit privacy decision (opt-in public gallery).
- Close F-1: server-derived peaks if product decides the free board is a trust boundary.

---

## Existing-system facts this spec depends on (do not re-litigate)

- Replays: `app/src/game/runReplay.ts` (`encodeRunReplay` / `decodeRunReplay` / `buildReplayUrl` → `/play?r=`). Share UI: `ShareRun.tsx` (X + copy only, `min-h-[40px]`). Dashboard: `ClimbReplaysSection.tsx` copies `buildReplayUrl(token, window.location.origin)`.
- Persist: `ClimbRun.replay_token`; `recordClimb` does not return the new row id; POST spreads `{ saved: true, ...result }`.
- Homepage OG: `app/app/api/og/route.tsx` + root `generateMetadata` in `app/app/layout.tsx` (sky-blue listing card, `twitter:card=summary_large_image` already).
- Record pages: `app/app/b/[slug]/page.tsx` title/description only — no `openGraph`/`twitter`.
- No `robots.txt`, sitemap, JSON-LD, or oEmbed today.
- Bots: `app/src/views/botList.ts` + a **separate** middleware list: twitterbot / facebook / googlebot present; **no explicit** `tiktok` / `bytespider` / `bytedance`.
- Origin helper: `app/src/config/public.ts` `resolveBaseUrl()` / `PUBLIC_CONFIG.siteUrl`.
- Social-agent (PR #11, **not merged**) limits and draft fields are requirements on **our** payload, not a stack choice: platforms TIKTOK/X/YOUTUBE; caption limits 2200/280/5000; YouTube title ≤ 100 and `tags=hashtags`; X unfurl = Twitter `summary_large_image`; safety: avoid-terms block + **never truncate**.
