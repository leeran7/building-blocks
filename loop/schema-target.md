# Target physical schema — The Climb / paid stacks

**Status:** spec-only. Do **not** edit `app/prisma/schema.prisma`, do **not** run
`migrate`, do **not** write application code from this document in this stage.  
**ORM:** Prisma **6.19.3** / `prisma-client-js` + Postgres (Neon). Match
`context/profile.json`.  
**Parents:** `loop/spec.md` (AC-1–AC-57 closed), `loop/architecture.md` (§5–6,
§14, ADR-A–G).  
**Live SoR today:** `users`, `saved_urls`, `climb_records`, `climb_runs`,
`blocks`, `season_state`, `payments`, `payment_dead_letters`
(`app/prisma/schema.prisma` + `app/prisma/migrations/0001`–`0009` +
`20260826193624_user_settings`).

This file is the physical contract: types, nullability, defaults, unique/check
constraints, FKs, cascade, every index the ORM will not drop, CHECKs that live
only in migrate SQL, expand-contract from the live shape, retention SQL, seed
states, and query sketches. Implementer copies from here; they do not guess.

**Not in this generation:** Category table, Vercel Blob / `input_log_url` /
BYTEA, `clicks`, `spend_c`, `@default` on `stack_slug`/`category`,
`emailVerified`, stored current rank, `checkout_intents`, `prisma db push`.

---

## 0. Learnings applied (this stage)

| Source | Insight | How applied | Exception |
|--------|---------|-------------|-----------|
| architect → data | Partial uniques are migrate-SQL-only; same-named non-partial `@@index` destroyed `blocks_rank_idx`; participations sort index is non-partial Prisma-safe; integer mm/views; `payment_state` on listings; `spend_c` omitted; ClimbRecord unique `user_id` only; payment UNIQUE is the increment lock | §1–3, §2 banned-name table, ADR-F ops note | — |
| product-spec → data | Listing vs Participation; live set = paid + unhidden + current-season participation | Listing / Participation split; one Block → one of each | — |
| product-spec → data | Ledger SoR; pending not public; no `emailVerified` | No `spend_c`; `payment_state`; User omits `emailVerified` | — |
| product-spec → data | Replay retention 30+PB/90d; no Category table | `input_log TEXT` + §6 SQL; seed forbids a Category table | No Blob (50 GiB trigger) |
| product-spec → data | Client `peakY` forbidden | No `peakY` column; `peak_y_mm` is re-sim only | — |
| standing / kernel 14 | Declare indexes the ORM will not drop | §2 Prisma-safe vs migrate-SQL; `pg_indexes` test | — |
| standing | CHECKs in migrate SQL; no string-interpolated SQL | §3; §8 uses bound parameters | — |
| standing | Never rename/drop in the same deploy as readers of the old shape | §5 numbered phases; dual-write windows | — |
| ledger | `getOrCreate` ≠ removing a default | Backfill copies leftover `tech`; does **not** rewrite it to an allow-listed slug | — |

---

## 1. Target Prisma-like models

Conventions (architecture §4.3, §5):

- Prisma **model** names PascalCase; **scalar fields and Postgres columns**
  `snake_case`; **relation fields** camelCase only (`user`, `listing`,
  `payments`).
- No mixing `userId` and `user_id` on the target models.
- No `@default` on `stack_slug`. No `@default("tech")` anywhere.
- `created_at DateTime @default(now()) @db.Timestamptz(3)` unless noted.
- Enums below are exhaustive. Prisma 6.19.3 **cannot** express CHECKs or
  partial uniques as push-safe schema — those are §3 and §2.2.
- IDs: `User.id` is the Firebase UID (client-supplied, not `cuid`). Every
  other PK is `String @id @default(cuid())`.
- **Do not add** `clicks`, `spend_c`, `category_slug` (climb), `emailVerified`,
  Blob columns, or a `Category` model.

The block below is the **end-state** `schema.prisma` (after all contract
phases). Intermediate dual-write shapes are §5, not this block.

