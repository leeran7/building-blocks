# Package upgrade — compatibility architecture

**Date:** 2026-08-29  
**Scope:** dependency compatibility for `app/` (pnpm) and `orchestrator/` (yarn).  
**Not in scope:** product data-model or HTTP contract redesign. Do not add a second ORM, HTTP client, or test runner.  
**Registry snapshot:** npm dist-tags queried 2026-08-29. Versions below exist on the registry today.

---

## 1. Target versions

Install the **exact** versions in the Target column unless a cell says a bounded range. After install, commit the lockfile; do not leave floating tags like `next@latest`.

| Package | Current | Target | Why | CVE / compat note |
|---|---|---|---|---|
| **app — runtime** | | | | |
| `next` | `14.0.4` (exact) | **`15.5.24`** (exact) | Smallest **currently patched** LTS. 14.x is EOL. | Clears CVE-2025-29927 (fixed 14.2.25 / 15.2.3) and the 2026-08-29 release (GHSA-2xp9-vwfh-vxw4 AVIF/sharp RCE; CVE-2026-75604 Windows RCE). `14.2.35` is the last 14.x and is **unpatched** for the Aug 2026 GHSAs. |
| `eslint-config-next` | `14.0.4` | **`15.5.24`** (exact, must match `next`) | Peer of Next; ships `@next/eslint-plugin-next@15.5.24`. | Accepts ESLint `^7 \|\| ^8 \|\| ^9`. We stay on 8. |
| `react` / `react-dom` | `^18` | **`18.3.1`** (exact pair) | Next 15.5 peers still allow `^18.2 \|\| ^19`. Stay 18. | React 19 is **not** required by 15.5.24. |
| `@types/react` | `^18` | **`18.3.31`** | Last 18.x types. | Do **not** install `@types/react@19` while React stays 18. |
| `@types/react-dom` | `^18` | **`18.3.7`** | Match React 18. | |
| `@prisma/client` | `^5.7.1` | **`6.19.3`** (exact, must match `prisma`) | Last 6.x that still uses `prisma-client-js` + `import from "@prisma/client"`. | Prisma 5.22.0 is frozen. Prisma 7/8 require a new generator, `output` path, and a driver adapter — that is a second client shape. Do not. |
| `prisma` (dev) | `^5.7.1` | **`6.19.3`** (exact) | CLI must equal client. | Keep `generator.provider = "prisma-client-js"`. Do not add Accelerate or wasm. |
| `stripe` | `^14.9.0` | **`14.25.0`** (exact) | Last 14.x. Keeps `apiVersion: "2023-10-16"` as a typed literal and `webhooks.constructEvent`. | Do not jump to stripe 16–22 in this pass; later majors type only newer API versions and drop `typescript: true`. |
| `@stripe/stripe-js` | `^2.3.0` (lock `2.4.0`) | **`2.4.0`** | Last 2.x, lockstep with server 14.x. | **No production importer** in this repo (confirmed). Bump the lockfile only; do not add `loadStripe`. |
| `firebase` | `^10.14.1` | **`10.14.1`** (pin exact) | Already last 10.x. Webpack alias targets this major's `dist/esm2017/index.js`. | 11/12 change packaged entry paths; would invalidate `next.config.js` alias. Defer. |
| `firebase-admin` | `^12.7.0` | **`12.7.0`** (pin exact) | Already last 12.x. Callers: `cert`, `getAuth`, `verifyIdToken` only. | Admin 13 is a separate Node/ESM major. Defer with Next 16. |
| `@upstash/redis` | `^1.28.0` | **`1.38.3`** | Latest 1.x. `new Redis({ url, token })` unchanged. | HTTP REST client; not a second Redis client. |
| `@vercel/og` | `^0.6.2` | **`0.11.1`** | Last 0.x. `ImageResponse` ctor used by `/api/og` is unchanged. | Do not jump to `1.0.2` (Satori major). Do not switch to `next/og` in this pass. |
| `zod` | `^3.22.4` | **`3.25.76`** | Last 3.x. Used by `app/app/api/checkout/route.ts`. | Zod 4 is a rewrite (error map, `z.object`). Do not. |
| `recharts` | `^2.10.0` | **`2.15.4`** | Last 2.x. Used by `AltitudeChart.tsx`. | Recharts 3 is a React 19-era major. Do not. |
| **app — dev** | | | | |
| `vitest` | `^1.1.0` | **`3.2.7`** (exact) | No patched 1.x exists for CVE-2026-47429. 3.2.5/3.2.6 is the 3.x fix; 3.2.7 is latest 3.x. | Keep `vitest.config.ts` + the existing `include` globs. Do not add Jest. Vitest 4 requires `vite@^6\|\|^7\|\|^8` as a hard peer and is a larger API jump. |
| `vite` | (transitive / absent) | **`^6.0.0 <7`** (add as **devDependency**) | Vitest 3's bundler, not a second test runner. | Do not add `@vitest/ui` (that is the CVE surface). |
| `@vitejs/plugin-react` | `^4.2.1` | **`4.7.0`** | Last 4.x. **Not referenced** by `vitest.config.ts`. | Leave installed; do not wire it unless a `.tsx` test fails to transform. |
| `eslint` | `^8` | **`8.57.1`** (exact, last 8.x) | `eslint-config-next@15.5.24` accepts 8. Existing `.eslintrc.json` is legacy-config. | ESLint 9 flat config is required by `eslint-config-next@16`. Defer. |
| `typescript` | `^5` | **`5.9.3`** | Last TS 5.x. Next 15.5 / Prisma 6 want TS ≥5.1. | TypeScript 7 (`7.0.2`) is a new compiler. Do not. |
| `@types/node` | `^20` | **`20.19.43`** | Matches CI Node 20. | Do not install `@types/node@22` in `app/` (orchestrator only). |
| `tailwindcss` | `^3.3.0` | **`3.4.19`** (`v3-lts` dist-tag) | Keeps `tailwind.config.ts` + `postcss.config.js` `tailwindcss: {}`. | Tailwind 4 (`4.3.3`) requires `@tailwindcss/postcss` and a CSS-first config. Do not. |
| `postcss` | `^8` | **`8.5.26`** | Latest 8.x. | Next 15.5.24 depends on `postcss@8.4.31` internally; 8.5.x as a direct dep is compatible. |
| `autoprefixer` | `^10.0.1` | **`10.5.4`** | Latest 10.x. Required by current PostCSS pipeline. | |
| `playwright` / `@playwright/test` | `^1.40.1` | **`1.62.1`** (exact pair, same version) | Latest. Next 15.5 optional peer `@playwright/test@^1.51.1`. | Keep `app/playwright.config.ts`. Fix `webServer.command` (`yarn dev` is wrong; app is pnpm). |
| `tsx` (app, prisma seed) | `^4.8.1` | **`4.23.12`** | Latest 4.x. | Same major as orchestrator. |
| `packageManager` field | `pnpm@9.0.0` | **`pnpm@9.15.9`** | Last 9.x. CI already uses pnpm 9. | pnpm 10 is a lockfile/major jump. Do not. |
| **orchestrator — yarn** | | | | |
| `@cursor/sdk` | `^1.0.28` | **`1.0.30`** (exact) | Latest. Production caller: `Agent`, `CursorAgentError` in `orchestrator/src/loop.ts`. | Patch bump. `undici` highs via `@connectrpc/connect-node` likely remain — do not claim audit zero. |
| `tsx` | `^4.19.0` | **`4.23.12`** | Latest 4.x. `tsx --test` stays the orchestrator runner. | Do not add vitest to orchestrator. |
| `typescript` | `^5.6.0` | **`5.9.3`** | Align with app on TS 5. | Keep `tsconfig.json` + `tsconfig.test.json` (tests must stay typechecked). |
| `@types/node` | `^22.0.0` | **`22.20.1`** | Matches engines `node >= 22.13`. | |
| **CI** | | | | |
| App job Node | `20` | **`20`** (GHA `node-version: "20"`) | Next 15.5.24 engines: `^18.18.0 \|\| ^19.8.0 \|\| >= 20.0.0`. | Next 16 would require `>= 20.9.0`. Stay 20. |
| App job pnpm | `9` | **`9`** | Matches `packageManager`. | |
| Orchestrator job Node | `22` | **`22`** | Unchanged. | |

