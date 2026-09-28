# Climber art contract

Each avatar (`src/lib/avatars.ts`) climbs as its own character. The engine
(`src/components/Game/climberSprite.ts`) reads a registry,
`src/components/Game/climberCharacters.ts`, keyed by avatar id. A character
without art is a `tint`: the Wraith sheets recoloured into the avatar's
palette. To give a character real art, you add two files and change one line.

## Files

| File | Required | Layout |
|------|----------|--------|
| `<id>-poses-192.png` | yes | 4 columns × 2 rows of 192×192 cells (768×384) |
| `<id>-climb-192.png` | no | 6 columns × 1 row of 192×192 cells (1152×192) |

`<id>` is the avatar id, lower-case, e.g. `ibex-poses-192.png`.

Poses cells, left to right, top row first:

| # | Cell | Used for |
|---|------|----------|
| 0 | idle | standing still (breathing is added in-engine) |
| 1 | run-a | walk cycle, first contact |
| 2 | run-b | walk cycle, second contact |
| 3 | reach-a | ladder climbing when there is no climb strip |
| 4 | reach-b | ladder climbing when there is no climb strip |
| 5 | falling | airborne (jump or fall) |
| 6 | celebrate | finished / reached the summit |
| 7 | down | eliminated by the lava |

The climb strip is a back view, 6 frames that loop while the character goes up
a ladder. Without it, climbing alternates cells 3 and 4.

## Drawing rules

- Draw the character facing **right**. The engine mirrors it for left.
- Use a **transparent** background, PNG. Keep each file under ~50 KB
  (palette quantise). The figure draws at about 30 CSS px.
- **Foot anchor:** by default, every cell's point between the feet sits at
  **(96, 172.5)** in the 192 cell. That is the art pack's (256, 460) in a 512
  cell. The engine pins this point to the ground, so keep the feet on it in
  every frame. Airborne frames hang from it too.
- **Reference height:** the idle figure is **142.5 px** tall, from the anchor
  up to the top of the head (380 px in a 512 cell). All poses use one scale,
  so a crouch really is shorter.
- If your art uses a different anchor or height, pass `rootX`, `rootY` and
  `refH` (in 192-cell px) to `sheets()`. Do not rescale the sheet to fit.
- The engine does the smoothing: distance-driven cycles, crossfades, bob,
  lean, squash and stretch. Do not bake motion blur or ground shadows in.

## Registering a character

In `src/components/Game/climberCharacters.ts`, replace the avatar's `tint`
entry:

```ts
ibex: tint("#ecba55", "#2e1e12"),
```

with:

```ts
ibex: sheets("ibex"),                  // poses + climb strip
ibex: sheets("ibex", { climb: false }), // poses only
```

That is the whole change. Nothing else in shared code needs to change:

- **Web** loads `/climb/<id>-…-192.png` from this folder. It loads only when
  that character is first drawn.
- **Native (Capacitor)** bundles every `*-poses-192.png` and
  `*-climb-192.png` in this folder by glob
  (`mobile/src/lib/climberSheets.ts`), so you add no import.
- **Fallbacks:** the vector climber draws until the poses sheet decodes. If
  the poses sheet fails to load, the character draws as the Wraith.

The registry test (`tests/game/climberCharacters.test.ts`) requires exactly
one entry per catalogue avatar. Run `pnpm test` in `app/` after the change.