```prisma
// app/prisma/schema.prisma — TARGET (not applied in this stage)
// CHECKs + partial uniques: migrate SQL only. NEVER prisma db push (ADR-F).
// Banned @@index / @unique / @@unique names: season_one_active_per_category,
// admin_audits_idempotency_key, listings_live_idx, blocks_rank_idx.
// See loop/schema-target.md §2.

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

enum PaymentState {
  pending
  paid
}

enum DeadLetterStatus {
  open
  replayed
}

enum AdminAction {
  hide
  refund
  rollover
  dead_letter_replay
}

model User {
  id           String   @id
  email        String   @unique
  display_name String?
  created_at   DateTime @default(now()) @db.Timestamptz(3)

  listings     Listing[]
  climbRecords ClimbRecord[]
  climbRuns    ClimbRun[]
  savedUrls    SavedUrl[]

  @@map("users")
}

model SavedUrl {
  id         String   @id @default(cuid())
  user_id    String
  url        String
  created_at DateTime @default(now()) @db.Timestamptz(3)

  user User @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@unique([user_id, url], map: "saved_urls_user_url_key")
  // user_id FK is the leftmost column of saved_urls_user_url_key — do not also
  // declare @@index([user_id]) (redundant btree).
  @@map("saved_urls")
}

model Season {
  id          String   @id @default(cuid())
  stack_slug  String   // NO @default. Allow-list on write (AC-55).
  views_count Int      @default(0)
  starts_at   DateTime @db.Timestamptz(3)
  ends_at     DateTime @db.Timestamptz(3)
  is_active   Boolean  @default(false)

  participations Participation[]

  @@index([stack_slug], map: "seasons_stack_idx")
  // PARTIAL UNIQUE season_one_active_per_category (stack_slug) WHERE is_active
  // is migrate-SQL-only. Do NOT @@unique([stack_slug]) — many inactive seasons
  // per stack are required (T11). Do NOT reuse that index name here.
  @@map("season_state") // keep physical name this generation (no table rename)
}

model Listing {
  id            String       @id @default(cuid())
  slug          String       @unique // never recycled for paid rows
  url           String
  display_name  String
  owner_email   String       // from token; retained after account delete
  stack_slug    String       // NO @default
  payment_state PaymentState // must be set explicitly; no @default
  hidden_at     DateTime?    @db.Timestamptz(3) // NULL = not hidden
  user_id       String?
  created_at    DateTime     @default(now()) @db.Timestamptz(3)

  user           User?           @relation(fields: [user_id], references: [id], onDelete: SetNull)
  participations Participation[]
  payments       Payment[]

  @@index([user_id], map: "listings_user_id_idx")
  @@index([stack_slug, payment_state, hidden_at], map: "listings_stack_state_idx")
  // PARTIAL listings_live_idx is migrate-SQL-only. Do not @@index name it.
  @@map("listings")
}

model Participation {
  id                String   @id @default(cuid())
  listing_id        String
  season_id         String
  altitude_mm       Int      @default(0)
  views_served      Int      @default(0)
  peak_rank         Int?     // best observed 1-based live rank; not ORDER BY
  first_credited_at DateTime @db.Timestamptz(3) // set on insert; never moves
  created_at        DateTime @default(now()) @db.Timestamptz(3)

  listing  Listing  @relation(fields: [listing_id], references: [id], onDelete: Restrict)
  season   Season   @relation(fields: [season_id], references: [id], onDelete: Restrict)
  payments Payment[]

  @@unique([listing_id, season_id], map: "participations_listing_season_key")
  // listing_id FK served by unique prefix — no second btree.
  // season_id FK served by leftmost of participations_season_altitude_idx.
  @@index([season_id, altitude_mm(sort: Desc), first_credited_at], map: "participations_season_altitude_idx")
  @@map("participations")
}

model Payment {
  id                        String    @id @default(cuid())
  listing_id                String
  participation_id          String
  stripe_session_id         String    @unique
  amount_cents              Int
  metres_added_mm           Int       // settlement; never rewritten
  views_count_at_settlement Int       // V used at credit (audit)
  refunded_at               DateTime? @db.Timestamptz(3)
  stripe_refund_id          String?
  created_at                DateTime  @default(now()) @db.Timestamptz(3)

  listing       Listing       @relation(fields: [listing_id], references: [id], onDelete: Restrict)
  participation Participation @relation(fields: [participation_id], references: [id], onDelete: Restrict)
  deadLetterReplays PaymentDeadLetter[]

  @@index([listing_id], map: "payments_listing_id_idx")
  @@index([participation_id], map: "payments_participation_id_idx")
  @@map("payments")
}

model PaymentDeadLetter {
  id                  String           @id @default(cuid())
  stripe_session_id   String           @unique
  event_type          String
  amount_cents        Int
  reason              String
  event_json          Json?            @db.JsonB
  status              DeadLetterStatus @default(open)
  replayed_at         DateTime?        @db.Timestamptz(3)
  replayed_payment_id String?
  created_at          DateTime         @default(now()) @db.Timestamptz(3)
  last_seen_at        DateTime         @db.Timestamptz(3)

  replayedPayment Payment? @relation(fields: [replayed_payment_id], references: [id], onDelete: Restrict)

  @@index([status, created_at], map: "dead_letters_status_created_idx")
  @@index([replayed_payment_id], map: "dead_letters_replayed_payment_id_idx")
  @@map("payment_dead_letters")
}

model AdminAudit {
  id               String      @id @default(cuid())
  actor            String      // "admin" — bearer class; no user PII required
  action           AdminAction
  listing_id       String?     // TEXT, not FK (append-only; pending purge may remove a listing)
  season_id        String?
  payment_id       String?
  stripe_session_id String?
  idempotency_key  String?     // NOT @unique — partial unique is SQL-only
  payload          Json        @db.JsonB
  created_at       DateTime    @default(now()) @db.Timestamptz(3)

  @@index([created_at(sort: Desc)], map: "admin_audits_created_at_idx")
  @@index([listing_id], map: "admin_audits_listing_id_idx")
  @@map("admin_audits")
}

model ClimbRecord {
  id               String   @id @default(cuid())
  user_id          String   @unique
  peak_y_mm        Int
  peak_achieved_at DateTime @db.Timestamptz(3) // moves only when peak_y_mm increases
  finishes         Int      @default(0)
  pb_run_id        String?
  updated_at       DateTime @updatedAt @db.Timestamptz(3)

  user  User      @relation(fields: [user_id], references: [id], onDelete: Cascade)
  pbRun ClimbRun? @relation("ClimbRecordPbRun", fields: [pb_run_id], references: [id], onDelete: SetNull)

  @@index([peak_y_mm(sort: Desc), peak_achieved_at], map: "climb_records_board_idx")
  @@index([pb_run_id], map: "climb_records_pb_run_id_idx")
  @@map("climb_records")
}

model ClimbRun {
  id            String   @id @default(cuid())
  user_id       String   // NOT NULL — persisted runs only; anonymous POST writes nothing
  peak_y_mm     Int      // re-sim only; never client peakY
  finished      Boolean  @default(false)
  finished_tick Int?
  ticks         Int?
  seed          String
  input_log     String?  @db.Text // NULL after eviction; CHECK char_length <= 32768 in SQL
  created_at    DateTime @default(now()) @db.Timestamptz(3)

  user     User         @relation(fields: [user_id], references: [id], onDelete: Cascade)
  pbRecord ClimbRecord? @relation("ClimbRecordPbRun")

  @@index([user_id, created_at(sort: Desc)], map: "climb_runs_user_created_idx")
  @@map("climb_runs")
}
```

### 1.1 Field notes (load-bearing)

| Model | Field | Notes |
|-------|--------|--------|
| Season | `stack_slug` | No DB default. Inactive seasons **never deleted**. Physical table stays `season_state`. `views_k` is **not stored**; API `views_k = views_count / 1000`. |
| Listing | `payment_state` | `pending` \| `paid`. Public T1/`/b` require `paid`. Pending: no participation. |
| Listing | identity | `slug` public; `id` checkout/webhook. **Expand-contract: `listings.id = blocks.id`** so Stripe metadata and `payments.block_id` keep working. |
| Participation | created | **Only** on first credited payment for `(listing_id, season_id)`. |
| Participation | `peak_rank` | Optional write-behind; stale-worse allowed; **not** in `ORDER BY`. |
| Payment | `participation_id` | `NOT NULL` at target. Same-txn order: get-or-create participation (`altitude_mm=0`) → `INSERT` payment (UNIQUE is the lock) → `UPDATE … altitude_mm = altitude_mm + :mm`. Never `SET`/`decrement` altitude. |
| Payment | no user FK | AC-53: payments retained with no owner row. |
| ClimbRecord | unique | **`user_id` only.** No `category_slug`. One global board (AC-43). |
| ClimbRecord | `pb_run_id` | `ON DELETE SET NULL` (cycle-free with CASCADE from `users`). |
| ClimbRun | `input_log` | Existing deflate+base64url token. `TEXT`, not BYTEA, not Blob. Cap 32 768 **characters**. |
| AdminAudit | `idempotency_key` | Nullable. Uniqueness **only** via SQL partial unique (AC-33). |
| AdminAudit | FKs | None. Append-only from product paths. |

**Live set** for stack `S` (T1): `season_state.is_active AND stack_slug = S`
⋈ `participations.season_id` ⋈ `listings.payment_state = 'paid' AND hidden_at IS NULL`,
`ORDER BY altitude_mm DESC, first_credited_at ASC`, `take 100`.

---

## 2. Indexes

Every FK has a btree (unique prefix or dedicated index). Every `findMany` has
`take` (see §8). Partial / unique-partial indexes are **migrate-SQL-only**.

### 2.1 Prisma-safe (declare in `schema.prisma`; survive migrate **and** would survive push)

These have **no** `WHERE` predicate. Names must **not** collide with §2.2.