Repo root `package.json` stays scripts-only. Do not add runtime deps there.

---

## 2. Stack ADRs

### ADR-1: Next major — 15.5.24, not 14.2.x, not 16.x

**Options:** A) `next@14.2.35` (last 14.x, ≥14.2.25 for CVE-2025-29927). B) `next@15.5.24` (Maintenance LTS, 2026-08-29 security release). C) `next@16.3.3` (Active LTS, same security release).

**Choice:** B — `15.5.24`.

**Reason:** 14.x reached vendor EOL on 2026-10-26; last official patch is 14.2.35 (2025-12-11). The 2026-08-29 Next security release patched **only** 15.5.24 and 16.3.3 — 14.2.35 does **not** receive GHSA-2xp9-vwfh-vxw4 / CVE-2026-75604. That eliminates A. C is Active LTS until ~2027, but it is not the smallest bump: Turbopack is default and **`next build` fails if `next.config.js` defines `webpack`** (this repo does — Firebase `@firebase/auth` alias); `next lint` is removed; `eslint-config-next@16` requires ESLint ≥9 (flat config); async `params`/`searchParams` lose the Next 15 sync compat layer; `middleware.ts` is deprecated in favour of `proxy.ts` (nodejs-only). This repo's load-bearing auth/view middleware is Edge-shaped today; Next 16's documented escape hatch for Edge is "keep `middleware.ts`". Stacking Turbopack, ESLint 9, lint-script rewrite, and hard async request APIs on top of a 14→15 jump is how this upgrade fails. 15.5.24 still: webpack by default (alias keeps working), `next lint --max-warnings=0`, ESLint 8 + `.eslintrc.json`, React 18 peers, Node 20, sync-compat for request APIs.

**Consequence:** Implementer installs `next@15.5.24` and `eslint-config-next@15.5.24` only. Do not run `@next/codemod upgrade latest` (that tracks 16). A **follow-up** to 16.3.x must land before **2026-10-21** (Next 15 Maintenance LTS EOL). That follow-up is a separate change set: `--webpack` or a Turbopack `resolveAlias` replacement for Firebase, ESLint 9 flat config, `next lint` → `eslint . --max-warnings=0`, Promise-only params.

**Assumption (explicit):** Vercel production for this app is Linux, so CVE-2026-75604 (Windows `next start` RCE) is not the blast radius; the AVIF/sharp GHSA still is, and 15.5.24 disables AVIF optimization until upstream sharp/libheif is safe.

### ADR-2: React stays 18.3.1

**Options:** A) React 18.3.1. B) React 19.2.8.

**Choice:** A.

**Reason:** Next 15.5.24 peers `react@^18.2.0 || ^19.0.0`. React 19 is required by some Next 15+ **docs** wording, not by this package's peer range. This repo has no `useFormState`, no `next/image` usage, and a canvas/rAF game loop that must not pick up React 19 `ref`-as-prop / owner-stack surprises in the same PR as a Next major. `@types/react@19` against `react@18` is a types lie.

**Consequence:** Pin `react@18.3.1`, `react-dom@18.3.1`, `@types/react@18.3.31`, `@types/react-dom@18.3.7`. Do not enable `reactCompiler` in `next.config.js`.

### ADR-3: Vitest 3.2.7 (not 1.x patched, not 2, not 4)

