# Persistence cost envelope — The Climb / paid stacks

**Status:** spec-only. No infra change, no application code, no storage-class change.  
**Spec NFRs:** `loop/spec.md` (scale envelope, retention, latency).  
**Architecture:** `loop/architecture.md` §4 (placement), §11 (failures), §15 (10×).  
**Stack:** Neon Postgres (pooled `DATABASE_URL`) + Upstash Redis + Vercel Fluid Compute + Stripe + Firebase Auth. **No Vercel Blob this generation (ADR-B).**  
**Prices:** public list rates as of **2026-08-31** (iad1 / US for Fluid). Bills move; re-price from vendor dashboards before a launch, not from this file’s monthly roll-ups.

Unit economics first. A monthly round number is a consequence, not a plan.

---

## 0. Verdict (for architect / data)

**Replay logs stay `climb_runs.input_log TEXT` this generation.** TEXT-on-row is cheap at expected retention. The 50 GiB retained-blob trigger is an **operational** reopen (table bloat, restore time, autovacuum), not a storage-class mandate: 50 GiB of Neon logical storage is **$17.50/month** at $0.35/GiB. Fluid Active CPU for climb re-sim is the line that can hit hundreds to thousands of dollars; Neon GiB is not.

**Right-size:** stay on **Neon Launch** (not Free) + **Upstash Fixed 1 GB** (not Free, not PAYG at the view ceiling) + **Vercel Pro** (not Hobby). Add Blob only after `sum(pg_column_size(input_log))` exceeds **50 GiB** (or retention is proven broken). Do **not** delete dead-letter, unique `stripe_session_id`, or re-sim to save money.

---

## 1. List rates (the meters)

| Service | Meter that spikes the bill | Included / free (host already uses) | On-demand (this product) |
|---------|----------------------------|-----------------------------------|---------------------------|
| **Neon** storage | Logical GB-month (root branch) | Free: **0.5 GB**/project | **$0.35 / GB-month** Launch & Scale |
| **Neon** instant restore | History GB-month | Free: 6 h / 1 GB cap | **$0.20 / GB-month** (Launch ≤7 d, Scale ≤30 d) |
| **Neon** compute | CU-hour (`size × hours awake`); 1 CU ≈ 4 GB RAM | Free: **100 CU-hours**/project | Launch **$0.106 / CU-hour**; Scale **$0.222 / CU-hour** |
| **Neon** egress | Public network GB | Free 5 GB; Launch/Scale **500 GB**/project | **$0.10 / GB** after included |
| **Upstash Redis** commands | Commands (SET/INCR/EXPIRE each count) | Free: **500 000 / month** | PAYG **$0.20 / 100k**; Fixed plans: unlimited cmds |
| **Upstash Redis** storage | Daily-average GB of TTL keys | Free **256 MB**; PAYG first **1 GB** free then **$0.25 / GB** | Fixed: cap is the plan size ($10 / 250 MB … $20 / 1 GB …) |
| **Vercel Fluid** Active CPU | CPU-hours while code runs (I/O does **not** count) | Hobby: **4 hours** | iad1/pdx1/cle1 **$0.128 / CPU-hour** |
| **Vercel Fluid** Provisioned Memory | GB-hours instance is alive (includes I/O wait) | Hobby: **360 GB-hrs** | iad1 **$0.0106 / GB-hour** |
| **Vercel** invocations | Each POST/GET to a function | Hobby: **1M** | Pro **$0.60 / million** |
| **Vercel** Pro seat | Seats | Hobby $0 (non-commercial) | **$20 / seat-month** (usage credit may offset meters) |
| **Stripe** | Successful captured charge | — | US cards **2.9% + $0.30** (unchanged) |
| **Stripe** refund | Original processing fee | — | **Fee is not returned** on standard pricing |
| **Vercel Blob** (not now) | Stored GB + ops + transfer | Hobby 1 GB / 10k simple / 2k advanced | **$0.023 / GB-month**; simple **$0.40 / 1M**; advanced **$5 / 1M**; transfer from **$0.05 / GB** (iad1) |

**Hobby / Free do not fit the spec envelope** (10⁵ users, 10⁵ climb persists/day, 4×10⁴ qualified views/hour). They are fine for local/preview projects.

---

## 2. Each service — model, spike metric, unit price