| Name | Table | Columns | Unique | Partial / WHERE | Traversal | Kind |
|------|-------|---------|--------|-----------------|-----------|------|
| `users_pkey` | users | `id` | PK | — | T22, T24 | implicit PK |
| `users_email_key` | users | `email` | UNIQUE | — | T22 | Prisma `@unique` |
| `saved_urls_pkey` | saved_urls | `id` | PK | — | T23 | implicit PK |
| `saved_urls_user_url_key` | saved_urls | `(user_id, url)` | UNIQUE | — | T23 | Prisma `@@unique` |
| `seasons_pkey` / `season_state_pkey` | season_state | `id` | PK | — | T1, T9 | implicit PK |
| `seasons_stack_idx` | season_state | `stack_slug` | no | **none** | T1, T10, T9 | Prisma `@@index` |
| `listings_pkey` | listings | `id` | PK | — | T2, T7 | implicit PK |
| `listings_slug_key` | listings | `slug` | UNIQUE | — | T2 | Prisma `@unique` |
| `listings_user_id_idx` | listings | `user_id` | no | — | T3, T24 | Prisma `@@index` (FK) |
| `listings_stack_state_idx` | listings | `(stack_slug, payment_state, hidden_at)` | no | — | T1 join filter | Prisma `@@index` |
| `participations_pkey` | participations | `id` | PK | — | T11 | implicit PK |
| `participations_listing_season_key` | participations | `(listing_id, season_id)` | UNIQUE | — | T11 | Prisma `@@unique`; **also** the `listing_id` FK index (leftmost). Do **not** add `participations_listing_id_idx`. |
| `participations_season_altitude_idx` | participations | `(season_id, altitude_mm DESC, first_credited_at ASC)` | no | **none** (Prisma-safe) | **T1 ORDER BY**, **T3 COUNT**, T13 | Prisma `@@index` sort |
| `payments_pkey` | payments | `id` | PK | — | T5, T8 | implicit PK |
| `payments_stripe_session_id_key` | payments | `stripe_session_id` | UNIQUE | — | T5, T12, AC-18 | Prisma `@unique` (idempotency lock) |
| `payments_listing_id_idx` | payments | `listing_id` | no | — | T2, T4, T8, AC-10 SUM | Prisma `@@index` (FK) |
| `payments_participation_id_idx` | payments | `participation_id` | no | — | T12 | Prisma `@@index` (FK) |
| `dead_letters_pkey` | payment_dead_letters | `id` | PK | — | T6 | implicit PK |
| `dead_letters_stripe_session_id_key` | payment_dead_letters | `stripe_session_id` | UNIQUE | — | T6, T12, AC-20 | Prisma `@unique` (`map:` this name) |
| `dead_letters_status_created_idx` | payment_dead_letters | `(status, created_at)` | no | — | T6, T26 | Prisma `@@index` |
| `dead_letters_replayed_payment_id_idx` | payment_dead_letters | `replayed_payment_id` | no | — | T12 | Prisma `@@index` (FK) |
| `admin_audits_pkey` | admin_audits | `id` | PK | — | T7–T9 | implicit PK |
| `admin_audits_created_at_idx` | admin_audits | `created_at DESC` | no | — | ops | Prisma `@@index` |
| `admin_audits_listing_id_idx` | admin_audits | `listing_id` | no | — | T7–T9 | Prisma `@@index` (not an FK) |
| `climb_records_pkey` | climb_records | `id` | PK | — | T16 | implicit PK |
| `climb_records_user_id_key` | climb_records | `user_id` | UNIQUE | — | T16, T19 | Prisma `@unique` (FK + one-row-per-user) |
| `climb_records_board_idx` | climb_records | `(peak_y_mm DESC, peak_achieved_at ASC)` | no | — | **T15**, T16 COUNT | Prisma `@@index` |
| `climb_records_pb_run_id_idx` | climb_records | `pb_run_id` | no | — | T20 | Prisma `@@index` (FK) |
| `climb_runs_pkey` | climb_runs | `id` | PK | — | T17, T20 | implicit PK |
| `climb_runs_user_created_idx` | climb_runs | `(user_id, created_at DESC)` | no | — | **T17 take 30** | Prisma `@@index`; also the `user_id` FK index |

**Sort index call-out:** `participations_season_altitude_idx` is the live-tower
sort index. It is a **non-partial** btree. That is deliberate (ADR-F): Prisma
can own it. T1 still filters `paid` + `hidden_at IS NULL` in SQL; the index
prefix `season_id` + ordered `altitude_mm` makes `take 100` and T3 `COUNT`
O(log n) at 10× live rows.

### 2.2 Migrate-SQL-only (ADR-F)

Prisma 6.19.3 `prisma-client-js` cannot express these as first-class schema
that `db push` preserves. Put them in migrate SQL. **Quote the exact names
in a schema comment. Never declare the same name as a non-partial `@@index`
or `@unique`.**

| Name | Table | Columns | Unique | Partial / WHERE | Traversal | Kind |
|------|-------|---------|--------|-----------------|-----------|------|
| `season_one_active_per_category` | season_state | `stack_slug` | UNIQUE | `WHERE (is_active = true)` | T1, T9, T10, P2002 race guard | **migrate-SQL-only** |
| `admin_audits_idempotency_key` | admin_audits | `idempotency_key` | UNIQUE | `WHERE (idempotency_key IS NOT NULL)` | T9, AC-33 | **migrate-SQL-only** |
| `listings_live_idx` | listings | `stack_slug` | no | `WHERE payment_state = 'paid' AND hidden_at IS NULL` | T1 join helper (optional) | **migrate-SQL-only**; does **not** replace `participations_season_altitude_idx` |

```sql
-- One active season per stack (P2002 race guard for checkout/rollover)
CREATE UNIQUE INDEX season_one_active_per_category
  ON season_state (stack_slug) WHERE (is_active = true);

-- Rollover idempotency (AC-33)
CREATE UNIQUE INDEX admin_audits_idempotency_key
  ON admin_audits (idempotency_key) WHERE (idempotency_key IS NOT NULL);

-- Optional live-listing partial (does not replace the participation sort index)
CREATE INDEX listings_live_idx
  ON listings (stack_slug)
  WHERE payment_state = 'paid' AND hidden_at IS NULL;
```

Live today `season_one_active_per_category` is `ON season_state (category)
WHERE (is_active = true)` (migration 0004). Expand-contract replaces the
indexed column with `stack_slug` **without** a same-named non-partial
substitute (see §5 phase 2d / 6).

### 2.3 Banned colliding names (how `blocks_rank_idx` was destroyed)

A Prisma `@@index` / `@unique` / `@@unique` whose **name** matches a
partial SQL index causes `prisma db push` (and some generated migrate diffs)
to **DROP** the partial and recreate a non-partial btree. That is how
migration 0002’s `blocks_rank_idx … WHERE hidden_at IS NULL` was replaced by
`schema.prisma`’s `@@index([altitude], name: "blocks_rank_idx")`.

**Do not put any of these names on a Prisma index or unique:**

| Banned name | Why |
|-------------|-----|
| `season_one_active_per_category` | Partial unique. A non-partial unique on `stack_slug` would also **forbid multiple inactive seasons**. |
| `admin_audits_idempotency_key` | Partial unique (`NULL` keys must not collide). Prisma `@unique` on the field would use this name and drop the `WHERE`. |
| `listings_live_idx` | Partial. A non-partial `@@index([stack_slug], name: "listings_live_idx")` would drop the `WHERE`. |
| `blocks_rank_idx` | Retired with `blocks`. Do **not** recreate this name on `participations` or `listings`. Replacement is `participations_season_altitude_idx`. |

Also ban:

- `@@unique([stack_slug])` on `Season` (inactive multiples are required).
- `@unique` on `AdminAudit.idempotency_key`.
- A second btree `@@index([listing_id])` named `participations_listing_id_idx` (unique prefix already indexes the FK; architecture listed the name as the unique).
- Re-adding `@@index([altitude], name: "blocks_rank_idx")` on a frozen `Block` model in a way that **regenerates** a drop/create (leave the live `Block` model untouched until the table is dropped in phase 6).

### 2.4 Survival policy (ops — load-bearing)

1. **Never run `prisma db push`** in CI, Vercel build, `package.json` scripts,
   README, or a cloud-agent shell. Only `prisma migrate dev` / `migrate deploy`
   against `DIRECT_URL`.
2. Schema comments quote the exact SQL and names in §2.2.
3. Verifier: an **integration test** (not a source grep) runs
   `SELECT indexname, indexdef FROM pg_indexes WHERE indexname IN (
      'season_one_active_per_category',
      'admin_audits_idempotency_key',
      'listings_live_idx'
    )` and asserts each `indexdef` still contains its `WHERE` predicate after
   migrate. If someone `db push`es a branch DB, this test fails; restore from
   the durable migration.