**Options:** A) Stay on Vitest 1.x if a patch exists. B) Vitest 2.1.9. C) Vitest 3.2.7. D) Vitest 4.1.11.

**Choice:** C.

**Reason:** A is impossible — CVE-2026-47429 (GHSA-5xrq-8626-4rwp) is fixed in **3.2.5 / 3.2.6** and **4.1.0**, not in 1.x. This repo does not run Vitest UI (`@vitest/ui` is not a dependency; `vitest.config.ts` has no `api` / `ui` keys), so the CVE is latent, but leaving 1.x means `pnpm audit` keeps a named critical/high forever. B is unpatched for that CVE (`<3.2.5` is affected, including all 2.x). D (Vitest 4) adds a hard `vite@^6\|\|^7\|\|^8` peer and a 4.x config surface we do not need. C is the smallest **patched** line. This repo's config is the v1-compatible subset: `environment: "node"`, `globals: true`, `include`/`exclude`, `alias`, `vi.mock` / `vi.fn` / `vi.mocked`. No snapshots, no `deps.inline`, no `workspace` key, no custom `pool`. `tests/game/rngCounter.ts` exists because `vi.mock` factories hoist — that remains true in 3.x.

**Consequence:** `pnpm add -D vitest@3.2.7 vite@6` in `app/`. Do not add `@vitest/ui`. Do not introduce Jest or `node:test` in `app/` (orchestrator keeps `tsx --test`). Keep `vitest.config.ts` shape; if 3.x warns on a renamed key, update that one key only.

### ADR-4: Prisma 6.19.3, keep `prisma-client-js`

**Options:** A) Prisma 5.22.0 (last 5.x). B) Prisma 6.19.3 with current generator. C) Prisma 6.19.3 migrated to `provider = "prisma-client"` + adapter. D) Prisma 7.10.0 / 8-rc.

**Choice:** B.

**Reason:** A is frozen (2024) and will not get engine/CVE fixes. C and D change the client **import path**, require `output`, and require `@prisma/adapter-pg` (or Accelerate). That is a second ORM client shape even if the package name is still Prisma — forbidden by standing rule, and it rewrites `app/src/db/client.ts` plus every `from "@prisma/client"` type import. Prisma 6.x still generates into `node_modules/.prisma/client` via `prisma-client-js`. Production callers: `app/src/db/client.ts`, `app/prisma/seed.ts`, type imports in `payments.ts` / `seasons.ts` / `blocks.ts`. This repo does **not** use Accelerate, wasm, or `previewFeatures`.

**Consequence:** Pin `prisma@6.19.3` and `@prisma/client@6.19.3` together. Do not edit `schema.prisma` generator/datasource except if `prisma generate` prints a required one-line warning that does not change the import path. Do not add `prisma.config.ts`. Do not run `prisma migrate dev` as part of this upgrade (no schema change). `postinstall`: `prisma generate` stays.

### ADR-5: Stripe server 14.25.0 + stripe-js 2.4.0; keep API version `2023-10-16`

**Options:** A) Last 14.x server + last 2.x.js. B) Jump server to 18–22 and keep `apiVersion: "2023-10-16"` with ts-ignore. C) Upgrade Stripe account API version.

**Choice:** A.

**Reason:** `app/src/api/stripe.ts` constructs `new Stripe(secret, { apiVersion: "2023-10-16", typescript: true })` and `webhooks.constructEvent(rawBody, signature, webhookSecret)`. That is the production contract (caller: `app/app/api/webhook/stripe/route.ts`). Newer `stripe` majors type `LatestApiVersion` to 2025/2026 dates; pinning `"2023-10-16"` becomes a type error or a silent types lie. Dashboard API version is **not** changed by an SDK bump and is out of this change set. `@stripe/stripe-js` has **zero** `from` importers — standing rule: not a contract. Bump 2.4.0 so the lockfile is current; do not add Checkout.js.

**Consequence:** Do not change `apiVersion`. Do not remove `constructEvent`. Do not change webhook raw-body handling. If `typescript: true` warns as deprecated on 14.25.0, leave it (it is still valid).

### ADR-6: Firebase client 10.14.1 + admin 12.7.0; keep webpack alias (hardened)

**Options:** A) Keep 10.x/12.x + webpack alias. B) Firebase JS 12.18.0 + drop alias. C) Replace webpack alias with Turbopack `resolveAlias`.

**Choice:** A, with `require.resolve` instead of a hard-coded `.pnpm` path.

**Reason:** `next.config.js` aliases `@firebase/auth$` to the browser ESM bundle because Next's RSC/SWC transform cannot parse undici private fields in the Node ESM entry. Production importers of `firebase/auth`: `src/lib/firebase.ts`, `src/contexts/AuthContext.tsx`, four `app/auth/*` pages. Admin importers: `src/lib/firebaseAdmin.ts` (`verifyIdToken` ← `requireAuth`). Firebase 10.14.1 and admin 12.7.0 are already the last releases on those majors. Jumping the client to 11/12 without proving `next build` on this app is how auth breaks on Vercel. C is a Next 16 task.

**Consequence:** Keep `transpilePackages` and the `webpack` function. Change the alias target to `require.resolve("@firebase/auth/dist/esm2017/index.js")` (or the path `ls` shows after install if that subpath moved). If `next build` succeeds **without** the alias, you may delete it in a follow-up with a comment pointing at the successful build log — not in the first green build of this upgrade. Do not set `experimental.trustHostHeader` (exfiltrates `INTERNAL_TOKEN` via `request.nextUrl.origin` in middleware).

### ADR-7: ESLint 8.57.1 + `next/core-web-vitals` + `next lint --max-warnings=0`

**Options:** A) ESLint 8 + current `.eslintrc.json`. B) ESLint 9 flat config.

**Choice:** A.