### 2.1 Neon Postgres (SoR, pooled serverless)

**Model:** storage GB-month + CU-hours while the compute is not scaled to zero + optional restore history. Runtime uses the **pooled** URL; migrate uses `DIRECT_URL`. Spike metrics: **retained `input_log` bytes**, **dead tuples from T10 wide UPDATE**, **always-on CU** (if scale-to-zero is disabled for latency).

**Does Free fit?** No. 0.5 GB is smaller than climb-run **metadata** at envelope (~2–6 GiB including indexes, §3.2). 100 CU-hours is ~400 h of 0.25 CU — one always-on 0.25 CU month is already 180 CU-hours.

**Compute (latency, not storage class):** T1 miss p95 ≤500 ms and view-credit p95 ≤300 ms cannot absorb a scale-to-zero cold start. **Prod: Launch, scale-to-zero off**, floor **0.5–1 CU**, autoscale cap **4 CU** until T10 at 10k live rows proves otherwise.

| Always-on size | CU-hours / 730 h month | Launch $ | Scale $ |
|----------------|------------------------|----------|---------|
| 0.5 CU | 365 | **$39** | $81 |
| 1 CU | 730 | **$77** | $162 |
| 2 CU | 1 460 | $155 | $324 |
| 4 CU (T10 10× headroom) | 2 920 | $309 | $648 |

Storage at $0.35/GiB is **not** the envelope’s dominant Neon line until retention fails for months (§6).

**Spike to watch:** `pg_column_size(input_log)` sum; WAL/autovacuum on `participations` (T10); extra branches ($1.50/branch-month); 30-day Scale restore history ($0.20/GB).

### 2.2 Upstash Redis (ephemeral only)

**Model:** commands × $0.20/100k (PAYG) **or** a Fixed plan with unlimited commands; storage of **TTL keys** (dedup, ip_cap, global_ceil, rl). Flush is accepted (spec R6); SoR must not live here.

**Commands per qualified view (architecture §4.4 / §12): `SETNX` + 2× `INCR` = 3.**

Live pipeline (and the persistence architecture) for a view that becomes qualified:

1. `INCR ip_cap:{stack}:{ip}:{hour}` (architecture partitions by stack; live code is missing the stack — cost is still one INCR).
2. `SET dedup:{stack}:{tid}:{bucket} NX EX 2100` (one command; this **is** SETNX).
3. `INCR global_ceil:{hour}`.

Plus **0–2 `EXPIRE`** on first increment of the hour windows (not every view). Rate-limit `rl:*` is a separate INCR on climb/checkout, not on the view path.

| Path | Redis commands |
|------|----------------|
| Bot / no Redis | 0 |
| IP cap exceeded | 1 (`INCR`) |
| Session duplicate | 2 (`INCR` + `SETNX`) |
| **Qualified (credited or ceiling-hit after SETNX)** | **3** (`SETNX` + 2× `INCR`) |
| First view of an hour | +1–2 `EXPIRE` |

**Ceiling math (AC-37):** 40 000 qualified/hour × 24 × 30 = **28.8 M qualified views/month**.

| | Commands/month | PAYG $ | vs Fixed |
|--|----------------|--------|----------|
| Qualified path only (3 cmd) | 86.4 M | **$173** | Fixed 1 GB = **$20** (breakeven vs PAYG is 10 M cmds ≈ $20) |
| + equal number of dup/cap attempts | ~120 M | ~$240 | still $20 |
| Free 500k cmds | **exhausted in ~4 hours** at 40k/h × 3 | — | not usable |

**Storage of TTL keys (typical):** tens of MB. Dedup TTL 35 min; ip_cap 70 min; global_ceil 1–2 keys; `rl:climb:*` 60 s. At the **view ceiling**, live key count is bounded by unique sessions/IPs in those windows, **not** by 10⁵ users directly — the 40k/h lid caps *credits*. Cardinality risk is **partitioned keys × browsers**, see §7.

**Right-size:** **Fixed 1 GB ($20/month)** at envelope. Free does not fit. PAYG is the expensive choice once qualified views approach the ceiling. Do not persist dedup to “save commands.”

### 2.3 Vercel Fluid Compute (especially `POST /api/climb/result`)

**Model:** Active CPU (re-sim is CPU-bound) + provisioned memory for wall clock + invocations. Firebase verify and Neon I/O **pause** Active CPU; `simulateFromInputs` **does not**.