4. `CREATE INDEX CONCURRENTLY` cannot run inside Prisma’s migration
   transaction. At current scale, create indexes in-transaction. A later large
   table uses a maintenance window, not `db push`.

### 2.5 Index count (for cost)

Target extra btrees beyond PKs: **7 uniques** (email, slug, listing+season,
two stripe_session_id, climb user_id, saved url pair) + **14 non-unique
Prisma btrees** in §2.1 + **3 migrate-SQL** in §2.2 = **24 secondary indexes**.
Hottest write amplification: `participations_season_altitude_idx` (T10
`views_served` updates touch the row; the sort key `altitude_mm` is unchanged
on view credit) and `payments_listing_id_idx` (append-only).

---

## 3. CHECKs (migrate SQL only)

Prisma does not model these. Names are stable; all are `NOT VALID` first only
if a backfill might fail — target backfills in §5 keep them valid, so add
`VALID` in the expand migrate after backfill of the new columns.

| Name | Table | Expression |
|------|-------|------------|
| `seasons_views_count_nonneg` | season_state | `views_count >= 0` |
| `seasons_ends_after_starts` | season_state | `ends_at > starts_at` |
| `participations_altitude_mm_nonneg` | participations | `altitude_mm >= 0` |
| `participations_views_served_nonneg` | participations | `views_served >= 0` |
| `participations_peak_rank_positive` | participations | `peak_rank IS NULL OR peak_rank >= 1` |
| `listings_payment_state_valid` | listings | `payment_state IN ('pending'::"PaymentState", 'paid'::"PaymentState")` (enum already constrains; keep CHECK if the column is ever TEXT in an intermediate migrate) |
| `payments_amount_cents_nonneg` | payments | `amount_cents >= 0` |
| `payments_metres_added_mm_nonneg` | payments | `metres_added_mm >= 0` |
| `payments_views_count_at_settlement_nonneg` | payments | `views_count_at_settlement >= 0` |
| `dead_letters_amount_cents_nonneg` | payment_dead_letters | `amount_cents >= 0` |
| `climb_records_peak_y_mm_nonneg` | climb_records | `peak_y_mm >= 0` |
| `climb_records_finishes_nonneg` | climb_records | `finishes >= 0` |
| `climb_runs_peak_y_mm_nonneg` | climb_runs | `peak_y_mm >= 0` |
| `climb_runs_input_log_len` | climb_runs | `char_length(input_log) <= 32768` (`NULL` passes) |
| `climb_runs_ticks_nonneg` | climb_runs | `ticks IS NULL OR ticks >= 0` |
| `climb_runs_finished_tick_nonneg` | climb_runs | `finished_tick IS NULL OR finished_tick >= 0` |

```sql
ALTER TABLE season_state
  ADD CONSTRAINT seasons_views_count_nonneg CHECK (views_count >= 0);
ALTER TABLE season_state
  ADD CONSTRAINT seasons_ends_after_starts CHECK (ends_at > starts_at);

ALTER TABLE participations
  ADD CONSTRAINT participations_altitude_mm_nonneg CHECK (altitude_mm >= 0);
ALTER TABLE participations
  ADD CONSTRAINT participations_views_served_nonneg CHECK (views_served >= 0);
ALTER TABLE participations
  ADD CONSTRAINT participations_peak_rank_positive
  CHECK (peak_rank IS NULL OR peak_rank >= 1);

ALTER TABLE payments
  ADD CONSTRAINT payments_amount_cents_nonneg CHECK (amount_cents >= 0);
ALTER TABLE payments
  ADD CONSTRAINT payments_metres_added_mm_nonneg CHECK (metres_added_mm >= 0);
ALTER TABLE payments
  ADD CONSTRAINT payments_views_count_at_settlement_nonneg
  CHECK (views_count_at_settlement >= 0);

ALTER TABLE payment_dead_letters
  ADD CONSTRAINT dead_letters_amount_cents_nonneg CHECK (amount_cents >= 0);

ALTER TABLE climb_records
  ADD CONSTRAINT climb_records_peak_y_mm_nonneg CHECK (peak_y_mm >= 0);
ALTER TABLE climb_records
  ADD CONSTRAINT climb_records_finishes_nonneg CHECK (finishes >= 0);

ALTER TABLE climb_runs
  ADD CONSTRAINT climb_runs_peak_y_mm_nonneg CHECK (peak_y_mm >= 0);
ALTER TABLE climb_runs
  ADD CONSTRAINT climb_runs_input_log_len
  CHECK (char_length(input_log) <= 32768);
ALTER TABLE climb_runs
  ADD CONSTRAINT climb_runs_ticks_nonneg CHECK (ticks IS NULL OR ticks >= 0);
ALTER TABLE climb_runs
  ADD CONSTRAINT climb_runs_finished_tick_nonneg
  CHECK (finished_tick IS NULL OR finished_tick >= 0);
```

Live CHECKs to **keep until the float columns drop** (phase 6):
`blocks_altitude_nonneg`, `season_views_k_nonneg`,
`climb_records_peak_y_nonneg`, `climb_runs_peak_y_nonneg`.

Do **not** add a CHECK that rewrites leftover `stack_slug = 'tech'` — new
writes are rejected in application allow-list (AC-55), not by deleting
history.

---

## 4. FK / delete policy (AC-53 / AC-54)

| Child | Column | Parent | ON DELETE | ON UPDATE | Product meaning |
|-------|--------|--------|-----------|-----------|-----------------|
| saved_urls | `user_id` | users.id | **CASCADE** | CASCADE | Saved URLs gone with the account |
| climb_records | `user_id` | users.id | **CASCADE** | CASCADE | Board row gone; handle gone |
| climb_runs | `user_id` | users.id | **CASCADE** | CASCADE | Runs gone (live today is SET NULL — change in expand after `user_id` is NOT NULL) |
| climb_records | `pb_run_id` | climb_runs.id | **SET NULL** | CASCADE | Cycle-free with the two CASCADEs from `users` |
| listings | `user_id` | users.id | **SET NULL** | CASCADE | Listing **remains**; slug unchanged; orphan still in T1 if paid+unhidden (AC-54) |
| participations | `listing_id` | listings.id | **RESTRICT** | CASCADE | Listings are not deleted except pending purge (zero payments ⇒ no participation) |
| participations | `season_id` | season_state.id | **RESTRICT** | CASCADE | Inactive seasons never deleted |
| payments | `listing_id` | listings.id | **RESTRICT** | CASCADE | Payments never deleted; blocks listing delete if any payment exists |
| payments | `participation_id` | participations.id | **RESTRICT** | CASCADE | |
| payment_dead_letters | `replayed_payment_id` | payments.id | **RESTRICT** | CASCADE | |
| payments | — | users | **no FK** | — | Ledger retained with no owner |
| admin_audits | listing/season/payment | — | **no FK** | — | Append-only |

**Account-delete transaction (T24):**

```sql
-- Bind parameters only. Application txn (Prisma), not string-built SQL.
-- 1) listings.user_id SET NULL is implied by FK; payments untouched.
-- 2) DELETE climb_records first (pb_run_id SET NULL), then user CASCADE
--    saved_urls + climb_runs, OR DELETE user and rely on SET NULL + CASCADE.
DELETE FROM users WHERE id = $user_id;
```

Effects:

| Data | After delete |
|------|----------------|
| `users.email`, `display_name` | **gone** |
| `saved_urls` | **gone** |
| `climb_records`, `climb_runs` (including `input_log`) | **gone** |
| `listings.user_id` | **NULL** |
| `listings.owner_email`, `url`, `display_name`, `slug` | **retained** |
| `payments.*` (no user column) | **retained** |
| Live tower | orphan paid unhidden listing still ranks (AC-54) |