**Reason:** `app/.eslintrc.json` already extends `next/core-web-vitals`. `eslint-config-next@15.5.24` peers include `eslint@^8`. Next 15 still ships `next lint`. Next 16 **removes** `next lint` and `eslint-config-next@16` peers `eslint: >=9`. Flat-config migration is a Next 16 companion, not this pass. Lint script stays `"lint": "next lint --max-warnings=0"`.

**Consequence:** Implementer must **prove the lint gate can fail** (section 7) before trusting CI. Two `eslint-disable-next-line react-hooks/exhaustive-deps` comments in `app/src/game/useClimb.ts` currently suppress a rule that historically never ran; after this bump they suppress a live rule — leave them unless you also add a test for the mount-only / listener effect they protect. Do not delete them "to clean lint" without that test.

### ADR-8: TypeScript 5.9.3, Node 20 (app) / 22 (orchestrator), pnpm 9.15.9, Playwright 1.62.1, Tailwind 3.4.19, Zod 3.25.76, Upstash 1.38.3, @vercel/og 0.11.1, recharts 2.15.4

**Choice:** stay on the current **major** of each; take the last patched release on that major.

**Reason:** TS 7, Tailwind 4, Zod 4, Recharts 3, `@vercel/og@1`, pnpm 10 are each their own migration. None of them clears a Next/Vitest critical CVE. Playwright 1.62.1 satisfies Next 15.5's optional `@playwright/test@^1.51.1`. App `@types/node@20.19.43` matches CI Node 20; orchestrator `@types/node@22.20.1` matches `engines.node >= 22.13`.

**Consequence:** Do not bump CI app Node to 22 in this pass (unrelated surface). Do not add a root-level pnpm workspace.

### ADR-9: Orchestrator — `@cursor/sdk@1.0.30`, `tsx@4.23.12`, `typescript@5.9.3`, `@types/node@22.20.1`

**Choice:** patch/minor on the existing majors; keep `yarn` + `tsx --test` + dual `tsc`.

**Reason:** Production caller of the SDK is `orchestrator/src/loop.ts` (`Agent`, `CursorAgentError`). 1.0.28 → 1.0.30 is a patch. `tsx --test` is the orchestrator test runner; do not add Vitest there (that would be a second runner **in that package**, and the standing rule is one runner per package as already established: vitest in app, tsx in orchestrator). Keep `tsconfig.test.json` so tests are typechecked.

**Consequence:** `yarn --cwd orchestrator upgrade` those four; `yarn typecheck` and `yarn test` must pass. Do not change `engines`.

### ADR-10: CI Node versions

**Choice:** app job stays Node **20** + pnpm **9**; orchestrator job stays Node **22** + yarn.

**Reason:** Next 15.5.24 supports Node 20. Next 16 would require ≥20.9; we are not on 16. Orchestrator already requires ≥22.13.

**Consequence:** Optionally pin `"20.19"` if you want a floor; `"20"` is enough. Add an **audit** step only after proving it can fail (section 7). Do not inject production secrets into a `pull_request` job beyond what CI already has.

---

## 3. Compatibility matrix

| Pair | Contract |
|---|---|
| Next 15.5.24 ↔ React 18.3.1 | Supported peer. Do not install React 19. |
| Next 15.5.24 ↔ `eslint-config-next@15.5.24` | **Exact same version.** |
| `eslint-config-next@15.5.24` ↔ ESLint 8.57.1 | Supported (`^7 \|\| ^8 \|\| ^9`). Stay 8 + `.eslintrc.json`. |
| Next 15.5.24 ↔ `@types/react@18.3.31` | Required while React is 18. |
| Next 15.5.24 ↔ Node 20 | Engines include `>= 20.0.0`. CI Node 20 is valid. |
| Next 15.5.24 ↔ webpack Firebase alias | Webpack is still the default bundler. Keep `webpack()`. |
| Next 15.5.24 ↔ `next lint` | Command still exists. Keep `--max-warnings=0`. |
| Next 15.5.24 ↔ `middleware.ts` at `app/middleware.ts` | Still the Edge middleware file. Do not rename to `proxy.ts`. |
| Next 15.5.24 ↔ `params` / `searchParams` | **Typed as `Promise<>` in 15.5.** Sync access still *runs* (compat + warning). `tsc` will fail until the four files in §4 await them. |
| Next 15.5.24 ↔ `fetch` caching | `fetch` is **no-store by default**. This repo already passes `next: { revalidate }` in `app/layout.tsx` and `app/stack/[category]/page.tsx`. Client `fetch` is unchanged. GET route handlers are no longer implicitly cached — our JSON APIs already set `runtime = "nodejs"` and are dynamic. **Prove** via `next build` route table, do not reason. |
| Next 15.5.24 ↔ `next/font/google` | Already used (`Bricolage_Grotesque`, `Hanken_Grotesk`, `Space_Mono`). Keep `adjustFontFallback: false` unless `next build` shows the size-adjust metrics now exist. |
| Next 15.5.24 ↔ `runtime = "nodejs"` / `"edge"` | `experimental-edge` is gone; this repo already uses `"edge"` only on `/api/og`. |
| Prisma 6.19.3 ↔ Node 20 | Engines `>=18.18`. |
| Prisma 6.19.3 ↔ `prisma-client-js` ↔ `@prisma/client` | Same import as today. No Accelerate, no wasm, no adapter. |
| `stripe@14.25.0` ↔ `apiVersion: "2023-10-16"` | Valid typed version on 14.x. `constructEvent` signature unchanged. |
| `stripe@14.25.0` ↔ `@stripe/stripe-js@2.4.0` | Compatible pair. JS package unused in source. |
| `firebase@10.14.1` ↔ webpack alias | Alias must resolve to that package's browser ESM file. |
| `firebase@10.14.1` ↔ `firebase-admin@12.7.0` | Same Identity Toolkit tokens; `verifyIdToken` unchanged. |
| Vitest 3.2.7 ↔ Vite 6 | Add `vite@^6 <7` as a direct app devDependency. |
| Vitest 3.2.7 ↔ existing config | `defineConfig` from `vitest/config`; `globals`; `vi.*`. |
| Playwright 1.62.1 ↔ Next 15.5 optional peer | `^1.51.1` satisfied. |
| `@cursor/sdk@1.0.30` ↔ Node 22 + `tsx --test` | Patch bump; keep yarn.lock. |
| Tailwind 3.4.19 ↔ PostCSS 8 ↔ autoprefixer 10 | Current `postcss.config.js` / `tailwind.config.ts` stay. |

