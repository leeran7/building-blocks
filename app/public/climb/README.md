# Climber art contract

Each avatar (`src/lib/avatars.ts`) climbs as its own character. The engine
(`src/components/Game/climberSprite.ts`) reads a registry,
`src/components/Game/climberCharacters.ts`, keyed by avatar id. Characters use
real art only: there are no placeholders. A character without art is a
`base()` entry and shows as the Wraith until its sheets land. To give a
character real art, you add two files and change one line.

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

In `src/components/Game/climberCharacters.ts`, replace the avatar's `base()`
entry:

```ts
ibex: base(),
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

Recolours (the Wraith tinted into another palette, `tint(...)`) are not used
for characters. The engine and the sampled colours (`RECOLOR_PALETTE`) are
kept for a separate, future feature such as unlockable colour skins.

The registry test (`tests/game/climberCharacters.test.ts`) requires exactly
one entry per catalogue avatar. Run `pnpm test` in `app/` after the change.

## Generated art: how to prepare it

Image generators tend to return a flat RGB image with a checkerboard *painted
in* rather than real transparency, figures of uneven size, and no grid. To use
generated art directly, ask for:

- a real transparent PNG (alpha channel), not a checkerboard;
- the exact layout above: 192 px cells (or 512 px cells, same proportions),
  one figure per cell, nothing crossing a cell edge;
- the same scale in every frame, feet on one ground line;
- the named poses in the stated order (idle, run-a, run-b, reach-a, reach-b,
  falling, celebrate, down), plus the 6-frame back-view climb as its own image.