**SLA:** re-sim ≤18 000 ticks; **p95 ≤ 2 s; fail closed** (do not skip re-sim, do not async the trust boundary). Platform `maxDuration` must be **> 2 s** so the fail-closed path runs; that is a route setting, not a new host.

**Hobby:** 4 Active CPU hours/month. At 0.25 s CPU × 10⁵ persists/day = **6.9 CPU-hours on day one**. Hobby is not a fit. Paid stacks are commercial → **Pro**.

**Assume iad1, 1 vCPU, 2 GB instance** (Vercel’s own 1 vCPU / 2 GB comparison shape). Per persist:

| Active CPU | Active CPU $ | Memory $ at wall ≈ CPU+0.1 s (2 GB) | Invocation | **All-in** |
|------------|--------------|----------------------------------------|------------|------------|
| 50 ms (short run) | $0.0000018 | $0.0000004 | $0.0000006 | **~$0.000003** |
| **250 ms (design typical)** | **$0.0000089** | $0.0000021 | $0.0000006 | **~$0.000012** |
| 1.0 s | $0.0000356 | $0.0000065 | $0.0000006 | **~$0.000043** |
| **2.0 s (SLA cap, fail closed)** | **$0.0000711** | $0.0000124 | $0.0000006 | **~$0.000084** |

Formula: Active CPU $ = `(seconds / 3600) × $0.128`. Memory $ = `(2 GB × wall_s / 3600) × $0.0106`. Invocation $ = `$0.60 / 1e6`.

**Anonymous POST** must **not** re-sim (architecture: `{ saved: false, code: NOT_SAVED_ANON }` with zero SoR writes). Invocations still count; CPU should be milliseconds. Signed-in persist is the CPU centre.

**10⁵ and 10⁶ persists/day** — see §4.

**Other Fluid drivers (smaller than re-sim at envelope):** T1 origin after 3 s CDN, dashboard COUNT queries, webhook (I/O), view credit (Redis + 2 SQL). Chatty `findMany` without `take` and per-row loops are the accidental CPU/DB multipliers — architecture already forbids them.

**Log volume:** today’s view pipeline `console.log`s raw / qualified / credited JSON. At the 40k/h ceiling that is **>1k lines/min** on one path, not stored in Postgres (good; T29 is Future). Vercel log drains / Observability can still spike. Sample or drop per-view stdout at envelope; **AdminAudit stays a table**.

### 2.4 Stripe (unchanged)

**Model:** 2.9% + $0.30 per successful US card charge. Spec envelope: **10³ payments/day**, 10⁶ lifetime. `MIN_ENTRY_USD` is $5.00.

| Ticket | Stripe fee | Effective % | Net to us |
|--------|------------|-------------|-----------|
| $5 (min entry) | **$0.445** | 8.9% | $4.555 |
| $10 | $0.59 | 5.9% | $9.41 |
| $25 | $1.03 | 4.1% | $23.97 |

**Refunds (admin-only, AC-26/28):** customer copy stays no-refunds. On refund Stripe **does not return** the original processing fee; we return `amount_cents`; **altitude does not decrease**; listing is hidden. Cost of one exceptional $25 refund ≈ **$25 + the $1.03 already paid**, not a reason to drop the refund path, the dead-letter, or unique session idempotency.

**Do not** create a Payment row on `payment_status=unpaid` (no fee yet; AC-19). Unique `stripe_session_id` prevents double credit (double metres **and** a support mess). Dead-letter + 2xx prevents losing a **captured** charge to a 4xx (that is money, not a row we can “optimize away”).

Webhook p95 ≤ 1 s excluding Stripe RTT — Fluid I/O, tiny vs climb CPU.

### 2.5 Vercel Blob (comparison only — **not this generation**)

**Not in the stack (ADR-B).** Quoted so the 50 GiB trigger is a number, not a vibe.