**Explicit non-pairs (do not mix):** `next@16` + ESLint 8; `next@15.5` + `@types/react@19`; `prisma@7` + `@prisma/client` default import; `stripe@18+` + `apiVersion: "2023-10-16"` without a types plan; `firebase@12` + the current hard-coded `.pnpm` alias path.

---

## 4. Breaking-change hit list (this repo)

These are the **only** source files the Next 15.5 / Vitest 3 / Prisma 6 bump is expected to touch. Product routes, engines, and DB schema stay.

### Must change (Next 15.5 types: `params` / `searchParams` are Promises)

New contract for App Router pages and route handlers:

```ts
// Before (Next 14)
params: { slug: string }
searchParams: { payment?: string }

// After (Next 15.5 — required for tsc)
params: Promise<{ slug: string }>
searchParams: Promise<{ payment?: string }>
const { slug } = await params
const sp = await searchParams
```

| File | New contract |
|---|---|
| `app/app/b/[slug]/page.tsx` | `RecordPageProps.params` and `.searchParams` become `Promise<...>`. `generateMetadata` and `RecordPage` `await` them before `params.slug` / `searchParams.payment`. |
| `app/app/stack/[category]/page.tsx` | `TowerPageProps.params` becomes `Promise<{ category: string }>`. Await in `generateMetadata` and `CategoryTowerPage`. |
| `app/app/tower/[category]/page.tsx` | Sync `LegacyTowerRedirect` must become `async` and `await params` before `params.category`. |
| `app/app/api/tower/[category]/route.ts` | Second GET arg: `{ params }: { params: Promise<{ category: string }> }`, then `const { category } = await params`. |

Client `useSearchParams()` in `app/app/auth/signin/page.tsx` and `app/app/submit/page.tsx` is **unchanged**. `new URL(request.url).searchParams` in `/api/og` is **unchanged**.

### Must change (webpack alias robustness)

| File | New contract |
|---|---|
| `app/next.config.js` | Keep `webpack` and `transpilePackages`. Replace the hard-coded `node_modules/.pnpm/node_modules/@firebase/auth/dist/esm2017/index.js` with `require.resolve("@firebase/auth/dist/esm2017/index.js")` (adjust the subpath if `require.resolve` fails after install). Leave `experimental: {}` empty. Do **not** set `trustHostHeader`. |

### Must change (package + CI + lint)

| File | New contract |
|---|---|
| `app/package.json` | Versions per §1. Scripts: keep `"lint": "next lint --max-warnings=0"`, `"test": "vitest run"`, `"build": "prisma generate && next build"`. `"packageManager": "pnpm@9.15.9"`. |
| `app/pnpm-lock.yaml` | Regenerated by `pnpm install` in `app/`. |
| `app/.eslintrc.json` | Keep `{ "root": true, "extends": "next/core-web-vitals" }`. Do not migrate to `eslint.config.mjs`. |
| `.github/workflows/ci.yml` | Keep Node 20 + pnpm 9 + `pnpm lint`. After proving audit can fail (§7), add `pnpm audit --audit-level=critical` as a step that is allowed to fail **only** if §9 still lists remaining criticals — otherwise it must be blocking. Do not add `--audit-level=high` as blocking until remaining highs are inventoried. |
| `app/playwright.config.ts` | `webServer.command`: `"pnpm dev"` (currently `"yarn dev"`, which is the wrong package manager for `app/`). Pin is not a product change. |

### Must change (orchestrator)

| File | New contract |
|---|---|
| `orchestrator/package.json` | `@cursor/sdk@1.0.30`, `tsx@4.23.12`, `typescript@5.9.3`, `@types/node@22.20.1`. Scripts unchanged. |
| `orchestrator/yarn.lock` | Regenerated by `yarn install` in `orchestrator/`. |

### Touch only if the tool demands it

| File | When |
|---|---|
| `app/vitest.config.ts` | Only if Vitest 3.2.7 prints a renamed-key warning (`deps.inline` / `workspace` / pool). Current keys stay. |
| `app/prisma/schema.prisma` | Only if `prisma generate` on 6.19.3 requires a generator field **that does not change** `provider` or import path. Otherwise do not edit. |
| `app/src/db/client.ts` | Only if Prisma 6 constructor options reject `log: ["query",...]`. Unlikely; keep the singleton. |
| `app/src/api/stripe.ts` | Do not change unless `stripe@14.25.0` types reject `typescript: true` — then drop that flag only, keep `apiVersion`. |
| `app/app/api/og/route.tsx` | Only if `@vercel/og@0.11.1` changes `ImageResponse` (not expected). Keep `runtime = "edge"`. |
| `app/app/layout.tsx` | Only if `next build` fails on `adjustFontFallback: false`. Fetch already has `next: { revalidate: 60 }`. |
| `app/src/game/useClimb.ts` | Do not strip `eslint-disable` comments without a test. Lint will now enforce `react-hooks/exhaustive-deps`. |

### Confirmed non-hits (do not "upgrade" these APIs)

- No `next/image` imports.
- No `cookies()` / `headers()` / `draftMode()` from `next/headers`.
- No `useFormState` / `@next/font` / `experimental-edge` / `NextRequest.geo` / `revalidateTag`.
- No Prisma Accelerate / wasm / second `PrismaClient` construction besides `db/client.ts` + seed.
- Do not rewrite `middleware.ts` to `proxy.ts`.
- Do not change Stripe webhook event names, `payment_status` gating, or dead-letter behaviour — those are product, already reviewed.

