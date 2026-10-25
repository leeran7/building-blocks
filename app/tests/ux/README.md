# UX checks

`pnpm ux` visits every app screen and web page in `surfaces.ts` at phone
(390×844), small phone (320×568) and desktop (1440×900) sizes, and taps
through the core flows in `flows.spec.ts`. It is the automated half of the
8/10 bar in the plan "Doomstack to 8/10".

| Check | Rule | Bar |
|---|---|---|
| axe | WCAG 2.2 A/AA, serious and critical | none |
| target | hit area | 44 px app, 24 px web |
| focus | visible keyboard focus; Tab stays inside an open sheet | desktop only |
| zoom | viewport allows pinch zoom | phone sizes only |
| overflow | no sideways scroll | all |
| stretch | no button wider than 720 px | desktop only |
| flow | taps to the goal, dead ends, covered controls, broken promises | phone |

Each surface has a `ready` element that must show before the checks run, and
an uncaught page error or a web page that isn't a 200 fails the run, so a
blank or crashed screen can't pass.

`baseline.json` holds the counts main had when a check landed, and a run
fails when a count differs from it. Higher is a regression. Lower means the
page got better: run `pnpm ux:baseline` and commit the lower counts, so the
fixed problem can't come back. `pnpm ux:baseline` refuses to raise a count
unless you pass `--allow-raise`, which is only for a new surface or a flow
that now reaches its goal; say why in the PR.

Flows count taps only when they reach their goal. Their problems must match
`KNOWN_BROKEN` in `surfaces.ts` exactly, each entry naming the plan step that
fixes it; the fix PR deletes the entry.

Running it:

- App only: `UX_SURFACES=app pnpm ux` (starts `pnpm mobile:dev` on 5174).
- Website: needs a migrated local database in both `DATABASE_URL` and
  `DIRECT_URL` (see `pnpm db:migrate:local`); the config refuses any other
  host, and starts the website with every server key in `.env.example` blanked
  except the database URLs. Locally it starts `pnpm dev` on 3100; for steadier
  results run `pnpm build && pnpm start -p 3100` first and it reuses that.
- Screenshots land in `test-results/ux/screens/<size>/`.

The app runs with a stubbed account and fixture API answers (`lib/app.ts`).
Every request and WebSocket that leaves the machine is blocked, and service
workers are off, so the checks never reach production services.

`selfcheck.spec.ts` proves each check reports a planted violation.