| | Neon TEXT on row | Blob hybrid (non-PB → object, PB stays on row) |
|--|------------------|--------------------------------------------------|
| Storage | **$0.35 / GiB-month** | **$0.023 / GiB-month** |
| Persist | INSERT in the same txn as the run; log already in POST body | Extra **PUT** (advanced op $5/1M) + two-phase failure (orphan blobs) |
| Dashboard T17 | One `findMany take 30` | **30 GETs** (simple ops + transfer) **or** N+1 on Fluid |
| Re-sim (T19) | Uses request body; **0 extra RTT** inside the 2 s budget | PUT **competes** with re-sim CPU; does not help re-sim |
| Eviction | `UPDATE … SET input_log=NULL` | Lifecycle rules + pointer in SoR |
| 50 GiB storage $ | **$17.50/mo** | **$1.15/mo** storage **before** ops |

Blob **wins $/GB stored** and **loses** persist reliability, dashboard RTT, and IAM until retained bytes (or restore time) justify it. **Do not add `input_log_url` until the trigger.**

### 2.6 Firebase Auth (identity, not SoR)

Profile stack: Firebase Auth, middleware presence-only. Not a persistence store. Spike metric: **MAU**. Spark-class quotas do not cover 10⁵ users; keep Blaze as today. No change from this architecture. Account deletion still cascades climb rows (AC-53); that **saves** climb TEXT, not listing/payment rows.

---

## 3. Drivers from this architecture

### 3.1 `input_log` TEXT width

Replay token is deflate+base64url, **`CHECK char_length(input_log) ≤ 32768`**. One byte packed per tick uncompressed (`runReplay.ts`); 18 000 ticks ≈ 18 KiB uncompressed, typically well under the 32 KiB cap after deflate. **Billable width is `pg_column_size(input_log)`** (TOAST + header), not `char_length`.

| | Bytes | Neon $ / month @ $0.35/GiB |
|--|-------|------------------------------|
| 1 retained log at cap | 32 768 | **$0.000011** |
| 1 typical log (8 KiB assumed mean) | 8 192 | **$0.0000027** |
| 1 user worst-case 31×32 KiB | 1 015 808 (0.969 MiB) | **$0.00033** |
| 1 user typical 1×PB 16 KiB + 12×8 KiB | ~112 KiB | **$0.000037** |

**31×32 KiB worst-case/user before expiry:** spec NFR. 10⁵ users × 0.969 MiB = **~95 GiB** (spec’s “~100 GiB / ~1 MiB/user” rounding). That is the **ignored-retention / everyone-at-cap** ceiling, **not** the expected bill.

### 3.2 Typical after 30 + PB + 90 d (AC-47–50)

Retention job (architecture §8.12): `NULL` non-PB `input_log` older than 90 d and outside newest 30 per user; **metadata remains**.

| Scenario | Retained TEXT | Neon storage $ | Notes |
|----------|---------------|-----------------|-------|
| Healthy, ~50k climbers with PB+~12 recent, 8 KiB mean | **~6 GiB** | **~$2** | Expected |
| Envelope 10⁵ users, same mean, 15 live logs + PB | **~11 GiB** | **~$4** | Conservative |
| All 10⁵ users at 31×32 KiB | **~95 GiB** | **~$33** | Cap, not typical |
| **Architect trigger** | **50 GiB** | **$17.50** | Reopen Blob hybrid |
| Metadata only (`input_log` NULL), 10⁷ run rows | **~2–6 GiB** + indexes | **~$1–2** | Unbounded row count, small $ |

Plus non-blob SoR (listings 10⁵, participations 10⁶, payments 10⁶, users, audits): **< 1 GiB** data + indexes. **Climb-run metadata + TEXT dominate Postgres bytes; TEXT dominates that only when retention is skipped.**

Instant restore on Launch (7 d) adds **~$0.20 × logical GB**. At 15 GiB that is **$3**, not a reason to drop PITR.

### 3.3 AdminAudit growth

Append-only table (not Vercel logs). Privileged writes are rare (hide / refund / rollover / dead-letter replay). 1 KiB JSONB × 10⁵ audits/year = 100 MiB/year. **$0.03/year** at $0.35/GiB. Index `created_at`. **Do not move audits to logs to save money** — logs are not replayable for AC-23/26/30/21.

### 3.4 Pending listings: cap 10 + 7 d purge

Architectural abuse cap (not an AC): max **10** `pending` per `user_id`; purge pending with **zero** payments and `created_at < now()-7d`.

| | Rows | Bytes (≈200 B/row) |
|--|------|---------------------|
| 10⁵ users × 10 pending (hard cap) | 10⁶ | **~200 MB** |
| After 7 d purge, steady | ≪ cap | negligible |