---

## 5. What we are NOT bumping (and why)

| Package / line | Why not |
|---|---|
| `next@14.2.35` | EOL; missing Aug 2026 GHSAs. |
| `next@16.3.3` | Turbopack-default vs webpack Firebase alias; `next lint` removed; ESLint 9 required; async request APIs hard-break. Follow-up before 2026-10-21. |
| `react@19` / `@types/react@19` | Not required by Next 15.5.24 peers; extra renderer risk on the canvas loop. |
| `vitest@1` / `@vitest/ui` | 1.x has no CVE-2026-47429 patch; UI is the CVE surface. |
| `vitest@2` | Still in the affected range (`<3.2.5`). |
| `vitest@4` | Hard vite 6/7/8 peer + larger API jump; 3.2.7 already clears the CVE. |
| `prisma@5.22.0` | Frozen; no further patches. |
| `prisma@7` / `8-rc` / `prisma-client` generator / `@prisma/adapter-pg` | New client import + adapter = second ORM shape. |
| `stripe@16+` / `@stripe/stripe-js@3+` | `apiVersion: "2023-10-16"` typing; unused JS package is not a reason to major-bump. |
| `firebase@11/12`, `firebase-admin@13+` | Alias path + admin ESM major. Already on last 10.x / 12.x. |
| `eslint@9` / `eslint@10` / `eslint.config.mjs` | Next 16 companion. Would drop `next lint`. |
| `typescript@7` | New compiler; Next/Prisma docs still say TS 5. |
| `tailwindcss@4` | PostCSS plugin + CSS-first config rewrite. |
| `zod@4` | Checkout schema rewrite. |
| `recharts@3` | React 19-era major; one dashboard chart. |
| `@vercel/og@1` | Satori major; `/api/og` stays on 0.x `ImageResponse`. |
| `pnpm@10` | Lockfile/major; CI is pnpm 9. |
| Root workspace / second HTTP client / Jest | Standing rule. `fetch` stays. Orchestrator keeps `tsx --test`. |
| `experimental.trustHostHeader` | Turns middleware origin + `INTERNAL_TOKEN` into an exfil primitive. |
| React Compiler / `cacheComponents` / PPR | Unrelated to CVEs; extra runtime semantics. |

---

## 6. Rollout order

Package managers: **`app/` = pnpm**, **`orchestrator/` = yarn**, repo root = scripts only. Never run `yarn` inside `app/` or `pnpm` inside `orchestrator/`.

Work in `app/` first (production CVEs), then orchestrator.

### Phase 0 — prove gates can fail (before any bump)

From `app/` on **current** lockfile:

```bash
cd app
pnpm lint; echo "lint_exit=$?"
# Expect: either a real lint report, or (if still unconfigured) the next-lint
# setup prompt with exit 0 — that is the standing-rule failure mode.
pnpm audit --audit-level=critical; echo "audit_exit=$?"
# Expect: non-zero today because next@14.0.4 is critical (CVE-2025-29927).
```

Record both exit codes in the implementer handoff. If lint exits 0 without listing files, stop and fix `.eslintrc.json` / non-interactive lint **before** bumping Next (otherwise you will carry a green-but-blind gate through the upgrade).

### Phase 1 — Next + React + eslint-config-next

```bash
cd app
pnpm add next@15.5.24 react@18.3.1 react-dom@18.3.1
pnpm add -D eslint-config-next@15.5.24 eslint@8.57.1 \
  @types/react@18.3.31 @types/react-dom@18.3.7 typescript@5.9.3 @types/node@20.19.43
```

Then apply §4 Promise `params`/`searchParams` and the `require.resolve` alias. Then:

```bash
pnpm exec tsc --noEmit
pnpm lint
```

Do not proceed if `tsc` or lint is red.

### Phase 2 — Prisma (same major pair, generate)

```bash
cd app
pnpm add @prisma/client@6.19.3
pnpm add -D prisma@6.19.3
pnpm db:generate
pnpm exec tsc --noEmit
```

If generate asks to change the generator provider, **stop** and keep `prisma-client-js` (ADR-4).

### Phase 3 — Vitest 3

```bash
cd app
pnpm add -D vitest@3.2.7 vite@6 @vitejs/plugin-react@4.7.0
pnpm test
```

All files matching `vitest.config.ts` `include` must stay green. No second runner.

### Phase 4 — remaining app bounded bumps

```bash
cd app
pnpm add stripe@14.25.0 @stripe/stripe-js@2.4.0 \
  firebase@10.14.1 firebase-admin@12.7.0 \
  @upstash/redis@1.38.3 @vercel/og@0.11.1 zod@3.25.76 recharts@2.15.4
pnpm add -D tailwindcss@3.4.19 postcss@8.5.26 autoprefixer@10.5.4 \
  playwright@1.62.1 @playwright/test@1.62.1 tsx@4.23.12
```

Set `"packageManager": "pnpm@9.15.9"`. Fix Playwright `webServer.command`. Then `pnpm test && pnpm lint && pnpm exec tsc --noEmit`.

### Phase 5 — production build (the real Next gate)

```bash
cd app
pnpm build
```

Read the **route table** Next prints. Confirm `/api/og` is edge, API routes are dynamic/nodejs, `/b/[slug]` and `/stack/[category]` are dynamic. Do not assert this by grepping source.

### Phase 6 — orchestrator

```bash
cd orchestrator
yarn add @cursor/sdk@1.0.30
yarn add -D tsx@4.23.12 typescript@5.9.3 @types/node@22.20.1
yarn typecheck
yarn test
```

### Phase 7 — CI + audit inventory