Pending-listing 7-day purge is the **only** product `DELETE` of `listings`, and
only when `payment_state = 'pending'` and **zero** payment rows (RESTRICT
enforces the zero-payment rule).

---

## 5. Expand-contract from LIVE schema

Never rename or drop a column/table in the same deploy as an app still reading
the old shape. Public GET stays create-free the entire time. Only
`prisma migrate dev` / `migrate deploy`.

### 5.1 Live inventory (today)

| Table | Live columns (abbrev.) | Live constraints / indexes of note |
|-------|------------------------|------------------------------------|
| `users` | `id`, `email`, `emailVerified`, `display_name`, `createdAt` | `users_email_key` |
| `saved_urls` | `id`, `userId`, `url`, `created_at` | unique `(userId, url)`; idx `userId`; FK CASCADE |
| `climb_records` | `id`, `userId`, `category_slug`, `peak_y` Float, `wins`, `updated_at` | unique `(userId, category_slug)` `climb_record_user_category`; idx `(category_slug, peak_y DESC)`; CHECK `peak_y >= 0`; FK CASCADE. Migration 0007 already collapsed rows to `category_slug = 'free'`. |
| `climb_runs` | `id`, `userId` **nullable**, `category_slug`, `peak_y` Float, `finished`, `finished_tick`, `seed`, `replay_token`, `created_at` | idx category+created; idx `(userId, created_at DESC)`; FK **SET NULL**; CHECK `peak_y >= 0` |
| `blocks` | `id`, `slug` unique, `url`, `display_name`, `owner_email`, `altitude` Float, `spend_c`, `views_served`, `clicks`, `peak_rank`, `hidden_at`, `created_at`, `season_id`, `category` default **`'tech'`**, `userId` | CHECK `altitude >= 0`; `blocks_rank_idx` (partial in 0002; Prisma name collision); `blocks_category_altitude_idx`; `blocks_user_id_idx`; FK season RESTRICT; FK user SET NULL |
| `season_state` | `id`, `views_k` Float, `starts_at`, `ends_at`, `is_active`, `category` default **`'tech'`** | CHECK `views_k >= 0`; **partial unique** `season_one_active_per_category` on `(category) WHERE is_active` |
| `payments` | `id`, `block_id`, `stripe_session_id` unique, `amount_cents`, `metres_added` Float, `created_at` | FK block RESTRICT; unique `payments_stripe_unique` |
| `payment_dead_letters` | `id`, `stripe_session_id` (**non-unique** idx), `event_type`, `amount_cents`, `reason`, `created_at` | idx `payment_dead_letters_stripe_session_id_idx` |

No `listings`, `participations`, `admin_audits`. No `payment_state`,
`refunded_at`, `input_log`, `peak_y_mm`, `views_count`.

### 5.2 Conversion formulas (one-shot, then integer only)

Use `ROUND` (half away from zero via SQL `ROUND(x)` on numeric), never `CEIL`.

| Live | Target |
|------|--------|
| `blocks.altitude` (metres float) | `participations.altitude_mm = ROUND(altitude * 1000)::int` |
| `season_state.views_k` | `views_count = ROUND(views_k * 1000)::int` |
| `payments.metres_added` | `metres_added_mm = ROUND(metres_added * 1000)::int` |
| `climb_records.peak_y` / `climb_runs.peak_y` | `peak_y_mm = ROUND(peak_y * 1000)::int` |
| `climb_records.wins` | `finishes = wins` |

After conversion, writers increment integers only (ADR-C / ADR-G).

### 5.3 Leftover `category = 'tech'` (and other non-allow-listed slugs)

AC-55 / Decision 2 / R7: **new writes reject** `tech` and anything not in the
code seed. Leftover rows may still be **read** with `parseSeasonSlug`
(format parser). Do **not** rewrite `'tech'` to `GAME_CATEGORIES[0]` — that
is the default substitution the standing rule forbids.

| Step | Treatment |
|------|-----------|
| Backfill | `stack_slug = category` **as stored**, including `'tech'`, `'design'`, NULL-if-any |
| NULL `blocks.category` | Copy NULL. **Do not** `COALESCE(..., 'tech')`. Block `SET NOT NULL` on `listings.stack_slug` until an operator assigns a real allow-listed slug or the row stays pending/hidden. Fail the migrate if paid unhidden NULLs exist. |
| Active leftover seasons | Leave `is_active` untouched during backfill (old readers still use `category`). In **phase 5** (writers allow-list-only): `UPDATE season_state SET is_active = false WHERE is_active AND stack_slug NOT IN (:allow_listed_slugs)` with bound parameters from the code seed — **not** a rewritten slug. |
| Live T1 after switch | `GET /api/tower/tech` → 404 `INVALID_CATEGORY`. Leftover paid `'tech'` listings remain (never deleted) but are on no allow-listed board. Top-up of those rows is rejected (not in seed). |
| New money | Cannot target leftover tech seasons. |

### 5.4 ClimbRecord unique: `(userId, category_slug)` → `user_id`

Migration 0007 already deleted non-`free` records and forced runs to `'free'`,
so `userId` is de-facto unique. Still **assert**, then add the new unique
**before** dropping the old one.

```sql
-- Fail the migrate if duplicates survived 0007.
SELECT 1 FROM climb_records GROUP BY "userId" HAVING COUNT(*) > 1;
-- 0 rows required.

-- If any (should not): keep max(peak_y) / sum(wins) / max(updated_at) per user;
-- DELETE extras. Then:

-- After user_id is backfilled:
CREATE UNIQUE INDEX climb_records_user_id_key ON climb_records (user_id);
-- Old climb_record_user_category stays until phase 6 (app may still read
-- category_slug). Drop category_slug + old unique only when readers are gone.
```

`peak_achieved_at` does not exist live. Backfill `updated_at` (best available
timestamp; tie-break is approximate for legacy rows). `pb_run_id`: optional
best-effort — the user’s `climb_runs` row with greatest `peak_y_mm` (tie:
earliest `created_at`); else NULL.

### 5.5 Numbered phases

**Phase 0 — Ops (same PR as first expand migrate, not a data rewrite)**  
Remove any `db push` from docs/scripts. Comment ADR-F on `schema.prisma`.
Add the `pg_indexes` test skeleton (fails until expand migrate exists).

**Phase 1 — Expand (additive only; old app keeps working)**  
Create enums `PaymentState`, `DeadLetterStatus`, `AdminAction`.  
Create tables `listings`, `participations`, `admin_audits` with target
columns, PKs, Prisma-safe indexes, FKs, CHECKs.  
Add **nullable** twin columns on live tables (no drops, no renames):

| Table | Add |
|-------|-----|
| users | `created_at timestamptz` |
| saved_urls | `user_id text` (FK later not-null) |
| season_state | `stack_slug text` (**no default**), `views_count int DEFAULT 0` |
| climb_records | `user_id`, `peak_y_mm`, `peak_achieved_at`, `finishes`, `pb_run_id` |
| climb_runs | `user_id`, `peak_y_mm`, `ticks`, `input_log text` |
| payments | `listing_id`, `participation_id`, `metres_added_mm`, `views_count_at_settlement`, `refunded_at`, `stripe_refund_id` |
| payment_dead_letters | `event_json jsonb`, `status` default `open`, `replayed_at`, `replayed_payment_id`, `last_seen_at` |