Without the cap, checkout is an authenticated insert of unique slugs — a Neon-row spam surface. **Cap 10 is the cost control.** Do not raise it to “be nice”; 409 `PENDING_LIMIT`.

### 3.5 T10 wide UPDATE at 10k live rows

Qualified view: 1 season `UPDATE views_count += 1` + **one set-based** `UPDATE participations … WHERE live AND altitude_mm >= ground_mm` (AC-36). **No per-row loop. Do not update only top 100** (that would violate AC-36 to save WAL).

| Live above-ground rows / stack | 40k views/h row-versions if one fat stack | Cost nature |
|--------------------------------|---------------------------------------------|--------------|
| 100 (near T1 page size) | 4 M / hour | Fine on 0.5–1 CU |
| **10k (10×, architecture §15)** | **400 M / hour** | WAL, autovacuum, CU; **p95 300 ms** is the cap |

This is a **Neon compute / I/O** spike, not a Blob problem. Mitigation already in the design: set-based SQL, watch p95, raise CU — **not** accuracy.

### 3.6 T1 `take 100` + 3 s CDN

T1 is product-capped at 100 rows. `s-maxage=3` per **stack slug** (not a global key). Origin rate ≈ 74 stacks / 3 s if every stack is continuously polled ≈ **25 origin reads/s** worst case with cache coalescing — cheap vs climb CPU. **Missing `take` or a global cache key is the cost bug**, not the 100-row page.

### 3.7 Dashboard COUNT, not `findMany` 500

Ledger: current dashboard `findMany` 500 then `findIndex` is already wrong at 1× (fake ranks + 500-row reads × owned listings). Architecture: **indexed COUNT** + `findFirst` competitor, listings `take 100`, payments `IN (...)`.

| | Rows touched for 20 live owned listings on a 10k-live stack |
|--|------|
| `findMany` 500 × 20 | **10 000** |
| COUNT + `findFirst` × 20 | **~40 index probes** |

This is a **latency and CU** driver, not a GB driver. Implementer must not ship the 500-row path.

---

## 4. Fluid CPU — 10⁵ and 10⁶ climb persists/day

Signed-in persists (spec envelope / 10×). Re-sim ≤18 000 ticks, fail closed at 2 s. **Typical** 250 ms Active CPU is an estimate (short runs; 18k ticks is the cap, not the mean). **p95 = 2 s** is the billed worst case the SLA allows. Measure `simulateFromInputs` on Fluid before treating typical as fact.

### 4.1 10⁵ persists/day (spec envelope)

30-day month → **3.0 M persists/month**.

| Active CPU mean | CPU-hours / month | Active CPU $ | Memory $ (2 GB, wall≈CPU+0.1 s) | Invocations $ | **Fluid persist $ / month** | **$ / persist** |
|-----------------|-------------------|--------------|----------------------------------|---------------|------------------------------|-----------------|
| 50 ms | 42 | $5 | $1.3 | $1.80 | **~$7** | $0.000003 |
| **250 ms** | **208** | **$27** | $6 | $1.80 | **~$35** | **$0.000012** |
| 1.0 s | 833 | $107 | $22 | $1.80 | **~$131** | $0.000043 |
| **2.0 s all** | **1 667** | **$213** | $37 | $1.80 | **~$252** | **$0.000084** |

Hobby included 4 CPU-hours ≈ **5.8×10⁴ persists at 250 ms** — about **14 hours** of envelope traffic.

### 4.2 10⁶ persists/day (architecture 10×)

30-day month → **30 M persists/month**. Invocations: 30 M × $0.60/M = **$18**.

| Active CPU mean | CPU-hours / month | Active CPU $ | Memory $ | **Fluid persist $ / month** |
|-----------------|-------------------|--------------|----------|------------------------------|
| 50 ms | 417 | $53 | $13 | **~$84** |
| **250 ms** | **2 083** | **$267** | $62 | **~$347** |
| 1.0 s | 8 333 | $1 067 | $216 | **~$1.3k** |
| **2.0 s all** | **16 667** | **$2 133** | $372 | **~$2.5k** |

**10× persist rate is a CPU bill, not a disk bill.** Horizontal Fluid instances are the mitigation (architecture §15). **Do not skip re-sim. Do not queue the trust boundary** to cheapen CPU (peak would not be server-derived on the request). Fail closed at 2 s; clients retry.