Update `.github/workflows/ci.yml` only as §4 says. Re-run §7 fail-proofs on the **new** lockfile. Paste `pnpm audit` counts into the implementer handoff (section 9). Commit `app/pnpm-lock.yaml` and `orchestrator/yarn.lock` in the same change as `package.json`.

---

## 7. Verification (and proving gates can fail)

Standing rule: **a quality gate is not a gate until it has been proven to fail.**

### Commands that must pass after the bump

From `app/`:

| Command | Must |
|---|---|
| `pnpm install --frozen-lockfile` | CI equivalent; lockfile committed. |
| `pnpm db:generate` | Prisma client emits; no generator-provider rewrite. |
| `pnpm exec tsc --noEmit` | Includes App Router Promise params. |
| `pnpm lint` | `next lint --max-warnings=0`; **lists files**; exit 0. |
| `pnpm test` | Existing vitest include; same runner. |
| `pnpm build` | Route table inspected; webpack alias does not crash SWC. |

From `orchestrator/`:

| Command | Must |
|---|---|
| `yarn install --frozen-lockfile` | |
| `yarn typecheck` | `tsc` + `tsc -p tsconfig.test.json`. |
| `yarn test` | `tsx --test` on the four test files. |

Optional: `pnpm test:e2e` if a browser is available; Playwright `webServer` must use `pnpm dev`.

### Prove lint can fail

After `.eslintrc.json` is in effect:

```bash
cd app
# probe file — do not commit
printf '%s\n' 'export const __lint_probe = 1' > app/__lint_probe.ts
pnpm lint; echo "lint_probe_exit=$?"
rm app/__lint_probe.ts
```

**Pass condition for the proof:** `lint_probe_exit` is **non-zero** (unused export / similar under `next/core-web-vitals`). If it is still 0, the gate is still blind — fix config (`eslint.ignoreDuringBuilds` must not be set; do not add a bogus `ignore` that excludes `app/**`). Then re-prove.

Alternatively, temporarily drop `--max-warnings=0` and introduce a warning; the production script must keep `--max-warnings=0`.

### Prove audit can fail

On **pre-upgrade** lockfile (Phase 0): `pnpm audit --audit-level=critical` must be **non-zero** (next@14.0.4). That proves the tool is wired.

On **post-upgrade** lockfile: run `pnpm audit` with no level, then `--audit-level=critical`, then `--audit-level=high`. Record counts in §9. If `--audit-level=critical` is still non-zero after 15.5.24, CI must not be greened by `--audit-level=none` or by omitting the step. If it is zero, add the CI step as blocking.

Do **not** `pnpm audit --fix` blindly (it will major-bump off this plan).

### What not to treat as proof

- Grepping `package.json` for `"15.5.24"`.
- A `next build` that exits 0 without reading the route table (empty-data prerender has already shipped that way).
- Vitest passing while `tsc` is skipped.
- Docblocks in `next.config.js` claiming the alias is needed — prove with `next build` with and without the alias if you intend to delete it.

---

## 8. Failure modes

| Failure | What users / CI see | Data at risk | Recovery |
|---|---|---|---|
| `pnpm add next@15.5.24` / peer conflict | Install abort. | None. | Do not `--force` React 19. Align exact versions in §1. |
| Lockfile frozen install fails | CI red on `pnpm install --frozen-lockfile`. | None. | Re-run install without frozen locally, commit lockfile. |
| `next build` fails on webpack+Firebase | SWC/undici private-fields error, or module not found on alias path. | Deploy blocked; prod stays on 14.0.4 (still vulnerable). | Restore alias; `require.resolve` the real file; keep `transpilePackages`. Do not switch to Turbopack. |
| `next build` fails: webpack config vs Turbopack | Only if someone installed Next 16 by mistake. | Deploy blocked. | Downgrade to 15.5.24. Do not add `--webpack` unless ADR-1 is reopened. |
| `tsc`: `params.slug` on a Promise | Typecheck red. | None. | Await params in the four files (§4). Do not `as any`. |
| `next lint` setup prompt / exit 0, no files | CI green, zero files linted — **known standing failure**. | Vulnerabilities and hooks bugs merge unseen. | Committed `.eslintrc.json` + probe in §7. |
| Vitest 3 API break (`vi.mock` hoist, globals) | `pnpm test` red. | None. | Fix config key only; keep factories in separate modules (`rngCounter.ts` pattern). Do not add Jest. |
| Prisma `generate` wants `prisma-client` provider | Generate error or empty `@prisma/client`. | Runtime would miss the client; do not deploy. | Keep `provider = "prisma-client-js"`. Do not add an adapter. |
| Prisma client version mismatch | "Query engine mismatch" at runtime. | Queries fail; no writes if process crashes first. | `prisma` and `@prisma/client` **exact** same version; `pnpm db:generate`. |
| Stripe types reject `2023-10-16` | `tsc` red in `src/api/stripe.ts`. | If bypassed, webhook verification could be built against the wrong types. | Stay on `stripe@14.25.0`. Do not ts-ignore a newer SDK. |
| Vercel build uses wrong Next | Production middleware bypass remains, or webpack alias missing in the serverless bundle. | Auth cookie presence-check skipped (CVE-2025-29927 class); view-count internal fetch. | `vercel.json` already `framework: nextjs` + `pnpm install`. Confirm the deployment installs `app/` not repo root. `outputDirectory: ".next"`. |
| Vercel Edge `/api/og` breaks on `@vercel/og@0.11.1` | OG images 500. | No money path; share cards fail. | Pin back `0.6.2` only for that package; rest of the suite stays. |
| Upstash client ctor change | Redis throws at first view-credit / rate-limit. | Checkout fail-open already documented; view counts drop. | Revert `@upstash/redis` only. |
| Orchestrator `@cursor/sdk` patch breaks `Agent` | `yarn test` / loop dispatch fails. | No production app data. | Revert SDK to 1.0.28; keep tsx/typescript bumps. |
| `pnpm audit` still critical after bump | If CI is blocking, merge blocked. | Honest. | Identify the package; do not ignore. Reopen ADR if Next 15.5.24 is itself flagged (it should not be for the Aug 2026 GHSAs). |

