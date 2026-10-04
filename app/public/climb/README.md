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

Walking alternates cells 1 and 2 only, so make them two mirrored strides:
one foot forward and one back in run-a, swapped in run-b, soles on the anchor
in both. A stride paired with a legs-together passing pose reads as a hop on
every other step, and a frame whose feet end above the anchor floats (the
engine already adds the bob). `grounding.py` in `tools/climber-art/` snaps a
rig's grounded cells onto the anchor.

The climb strip is a back view, 6 frames that loop while the character goes up
a ladder. Without it, climbing alternates cells 3 and 4.

All six climb frames must differ, and the cycle must travel, not bounce: hand
over hand, one hand gripping while the other reaches past it. A strip that
repeats a frame (1 = 2) stutters in game, and one that mirrors itself (1 = 5,
2 = 4) pumps its arms up and down like waving. The engine advances one frame
per 0.65 m climbed, which is 13.5 px of a 192 cell, so a gripping hand that
slides down that much per frame stays still on screen. The code-drawn rigs
share this cycle in `tools/climber-art/climb_cycle.py`, and
`tests/game/climberSheetFiles.test.ts` fails a strip whose frames repeat.

## Drawing rules

- Draw the character facing **right**. The engine mirrors it for left.
- Use a **transparent** background, PNG. Keep each file under ~50 KB
  (palette quantise). The figure draws at about 30 CSS px.
- **Foot anchor:** by default, every cell's point between the feet sits at
  **(96, 172.5)** in the 192 cell. That is the art pack's (256, 460) in a 512
  cell. The engine pins this point to the ground, so keep the feet on it in
  every frame. Airborne frames hang from it too.
- **A character is a skin over the stick figure.** It is drawn on top of the
  green stick at the stick's feet, and it never changes how the climber
  plays: hitbox, movement, ladder grabs, hits, power-ups and scoring are the
  stick's for every character, free or paid (`context/trust.md` item 9).
- **Head height:** the top of the character's skull sits exactly on the top of
  the stick's head (2.92 × the climber size above the feet, the
  `STICK_HEAD_TOP_IN_S` constant in `climberSprite.ts`). Horns, ears, antennae,
  crests, spikes and hoods do not count: they stick out above the stick's head.
  For a hooded character (the Wraith) the skull is the head inside the hood.
- Register the skull top as `headTop`, the row of the idle cell (192-cell px
  from the top) where the skull starts, estimated by eye:
  `sheets("ibex", { headTop: 38 })`. The engine scales the whole sheet so
  that row lands on the stick's head top. All poses use one scale, so a crouch
  really is shorter. Leave room above the skull for horns and hoods (the cell
  is 192 px; keep a ~10 px gutter).
- If your art uses a different foot anchor, pass `rootX` and `rootY` (in
  192-cell px) to `sheets()`. Do not rescale the sheet to fit.
- The engine does the smoothing: distance-driven cycles, crossfades, bob,
  lean, squash and stretch. Do not bake motion blur or ground shadows in.
  A cycle drawn as steps of one motion (the Wraith's) wants the default
  short crossfade; a cycle assembled from generated poses can ask for a
  continuous dissolve per cycle with `cycleBlend` (0 to 0.5):
  `sheets("otter-void", { headTop: 43, cycleBlend: { climb: 0.5 } })`.

## Registering a character

In `src/components/Game/climberCharacters.ts`, replace the avatar's `base()`
entry:

```ts
ibex: base(),
```

with:

```ts
ibex: sheets("ibex", { headTop: 38 }),                  // poses + climb strip
ibex: sheets("ibex", { headTop: 38, climb: false }),    // poses only
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

## Paid Void skins

The 18 `<id>-void` character skins use their own portrait-faithful poses and
climb sheets. Keep the existing Choose Character portraits: the badge falls
back to its base character's portrait, preserving the same identity. The
Wraith's colour skins still use the tint renderer.

Approved masters live in `paid-characters/art/<id>-void/`. Compile them with
`scripts/climber-art/process_paid.py` and compare the resulting sheets with
the reviewed snapshot before replacing runtime PNGs. Each pair shares one
scale and the foot anchor `(96,172.5)`; standing poses are grounded, the
falling pose keeps its authored position, and the run and climb cycles are
stabilised (the climb re-sequenced into its smoothest loop, mirroring frames
where that is the other hand's reach, then each frame's body pinned onto the
cycle's first) so the crossfades read like the Wraith's: limbs move, the
figure does not.

`VOID_SKIN_SHEETS` in `climberCharacters.ts` registers all 18 pairs with the
reviewed idle skull-top estimate (excluding horns, ears and crests). Its
`headTop` determines rendered body height. Recheck this calibration whenever
source framing or the common compilation scale changes. Native bundling
resolves the full hyphenated id through `mobile/src/lib/climberSheets.ts`.

A skin is still only a look: it plays exactly like the stick figure.

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