If p95 approaches 2 s at 10⁵/day, **fix tick CPU** (simulation already has a known O(floor²) geometry lesson in the ledger) before buying 10× Fluid. That is a gameplay/perf change, not a storage-class change.

Anonymous volume can be a **multiple** of signed-in persists; keep it off `simulateFromInputs`.

---

## 5. Redis commands per qualified view — worked

**Budget: 3 commands / qualified view** (`SETNX` + `INCR` ip_cap + `INCR` global_ceil).

| Unit | PAYG | On Fixed 1 GB |
|------|------|----------------|
| 1 qualified view | **$0.000006** | ~$0 (amortized $20 / 28.8 M ≈ **$0.0000007**) |
| 1e3 qualified | $0.006 | ~$0.0007 |
| 1 hour at ceiling (40k × 3) | 120k cmds = **$0.24** | $0 |
| 1 month at ceiling | 86.4 M cmds | **$173 PAYG vs $20 Fixed** |

**Alert if commands per credited view > 5** (pipeline regression: extra GET, per-row Redis, or `INCR`+`EXPIRE` every time). Architecture already says 3 Redis + 2 SQL after the gates.

Climb persist RL: 1 `INCR` per POST (60/60s/IP, fail-open). At 10⁵/day that is 3 M cmds/month (**$6 PAYG**, noise on Fixed). At 10⁶/day, 30 M (**$60 PAYG**, still inside Fixed).

---

## 6. Neon GiB: retained TEXT vs later Blob hybrid

**Trigger (architecture §4.1 / ADR-B):** if retained `pg_column_size(input_log)` **> 50 GiB** **or** Neon storage $ exceeds Blob+complexity, move **non-PB** logs to object storage; **keep PB `input_log` on the row**. Do not add the column until then.

### 6.1 Same 50 GiB retained

| | Neon TEXT (all 50 GiB on-row) | Blob for 50 GiB non-PB (PB still on Neon) |
|--|-------------------------------|-------------------------------------------|
| Storage | 50 × $0.35 = **$17.50** | 50 × $0.023 = **$1.15** |
| PITR 7 d (optional) | +50 × $0.20 = **$10** | Blob not in PITR; SoR pointers still are |
| Persist ops @ 10⁵/day | 0 extra | 3 M PUT/month × $5/1M = **$15** |
| Dashboard 10⁴ loads/day × 30 GET, 8 KiB | 0 extra | 9 M GET × $0.40/1M ≈ **$4** + ~72 GB × $0.05 ≈ **$4** transfer |
| **Steady $ (ignore CPU)** | **~$18–28** | **~$24 + Fluid RTT** |
| Re-sim | Unchanged | **Worse** (extra failure domain inside 2 s) |

**At 50 GiB, Blob does not win a clean cost comparison once PUTs, dashboard GETs, and the 2 s budget are counted.** The trigger is still correct as a **size** alarm (restore, `VACUUM`, `pg_dump`, TOAST bloat). **Cost does not force a storage-class change now.**

### 6.2 If retention job fails

Inserts keep TEXT forever. Envelope 10⁵ persists/day:

| Mean log | GiB / day | 90 d | 365 d | Neon $ at 365 d |
|----------|-----------|------|-------|------------------|
| 8 KiB typical | 0.76 | 69 | **278** | **$97** |
| 32 KiB cap | 3.05 | 275 | **1 114** | **$390** |
| 10× persist, 32 KiB | 30.5 | 2.7 TiB | **11 TiB** | **$3.9k** |

**Retention job health is the storage cost control.** Metadata rows remaining after `NULL` are ~200 B × 10⁷ = 2 GB at envelope — keep them (T17/T20/finishes). **Do not DELETE run rows to save TEXT.**

### 6.3 Per-user / per-GB recap

| Unit | Typical (retention on) | At 32 KiB × 31 | At 50 GiB fleet |
|------|-------------------------|----------------|-----------------|
| Per user / month Neon TEXT | **$0.00004** | $0.00033 | — |
| Per GiB-month Neon | **$0.35** | $0.35 | $0.35 |
| Per GiB-month Blob storage | — | — | $0.023 **+ ops** |
| Per persist Fluid (250 ms) | **$0.000012** | — | — |
| Per persist Fluid (2 s) | **$0.000084** | — | — |
| Per qualified view Redis (Fixed) | **~$7e-7** | — | — |