---

## 9. Security — remaining CVEs after the bump

**Do not claim `pnpm audit` is zero.** Architect cannot run the post-upgrade lockfile in this stage. Implementer **must** paste actual counts.

**Expected to clear (named):**

- CVE-2025-29927 (Next middleware `x-middleware-subrequest` bypass) — 15.5.24 ≫ 15.2.3.
- Next 14.0.4 cluster cited in `docs/reviews/2026-08-29.md` F-2 (CVE-2024-51479, CVE-2024-34351, cache poisoning on that pin) — superseded by 15.5.24.
- 2026-08-29 Next GHSAs (AVIF/sharp unauthenticated RCE; CVE-2026-75604 Windows RCE) — patched in 15.5.24. This app does not use `next/image`; AVIF optimization is disabled in the patched Next regardless. Production is Vercel/Linux, so Windows RCE is not the hosting case.
- CVE-2026-47429 (Vitest UI path traversal / RCE) — 3.2.7 ≥ 3.2.5. Still do not add `@vitest/ui`.

**Expected to remain (inventory, do not ignore silently):**

- `undici` highs via **Firebase** (client) and via **`@cursor/sdk` → `@connectrpc/connect-node`** (orchestrator). F-2 already counted orchestrator as 12 findings / 3 high / 0 critical, all undici-via-SDK. A patch of SDK 1.0.30 may or may not move that; measure.
- Any `pnpm audit` moderate/low on `prisma`, `jws`/`jsonwebtoken` (firebase-admin), `esbuild` (vitest/vite), `brace-expansion`, etc.
- Next 15.5 Maintenance LTS **EOL 2026-10-21**. After that date, 15.5.24 is in the same "no new patches" class 14.2.35 is in today. The 16.3.x follow-up is a security deadline, not a nice-to-have.

**CI policy:**

- Blocking: `pnpm audit --audit-level=critical` once Phase 0 proved it fails on 14.0.4 and Phase 7 shows the post-upgrade result.
- Not blocking yet: `--audit-level=high` until the remaining high list is written down (likely undici). Silencing with `pnpm audit --ignore` without a CVE id and expiry is forbidden.

**Unchanged trust boundaries (not this change set):** middleware is still presence-only; `requireAuth` still verifies Firebase tokens in route handlers; Stripe `constructEvent` still needs the raw body; do not derive `INTERNAL_TOKEN` destinations from `request.nextUrl.origin`.

---

## 10. Environment variables

**Unchanged.** No library rename requires new names.

Already required (do not add, remove, or rename):

| Name | Where |
|---|---|
| `DATABASE_URL` | Prisma pooled |
| `DIRECT_URL` | Prisma migrate / `vercel.json` fallback |
| `STRIPE_SECRET_KEY` | `getStripe()` |
| `STRIPE_WEBHOOK_SECRET` | `constructEvent` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | public config (JS SDK still unused in source) |
| `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` | admin `cert()` |
| Public Firebase keys in `src/config/public.ts` | client SDK |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | `@upstash/redis` (`REDIS_URL` is **not** the client this code uses) |
| `INTERNAL_TOKEN` / `ADMIN_TOKEN` | middleware + admin routes |
| `BASE_URL` / `INTERNAL_BASE_URL` if present | `resolveBaseUrl` |
| `CURSOR_API_KEY` | orchestrator only |

Do not enable `experimental.trustHostHeader`. Do not add Prisma Accelerate URL vars. Do not add Stripe API-version env overrides.

---

## Folder structure / ownership (no new trees)

No new directories. Ownership for this change:

| Path | Owner |
|---|---|
| `app/package.json`, `app/pnpm-lock.yaml` | implementer |
| `app/next.config.js`, `app/middleware.ts` | implementer (alias only; no middleware rewrite) |
| `app/.eslintrc.json`, `app/vitest.config.ts` | implementer |
| `app/app/b/[slug]/page.tsx`, `app/app/stack/[category]/page.tsx`, `app/app/tower/[category]/page.tsx`, `app/app/api/tower/[category]/route.ts` | implementer (Promise params only) |
| `app/prisma/schema.prisma` | data — **read-only** unless generate forces a non-breaking generator line |
| `app/src/db/client.ts`, `app/src/api/stripe.ts` | backend — **do not** change unless versions force a one-line ctor fix |
| `orchestrator/package.json`, `orchestrator/yarn.lock` | implementer |
| `.github/workflows/ci.yml` | devops/implementer |
| `loop/package-upgrade.md` | architect (this file; stable until implementer starts) |

---

## Out-of-scope product questions (explicitly not decided here)

Standing open questions in `loop/learnings.md` (free-leaderboard trust boundary, power-up one-slot vs stacking, unscoped `/api/tower`) are **not** part of this upgrade. Answering them would rewrite product contracts, which this goal forbids.

---

## Implementer checklist (copy)

- [ ] Phase 0 lint/audit exit codes recorded (both proven able to fail)
- [ ] `next@15.5.24` + `eslint-config-next@15.5.24` + React 18.3.1
- [ ] Four files await Promise `params`/`searchParams`
- [ ] Firebase alias uses `require.resolve`; `next build` green
- [ ] Prisma 6.19.3 pair; still `from "@prisma/client"`
- [ ] Vitest 3.2.7 + vite 6; `pnpm test` green; no Jest
- [ ] Remaining §1 pins; Playwright `pnpm dev`
- [ ] Orchestrator yarn bumps; `yarn typecheck` + `yarn test`
- [ ] Post-upgrade `pnpm audit` counts written (no "zero" claim unless the tool printed 0)
- [ ] CI still `--max-warnings=0`; probe file proved non-zero