Do **not** drop `clicks`, `spend_c`, `category`, `category_slug`,
`emailVerified`, `block_id`, `replay_token`, float columns, camelCase
columns. Do **not** `SET NOT NULL` yet on twins.

**Phase 2 — Backfill (still old readers)**

2a. **Listings from blocks (1:1, same id):**

```sql
INSERT INTO listings (
  id, slug, url, display_name, owner_email, stack_slug,
  payment_state, hidden_at, user_id, created_at
)
SELECT
  b.id,                          -- SAME PK: Stripe metadata / payments.block_id
  b.slug,
  b.url,
  b.display_name,
  b.owner_email,
  b.category,                    -- as-is, including 'tech'; NULL stays NULL
  'paid',                        -- live blocks were public; do not 404 /b/{slug}
  b.hidden_at,
  b."userId",
  b.created_at
FROM blocks b
ON CONFLICT (id) DO NOTHING;
```

All existing blocks → `payment_state = 'paid'` (abandoned altitude-0 rows
were already public; flipping them to `pending` would 404 live record pages).

2b. **One Participation per Block** for that block’s `season_id`:

```sql
INSERT INTO participations (
  id, listing_id, season_id, altitude_mm, views_served, peak_rank,
  first_credited_at, created_at
)
SELECT
  gen_random_uuid()::text,       -- or cuid in app backfill
  b.id,
  b.season_id,
  ROUND(b.altitude * 1000)::int,
  b.views_served,
  b.peak_rank,
  COALESCE(
    (SELECT MIN(p.created_at) FROM payments p WHERE p.block_id = b.id),
    b.created_at
  ),
  b.created_at
FROM blocks b
ON CONFLICT (listing_id, season_id) DO NOTHING;
```

That is the load-bearing split: **one Block row → one Listing + one
Participation** for `blocks.season_id`. Historical altitude does **not**
copy onto any other season. After a later rollover, the new live set is
empty until a new credit (ADR-A).

2c. **Seasons, users, saved URLs, climbs, payments, dead letters:**

```sql
UPDATE season_state SET
  stack_slug = category,         -- including 'tech'; never COALESCE to a seed slug
  views_count = ROUND(views_k * 1000)::int
WHERE stack_slug IS NULL;

UPDATE users SET created_at = "createdAt" WHERE created_at IS NULL;
UPDATE saved_urls SET user_id = "userId" WHERE user_id IS NULL;

UPDATE climb_records SET
  user_id = "userId",
  peak_y_mm = ROUND(peak_y * 1000)::int,
  finishes = wins,
  peak_achieved_at = updated_at
WHERE user_id IS NULL;

UPDATE climb_runs SET
  user_id = "userId",            -- NULLs remain for anonymous leftovers
  peak_y_mm = ROUND(peak_y * 1000)::int,
  input_log = replay_token
WHERE peak_y_mm IS NULL;

DELETE FROM climb_runs WHERE "userId" IS NULL;  -- spec: anonymous not persisted

UPDATE payments SET
  listing_id = block_id,
  metres_added_mm = ROUND(metres_added * 1000)::int,
  views_count_at_settlement = 0  -- historical V unknown; do not invent
WHERE listing_id IS NULL;

UPDATE payments pay SET participation_id = part.id
FROM blocks b
JOIN participations part
  ON part.listing_id = b.id AND part.season_id = b.season_id
WHERE pay.block_id = b.id AND pay.participation_id IS NULL;
```

Dead-letter UNIQUE (AC-20): one row per `stripe_session_id`. Keep the latest
`created_at` (tie: max `id`); delete extras; then unique index. Set
`status = 'open'`, `last_seen_at = created_at`.

2d. **Partial unique on `stack_slug`** (new **temporary** name while the old
index still owns `season_one_active_per_category`):

```sql
CREATE UNIQUE INDEX season_one_active_per_stack_slug
  ON season_state (stack_slug) WHERE (is_active = true);
-- Old season_one_active_per_category on (category) stays until phase 6.
```

2e. `CREATE UNIQUE INDEX climb_records_user_id_key` after the duplicate assert.  
2f. `SET NOT NULL` on twins that are fully populated (`views_count`,
`metres_added_mm`, `listing_id`, `participation_id`, climb `user_id` after
anonymous delete, `stack_slug` on seasons if no NULL categories, etc.).

**Phase 3 — Dual-write window**  
Deploy app that **writes both** shapes (blocks + listings/participations;
`views_k` float **and** `views_count` int; `block_id` **and** `listing_id`;
`replay_token` **and** `input_log`). Reads still old. Stripe metadata:
`listing_id` plus `block_id` copy (same value). Checkout may insert
`payment_state='pending'` listings **without** a block, or write both —
prefer both until phase 4 so old T1 does not see pending (old T1 has no
`payment_state`; **do not** insert pending rows into `blocks`).

**Phase 4 — Dual-read switch**  
APIs read `listings`/`participations`/`views_count`/`peak_y_mm`/`input_log`.
Old columns unread but still written. T1 uses §8 sketches. Stop
`getOrCreateActiveSeason` on public GET.

**Phase 5 — Stop writing the old shape** (separate deploy from phase 6)  
Writers: listings/participations only; integer increments only; allow-list
`stack_slug`; deactivate leftover active non-allow-listed seasons (bound
IN list from code seed). Insert payment **before** increment. Unique
dead-letter upsert. `ClimbRun.user_id` always set. Ignore client `peakY` /
`categorySlug` / `owner_email`.  
**Still do not drop** `clicks`, `spend_c`, `category_slug`, `blocks`,
`emailVerified`.

**Phase 6 — Contract drop** (**new deploy**, after phase 5 is live everywhere)

Only now:

- Drop table `blocks` (and `blocks_rank_idx`, `blocks_category_altitude_idx`,
  `blocks_user_id_idx`, `blocks_altitude_nonneg`).
- Drop `clicks`, `spend_c` (they live on `blocks` — gone with the table).
- Drop `season_state.category` + default, `views_k`, `season_views_k_nonneg`;
  drop old `season_one_active_per_category` on `category`;
  `ALTER INDEX season_one_active_per_stack_slug RENAME TO season_one_active_per_category`.
- Drop `users.emailVerified`, `users.createdAt`.
- Drop `saved_urls.userId` (and old unique/index names); keep `user_id`.
- Drop `climb_records.category_slug`, `userId`, `peak_y`, `wins`,
  `climb_record_user_category`, `climb_record_leaderboard_idx`.
- Drop `climb_runs.category_slug`, `userId`, `peak_y`, `replay_token`,
  `climb_run_category_idx`; change user FK SET NULL → CASCADE if not already.
- Drop `payments.block_id`, `metres_added`.
- Drop non-unique `payment_dead_letters_stripe_session_id_idx` if the unique
  remains.

**Never** combine phase 6 with phase 4/5.

### 5.6 Dual-write matrix

| Write | Phase 3 | Phase 5 |
|-------|---------|---------|
| New listing checkout | `listings` pending; **no** `blocks` row | same |
| Webhook credit | payment `block_id`+`listing_id`; participation increment; optionally update `blocks.altitude` | listing/participation/payment only |
| View credit | `views_k += 0.001` **and** `views_count += 1`; `views_served` on block **and** participation | integers + participation only |
| Climb persist | both `peak_y` and `peak_y_mm`; both `replay_token` and `input_log` | mm + `input_log` only |
| Hide / refund | `blocks.hidden_at` and `listings.hidden_at`; `refunded_at` on payments (new col) | listings + payments |
| Rollover | deactivate via `category` **and** `stack_slug` | `stack_slug` only |

### 5.7 What must not happen