One 2 s persist costs about as much as **~250 typical users’** monthly TEXT. **CPU, not TEXT, is the climb bill.**

---

## 7. Risks (do not “fix” by deleting controls)

| ID | Risk | $ / reliability | What not to do | What to do |
|----|------|-----------------|----------------|------------|
| C1 | **Unbounded climb_runs metadata** after blob NULL | 10⁸ rows at 10× ≈ 20–40 GiB + indexes (~$7–14/mo) | DELETE runs / finishes to save rows | Alert row count; keep T20/T17 |
| C2 | **Redis key cardinality at 10× users** | `dedup` and `ip_cap` are **per stack**. 10⁶ users × 74 stacks in a 35 min window (pathological browse-all) ≈ **tens of millions of keys**, ~1–10 GB. View **credits** still lid at 40k/h, but SETNX still runs **before** the ceiling. | Drop per-stack partition (breaks burial/price). Persist keys. | TTL already required. Alert `dbsize` / key count. Fixed 1 GB → 5 GB ($100) if RSS > 80% of plan. |
| C3 | **Re-sim CPU if persist rate 10×** | §4.2: **~$0.3k–$2.5k/mo** Fluid | Skip re-sim; raise tick cap; async verify | Fail closed; skip anon; measure p95; sim perf |
| C4 | **Neon storage if retention job fails** | §6.2: up to **~$390/mo** at 1× cap in a year; **k$/mo** at 10× | Drop 90 d expiry or PB exemption | Cron + alert on `sum(pg_column_size)` daily delta |
| C5 | T10 UPDATE width at 10k live | CU + WAL; p95 > 300 ms | Only update top 100 | Set-based; raise CU; never drop AC-36 |
| C6 | View **stdout** at 40k/h | Observability drain | Delete AdminAudit | Sample `view_*` logs |
| C7 | Pending without cap | 10⁶+ listing rows, unique slugs | Remove 10 cap / 7 d purge | Keep both |
| C8 | Scale-to-zero on prod Neon | T1/view p95 miss | Save CU-hours with suspend | Always-on 0.5–1 CU |
| C9 | PAYG Redis at ceiling | **$173+/mo** vs $20 Fixed | — | Fixed 1 GB |
| C10 | Blob added early | Extra PUT in 2 s path; dashboard 30 GETs | “Cheaper $/GB” | Wait for 50 GiB trigger |

Dead-letter (≤10⁴ lifetime, 2 y if open), unique session, and re-sim are **reliability / money** controls. Their storage is **≪ $1/month**. Cutting them does not move the bill and can **drop captured funds** or the free board’s trust boundary.

---

## 8. Recommended caps and alerts

| Signal | Warn | Page / reopen | Owner |
|--------|------|---------------|--------|
| **Retained `input_log` bytes** `sum(pg_column_size(input_log)) FILTER (WHERE input_log IS NOT NULL)` | **20 GiB** | **50 GiB** Blob-hybrid design; **80 GiB** if retention looks stuck | data / cost |
| Daily delta of that sum | > **2 GiB/day** (cap-rate 10⁵/day) | Retention job failed | devops |
| **Climb persist p95** (route, including re-sim) | **1.5 s** | **2.0 s** fail-closed rate > 1% | backend |
| **Redis commands / credited view** | **> 5** | **> 10** | backend |
| Upstash key count / RSS | 200k keys or 50% plan | 1 M keys or 80% of 1 GB | devops |
| **Pending listings / user** | — | **10** (409 already) | backend |
| Pending rows older than 7 d with zero payments | > 0 after cron | Cron / INTERNAL_TOKEN | devops |
| T10 `views_served` UPDATE p95 | **200 ms** | **300 ms** (NFR) | data |
| Neon CU vs cap | 70% of autoscale max | 90% | devops |
| `climb_runs` row count | 2×10⁷ | 10⁸ (10× metadata) | data |
| Stripe refunds / day | — | Unusual volume (ops, not a cap) | operator |

T29 (blob-byte gauges) is Future in the spec; **these alerts are the now version** of that gauge.

---

## 9. Right-size (use included tiers only when they fit)

| Host | Envelope (10⁵ users, 10⁵ persists/day, 40k views/h) | 10× persist or 10k live/stack |
|------|----------------------------------------------------------|------------------------------|
| Neon **Free** | **No** (0.5 GB, 100 CU-h) | No |
| Neon **Launch**, 0.5–1 CU always-on, autoscale ≤4, 7 d restore | **Yes** | Raise floor CU; Scale only if SLA / HIPAA / 56 CU needed |
| Upstash **Free** | **No** (500k cmds; ~4 h at ceiling) | No |
| Upstash **PAYG** | Works but **~$170+/mo** at ceiling | Worse |
| Upstash **Fixed 1 GB ($20)** | **Yes** | 5 GB ($100) if key RSS demands |
| Vercel **Hobby** | **No** (4 CPU-h, non-commercial) | No |
| Vercel **Pro** + Fluid, iad1, persist `maxDuration` > 2 s | **Yes** | Same; CPU $ scales with persist rate |
| Vercel **Blob** | **No** (ADR-B) | Only after **50 GiB** retained TEXT |

**Do not pretend 10⁵ users fit hobby Neon.** Preview/dev projects may stay Free with scale-to-zero; production must not.

Approximate **infra** envelope (not including Stripe GMV or Pro seats), retention healthy, 250 ms re-sim, Fixed Redis, 1 CU Neon:

| Line | $/month |
|------|--------|
| Neon 1 CU always-on | ~$77 |
| Neon storage+PITR ~15 GiB | ~$8 |
| Upstash Fixed 1 GB | $20 |
| Fluid climb persist | **~$35** |
| Other Fluid (T1/dashboard/webhook) | low tens if cache+COUNT hold |
| **Infra (order of)** | **~$150–250** |

Stripe at 10³ × $5/day is **~$13k GMV/month** and **~$1.3k fees** — a different budget, unchanged by TEXT vs Blob.

---

## 10. Reliability controls we will not delete to save money

- **PaymentDeadLetter** + HTTP 2xx on unattributable captured events.
- **UNIQUE `payments.stripe_session_id`** and **UNIQUE `payment_dead_letters.stripe_session_id`**.
- **Server re-sim** of seed+log; fail closed at 2 s / 18k ticks.
- **AdminAudit** table (append-only).
- **Pending cap 10** and **7-day purge**.
- **T10 set-based `views_served`** for every live above-ground row (AC-36).
- **PB `input_log` exemption** from 90-day expiry.
- Climb-run **metadata** after blob NULL.

---

## 11. Pings

**data:** Measure retained bytes with `sum(pg_column_size(input_log))`, not `char_length`. Do not index `input_log`. Do not add `input_log_url` this generation. Partial uniques stay migrate-SQL (architect ping); that has no cost impact. Integer mm/views do not change $ vs floats.

**architect:** Cost **does not** force a storage-class change. Confirm ADR-B. 50 GiB remains the reopen trigger for operational size; $/GiB still favors TEXT past 50 GiB until PUT+GET+2 s-budget are priced in. T10 at 10k live is a CU problem, not Blob.

**backend / implementer:** 3 Redis commands per qualified view; skip re-sim for anon; dashboard COUNT not `findMany` 500; T1 `take 100`; T10 set-based; sample view logs; `maxDuration` > 2 s on climb persist.

**devops / monitor:** Wire the §8 gauges. Prod Neon always-on. Upstash Fixed, not PAYG, before the view ceiling.

---

## 12. Learnings applied this stage

| Source | Insight | Applied |
|--------|---------|---------|
| architect → cost | TEXT on row; price Neon GiB vs Blob at 50 GiB; SETNX+2×INCR; Fluid at 1e5 and 1e6/day; no Blob now | §§2–6; verdict stays TEXT |
| product-spec → cost | 30+PB+90d; ~31×32 KiB/user before expiry; no Category table | §3; Category table still absent (saves nothing material) |
| standing | Do not delete a reliability control to pass a cost NFR | §10 |
| ledger | Dashboard `take` 500 is a fake rank **and** a read amplifier | §3.7 |
| ledger | Re-sim must have a non-test caller | Costed as production Fluid CPU, not a comment |
| kernel 19 | Unbounded cache keys need eviction | Redis TTL; alert cardinality rather than persist keys |

**Skipped:** gameplay O(floor²) / power-up stacking — spec out of scope; noted only as a possible re-sim CPU lever if p95 approaches 2 s (C3).