- `prisma db push`.
- `ALTER … RENAME COLUMN` while the app still selects the old name.
- Drop `clicks` / `spend_c` / `category_slug` / `blocks` while any reader
  (including a lagged Vercel instance) still queries them.
- `COALESCE(category, 'tech')` or mapping leftover `'tech'` onto a real stack.
- `SET` / `decrement` of `altitude_mm`.
- Creating a Category table to make AC-57 easier.

---

## 6. Retention SQL (AC-47–AC-50 + pending purge)

Parameterized only (`$1` / Prisma `Prisma.sql`). No string interpolation of
identifiers or user input.

### 6.1 NULL `input_log` (AC-50)

Predicate: blob present; **not** the PB run; **not** in the user’s newest 30
runs; **older than 90 days**. Metadata (`peak_y_mm`, `seed`, `finished`,
`created_at`) remains. PB blob is never nulled solely due to age (AC-48).

```sql
UPDATE climb_runs AS cr
SET input_log = NULL
WHERE cr.input_log IS NOT NULL
  AND cr.created_at < (now() - interval '90 days')
  AND NOT EXISTS (
    SELECT 1
    FROM climb_records rec
    WHERE rec.pb_run_id = cr.id
  )
  AND cr.id NOT IN (
    SELECT ranked.id
    FROM (
      SELECT
        r.id,
        ROW_NUMBER() OVER (
          PARTITION BY r.user_id
          ORDER BY r.created_at DESC
        ) AS rn
      FROM climb_runs r
    ) AS ranked
    WHERE ranked.rn <= 30
  );
```

Dashboard T17 still `take 30` newest; a PB older than 30 remains addressable
via `pb_run_id` (T20). Share URL `/play?r=` is client-only (no SoR).

### 6.2 Pending listing purge (7 days, zero payments)

Exception to “listings never deleted.” RESTRICT on `payments.listing_id`
makes this a no-op if a payment exists.

```sql
DELETE FROM listings
WHERE payment_state = 'pending'
  AND created_at < (now() - interval '7 days')
  AND NOT EXISTS (
    SELECT 1 FROM payments p WHERE p.listing_id = listings.id
  );
```

Do not purge `paid` rows. Do not purge pending rows that have a payment
(webhook race / abandoned-then-paid).

### 6.3 Dead letters (floors)

```sql
-- Replayed: may delete after ≥ 90 days.
DELETE FROM payment_dead_letters
WHERE status = 'replayed'
  AND replayed_at IS NOT NULL
  AND replayed_at < (now() - interval '90 days');

-- Open: keep ≥ 2 years. This generation prefers not to delete open rows at all.
-- If a later compliance job purges:
-- DELETE FROM payment_dead_letters
-- WHERE status = 'open' AND created_at < (now() - interval '2 years');
```

Inactive seasons, hidden listings, payments (including refunded): **no delete**.

---

## 7. Seed (idempotent; no Category table)

Rewrite `app/prisma/seed.ts` in the implementer stage. This section is the
contract. **Do not** insert into a `Category` / `categories` table. **Do not**
seed `stack_slug = 'tech'`. **Do not** set `clicks` or `spend_c`. **Do not**
call `getOrCreateActiveSeason` for 74 stacks on startup.

Idempotency keys: `listings.slug`; `(season_state.stack_slug) WHERE is_active`
(partial unique); `(participations.listing_id, season_id)`; `users.email`.

Use **one** allow-listed slug from the code seed (e.g. `developer-tools`) for
paid scenarios. Seasons: explicit `stack_slug`, `views_count`, `is_active`,
`starts_at`/`ends_at` (`ends_at > starts_at`). Listings: explicit
`payment_state`. Metres: integer millimetres.

| State | What to insert | T1 for that stack | Why |
|-------|----------------|-------------------|-----|
| **empty** | Zero listings, zero participations, zero payments, zero climb rows. Optional: zero seasons (T1 → `season: null`, empty list, not 500). | `listings: []` | AC-57 empty; no ghost `tech` season |
| **extreme: 100 live** | One active season; 100 `paid`, `hidden_at IS NULL` listings; 100 participations on that season; distinct `altitude_mm` (e.g. `(100-i)*1000`) and increasing `first_credited_at` for stable ORDER BY; `views_count` such that some/none are buried as desired. | 100 rows, ranks 1–100 | Hot-path cap; index + `take 100` |
| **0 live** | Active season exists; **no** current-season participations (or only hidden / other-season). May include frozen participations on an inactive season (T11). | `[]` | Rollover empty live set |
| **buried-only** | ≥1 paid unhidden current participation, all with `altitude_mm < ground_mm` at that season’s `views_count` (`ground_mm = round(computeGround(V)*1000)`). They **are** in the cap-100 list (AC-2). | N buried rows still listed | Burial is derived, not a filter |
| **pending-only** | `payment_state='pending'` listings, **zero** participations, zero or non-credited payments. | `[]`; `/b/{slug}` 404 | AC-13/14 |

Also seed, idempotent:

- One user (Firebase-shaped id + email) owning a subset of the 100, for T3.
- One climb user with 31 runs (30 recent + 1 older PB) to exercise T17 vs T20
  vs retention SQL.
- Empty climb board vs one-row board.
- A leftover `stack_slug='tech'` **inactive** season **without** live
  participations (read-path fixture only; no new money).

Payments for live listings: at least one row per live listing so net spend
SUM works; `metres_added_mm` consistent with participation altitude for the
**current** season (historical extra payments optional).

---

## 8. Query sketches (not application code)

Bound parameters only. Every `findMany` has `take`. `select` only listed
columns. No `getOrCreate` on these paths.

### T1 — live tower (`GET /api/tower/[stack]`)

```
-- 1. Active season (null → empty list, no INSERT)
SELECT id, stack_slug, views_count, starts_at, ends_at, is_active
FROM season_state
WHERE stack_slug = $stack AND is_active = true
LIMIT 1;
-- uses season_one_active_per_category + seasons_stack_idx

-- 2. Cap-100 live set
-- Prisma:
-- prisma.participation.findMany({
--   where: {
--     season_id: $seasonId,
--     listing: { payment_state: 'paid', hidden_at: null },
--   },
--   orderBy: [
--     { altitude_mm: 'desc' },
--     { first_credited_at: 'asc' },
--   ],
--   take: 100,
--   select: {
--     altitude_mm: true,
--     first_credited_at: true,
--     peak_rank: true,
--     views_served: true,
--     listing: {
--       select: { id, slug, url, display_name, hidden_at, stack_slug },
--     },
--   },
-- })

SELECT p.altitude_mm, p.first_credited_at, p.peak_rank, p.views_served,
       l.id, l.slug, l.url, l.display_name
FROM participations p
JOIN listings l ON l.id = p.listing_id
WHERE p.season_id = $seasonId
  AND l.payment_state = 'paid'
  AND l.hidden_at IS NULL
ORDER BY p.altitude_mm DESC, p.first_credited_at ASC
LIMIT 100;
-- index: participations_season_altitude_idx
-- Rank = 1-based position in this result. spend_c absent from ORDER BY.
```

At 10k live rows, `EXPLAIN ANALYZE` should show an index scan on
`participations_season_altitude_idx` with `LIMIT 100`, not a seq scan of
`listings`.

### T3 — dashboard rank via COUNT (not `findMany` 500)

```
-- Owned listings
-- prisma.listing.findMany({
--   where: { user_id: $uid },
--   orderBy: { created_at: 'desc' },
--   take: 100,
--   select: { id, slug, url, display_name, payment_state, hidden_at,
--             stack_slug, owner_email, created_at },
-- })

-- Rank for listing L with participation (alt, t0) in active season S:
-- prisma.participation.count({
--   where: {
--     season_id: S,
--     listing: { payment_state: 'paid', hidden_at: null },
--     OR: [
--       { altitude_mm: { gt: $alt } },
--       { AND: [
--           { altitude_mm: $alt },
--           { first_credited_at: { lt: $t0 } },
--         ] },
--     ],
--   },
-- })
-- rank = count === 0 && in live set ? 1 : 1 + count; else null (AC-12)

SELECT 1 + COUNT(*)::int AS rank
FROM participations p
JOIN listings l ON l.id = p.listing_id
WHERE p.season_id = $seasonId
  AND l.payment_state = 'paid'
  AND l.hidden_at IS NULL
  AND (
    p.altitude_mm > $alt
    OR (p.altitude_mm = $alt AND p.first_credited_at < $t0)
  );
-- index: participations_season_altitude_idx
-- FORBIDDEN: findMany take 500 then findIndex.

-- Next-better competitor: findFirst take 1, same predicates, opposite inequality.
-- Payments for owned ids:
-- prisma.payment.findMany({
--   where: { listing_id: { in: $ids } },
--   orderBy: { created_at: 'desc' },
--   take: 5000,
--   select: { listing_id, amount_cents, metres_added_mm, refunded_at, created_at },
-- })
-- Net spend = SUM(amount_cents) WHERE refunded_at IS NULL (same as T2).
```

### T10 — set-based view credit (no per-row loop)

```
-- After Redis gates (dedup:{stack}:…, ip_cap:{stack}:…, global_ceil).
-- Prisma.$executeRaw / $queryRaw with bound params — never interpolate slugs.

UPDATE season_state
SET views_count = views_count + 1
WHERE is_active = true
  AND stack_slug = $stack
RETURNING id, views_count;
-- 0 rows → skip, no INSERT.

UPDATE participations AS p
SET views_served = p.views_served + 1
FROM listings AS l
WHERE p.listing_id = l.id
  AND p.season_id = $seasonId
  AND l.payment_state = 'paid'
  AND l.hidden_at IS NULL
  AND p.altitude_mm >= $ground_mm;
-- ground_mm = round(computeGround(views_count/1000) * 1000)
-- Buried/hidden skipped. Season increment still happens if all buried (AC-36).
```

Do not `getRankedBlocks()` then await per-id updates. At 10k above-ground
rows this is one wide UPDATE; if p95 > 300 ms, keep set-based (do not
restrict to top 100 — that violates AC-36).

### T15 — free board

```
-- prisma.climbRecord.findMany({
--   orderBy: [
--     { peak_y_mm: 'desc' },
--     { peak_achieved_at: 'asc' },
--   ],
--   take: 50,
--   select: {
--     peak_y_mm: true,
--     peak_achieved_at: true,
--     finishes: true,
--     user: { select: { display_name: true } },
--   },
-- })
-- Do not filter category_slug. Handle ≠ email (AC-45).

SELECT cr.peak_y_mm, cr.peak_achieved_at, cr.finishes, u.display_name
FROM climb_records cr
JOIN users u ON u.id = cr.user_id
ORDER BY cr.peak_y_mm DESC, cr.peak_achieved_at ASC
LIMIT 50;
-- index: climb_records_board_idx
```

### T17 — dashboard replays (AC-47)

```
-- prisma.climbRun.findMany({
--   where: { user_id: $uid },
--   orderBy: { created_at: 'desc' },
--   take: 30,
--   select: {
--     id, peak_y_mm, finished, finished_tick, ticks, seed, input_log, created_at,
--   },
-- })

SELECT id, peak_y_mm, finished, seed, input_log, created_at
FROM climb_runs
WHERE user_id = $uid
ORDER BY created_at DESC
LIMIT 30;
-- index: climb_runs_user_created_idx
```

---

## 9. Ops note — ban `prisma db push`

Partial uniques in §2.2 **will be dropped** by `prisma db push` because they
are invisible to the Prisma schema. Live `blocks_rank_idx` already
demonstrated this.

| Allowed | Forbidden |
|---------|-----------|
| `pnpm exec prisma migrate dev` (dev, `DIRECT_URL`) | `prisma db push` |
| `pnpm exec prisma migrate deploy` (CI/Vercel) | `prisma db push --accept-data-loss` |
| `prisma migrate diff` / `validate` | Documenting push as a “quick fix” for branch DBs |

If a cloud branch database is push-damaged: `migrate deploy` from the
durable SQL (or restore). The `pg_indexes` test is the gate.

No Blob columns until retained `pg_column_size(input_log)` exceeds **50 GiB**
(architecture trigger). `input_log TEXT` max 32 768 characters ≈ 32 KiB
ASCII per row; TOAST stores oversized values out-of-line. Worst-case
retained 31 blobs/user × 32 KiB × 10⁵ users ≈ 100 GiB **if retention is
ignored**; AC-50 exists so that does not happen.

String-interpolated SQL is forbidden in product paths (`$queryRaw` /
`$executeRaw` with `Prisma.sql` templates and bound values only).

---

## Appendix A — breakingChanges

Copied to the data handoff. These fire when implementer applies the target
(not in this spec-only stage).

1. `blocks` splits into `listings` + `participations`; `blocks.season_id` is
   no longer “current membership.”
2. `clicks` removed from SoR and product.
3. `spend_c` removed; net spend is `SUM(payments.amount_cents) WHERE refunded_at IS NULL`.
4. No `@default("tech")` / no DB default on `stack_slug`; leftover `'tech'` is
   not rewritten to a seed slug.
5. `ClimbRecord` unique collapses from `(userId, category_slug)` to `user_id`;
   `category_slug` dropped after readers stop.
6. `wins` → `finishes` (count of persisted `finished=true`, not first place).
7. Float `altitude` / `views_k` / `peak_y` / `metres_added` → integer
   `altitude_mm` / `views_count` / `peak_y_mm` / `metres_added_mm`. API still
   speaks metres / `views_k` at the boundary.
8. `ClimbRun.userId` nullable + `ON DELETE SET NULL` → `user_id NOT NULL` +
   `CASCADE`; leftover anonymous runs deleted.
9. `replay_token` → `input_log` with length CHECK.
10. `User.emailVerified` dropped (not SoR).
11. camelCase `userId` / `createdAt` → `user_id` / `created_at` via
    expand-contract, not in-place rename in the reader deploy.
12. `payment_dead_letters.stripe_session_id` becomes UNIQUE (dedup first).
13. `payments.block_id` → `listing_id` (same ids during backfill).
14. New `payment_state`; existing blocks backfill `paid`.
15. New `admin_audits` (privileged writes are rows, not logs).
16. `pb_run_id` + `peak_achieved_at` on climb records.
17. Prisma `db push` is an operational break: it drops partial uniques.

## Appendix B — cost / security pings (also in handoff learnings)

**cost:** `input_log` is `TEXT` ≤ 32 768 chars; TOAST out-of-line above ~2 KiB;
heap without blob is narrow. 24 secondary indexes (§2.5). T10 is a wide
`UPDATE` of above-ground participations (row width of `participations` is
small: ints + timestamps + two FKs), not a Blob problem. 50 GiB retained
`input_log` is the Blob-hybrid trigger — do not add the column now.

**security-reviewer:** After account delete, remaining PII is
`listings.owner_email`, `listings.url`, `listings.display_name`, and the
entire `payments` row (amount, Stripe session id). `users.email` /
`display_name` / climb handle / saved URLs / replay logs are gone.
`admin_audits.actor` is `"admin"`, not a user email.
