# Void characters: full generation pack

Everything needed to generate the paid **Void** version of every character so
it matches the Wraith. Checked against `leeran7/building-blocks` main on
2026-10-01 (`app/src/lib/avatars.ts`, `app/src/components/Game/climberCharacters.ts`,
`app/public/climb/README.md`, `app/mobile/src/lib/avatarImages.ts`).

## What's live today

- 18 Void skins are in the shop, one per character, id `<character>-void`,
  shown as "Void <Name>", 1,200 gems each.
- Until a skin's own art lands, the game draws it as **the Wraith recoloured
  to that character's accent** (placeholder). This pack replaces those
  placeholders with real art.
- The Wraith's own skins (Void Walker `#9b5cff`, Blood Walker `#ff3b4a`,
  Frost Walker `#5fd8ff`) are recolours of the Wraith done in code. They need
  **no new images**.
- The Skin Details screen previews the skin by playing its sprite sheets
  (idle, walk, climb), and portraits come from the avatar bust. So the game
  uses **3 images per character**: poses sheet, climb strip and bust. The
  showcase and turntable are included as optional extras for marketing or a
  future store layout; nothing in the app reads them today.

## Checklist (18 characters)

| # | Skin id | Name | Accent | Key bg |
|---|---------|------|--------|--------|
| 1 | `kestrel-void` | Void Kestrel | `#4a9fef` | magenta |
| 2 | `lynx-void` | Void Lynx | `#f23db5` | green |
| 3 | `raven-void` | Void Raven | `#f4b943` | magenta |
| 4 | `panther-void` | Void Panther | `#b446f4` | green |
| 5 | `wolf-void` | Void Wolf | `#f43fba` | green |
| 6 | `otter-void` | Void Otter | `#3595f2` | magenta |
| 7 | `heron-void` | Void Heron | `#3b93e6` | magenta |
| 8 | `yak-void` | Void Yak | `#ea4239` | magenta |
| 9 | `mantis-void` | Void Mantis | `#b3f027` | magenta |
| 10 | `cobra-void` | Void Cobra | `#1982f5` | magenta |
| 11 | `badger-void` | Void Badger | `#be4df4` | green |
| 12 | `falcon-void` | Void Falcon | `#f29842` | magenta |
| 13 | `marmot-void` | Void Marmot | `#eaae74` | magenta |
| 14 | `bison-void` | Void Bison | `#f1442a` | magenta |
| 15 | `ibex-void` | Void Ibex | `#ecba55` | magenta |
| 16 | `sentinel-void` | Void Sentinel | `#42eff6` | magenta |
| 17 | `viking-void` | Void Viking | `#f4661c` | magenta |
| 18 | `gecko-void` | Void Gecko | `#b2ef2f` | magenta |

Accents are the exact colours the game already uses for each placeholder
(`RECOLOR_PALETTE`), so the real art matches what players see now.

Required: 18 × 3 = **54 images**. With the optional showcase and turntable:
18 × 12 = 216.

## Reference images to upload

All 39 are in the project folder **`paid-characters/references/`**:

- `wraith-poses-192.png`, `wraith-climb-192.png`, `wraith.webp`: the style
  target. Upload with every prompt.
- `<character>.webp` and `<character>-poses-192.png`: each character's
  identity (face, horns, ears, tail) and its current poses.

## How to run it

1. Open a fresh chat in your image generator for each character. Upload the
   four references listed in that character's section.
2. Generate **C (bust) first**. It is the quickest way to lock the Void look.
   Once you like it, upload that bust too for A and B, so every image is the
   same design.
3. Generate **A (poses sheet)**, then **B (climb strip)**.
4. Save each file with the name given and drop it in
   `paid-characters/art/<character>-void/`.

**If the generator won't hold the 4 × 2 grid** (common): ask for each pose
as its own 512 × 512 image instead, using the same prompt with "Output ONE
512 x 512 image of pose N only". Name them `<id>-void-pose-1.png` …
`-pose-8.png` and `<id>-void-climb-1.png` … `-climb-6.png`. I'll assemble the
sheets.

**If it can't do exact pixel sizes:** keep the aspect ratio (2:1 for poses,
6:1 for climb, 1:1 for the rest) and I'll rescale. Feet must still sit on one
shared ground line at the same scale in every frame. That part can't be fixed
afterwards without redrawing.

## Rules the game enforces (why the prompts say what they say)

- Facing **three-quarter right** in every frame. The engine mirrors for left.
- Feet anchored at **(256, 460)** in each 512 cell. The engine pins that point
  to the ground.
- **One scale for every pose.** The game scales the whole sheet so the skull
  lands on the stick figure's head, so a crouch must really be shorter.
- Sized like the Wraith: idle hood top at about y=75, figure about 385 px
  tall and 255 px wide in a 512 cell.
- Run poses 2 and 3 are **mirrored strides**. The walk only alternates
  those two.
- Climb: **6 different frames**, hand over hand. A repeated or mirrored frame
  fails the repo's test.
- No baked shadow, blur or glow halo outside the figure. The engine adds
  motion.
- Keying background: magenta, except green for the magenta and violet
  characters (Lynx, Wolf, Panther, Badger) so the key doesn't eat the accent.

---

## 1. Void Kestrel  (`kestrel-void`)

**Accent:** sky blue `#4a9fef` · **Keying background:** pure magenta #FF00FF · **Character:** a bird-of-prey warrior with a big kestrel head, short hooked golden-yellow beak, cream face and throat, and a swept-back crest of angular feathers; small folded wings at the back.

**Upload with every prompt below:** `references/wraith-poses-192.png`, `references/wraith.webp`, `references/kestrel.webp`, `references/kestrel-poses-192.png`  (climb prompt: also `references/wraith-climb-192.png`)

**Return these files** to `paid-characters/art/kestrel-void/`:

| File | Size | Needed by the game? |
|---|---|---|
| `kestrel-void-poses.png` | 2048 × 1024 | Yes |
| `kestrel-void-climb.png` | 3072 × 512 | Yes |
| `kestrel-void.webp` (or .png) | 1024 × 1024 | Yes |
| `kestrel-void-showcase.png` | 1536 × 1536 | Optional |
| `kestrel-void-turn-0.png` … `-turn-7.png` | 1024 × 1024 each | Optional |

### 1A. Poses sheet  →  `kestrel-void-poses.png`

```text
Make the VOID KESTREL: the Kestrel from the attached kestrel.webp and kestrel-poses-192.png, redesigned in the Wraith's look. Identity to keep: a bird-of-prey warrior with a big kestrel head, short hooked golden-yellow beak, cream face and throat, and a swept-back crest of angular feathers; small folded wings at the back. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, sky blue #4a9fef, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing sky-blue eyes with a soft bloom in a shadowed face. Wears a beaked Void hood, the crest spiking out through the top and the golden beak jutting out of the hood opening. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons.

Output ONE sprite sheet, exactly 2048 x 1024 px: 4 columns x 2 rows of 512 x 512 cells, one figure per cell, nothing crossing a cell edge. Same poses, order and framing as the attached wraith-poses-192.png. Left to right, top row first: 1 idle standing; 2 running stride, near leg forward and far leg back; 3 running stride, near leg back and far leg forward (the mirror of 2); 4 right arm reaching straight overhead; 5 left arm reaching straight overhead; 6 falling, arms and legs spread; 7 both arms raised in celebration; 8 crouched down low, defeated. Every pose faces three-quarter right; never mirror a frame. In every cell the point between the feet is at x=256, y=460; airborne poses hang from that same point. Identical character scale in all 8 cells, sized like the Wraith: in idle the top of the hood is at about y=75 and the figure is about 255 px wide. The crouch must be shorter than idle. At least 30 px empty margin to every cell edge. Flat pure magenta #FF00FF background filling every cell, no gradient, no ground shadow, no motion blur, no text, no grid lines.
```

### 1B. Climb strip  →  `kestrel-void-climb.png`

```text
The exact same Void Kestrel from the poses sheet, seen from directly behind, climbing a ladder (the ladder itself is NOT drawn). Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, sky blue #4a9fef, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing sky-blue eyes with a soft bloom in a shadowed face. Wears a beaked Void hood, the crest spiking out through the top and the golden beak jutting out of the hood opening. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons.

Output ONE strip, exactly 3072 x 512 px: 6 cells of 512 x 512 in a row, like the attached wraith-climb-192.png. Back of the hood centred, the sky blue chevron visible across the shoulders. Hand-over-hand cycle that travels upward, never bounces: 1 right hand high gripping, left hand at chest; 2 left hand rising past the right; 3 left hand high gripping, right hand low; 4 right hand rising; 5 right hand passing the left; 6 right hand nearly high again, left hand dropping to chest. Legs step opposite to the hands. All six frames clearly different; no frame repeats or mirrors another. Head and torso stay centred with under 2 px bob. Feet point at x=256, y=460 in every cell, same scale as the poses sheet. Flat pure magenta #FF00FF background, no ground shadow, no text.
```

### 1C. Avatar bust  →  `kestrel-void.webp`

```text
Head-and-shoulders bust of the same Void Kestrel, three-quarter front view facing slightly right, framed exactly like the attached wraith.webp: the hood and pauldrons fill a square edge to edge, cut off at the chest. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, sky blue #4a9fef, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing sky-blue eyes with a soft bloom in a shadowed face. Wears a beaked Void hood, the crest spiking out through the top and the golden beak jutting out of the hood opening. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. The eyes are the brightest point. Exactly 1024 x 1024 px, real transparent background (alpha channel, not a painted checkerboard), no text.
```

### 1D. Store showcase (optional)  →  `kestrel-void-showcase.png`

```text
Full-body hero render of the same Void Kestrel, three-quarter front view, confident idle stance, arms slightly out, centred with the feet in the bottom 10% of the frame. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, sky blue #4a9fef, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing sky-blue eyes with a soft bloom in a shadowed face. Wears a beaked Void hood, the crest spiking out through the top and the golden beak jutting out of the hood opening. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. Add a warm orange rim light from behind, as if standing in front of a lava field. Exactly 1536 x 1536 px, real transparent background, no pedestal, no text.
```

### 1E. Turntable (optional)  →  `kestrel-void-turn-0.png` … `-turn-7.png`

```text
Eight separate 1024 x 1024 renders of the exact same Void Kestrel in the same idle pose, rotated around its vertical axis in 45 degree steps: 0 front, 1 front-right, 2 right, 3 back-right, 4 back, 5 back-left, 6 left, 7 front-left. Same scale, same foot position, same lighting in all eight. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, sky blue #4a9fef, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing sky-blue eyes with a soft bloom in a shadowed face. Wears a beaked Void hood, the crest spiking out through the top and the golden beak jutting out of the hood opening. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. Real transparent background, no text.
```


---

## 2. Void Lynx  (`lynx-void`)

**Accent:** hot magenta `#f23db5` · **Keying background:** pure green #00FF00 · **Character:** a lynx warrior with an oversized lynx head, tall tufted ears, a spiky cheek ruff, white whisker lines, clawed gloves and a short tufted tail.

**Upload with every prompt below:** `references/wraith-poses-192.png`, `references/wraith.webp`, `references/lynx.webp`, `references/lynx-poses-192.png`  (climb prompt: also `references/wraith-climb-192.png`)

**Return these files** to `paid-characters/art/lynx-void/`:

| File | Size | Needed by the game? |
|---|---|---|
| `lynx-void-poses.png` | 2048 × 1024 | Yes |
| `lynx-void-climb.png` | 3072 × 512 | Yes |
| `lynx-void.webp` (or .png) | 1024 × 1024 | Yes |
| `lynx-void-showcase.png` | 1536 × 1536 | Optional |
| `lynx-void-turn-0.png` … `-turn-7.png` | 1024 × 1024 each | Optional |

### 2A. Poses sheet  →  `lynx-void-poses.png`

```text
Make the VOID LYNX: the Lynx from the attached lynx.webp and lynx-poses-192.png, redesigned in the Wraith's look. Identity to keep: a lynx warrior with an oversized lynx head, tall tufted ears, a spiky cheek ruff, white whisker lines, clawed gloves and a short tufted tail. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, hot magenta #f23db5, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing magenta eyes with a soft bloom in a shadowed face. Wears a close Void hood with the two tufted ears poking up through slits and the cheek ruff flaring out of the opening. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons.

Output ONE sprite sheet, exactly 2048 x 1024 px: 4 columns x 2 rows of 512 x 512 cells, one figure per cell, nothing crossing a cell edge. Same poses, order and framing as the attached wraith-poses-192.png. Left to right, top row first: 1 idle standing; 2 running stride, near leg forward and far leg back; 3 running stride, near leg back and far leg forward (the mirror of 2); 4 right arm reaching straight overhead; 5 left arm reaching straight overhead; 6 falling, arms and legs spread; 7 both arms raised in celebration; 8 crouched down low, defeated. Every pose faces three-quarter right; never mirror a frame. In every cell the point between the feet is at x=256, y=460; airborne poses hang from that same point. Identical character scale in all 8 cells, sized like the Wraith: in idle the top of the hood is at about y=75 and the figure is about 255 px wide. The crouch must be shorter than idle. At least 30 px empty margin to every cell edge. Flat pure green #00FF00 background filling every cell, no gradient, no ground shadow, no motion blur, no text, no grid lines.
```

### 2B. Climb strip  →  `lynx-void-climb.png`

```text
The exact same Void Lynx from the poses sheet, seen from directly behind, climbing a ladder (the ladder itself is NOT drawn). Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, hot magenta #f23db5, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing magenta eyes with a soft bloom in a shadowed face. Wears a close Void hood with the two tufted ears poking up through slits and the cheek ruff flaring out of the opening. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons.

Output ONE strip, exactly 3072 x 512 px: 6 cells of 512 x 512 in a row, like the attached wraith-climb-192.png. Back of the hood centred, the hot magenta chevron visible across the shoulders. Hand-over-hand cycle that travels upward, never bounces: 1 right hand high gripping, left hand at chest; 2 left hand rising past the right; 3 left hand high gripping, right hand low; 4 right hand rising; 5 right hand passing the left; 6 right hand nearly high again, left hand dropping to chest. Legs step opposite to the hands. All six frames clearly different; no frame repeats or mirrors another. Head and torso stay centred with under 2 px bob. Feet point at x=256, y=460 in every cell, same scale as the poses sheet. Flat pure green #00FF00 background, no ground shadow, no text.
```

### 2C. Avatar bust  →  `lynx-void.webp`

```text
Head-and-shoulders bust of the same Void Lynx, three-quarter front view facing slightly right, framed exactly like the attached wraith.webp: the hood and pauldrons fill a square edge to edge, cut off at the chest. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, hot magenta #f23db5, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing magenta eyes with a soft bloom in a shadowed face. Wears a close Void hood with the two tufted ears poking up through slits and the cheek ruff flaring out of the opening. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. The eyes are the brightest point. Exactly 1024 x 1024 px, real transparent background (alpha channel, not a painted checkerboard), no text.
```

### 2D. Store showcase (optional)  →  `lynx-void-showcase.png`

```text
Full-body hero render of the same Void Lynx, three-quarter front view, confident idle stance, arms slightly out, centred with the feet in the bottom 10% of the frame. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, hot magenta #f23db5, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing magenta eyes with a soft bloom in a shadowed face. Wears a close Void hood with the two tufted ears poking up through slits and the cheek ruff flaring out of the opening. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. Add a warm orange rim light from behind, as if standing in front of a lava field. Exactly 1536 x 1536 px, real transparent background, no pedestal, no text.
```

### 2E. Turntable (optional)  →  `lynx-void-turn-0.png` … `-turn-7.png`

```text
Eight separate 1024 x 1024 renders of the exact same Void Lynx in the same idle pose, rotated around its vertical axis in 45 degree steps: 0 front, 1 front-right, 2 right, 3 back-right, 4 back, 5 back-left, 6 left, 7 front-left. Same scale, same foot position, same lighting in all eight. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, hot magenta #f23db5, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing magenta eyes with a soft bloom in a shadowed face. Wears a close Void hood with the two tufted ears poking up through slits and the cheek ruff flaring out of the opening. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. Real transparent background, no text.
```


---

## 3. Void Raven  (`raven-void`)

**Accent:** amber `#f4b943` · **Keying background:** pure magenta #FF00FF · **Character:** a raven warrior with a big bird head, a short hooked amber beak, a pale grey face patch and a mantle of layered black feathers.

**Upload with every prompt below:** `references/wraith-poses-192.png`, `references/wraith.webp`, `references/raven.webp`, `references/raven-poses-192.png`  (climb prompt: also `references/wraith-climb-192.png`)

**Return these files** to `paid-characters/art/raven-void/`:

| File | Size | Needed by the game? |
|---|---|---|
| `raven-void-poses.png` | 2048 × 1024 | Yes |
| `raven-void-climb.png` | 3072 × 512 | Yes |
| `raven-void.webp` (or .png) | 1024 × 1024 | Yes |
| `raven-void-showcase.png` | 1536 × 1536 | Optional |
| `raven-void-turn-0.png` … `-turn-7.png` | 1024 × 1024 each | Optional |

### 3A. Poses sheet  →  `raven-void-poses.png`

```text
Make the VOID RAVEN: the Raven from the attached raven.webp and raven-poses-192.png, redesigned in the Wraith's look. Identity to keep: a raven warrior with a big bird head, a short hooked amber beak, a pale grey face patch and a mantle of layered black feathers. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, amber #f4b943, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing amber eyes with a soft bloom in a shadowed face. Wears a deep plague-crow Void hood, the amber beak protruding from the opening, feather shards layered around the hood rim. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons.

Output ONE sprite sheet, exactly 2048 x 1024 px: 4 columns x 2 rows of 512 x 512 cells, one figure per cell, nothing crossing a cell edge. Same poses, order and framing as the attached wraith-poses-192.png. Left to right, top row first: 1 idle standing; 2 running stride, near leg forward and far leg back; 3 running stride, near leg back and far leg forward (the mirror of 2); 4 right arm reaching straight overhead; 5 left arm reaching straight overhead; 6 falling, arms and legs spread; 7 both arms raised in celebration; 8 crouched down low, defeated. Every pose faces three-quarter right; never mirror a frame. In every cell the point between the feet is at x=256, y=460; airborne poses hang from that same point. Identical character scale in all 8 cells, sized like the Wraith: in idle the top of the hood is at about y=75 and the figure is about 255 px wide. The crouch must be shorter than idle. At least 30 px empty margin to every cell edge. Flat pure magenta #FF00FF background filling every cell, no gradient, no ground shadow, no motion blur, no text, no grid lines.
```

### 3B. Climb strip  →  `raven-void-climb.png`

```text
The exact same Void Raven from the poses sheet, seen from directly behind, climbing a ladder (the ladder itself is NOT drawn). Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, amber #f4b943, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing amber eyes with a soft bloom in a shadowed face. Wears a deep plague-crow Void hood, the amber beak protruding from the opening, feather shards layered around the hood rim. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons.

Output ONE strip, exactly 3072 x 512 px: 6 cells of 512 x 512 in a row, like the attached wraith-climb-192.png. Back of the hood centred, the amber chevron visible across the shoulders. Hand-over-hand cycle that travels upward, never bounces: 1 right hand high gripping, left hand at chest; 2 left hand rising past the right; 3 left hand high gripping, right hand low; 4 right hand rising; 5 right hand passing the left; 6 right hand nearly high again, left hand dropping to chest. Legs step opposite to the hands. All six frames clearly different; no frame repeats or mirrors another. Head and torso stay centred with under 2 px bob. Feet point at x=256, y=460 in every cell, same scale as the poses sheet. Flat pure magenta #FF00FF background, no ground shadow, no text.
```

### 3C. Avatar bust  →  `raven-void.webp`

```text
Head-and-shoulders bust of the same Void Raven, three-quarter front view facing slightly right, framed exactly like the attached wraith.webp: the hood and pauldrons fill a square edge to edge, cut off at the chest. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, amber #f4b943, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing amber eyes with a soft bloom in a shadowed face. Wears a deep plague-crow Void hood, the amber beak protruding from the opening, feather shards layered around the hood rim. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. The eyes are the brightest point. Exactly 1024 x 1024 px, real transparent background (alpha channel, not a painted checkerboard), no text.
```

### 3D. Store showcase (optional)  →  `raven-void-showcase.png`

```text
Full-body hero render of the same Void Raven, three-quarter front view, confident idle stance, arms slightly out, centred with the feet in the bottom 10% of the frame. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, amber #f4b943, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing amber eyes with a soft bloom in a shadowed face. Wears a deep plague-crow Void hood, the amber beak protruding from the opening, feather shards layered around the hood rim. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. Add a warm orange rim light from behind, as if standing in front of a lava field. Exactly 1536 x 1536 px, real transparent background, no pedestal, no text.
```

### 3E. Turntable (optional)  →  `raven-void-turn-0.png` … `-turn-7.png`

```text
Eight separate 1024 x 1024 renders of the exact same Void Raven in the same idle pose, rotated around its vertical axis in 45 degree steps: 0 front, 1 front-right, 2 right, 3 back-right, 4 back, 5 back-left, 6 left, 7 front-left. Same scale, same foot position, same lighting in all eight. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, amber #f4b943, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing amber eyes with a soft bloom in a shadowed face. Wears a deep plague-crow Void hood, the amber beak protruding from the opening, feather shards layered around the hood rim. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. Real transparent background, no text.
```


---

## 4. Void Panther  (`panther-void`)

**Accent:** violet `#b446f4` · **Keying background:** pure green #00FF00 · **Character:** a black panther warrior with a big feline head, short rounded ears, a pale grey faceted muzzle and a long curling tail.

**Upload with every prompt below:** `references/wraith-poses-192.png`, `references/wraith.webp`, `references/panther.webp`, `references/panther-poses-192.png`  (climb prompt: also `references/wraith-climb-192.png`)

**Return these files** to `paid-characters/art/panther-void/`:

| File | Size | Needed by the game? |
|---|---|---|
| `panther-void-poses.png` | 2048 × 1024 | Yes |
| `panther-void-climb.png` | 3072 × 512 | Yes |
| `panther-void.webp` (or .png) | 1024 × 1024 | Yes |
| `panther-void-showcase.png` | 1536 × 1536 | Optional |
| `panther-void-turn-0.png` … `-turn-7.png` | 1024 × 1024 each | Optional |

### 4A. Poses sheet  →  `panther-void-poses.png`

```text
Make the VOID PANTHER: the Panther from the attached panther.webp and panther-poses-192.png, redesigned in the Wraith's look. Identity to keep: a black panther warrior with a big feline head, short rounded ears, a pale grey faceted muzzle and a long curling tail. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, violet #b446f4, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing violet eyes with a soft bloom in a shadowed face. Wears a sleek close-fitting Void hood with the rounded ears through slits and the muzzle out of the opening. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons.

Output ONE sprite sheet, exactly 2048 x 1024 px: 4 columns x 2 rows of 512 x 512 cells, one figure per cell, nothing crossing a cell edge. Same poses, order and framing as the attached wraith-poses-192.png. Left to right, top row first: 1 idle standing; 2 running stride, near leg forward and far leg back; 3 running stride, near leg back and far leg forward (the mirror of 2); 4 right arm reaching straight overhead; 5 left arm reaching straight overhead; 6 falling, arms and legs spread; 7 both arms raised in celebration; 8 crouched down low, defeated. Every pose faces three-quarter right; never mirror a frame. In every cell the point between the feet is at x=256, y=460; airborne poses hang from that same point. Identical character scale in all 8 cells, sized like the Wraith: in idle the top of the hood is at about y=75 and the figure is about 255 px wide. The crouch must be shorter than idle. At least 30 px empty margin to every cell edge. Flat pure green #00FF00 background filling every cell, no gradient, no ground shadow, no motion blur, no text, no grid lines.
```

### 4B. Climb strip  →  `panther-void-climb.png`

```text
The exact same Void Panther from the poses sheet, seen from directly behind, climbing a ladder (the ladder itself is NOT drawn). Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, violet #b446f4, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing violet eyes with a soft bloom in a shadowed face. Wears a sleek close-fitting Void hood with the rounded ears through slits and the muzzle out of the opening. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons.

Output ONE strip, exactly 3072 x 512 px: 6 cells of 512 x 512 in a row, like the attached wraith-climb-192.png. Back of the hood centred, the violet chevron visible across the shoulders. Hand-over-hand cycle that travels upward, never bounces: 1 right hand high gripping, left hand at chest; 2 left hand rising past the right; 3 left hand high gripping, right hand low; 4 right hand rising; 5 right hand passing the left; 6 right hand nearly high again, left hand dropping to chest. Legs step opposite to the hands. All six frames clearly different; no frame repeats or mirrors another. Head and torso stay centred with under 2 px bob. Feet point at x=256, y=460 in every cell, same scale as the poses sheet. Flat pure green #00FF00 background, no ground shadow, no text.
```

### 4C. Avatar bust  →  `panther-void.webp`

```text
Head-and-shoulders bust of the same Void Panther, three-quarter front view facing slightly right, framed exactly like the attached wraith.webp: the hood and pauldrons fill a square edge to edge, cut off at the chest. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, violet #b446f4, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing violet eyes with a soft bloom in a shadowed face. Wears a sleek close-fitting Void hood with the rounded ears through slits and the muzzle out of the opening. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. The eyes are the brightest point. Exactly 1024 x 1024 px, real transparent background (alpha channel, not a painted checkerboard), no text.
```

### 4D. Store showcase (optional)  →  `panther-void-showcase.png`

```text
Full-body hero render of the same Void Panther, three-quarter front view, confident idle stance, arms slightly out, centred with the feet in the bottom 10% of the frame. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, violet #b446f4, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing violet eyes with a soft bloom in a shadowed face. Wears a sleek close-fitting Void hood with the rounded ears through slits and the muzzle out of the opening. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. Add a warm orange rim light from behind, as if standing in front of a lava field. Exactly 1536 x 1536 px, real transparent background, no pedestal, no text.
```

### 4E. Turntable (optional)  →  `panther-void-turn-0.png` … `-turn-7.png`

```text
Eight separate 1024 x 1024 renders of the exact same Void Panther in the same idle pose, rotated around its vertical axis in 45 degree steps: 0 front, 1 front-right, 2 right, 3 back-right, 4 back, 5 back-left, 6 left, 7 front-left. Same scale, same foot position, same lighting in all eight. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, violet #b446f4, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing violet eyes with a soft bloom in a shadowed face. Wears a sleek close-fitting Void hood with the rounded ears through slits and the muzzle out of the opening. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. Real transparent background, no text.
```


---

## 5. Void Wolf  (`wolf-void`)

**Accent:** hot magenta `#f43fba` · **Keying background:** pure green #00FF00 · **Character:** a wolf warrior with a big angular head, tall pointed ears, a jagged ruff of shard-like fur around the neck, a grey muzzle with a dark nose and a bushy faceted tail.

**Upload with every prompt below:** `references/wraith-poses-192.png`, `references/wraith.webp`, `references/wolf.webp`, `references/wolf-poses-192.png`  (climb prompt: also `references/wraith-climb-192.png`)

**Return these files** to `paid-characters/art/wolf-void/`:

| File | Size | Needed by the game? |
|---|---|---|
| `wolf-void-poses.png` | 2048 × 1024 | Yes |
| `wolf-void-climb.png` | 3072 × 512 | Yes |
| `wolf-void.webp` (or .png) | 1024 × 1024 | Yes |
| `wolf-void-showcase.png` | 1536 × 1536 | Optional |
| `wolf-void-turn-0.png` … `-turn-7.png` | 1024 × 1024 each | Optional |

### 5A. Poses sheet  →  `wolf-void-poses.png`

```text
Make the VOID WOLF: the Wolf from the attached wolf.webp and wolf-poses-192.png, redesigned in the Wraith's look. Identity to keep: a wolf warrior with a big angular head, tall pointed ears, a jagged ruff of shard-like fur around the neck, a grey muzzle with a dark nose and a bushy faceted tail. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, hot magenta #f43fba, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing magenta eyes with a soft bloom in a shadowed face. Wears a Void hood worn over the ruff, the pointed ears through slits and the muzzle out of the opening. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons.

Output ONE sprite sheet, exactly 2048 x 1024 px: 4 columns x 2 rows of 512 x 512 cells, one figure per cell, nothing crossing a cell edge. Same poses, order and framing as the attached wraith-poses-192.png. Left to right, top row first: 1 idle standing; 2 running stride, near leg forward and far leg back; 3 running stride, near leg back and far leg forward (the mirror of 2); 4 right arm reaching straight overhead; 5 left arm reaching straight overhead; 6 falling, arms and legs spread; 7 both arms raised in celebration; 8 crouched down low, defeated. Every pose faces three-quarter right; never mirror a frame. In every cell the point between the feet is at x=256, y=460; airborne poses hang from that same point. Identical character scale in all 8 cells, sized like the Wraith: in idle the top of the hood is at about y=75 and the figure is about 255 px wide. The crouch must be shorter than idle. At least 30 px empty margin to every cell edge. Flat pure green #00FF00 background filling every cell, no gradient, no ground shadow, no motion blur, no text, no grid lines.
```

### 5B. Climb strip  →  `wolf-void-climb.png`

```text
The exact same Void Wolf from the poses sheet, seen from directly behind, climbing a ladder (the ladder itself is NOT drawn). Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, hot magenta #f43fba, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing magenta eyes with a soft bloom in a shadowed face. Wears a Void hood worn over the ruff, the pointed ears through slits and the muzzle out of the opening. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons.

Output ONE strip, exactly 3072 x 512 px: 6 cells of 512 x 512 in a row, like the attached wraith-climb-192.png. Back of the hood centred, the hot magenta chevron visible across the shoulders. Hand-over-hand cycle that travels upward, never bounces: 1 right hand high gripping, left hand at chest; 2 left hand rising past the right; 3 left hand high gripping, right hand low; 4 right hand rising; 5 right hand passing the left; 6 right hand nearly high again, left hand dropping to chest. Legs step opposite to the hands. All six frames clearly different; no frame repeats or mirrors another. Head and torso stay centred with under 2 px bob. Feet point at x=256, y=460 in every cell, same scale as the poses sheet. Flat pure green #00FF00 background, no ground shadow, no text.
```

### 5C. Avatar bust  →  `wolf-void.webp`

```text
Head-and-shoulders bust of the same Void Wolf, three-quarter front view facing slightly right, framed exactly like the attached wraith.webp: the hood and pauldrons fill a square edge to edge, cut off at the chest. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, hot magenta #f43fba, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing magenta eyes with a soft bloom in a shadowed face. Wears a Void hood worn over the ruff, the pointed ears through slits and the muzzle out of the opening. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. The eyes are the brightest point. Exactly 1024 x 1024 px, real transparent background (alpha channel, not a painted checkerboard), no text.
```

### 5D. Store showcase (optional)  →  `wolf-void-showcase.png`

```text
Full-body hero render of the same Void Wolf, three-quarter front view, confident idle stance, arms slightly out, centred with the feet in the bottom 10% of the frame. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, hot magenta #f43fba, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing magenta eyes with a soft bloom in a shadowed face. Wears a Void hood worn over the ruff, the pointed ears through slits and the muzzle out of the opening. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. Add a warm orange rim light from behind, as if standing in front of a lava field. Exactly 1536 x 1536 px, real transparent background, no pedestal, no text.
```

### 5E. Turntable (optional)  →  `wolf-void-turn-0.png` … `-turn-7.png`

```text
Eight separate 1024 x 1024 renders of the exact same Void Wolf in the same idle pose, rotated around its vertical axis in 45 degree steps: 0 front, 1 front-right, 2 right, 3 back-right, 4 back, 5 back-left, 6 left, 7 front-left. Same scale, same foot position, same lighting in all eight. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, hot magenta #f43fba, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing magenta eyes with a soft bloom in a shadowed face. Wears a Void hood worn over the ruff, the pointed ears through slits and the muzzle out of the opening. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. Real transparent background, no text.
```


---

## 6. Void Otter  (`otter-void`)

**Accent:** bright blue `#3595f2` · **Keying background:** pure magenta #FF00FF · **Character:** an otter warrior with a big round head, small rounded ears, a cream faceted muzzle with thin whiskers and a thick tapering tail.

**Upload with every prompt below:** `references/wraith-poses-192.png`, `references/wraith.webp`, `references/otter.webp`, `references/otter-poses-192.png`  (climb prompt: also `references/wraith-climb-192.png`)

**Return these files** to `paid-characters/art/otter-void/`:

| File | Size | Needed by the game? |
|---|---|---|
| `otter-void-poses.png` | 2048 × 1024 | Yes |
| `otter-void-climb.png` | 3072 × 512 | Yes |
| `otter-void.webp` (or .png) | 1024 × 1024 | Yes |
| `otter-void-showcase.png` | 1536 × 1536 | Optional |
| `otter-void-turn-0.png` … `-turn-7.png` | 1024 × 1024 each | Optional |

### 6A. Poses sheet  →  `otter-void-poses.png`

```text
Make the VOID OTTER: the Otter from the attached otter.webp and otter-poses-192.png, redesigned in the Wraith's look. Identity to keep: an otter warrior with a big round head, small rounded ears, a cream faceted muzzle with thin whiskers and a thick tapering tail. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, bright blue #3595f2, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing blue eyes with a soft bloom in a shadowed face. Wears a soft rounded Void cowl, the cream muzzle and whiskers out of the opening. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons.

Output ONE sprite sheet, exactly 2048 x 1024 px: 4 columns x 2 rows of 512 x 512 cells, one figure per cell, nothing crossing a cell edge. Same poses, order and framing as the attached wraith-poses-192.png. Left to right, top row first: 1 idle standing; 2 running stride, near leg forward and far leg back; 3 running stride, near leg back and far leg forward (the mirror of 2); 4 right arm reaching straight overhead; 5 left arm reaching straight overhead; 6 falling, arms and legs spread; 7 both arms raised in celebration; 8 crouched down low, defeated. Every pose faces three-quarter right; never mirror a frame. In every cell the point between the feet is at x=256, y=460; airborne poses hang from that same point. Identical character scale in all 8 cells, sized like the Wraith: in idle the top of the hood is at about y=75 and the figure is about 255 px wide. The crouch must be shorter than idle. At least 30 px empty margin to every cell edge. Flat pure magenta #FF00FF background filling every cell, no gradient, no ground shadow, no motion blur, no text, no grid lines.
```

### 6B. Climb strip  →  `otter-void-climb.png`

```text
The exact same Void Otter from the poses sheet, seen from directly behind, climbing a ladder (the ladder itself is NOT drawn). Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, bright blue #3595f2, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing blue eyes with a soft bloom in a shadowed face. Wears a soft rounded Void cowl, the cream muzzle and whiskers out of the opening. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons.

Output ONE strip, exactly 3072 x 512 px: 6 cells of 512 x 512 in a row, like the attached wraith-climb-192.png. Back of the hood centred, the bright blue chevron visible across the shoulders. Hand-over-hand cycle that travels upward, never bounces: 1 right hand high gripping, left hand at chest; 2 left hand rising past the right; 3 left hand high gripping, right hand low; 4 right hand rising; 5 right hand passing the left; 6 right hand nearly high again, left hand dropping to chest. Legs step opposite to the hands. All six frames clearly different; no frame repeats or mirrors another. Head and torso stay centred with under 2 px bob. Feet point at x=256, y=460 in every cell, same scale as the poses sheet. Flat pure magenta #FF00FF background, no ground shadow, no text.
```

### 6C. Avatar bust  →  `otter-void.webp`

```text
Head-and-shoulders bust of the same Void Otter, three-quarter front view facing slightly right, framed exactly like the attached wraith.webp: the hood and pauldrons fill a square edge to edge, cut off at the chest. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, bright blue #3595f2, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing blue eyes with a soft bloom in a shadowed face. Wears a soft rounded Void cowl, the cream muzzle and whiskers out of the opening. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. The eyes are the brightest point. Exactly 1024 x 1024 px, real transparent background (alpha channel, not a painted checkerboard), no text.
```

### 6D. Store showcase (optional)  →  `otter-void-showcase.png`

```text
Full-body hero render of the same Void Otter, three-quarter front view, confident idle stance, arms slightly out, centred with the feet in the bottom 10% of the frame. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, bright blue #3595f2, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing blue eyes with a soft bloom in a shadowed face. Wears a soft rounded Void cowl, the cream muzzle and whiskers out of the opening. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. Add a warm orange rim light from behind, as if standing in front of a lava field. Exactly 1536 x 1536 px, real transparent background, no pedestal, no text.
```

### 6E. Turntable (optional)  →  `otter-void-turn-0.png` … `-turn-7.png`

```text
Eight separate 1024 x 1024 renders of the exact same Void Otter in the same idle pose, rotated around its vertical axis in 45 degree steps: 0 front, 1 front-right, 2 right, 3 back-right, 4 back, 5 back-left, 6 left, 7 front-left. Same scale, same foot position, same lighting in all eight. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, bright blue #3595f2, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing blue eyes with a soft bloom in a shadowed face. Wears a soft rounded Void cowl, the cream muzzle and whiskers out of the opening. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. Real transparent background, no text.
```


---

## 7. Void Heron  (`heron-void`)

**Accent:** cobalt `#3b93e6` · **Keying background:** pure magenta #FF00FF · **Character:** a heron warrior with an oversized white-and-grey heron head, a long golden beak pointing right, a black eye stripe, swept-back crest plumes and slender legs.

**Upload with every prompt below:** `references/wraith-poses-192.png`, `references/wraith.webp`, `references/heron.webp`, `references/heron-poses-192.png`  (climb prompt: also `references/wraith-climb-192.png`)

**Return these files** to `paid-characters/art/heron-void/`:

| File | Size | Needed by the game? |
|---|---|---|
| `heron-void-poses.png` | 2048 × 1024 | Yes |
| `heron-void-climb.png` | 3072 × 512 | Yes |
| `heron-void.webp` (or .png) | 1024 × 1024 | Yes |
| `heron-void-showcase.png` | 1536 × 1536 | Optional |
| `heron-void-turn-0.png` … `-turn-7.png` | 1024 × 1024 each | Optional |

### 7A. Poses sheet  →  `heron-void-poses.png`

```text
Make the VOID HERON: the Heron from the attached heron.webp and heron-poses-192.png, redesigned in the Wraith's look. Identity to keep: a heron warrior with an oversized white-and-grey heron head, a long golden beak pointing right, a black eye stripe, swept-back crest plumes and slender legs. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, cobalt #3b93e6, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing blue eyes with a soft bloom in a shadowed face. Wears a tall narrow Void hood, the long golden beak out of the opening and the crest plumes through the top. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons.

Output ONE sprite sheet, exactly 2048 x 1024 px: 4 columns x 2 rows of 512 x 512 cells, one figure per cell, nothing crossing a cell edge. Same poses, order and framing as the attached wraith-poses-192.png. Left to right, top row first: 1 idle standing; 2 running stride, near leg forward and far leg back; 3 running stride, near leg back and far leg forward (the mirror of 2); 4 right arm reaching straight overhead; 5 left arm reaching straight overhead; 6 falling, arms and legs spread; 7 both arms raised in celebration; 8 crouched down low, defeated. Every pose faces three-quarter right; never mirror a frame. In every cell the point between the feet is at x=256, y=460; airborne poses hang from that same point. Identical character scale in all 8 cells, sized like the Wraith: in idle the top of the hood is at about y=75 and the figure is about 255 px wide. The crouch must be shorter than idle. At least 30 px empty margin to every cell edge. Flat pure magenta #FF00FF background filling every cell, no gradient, no ground shadow, no motion blur, no text, no grid lines.
```

### 7B. Climb strip  →  `heron-void-climb.png`

```text
The exact same Void Heron from the poses sheet, seen from directly behind, climbing a ladder (the ladder itself is NOT drawn). Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, cobalt #3b93e6, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing blue eyes with a soft bloom in a shadowed face. Wears a tall narrow Void hood, the long golden beak out of the opening and the crest plumes through the top. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons.

Output ONE strip, exactly 3072 x 512 px: 6 cells of 512 x 512 in a row, like the attached wraith-climb-192.png. Back of the hood centred, the cobalt chevron visible across the shoulders. Hand-over-hand cycle that travels upward, never bounces: 1 right hand high gripping, left hand at chest; 2 left hand rising past the right; 3 left hand high gripping, right hand low; 4 right hand rising; 5 right hand passing the left; 6 right hand nearly high again, left hand dropping to chest. Legs step opposite to the hands. All six frames clearly different; no frame repeats or mirrors another. Head and torso stay centred with under 2 px bob. Feet point at x=256, y=460 in every cell, same scale as the poses sheet. Flat pure magenta #FF00FF background, no ground shadow, no text.
```

### 7C. Avatar bust  →  `heron-void.webp`

```text
Head-and-shoulders bust of the same Void Heron, three-quarter front view facing slightly right, framed exactly like the attached wraith.webp: the hood and pauldrons fill a square edge to edge, cut off at the chest. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, cobalt #3b93e6, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing blue eyes with a soft bloom in a shadowed face. Wears a tall narrow Void hood, the long golden beak out of the opening and the crest plumes through the top. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. The eyes are the brightest point. Exactly 1024 x 1024 px, real transparent background (alpha channel, not a painted checkerboard), no text.
```

### 7D. Store showcase (optional)  →  `heron-void-showcase.png`

```text
Full-body hero render of the same Void Heron, three-quarter front view, confident idle stance, arms slightly out, centred with the feet in the bottom 10% of the frame. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, cobalt #3b93e6, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing blue eyes with a soft bloom in a shadowed face. Wears a tall narrow Void hood, the long golden beak out of the opening and the crest plumes through the top. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. Add a warm orange rim light from behind, as if standing in front of a lava field. Exactly 1536 x 1536 px, real transparent background, no pedestal, no text.
```

### 7E. Turntable (optional)  →  `heron-void-turn-0.png` … `-turn-7.png`

```text
Eight separate 1024 x 1024 renders of the exact same Void Heron in the same idle pose, rotated around its vertical axis in 45 degree steps: 0 front, 1 front-right, 2 right, 3 back-right, 4 back, 5 back-left, 6 left, 7 front-left. Same scale, same foot position, same lighting in all eight. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, cobalt #3b93e6, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing blue eyes with a soft bloom in a shadowed face. Wears a tall narrow Void hood, the long golden beak out of the opening and the crest plumes through the top. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. Real transparent background, no text.
```


---

## 8. Void Yak  (`yak-void`)

**Accent:** crimson `#ea4239` · **Keying background:** pure magenta #FF00FF · **Character:** a yak warrior with a big bovine head, dark charcoal face and muzzle, two wide curved tan horns faceted like bone and a shaggy mane of angular crimson shards.

**Upload with every prompt below:** `references/wraith-poses-192.png`, `references/wraith.webp`, `references/yak.webp`, `references/yak-poses-192.png`  (climb prompt: also `references/wraith-climb-192.png`)

**Return these files** to `paid-characters/art/yak-void/`:

| File | Size | Needed by the game? |
|---|---|---|
| `yak-void-poses.png` | 2048 × 1024 | Yes |
| `yak-void-climb.png` | 3072 × 512 | Yes |
| `yak-void.webp` (or .png) | 1024 × 1024 | Yes |
| `yak-void-showcase.png` | 1536 × 1536 | Optional |
| `yak-void-turn-0.png` … `-turn-7.png` | 1024 × 1024 each | Optional |

### 8A. Poses sheet  →  `yak-void-poses.png`

```text
Make the VOID YAK: the Yak from the attached yak.webp and yak-poses-192.png, redesigned in the Wraith's look. Identity to keep: a yak warrior with a big bovine head, dark charcoal face and muzzle, two wide curved tan horns faceted like bone and a shaggy mane of angular crimson shards. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, crimson #ea4239, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing orange-red eyes with a soft bloom in a shadowed face. Wears a heavy Void hood over the mane, the two curved horns breaking out through the sides. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons.

Output ONE sprite sheet, exactly 2048 x 1024 px: 4 columns x 2 rows of 512 x 512 cells, one figure per cell, nothing crossing a cell edge. Same poses, order and framing as the attached wraith-poses-192.png. Left to right, top row first: 1 idle standing; 2 running stride, near leg forward and far leg back; 3 running stride, near leg back and far leg forward (the mirror of 2); 4 right arm reaching straight overhead; 5 left arm reaching straight overhead; 6 falling, arms and legs spread; 7 both arms raised in celebration; 8 crouched down low, defeated. Every pose faces three-quarter right; never mirror a frame. In every cell the point between the feet is at x=256, y=460; airborne poses hang from that same point. Identical character scale in all 8 cells, sized like the Wraith: in idle the top of the hood is at about y=75 and the figure is about 255 px wide. The crouch must be shorter than idle. At least 30 px empty margin to every cell edge. Flat pure magenta #FF00FF background filling every cell, no gradient, no ground shadow, no motion blur, no text, no grid lines.
```

### 8B. Climb strip  →  `yak-void-climb.png`

```text
The exact same Void Yak from the poses sheet, seen from directly behind, climbing a ladder (the ladder itself is NOT drawn). Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, crimson #ea4239, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing orange-red eyes with a soft bloom in a shadowed face. Wears a heavy Void hood over the mane, the two curved horns breaking out through the sides. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons.

Output ONE strip, exactly 3072 x 512 px: 6 cells of 512 x 512 in a row, like the attached wraith-climb-192.png. Back of the hood centred, the crimson chevron visible across the shoulders. Hand-over-hand cycle that travels upward, never bounces: 1 right hand high gripping, left hand at chest; 2 left hand rising past the right; 3 left hand high gripping, right hand low; 4 right hand rising; 5 right hand passing the left; 6 right hand nearly high again, left hand dropping to chest. Legs step opposite to the hands. All six frames clearly different; no frame repeats or mirrors another. Head and torso stay centred with under 2 px bob. Feet point at x=256, y=460 in every cell, same scale as the poses sheet. Flat pure magenta #FF00FF background, no ground shadow, no text.
```

### 8C. Avatar bust  →  `yak-void.webp`

```text
Head-and-shoulders bust of the same Void Yak, three-quarter front view facing slightly right, framed exactly like the attached wraith.webp: the hood and pauldrons fill a square edge to edge, cut off at the chest. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, crimson #ea4239, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing orange-red eyes with a soft bloom in a shadowed face. Wears a heavy Void hood over the mane, the two curved horns breaking out through the sides. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. The eyes are the brightest point. Exactly 1024 x 1024 px, real transparent background (alpha channel, not a painted checkerboard), no text.
```

### 8D. Store showcase (optional)  →  `yak-void-showcase.png`

```text
Full-body hero render of the same Void Yak, three-quarter front view, confident idle stance, arms slightly out, centred with the feet in the bottom 10% of the frame. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, crimson #ea4239, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing orange-red eyes with a soft bloom in a shadowed face. Wears a heavy Void hood over the mane, the two curved horns breaking out through the sides. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. Add a warm orange rim light from behind, as if standing in front of a lava field. Exactly 1536 x 1536 px, real transparent background, no pedestal, no text.
```

### 8E. Turntable (optional)  →  `yak-void-turn-0.png` … `-turn-7.png`

```text
Eight separate 1024 x 1024 renders of the exact same Void Yak in the same idle pose, rotated around its vertical axis in 45 degree steps: 0 front, 1 front-right, 2 right, 3 back-right, 4 back, 5 back-left, 6 left, 7 front-left. Same scale, same foot position, same lighting in all eight. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, crimson #ea4239, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing orange-red eyes with a soft bloom in a shadowed face. Wears a heavy Void hood over the mane, the two curved horns breaking out through the sides. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. Real transparent background, no text.
```


---

## 9. Void Mantis  (`mantis-void`)

**Accent:** lime `#b3f027` · **Keying background:** pure magenta #FF00FF · **Character:** an insect warrior with a big triangular mantis head, two long swept-back antennae, angular carapace plates and folded blade forearms.

**Upload with every prompt below:** `references/wraith-poses-192.png`, `references/wraith.webp`, `references/mantis.webp`, `references/mantis-poses-192.png`  (climb prompt: also `references/wraith-climb-192.png`)

**Return these files** to `paid-characters/art/mantis-void/`:

| File | Size | Needed by the game? |
|---|---|---|
| `mantis-void-poses.png` | 2048 × 1024 | Yes |
| `mantis-void-climb.png` | 3072 × 512 | Yes |
| `mantis-void.webp` (or .png) | 1024 × 1024 | Yes |
| `mantis-void-showcase.png` | 1536 × 1536 | Optional |
| `mantis-void-turn-0.png` … `-turn-7.png` | 1024 × 1024 each | Optional |

### 9A. Poses sheet  →  `mantis-void-poses.png`

```text
Make the VOID MANTIS: the Mantis from the attached mantis.webp and mantis-poses-192.png, redesigned in the Wraith's look. Identity to keep: an insect warrior with a big triangular mantis head, two long swept-back antennae, angular carapace plates and folded blade forearms. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, lime #b3f027, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Two large faceted glowing lime compound eyes with a soft bloom in a shadowed face. Wears a carapace-shaped Void hood, the antennae out through the top and the compound eyes glowing inside. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons.

Output ONE sprite sheet, exactly 2048 x 1024 px: 4 columns x 2 rows of 512 x 512 cells, one figure per cell, nothing crossing a cell edge. Same poses, order and framing as the attached wraith-poses-192.png. Left to right, top row first: 1 idle standing; 2 running stride, near leg forward and far leg back; 3 running stride, near leg back and far leg forward (the mirror of 2); 4 right arm reaching straight overhead; 5 left arm reaching straight overhead; 6 falling, arms and legs spread; 7 both arms raised in celebration; 8 crouched down low, defeated. Every pose faces three-quarter right; never mirror a frame. In every cell the point between the feet is at x=256, y=460; airborne poses hang from that same point. Identical character scale in all 8 cells, sized like the Wraith: in idle the top of the hood is at about y=75 and the figure is about 255 px wide. The crouch must be shorter than idle. At least 30 px empty margin to every cell edge. Flat pure magenta #FF00FF background filling every cell, no gradient, no ground shadow, no motion blur, no text, no grid lines.
```

### 9B. Climb strip  →  `mantis-void-climb.png`

```text
The exact same Void Mantis from the poses sheet, seen from directly behind, climbing a ladder (the ladder itself is NOT drawn). Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, lime #b3f027, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Two large faceted glowing lime compound eyes with a soft bloom in a shadowed face. Wears a carapace-shaped Void hood, the antennae out through the top and the compound eyes glowing inside. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons.

Output ONE strip, exactly 3072 x 512 px: 6 cells of 512 x 512 in a row, like the attached wraith-climb-192.png. Back of the hood centred, the lime chevron visible across the shoulders. Hand-over-hand cycle that travels upward, never bounces: 1 right hand high gripping, left hand at chest; 2 left hand rising past the right; 3 left hand high gripping, right hand low; 4 right hand rising; 5 right hand passing the left; 6 right hand nearly high again, left hand dropping to chest. Legs step opposite to the hands. All six frames clearly different; no frame repeats or mirrors another. Head and torso stay centred with under 2 px bob. Feet point at x=256, y=460 in every cell, same scale as the poses sheet. Flat pure magenta #FF00FF background, no ground shadow, no text.
```

### 9C. Avatar bust  →  `mantis-void.webp`

```text
Head-and-shoulders bust of the same Void Mantis, three-quarter front view facing slightly right, framed exactly like the attached wraith.webp: the hood and pauldrons fill a square edge to edge, cut off at the chest. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, lime #b3f027, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Two large faceted glowing lime compound eyes with a soft bloom in a shadowed face. Wears a carapace-shaped Void hood, the antennae out through the top and the compound eyes glowing inside. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. The eyes are the brightest point. Exactly 1024 x 1024 px, real transparent background (alpha channel, not a painted checkerboard), no text.
```

### 9D. Store showcase (optional)  →  `mantis-void-showcase.png`

```text
Full-body hero render of the same Void Mantis, three-quarter front view, confident idle stance, arms slightly out, centred with the feet in the bottom 10% of the frame. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, lime #b3f027, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Two large faceted glowing lime compound eyes with a soft bloom in a shadowed face. Wears a carapace-shaped Void hood, the antennae out through the top and the compound eyes glowing inside. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. Add a warm orange rim light from behind, as if standing in front of a lava field. Exactly 1536 x 1536 px, real transparent background, no pedestal, no text.
```

### 9E. Turntable (optional)  →  `mantis-void-turn-0.png` … `-turn-7.png`

```text
Eight separate 1024 x 1024 renders of the exact same Void Mantis in the same idle pose, rotated around its vertical axis in 45 degree steps: 0 front, 1 front-right, 2 right, 3 back-right, 4 back, 5 back-left, 6 left, 7 front-left. Same scale, same foot position, same lighting in all eight. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, lime #b3f027, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Two large faceted glowing lime compound eyes with a soft bloom in a shadowed face. Wears a carapace-shaped Void hood, the antennae out through the top and the compound eyes glowing inside. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. Real transparent background, no text.
```


---

## 10. Void Cobra  (`cobra-void`)

**Accent:** electric blue `#1982f5` · **Keying background:** pure magenta #FF00FF · **Character:** a cobra warrior standing upright on two short legs, a big angular head with a flared hood, a short pointed snout and a segmented belly plate of stacked chevrons.

**Upload with every prompt below:** `references/wraith-poses-192.png`, `references/wraith.webp`, `references/cobra.webp`, `references/cobra-poses-192.png`  (climb prompt: also `references/wraith-climb-192.png`)

**Return these files** to `paid-characters/art/cobra-void/`:

| File | Size | Needed by the game? |
|---|---|---|
| `cobra-void-poses.png` | 2048 × 1024 | Yes |
| `cobra-void-climb.png` | 3072 × 512 | Yes |
| `cobra-void.webp` (or .png) | 1024 × 1024 | Yes |
| `cobra-void-showcase.png` | 1536 × 1536 | Optional |
| `cobra-void-turn-0.png` … `-turn-7.png` | 1024 × 1024 each | Optional |

### 10A. Poses sheet  →  `cobra-void-poses.png`

```text
Make the VOID COBRA: the Cobra from the attached cobra.webp and cobra-poses-192.png, redesigned in the Wraith's look. Identity to keep: a cobra warrior standing upright on two short legs, a big angular head with a flared hood, a short pointed snout and a segmented belly plate of stacked chevrons. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, electric blue #1982f5, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing blue eyes with a soft bloom in a shadowed face. Wears its own flared cobra hood rebuilt as the Void hood: black faceted shards fanned behind the head with electric-blue edges. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons.

Output ONE sprite sheet, exactly 2048 x 1024 px: 4 columns x 2 rows of 512 x 512 cells, one figure per cell, nothing crossing a cell edge. Same poses, order and framing as the attached wraith-poses-192.png. Left to right, top row first: 1 idle standing; 2 running stride, near leg forward and far leg back; 3 running stride, near leg back and far leg forward (the mirror of 2); 4 right arm reaching straight overhead; 5 left arm reaching straight overhead; 6 falling, arms and legs spread; 7 both arms raised in celebration; 8 crouched down low, defeated. Every pose faces three-quarter right; never mirror a frame. In every cell the point between the feet is at x=256, y=460; airborne poses hang from that same point. Identical character scale in all 8 cells, sized like the Wraith: in idle the top of the hood is at about y=75 and the figure is about 255 px wide. The crouch must be shorter than idle. At least 30 px empty margin to every cell edge. Flat pure magenta #FF00FF background filling every cell, no gradient, no ground shadow, no motion blur, no text, no grid lines.
```

### 10B. Climb strip  →  `cobra-void-climb.png`

```text
The exact same Void Cobra from the poses sheet, seen from directly behind, climbing a ladder (the ladder itself is NOT drawn). Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, electric blue #1982f5, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing blue eyes with a soft bloom in a shadowed face. Wears its own flared cobra hood rebuilt as the Void hood: black faceted shards fanned behind the head with electric-blue edges. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons.

Output ONE strip, exactly 3072 x 512 px: 6 cells of 512 x 512 in a row, like the attached wraith-climb-192.png. Back of the hood centred, the electric blue chevron visible across the shoulders. Hand-over-hand cycle that travels upward, never bounces: 1 right hand high gripping, left hand at chest; 2 left hand rising past the right; 3 left hand high gripping, right hand low; 4 right hand rising; 5 right hand passing the left; 6 right hand nearly high again, left hand dropping to chest. Legs step opposite to the hands. All six frames clearly different; no frame repeats or mirrors another. Head and torso stay centred with under 2 px bob. Feet point at x=256, y=460 in every cell, same scale as the poses sheet. Flat pure magenta #FF00FF background, no ground shadow, no text.
```

### 10C. Avatar bust  →  `cobra-void.webp`

```text
Head-and-shoulders bust of the same Void Cobra, three-quarter front view facing slightly right, framed exactly like the attached wraith.webp: the hood and pauldrons fill a square edge to edge, cut off at the chest. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, electric blue #1982f5, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing blue eyes with a soft bloom in a shadowed face. Wears its own flared cobra hood rebuilt as the Void hood: black faceted shards fanned behind the head with electric-blue edges. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. The eyes are the brightest point. Exactly 1024 x 1024 px, real transparent background (alpha channel, not a painted checkerboard), no text.
```

### 10D. Store showcase (optional)  →  `cobra-void-showcase.png`

```text
Full-body hero render of the same Void Cobra, three-quarter front view, confident idle stance, arms slightly out, centred with the feet in the bottom 10% of the frame. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, electric blue #1982f5, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing blue eyes with a soft bloom in a shadowed face. Wears its own flared cobra hood rebuilt as the Void hood: black faceted shards fanned behind the head with electric-blue edges. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. Add a warm orange rim light from behind, as if standing in front of a lava field. Exactly 1536 x 1536 px, real transparent background, no pedestal, no text.
```

### 10E. Turntable (optional)  →  `cobra-void-turn-0.png` … `-turn-7.png`

```text
Eight separate 1024 x 1024 renders of the exact same Void Cobra in the same idle pose, rotated around its vertical axis in 45 degree steps: 0 front, 1 front-right, 2 right, 3 back-right, 4 back, 5 back-left, 6 left, 7 front-left. Same scale, same foot position, same lighting in all eight. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, electric blue #1982f5, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing blue eyes with a soft bloom in a shadowed face. Wears its own flared cobra hood rebuilt as the Void hood: black faceted shards fanned behind the head with electric-blue edges. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. Real transparent background, no text.
```


---

## 11. Void Badger  (`badger-void`)

**Accent:** violet `#be4df4` · **Keying background:** pure green #00FF00 · **Character:** a badger brawler with a big wedge-shaped head, small round ears, a bold white stripe from the nose over the crown, black eye masks, a stocky barrel torso and blunt claws.

**Upload with every prompt below:** `references/wraith-poses-192.png`, `references/wraith.webp`, `references/badger.webp`, `references/badger-poses-192.png`  (climb prompt: also `references/wraith-climb-192.png`)

**Return these files** to `paid-characters/art/badger-void/`:

| File | Size | Needed by the game? |
|---|---|---|
| `badger-void-poses.png` | 2048 × 1024 | Yes |
| `badger-void-climb.png` | 3072 × 512 | Yes |
| `badger-void.webp` (or .png) | 1024 × 1024 | Yes |
| `badger-void-showcase.png` | 1536 × 1536 | Optional |
| `badger-void-turn-0.png` … `-turn-7.png` | 1024 × 1024 each | Optional |

### 11A. Poses sheet  →  `badger-void-poses.png`

```text
Make the VOID BADGER: the Badger from the attached badger.webp and badger-poses-192.png, redesigned in the Wraith's look. Identity to keep: a badger brawler with a big wedge-shaped head, small round ears, a bold white stripe from the nose over the crown, black eye masks, a stocky barrel torso and blunt claws. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, violet #be4df4, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing violet eyes with a soft bloom in a shadowed face. Wears a Void hood pushed back far enough to show the white crown stripe, ears through slits. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons.

Output ONE sprite sheet, exactly 2048 x 1024 px: 4 columns x 2 rows of 512 x 512 cells, one figure per cell, nothing crossing a cell edge. Same poses, order and framing as the attached wraith-poses-192.png. Left to right, top row first: 1 idle standing; 2 running stride, near leg forward and far leg back; 3 running stride, near leg back and far leg forward (the mirror of 2); 4 right arm reaching straight overhead; 5 left arm reaching straight overhead; 6 falling, arms and legs spread; 7 both arms raised in celebration; 8 crouched down low, defeated. Every pose faces three-quarter right; never mirror a frame. In every cell the point between the feet is at x=256, y=460; airborne poses hang from that same point. Identical character scale in all 8 cells, sized like the Wraith: in idle the top of the hood is at about y=75 and the figure is about 255 px wide. The crouch must be shorter than idle. At least 30 px empty margin to every cell edge. Flat pure green #00FF00 background filling every cell, no gradient, no ground shadow, no motion blur, no text, no grid lines.
```

### 11B. Climb strip  →  `badger-void-climb.png`

```text
The exact same Void Badger from the poses sheet, seen from directly behind, climbing a ladder (the ladder itself is NOT drawn). Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, violet #be4df4, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing violet eyes with a soft bloom in a shadowed face. Wears a Void hood pushed back far enough to show the white crown stripe, ears through slits. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons.

Output ONE strip, exactly 3072 x 512 px: 6 cells of 512 x 512 in a row, like the attached wraith-climb-192.png. Back of the hood centred, the violet chevron visible across the shoulders. Hand-over-hand cycle that travels upward, never bounces: 1 right hand high gripping, left hand at chest; 2 left hand rising past the right; 3 left hand high gripping, right hand low; 4 right hand rising; 5 right hand passing the left; 6 right hand nearly high again, left hand dropping to chest. Legs step opposite to the hands. All six frames clearly different; no frame repeats or mirrors another. Head and torso stay centred with under 2 px bob. Feet point at x=256, y=460 in every cell, same scale as the poses sheet. Flat pure green #00FF00 background, no ground shadow, no text.
```

### 11C. Avatar bust  →  `badger-void.webp`

```text
Head-and-shoulders bust of the same Void Badger, three-quarter front view facing slightly right, framed exactly like the attached wraith.webp: the hood and pauldrons fill a square edge to edge, cut off at the chest. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, violet #be4df4, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing violet eyes with a soft bloom in a shadowed face. Wears a Void hood pushed back far enough to show the white crown stripe, ears through slits. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. The eyes are the brightest point. Exactly 1024 x 1024 px, real transparent background (alpha channel, not a painted checkerboard), no text.
```

### 11D. Store showcase (optional)  →  `badger-void-showcase.png`

```text
Full-body hero render of the same Void Badger, three-quarter front view, confident idle stance, arms slightly out, centred with the feet in the bottom 10% of the frame. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, violet #be4df4, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing violet eyes with a soft bloom in a shadowed face. Wears a Void hood pushed back far enough to show the white crown stripe, ears through slits. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. Add a warm orange rim light from behind, as if standing in front of a lava field. Exactly 1536 x 1536 px, real transparent background, no pedestal, no text.
```

### 11E. Turntable (optional)  →  `badger-void-turn-0.png` … `-turn-7.png`

```text
Eight separate 1024 x 1024 renders of the exact same Void Badger in the same idle pose, rotated around its vertical axis in 45 degree steps: 0 front, 1 front-right, 2 right, 3 back-right, 4 back, 5 back-left, 6 left, 7 front-left. Same scale, same foot position, same lighting in all eight. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, violet #be4df4, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing violet eyes with a soft bloom in a shadowed face. Wears a Void hood pushed back far enough to show the white crown stripe, ears through slits. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. Real transparent background, no text.
```


---

## 12. Void Falcon  (`falcon-void`)

**Accent:** burnt orange `#f29842` · **Keying background:** pure magenta #FF00FF · **Character:** a falcon warrior with a cream face mask around the eye, a short hooked gold beak, layered feather pauldrons and small folded wings.

**Upload with every prompt below:** `references/wraith-poses-192.png`, `references/wraith.webp`, `references/falcon.webp`, `references/falcon-poses-192.png`  (climb prompt: also `references/wraith-climb-192.png`)

**Return these files** to `paid-characters/art/falcon-void/`:

| File | Size | Needed by the game? |
|---|---|---|
| `falcon-void-poses.png` | 2048 × 1024 | Yes |
| `falcon-void-climb.png` | 3072 × 512 | Yes |
| `falcon-void.webp` (or .png) | 1024 × 1024 | Yes |
| `falcon-void-showcase.png` | 1536 × 1536 | Optional |
| `falcon-void-turn-0.png` … `-turn-7.png` | 1024 × 1024 each | Optional |

### 12A. Poses sheet  →  `falcon-void-poses.png`

```text
Make the VOID FALCON: the Falcon from the attached falcon.webp and falcon-poses-192.png, redesigned in the Wraith's look. Identity to keep: a falcon warrior with a cream face mask around the eye, a short hooked gold beak, layered feather pauldrons and small folded wings. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, burnt orange #f29842, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. A glowing amber eye with a soft bloom in a shadowed face. Wears a beaked Void hood, the cream mask visible inside the opening and the gold beak jutting out. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons.

Output ONE sprite sheet, exactly 2048 x 1024 px: 4 columns x 2 rows of 512 x 512 cells, one figure per cell, nothing crossing a cell edge. Same poses, order and framing as the attached wraith-poses-192.png. Left to right, top row first: 1 idle standing; 2 running stride, near leg forward and far leg back; 3 running stride, near leg back and far leg forward (the mirror of 2); 4 right arm reaching straight overhead; 5 left arm reaching straight overhead; 6 falling, arms and legs spread; 7 both arms raised in celebration; 8 crouched down low, defeated. Every pose faces three-quarter right; never mirror a frame. In every cell the point between the feet is at x=256, y=460; airborne poses hang from that same point. Identical character scale in all 8 cells, sized like the Wraith: in idle the top of the hood is at about y=75 and the figure is about 255 px wide. The crouch must be shorter than idle. At least 30 px empty margin to every cell edge. Flat pure magenta #FF00FF background filling every cell, no gradient, no ground shadow, no motion blur, no text, no grid lines.
```

### 12B. Climb strip  →  `falcon-void-climb.png`

```text
The exact same Void Falcon from the poses sheet, seen from directly behind, climbing a ladder (the ladder itself is NOT drawn). Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, burnt orange #f29842, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. A glowing amber eye with a soft bloom in a shadowed face. Wears a beaked Void hood, the cream mask visible inside the opening and the gold beak jutting out. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons.

Output ONE strip, exactly 3072 x 512 px: 6 cells of 512 x 512 in a row, like the attached wraith-climb-192.png. Back of the hood centred, the burnt orange chevron visible across the shoulders. Hand-over-hand cycle that travels upward, never bounces: 1 right hand high gripping, left hand at chest; 2 left hand rising past the right; 3 left hand high gripping, right hand low; 4 right hand rising; 5 right hand passing the left; 6 right hand nearly high again, left hand dropping to chest. Legs step opposite to the hands. All six frames clearly different; no frame repeats or mirrors another. Head and torso stay centred with under 2 px bob. Feet point at x=256, y=460 in every cell, same scale as the poses sheet. Flat pure magenta #FF00FF background, no ground shadow, no text.
```

### 12C. Avatar bust  →  `falcon-void.webp`

```text
Head-and-shoulders bust of the same Void Falcon, three-quarter front view facing slightly right, framed exactly like the attached wraith.webp: the hood and pauldrons fill a square edge to edge, cut off at the chest. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, burnt orange #f29842, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. A glowing amber eye with a soft bloom in a shadowed face. Wears a beaked Void hood, the cream mask visible inside the opening and the gold beak jutting out. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. The eyes are the brightest point. Exactly 1024 x 1024 px, real transparent background (alpha channel, not a painted checkerboard), no text.
```

### 12D. Store showcase (optional)  →  `falcon-void-showcase.png`

```text
Full-body hero render of the same Void Falcon, three-quarter front view, confident idle stance, arms slightly out, centred with the feet in the bottom 10% of the frame. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, burnt orange #f29842, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. A glowing amber eye with a soft bloom in a shadowed face. Wears a beaked Void hood, the cream mask visible inside the opening and the gold beak jutting out. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. Add a warm orange rim light from behind, as if standing in front of a lava field. Exactly 1536 x 1536 px, real transparent background, no pedestal, no text.
```

### 12E. Turntable (optional)  →  `falcon-void-turn-0.png` … `-turn-7.png`

```text
Eight separate 1024 x 1024 renders of the exact same Void Falcon in the same idle pose, rotated around its vertical axis in 45 degree steps: 0 front, 1 front-right, 2 right, 3 back-right, 4 back, 5 back-left, 6 left, 7 front-left. Same scale, same foot position, same lighting in all eight. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, burnt orange #f29842, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. A glowing amber eye with a soft bloom in a shadowed face. Wears a beaked Void hood, the cream mask visible inside the opening and the gold beak jutting out. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. Real transparent background, no text.
```


---

## 13. Void Marmot  (`marmot-void`)

**Accent:** copper `#eaae74` · **Keying background:** pure magenta #FF00FF · **Character:** a marmot brawler with a big round head, small round ears, a cream muzzle with a small black nose, a stern brow and a stocky barrel body.

**Upload with every prompt below:** `references/wraith-poses-192.png`, `references/wraith.webp`, `references/marmot.webp`, `references/marmot-poses-192.png`  (climb prompt: also `references/wraith-climb-192.png`)

**Return these files** to `paid-characters/art/marmot-void/`:

| File | Size | Needed by the game? |
|---|---|---|
| `marmot-void-poses.png` | 2048 × 1024 | Yes |
| `marmot-void-climb.png` | 3072 × 512 | Yes |
| `marmot-void.webp` (or .png) | 1024 × 1024 | Yes |
| `marmot-void-showcase.png` | 1536 × 1536 | Optional |
| `marmot-void-turn-0.png` … `-turn-7.png` | 1024 × 1024 each | Optional |

### 13A. Poses sheet  →  `marmot-void-poses.png`

```text
Make the VOID MARMOT: the Marmot from the attached marmot.webp and marmot-poses-192.png, redesigned in the Wraith's look. Identity to keep: a marmot brawler with a big round head, small round ears, a cream muzzle with a small black nose, a stern brow and a stocky barrel body. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, copper #eaae74, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing amber eyes with a soft bloom in a shadowed face. Wears a rounded Void cowl, the cream muzzle out of the opening. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons.

Output ONE sprite sheet, exactly 2048 x 1024 px: 4 columns x 2 rows of 512 x 512 cells, one figure per cell, nothing crossing a cell edge. Same poses, order and framing as the attached wraith-poses-192.png. Left to right, top row first: 1 idle standing; 2 running stride, near leg forward and far leg back; 3 running stride, near leg back and far leg forward (the mirror of 2); 4 right arm reaching straight overhead; 5 left arm reaching straight overhead; 6 falling, arms and legs spread; 7 both arms raised in celebration; 8 crouched down low, defeated. Every pose faces three-quarter right; never mirror a frame. In every cell the point between the feet is at x=256, y=460; airborne poses hang from that same point. Identical character scale in all 8 cells, sized like the Wraith: in idle the top of the hood is at about y=75 and the figure is about 255 px wide. The crouch must be shorter than idle. At least 30 px empty margin to every cell edge. Flat pure magenta #FF00FF background filling every cell, no gradient, no ground shadow, no motion blur, no text, no grid lines.
```

### 13B. Climb strip  →  `marmot-void-climb.png`

```text
The exact same Void Marmot from the poses sheet, seen from directly behind, climbing a ladder (the ladder itself is NOT drawn). Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, copper #eaae74, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing amber eyes with a soft bloom in a shadowed face. Wears a rounded Void cowl, the cream muzzle out of the opening. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons.

Output ONE strip, exactly 3072 x 512 px: 6 cells of 512 x 512 in a row, like the attached wraith-climb-192.png. Back of the hood centred, the copper chevron visible across the shoulders. Hand-over-hand cycle that travels upward, never bounces: 1 right hand high gripping, left hand at chest; 2 left hand rising past the right; 3 left hand high gripping, right hand low; 4 right hand rising; 5 right hand passing the left; 6 right hand nearly high again, left hand dropping to chest. Legs step opposite to the hands. All six frames clearly different; no frame repeats or mirrors another. Head and torso stay centred with under 2 px bob. Feet point at x=256, y=460 in every cell, same scale as the poses sheet. Flat pure magenta #FF00FF background, no ground shadow, no text.
```

### 13C. Avatar bust  →  `marmot-void.webp`

```text
Head-and-shoulders bust of the same Void Marmot, three-quarter front view facing slightly right, framed exactly like the attached wraith.webp: the hood and pauldrons fill a square edge to edge, cut off at the chest. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, copper #eaae74, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing amber eyes with a soft bloom in a shadowed face. Wears a rounded Void cowl, the cream muzzle out of the opening. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. The eyes are the brightest point. Exactly 1024 x 1024 px, real transparent background (alpha channel, not a painted checkerboard), no text.
```

### 13D. Store showcase (optional)  →  `marmot-void-showcase.png`

```text
Full-body hero render of the same Void Marmot, three-quarter front view, confident idle stance, arms slightly out, centred with the feet in the bottom 10% of the frame. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, copper #eaae74, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing amber eyes with a soft bloom in a shadowed face. Wears a rounded Void cowl, the cream muzzle out of the opening. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. Add a warm orange rim light from behind, as if standing in front of a lava field. Exactly 1536 x 1536 px, real transparent background, no pedestal, no text.
```

### 13E. Turntable (optional)  →  `marmot-void-turn-0.png` … `-turn-7.png`

```text
Eight separate 1024 x 1024 renders of the exact same Void Marmot in the same idle pose, rotated around its vertical axis in 45 degree steps: 0 front, 1 front-right, 2 right, 3 back-right, 4 back, 5 back-left, 6 left, 7 front-left. Same scale, same foot position, same lighting in all eight. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, copper #eaae74, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing amber eyes with a soft bloom in a shadowed face. Wears a rounded Void cowl, the cream muzzle out of the opening. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. Real transparent background, no text.
```


---

## 14. Void Bison  (`bison-void`)

**Accent:** ember red `#f1442a` · **Keying background:** pure magenta #FF00FF · **Character:** a bison warrior with an oversized head, short tan curved horns, a dark muzzle, a massive shaggy mane, a raised shoulder hump and a stocky barrel torso wider than the Wraith's.

**Upload with every prompt below:** `references/wraith-poses-192.png`, `references/wraith.webp`, `references/bison.webp`, `references/bison-poses-192.png`  (climb prompt: also `references/wraith-climb-192.png`)

**Return these files** to `paid-characters/art/bison-void/`:

| File | Size | Needed by the game? |
|---|---|---|
| `bison-void-poses.png` | 2048 × 1024 | Yes |
| `bison-void-climb.png` | 3072 × 512 | Yes |
| `bison-void.webp` (or .png) | 1024 × 1024 | Yes |
| `bison-void-showcase.png` | 1536 × 1536 | Optional |
| `bison-void-turn-0.png` … `-turn-7.png` | 1024 × 1024 each | Optional |

### 14A. Poses sheet  →  `bison-void-poses.png`

```text
Make the VOID BISON: the Bison from the attached bison.webp and bison-poses-192.png, redesigned in the Wraith's look. Identity to keep: a bison warrior with an oversized head, short tan curved horns, a dark muzzle, a massive shaggy mane, a raised shoulder hump and a stocky barrel torso wider than the Wraith's. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, ember red #f1442a, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing red-orange eyes with a soft bloom in a shadowed face. Wears a heavy Void hood draped over the hump, the horns breaking out through the sides. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons.

Output ONE sprite sheet, exactly 2048 x 1024 px: 4 columns x 2 rows of 512 x 512 cells, one figure per cell, nothing crossing a cell edge. Same poses, order and framing as the attached wraith-poses-192.png. Left to right, top row first: 1 idle standing; 2 running stride, near leg forward and far leg back; 3 running stride, near leg back and far leg forward (the mirror of 2); 4 right arm reaching straight overhead; 5 left arm reaching straight overhead; 6 falling, arms and legs spread; 7 both arms raised in celebration; 8 crouched down low, defeated. Every pose faces three-quarter right; never mirror a frame. In every cell the point between the feet is at x=256, y=460; airborne poses hang from that same point. Identical character scale in all 8 cells, sized like the Wraith: in idle the top of the hood is at about y=75 and the figure is about 255 px wide. The crouch must be shorter than idle. At least 30 px empty margin to every cell edge. Flat pure magenta #FF00FF background filling every cell, no gradient, no ground shadow, no motion blur, no text, no grid lines.
```

### 14B. Climb strip  →  `bison-void-climb.png`

```text
The exact same Void Bison from the poses sheet, seen from directly behind, climbing a ladder (the ladder itself is NOT drawn). Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, ember red #f1442a, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing red-orange eyes with a soft bloom in a shadowed face. Wears a heavy Void hood draped over the hump, the horns breaking out through the sides. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons.

Output ONE strip, exactly 3072 x 512 px: 6 cells of 512 x 512 in a row, like the attached wraith-climb-192.png. Back of the hood centred, the ember red chevron visible across the shoulders. Hand-over-hand cycle that travels upward, never bounces: 1 right hand high gripping, left hand at chest; 2 left hand rising past the right; 3 left hand high gripping, right hand low; 4 right hand rising; 5 right hand passing the left; 6 right hand nearly high again, left hand dropping to chest. Legs step opposite to the hands. All six frames clearly different; no frame repeats or mirrors another. Head and torso stay centred with under 2 px bob. Feet point at x=256, y=460 in every cell, same scale as the poses sheet. Flat pure magenta #FF00FF background, no ground shadow, no text.
```

### 14C. Avatar bust  →  `bison-void.webp`

```text
Head-and-shoulders bust of the same Void Bison, three-quarter front view facing slightly right, framed exactly like the attached wraith.webp: the hood and pauldrons fill a square edge to edge, cut off at the chest. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, ember red #f1442a, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing red-orange eyes with a soft bloom in a shadowed face. Wears a heavy Void hood draped over the hump, the horns breaking out through the sides. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. The eyes are the brightest point. Exactly 1024 x 1024 px, real transparent background (alpha channel, not a painted checkerboard), no text.
```

### 14D. Store showcase (optional)  →  `bison-void-showcase.png`

```text
Full-body hero render of the same Void Bison, three-quarter front view, confident idle stance, arms slightly out, centred with the feet in the bottom 10% of the frame. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, ember red #f1442a, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing red-orange eyes with a soft bloom in a shadowed face. Wears a heavy Void hood draped over the hump, the horns breaking out through the sides. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. Add a warm orange rim light from behind, as if standing in front of a lava field. Exactly 1536 x 1536 px, real transparent background, no pedestal, no text.
```

### 14E. Turntable (optional)  →  `bison-void-turn-0.png` … `-turn-7.png`

```text
Eight separate 1024 x 1024 renders of the exact same Void Bison in the same idle pose, rotated around its vertical axis in 45 degree steps: 0 front, 1 front-right, 2 right, 3 back-right, 4 back, 5 back-left, 6 left, 7 front-left. Same scale, same foot position, same lighting in all eight. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, ember red #f1442a, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing red-orange eyes with a soft bloom in a shadowed face. Wears a heavy Void hood draped over the hump, the horns breaking out through the sides. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. Real transparent background, no text.
```


---

## 15. Void Ibex  (`ibex-void`)

**Accent:** gold `#ecba55` · **Keying background:** pure magenta #FF00FF · **Character:** a mountain ibex warrior with a black-furred goat head, a pale muzzle, a goat beard, two long ridged horns curving back over the head and hooved boots.

**Upload with every prompt below:** `references/wraith-poses-192.png`, `references/wraith.webp`, `references/ibex.webp`, `references/ibex-poses-192.png`  (climb prompt: also `references/wraith-climb-192.png`)

**Return these files** to `paid-characters/art/ibex-void/`:

| File | Size | Needed by the game? |
|---|---|---|
| `ibex-void-poses.png` | 2048 × 1024 | Yes |
| `ibex-void-climb.png` | 3072 × 512 | Yes |
| `ibex-void.webp` (or .png) | 1024 × 1024 | Yes |
| `ibex-void-showcase.png` | 1536 × 1536 | Optional |
| `ibex-void-turn-0.png` … `-turn-7.png` | 1024 × 1024 each | Optional |

### 15A. Poses sheet  →  `ibex-void-poses.png`

```text
Make the VOID IBEX: the Ibex from the attached ibex.webp and ibex-poses-192.png, redesigned in the Wraith's look. Identity to keep: a mountain ibex warrior with a black-furred goat head, a pale muzzle, a goat beard, two long ridged horns curving back over the head and hooved boots. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, gold #ecba55, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. A glowing amber eye with a soft bloom in a shadowed face. Wears a Void hood with the two ridged horns sweeping out through the back. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons.

Output ONE sprite sheet, exactly 2048 x 1024 px: 4 columns x 2 rows of 512 x 512 cells, one figure per cell, nothing crossing a cell edge. Same poses, order and framing as the attached wraith-poses-192.png. Left to right, top row first: 1 idle standing; 2 running stride, near leg forward and far leg back; 3 running stride, near leg back and far leg forward (the mirror of 2); 4 right arm reaching straight overhead; 5 left arm reaching straight overhead; 6 falling, arms and legs spread; 7 both arms raised in celebration; 8 crouched down low, defeated. Every pose faces three-quarter right; never mirror a frame. In every cell the point between the feet is at x=256, y=460; airborne poses hang from that same point. Identical character scale in all 8 cells, sized like the Wraith: in idle the top of the hood is at about y=75 and the figure is about 255 px wide. The crouch must be shorter than idle. At least 30 px empty margin to every cell edge. Flat pure magenta #FF00FF background filling every cell, no gradient, no ground shadow, no motion blur, no text, no grid lines.
```

### 15B. Climb strip  →  `ibex-void-climb.png`

```text
The exact same Void Ibex from the poses sheet, seen from directly behind, climbing a ladder (the ladder itself is NOT drawn). Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, gold #ecba55, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. A glowing amber eye with a soft bloom in a shadowed face. Wears a Void hood with the two ridged horns sweeping out through the back. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons.

Output ONE strip, exactly 3072 x 512 px: 6 cells of 512 x 512 in a row, like the attached wraith-climb-192.png. Back of the hood centred, the gold chevron visible across the shoulders. Hand-over-hand cycle that travels upward, never bounces: 1 right hand high gripping, left hand at chest; 2 left hand rising past the right; 3 left hand high gripping, right hand low; 4 right hand rising; 5 right hand passing the left; 6 right hand nearly high again, left hand dropping to chest. Legs step opposite to the hands. All six frames clearly different; no frame repeats or mirrors another. Head and torso stay centred with under 2 px bob. Feet point at x=256, y=460 in every cell, same scale as the poses sheet. Flat pure magenta #FF00FF background, no ground shadow, no text.
```

### 15C. Avatar bust  →  `ibex-void.webp`

```text
Head-and-shoulders bust of the same Void Ibex, three-quarter front view facing slightly right, framed exactly like the attached wraith.webp: the hood and pauldrons fill a square edge to edge, cut off at the chest. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, gold #ecba55, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. A glowing amber eye with a soft bloom in a shadowed face. Wears a Void hood with the two ridged horns sweeping out through the back. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. The eyes are the brightest point. Exactly 1024 x 1024 px, real transparent background (alpha channel, not a painted checkerboard), no text.
```

### 15D. Store showcase (optional)  →  `ibex-void-showcase.png`

```text
Full-body hero render of the same Void Ibex, three-quarter front view, confident idle stance, arms slightly out, centred with the feet in the bottom 10% of the frame. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, gold #ecba55, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. A glowing amber eye with a soft bloom in a shadowed face. Wears a Void hood with the two ridged horns sweeping out through the back. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. Add a warm orange rim light from behind, as if standing in front of a lava field. Exactly 1536 x 1536 px, real transparent background, no pedestal, no text.
```

### 15E. Turntable (optional)  →  `ibex-void-turn-0.png` … `-turn-7.png`

```text
Eight separate 1024 x 1024 renders of the exact same Void Ibex in the same idle pose, rotated around its vertical axis in 45 degree steps: 0 front, 1 front-right, 2 right, 3 back-right, 4 back, 5 back-left, 6 left, 7 front-left. Same scale, same foot position, same lighting in all eight. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, gold #ecba55, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. A glowing amber eye with a soft bloom in a shadowed face. Wears a Void hood with the two ridged horns sweeping out through the back. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. Real transparent background, no text.
```


---

## 16. Void Sentinel  (`sentinel-void`)

**Accent:** cyan `#42eff6` · **Keying background:** pure magenta #FF00FF · **Character:** a crystalline guardian with a tall swept-back helm crowned by sharp crystal blades and a narrow visor.

**Upload with every prompt below:** `references/wraith-poses-192.png`, `references/wraith.webp`, `references/sentinel.webp`, `references/sentinel-poses-192.png`  (climb prompt: also `references/wraith-climb-192.png`)

**Return these files** to `paid-characters/art/sentinel-void/`:

| File | Size | Needed by the game? |
|---|---|---|
| `sentinel-void-poses.png` | 2048 × 1024 | Yes |
| `sentinel-void-climb.png` | 3072 × 512 | Yes |
| `sentinel-void.webp` (or .png) | 1024 × 1024 | Yes |
| `sentinel-void-showcase.png` | 1536 × 1536 | Optional |
| `sentinel-void-turn-0.png` … `-turn-7.png` | 1024 × 1024 each | Optional |

### 16A. Poses sheet  →  `sentinel-void-poses.png`

```text
Make the VOID SENTINEL: the Sentinel from the attached sentinel.webp and sentinel-poses-192.png, redesigned in the Wraith's look. Identity to keep: a crystalline guardian with a tall swept-back helm crowned by sharp crystal blades and a narrow visor. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, cyan #42eff6, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing cyan eyes behind a narrow visor with a soft bloom in a shadowed face. Wears a Void hood over the helm, the crystal blades spiking out through the top and the visor glowing inside the opening. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons.

Output ONE sprite sheet, exactly 2048 x 1024 px: 4 columns x 2 rows of 512 x 512 cells, one figure per cell, nothing crossing a cell edge. Same poses, order and framing as the attached wraith-poses-192.png. Left to right, top row first: 1 idle standing; 2 running stride, near leg forward and far leg back; 3 running stride, near leg back and far leg forward (the mirror of 2); 4 right arm reaching straight overhead; 5 left arm reaching straight overhead; 6 falling, arms and legs spread; 7 both arms raised in celebration; 8 crouched down low, defeated. Every pose faces three-quarter right; never mirror a frame. In every cell the point between the feet is at x=256, y=460; airborne poses hang from that same point. Identical character scale in all 8 cells, sized like the Wraith: in idle the top of the hood is at about y=75 and the figure is about 255 px wide. The crouch must be shorter than idle. At least 30 px empty margin to every cell edge. Flat pure magenta #FF00FF background filling every cell, no gradient, no ground shadow, no motion blur, no text, no grid lines.
```

### 16B. Climb strip  →  `sentinel-void-climb.png`

```text
The exact same Void Sentinel from the poses sheet, seen from directly behind, climbing a ladder (the ladder itself is NOT drawn). Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, cyan #42eff6, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing cyan eyes behind a narrow visor with a soft bloom in a shadowed face. Wears a Void hood over the helm, the crystal blades spiking out through the top and the visor glowing inside the opening. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons.

Output ONE strip, exactly 3072 x 512 px: 6 cells of 512 x 512 in a row, like the attached wraith-climb-192.png. Back of the hood centred, the cyan chevron visible across the shoulders. Hand-over-hand cycle that travels upward, never bounces: 1 right hand high gripping, left hand at chest; 2 left hand rising past the right; 3 left hand high gripping, right hand low; 4 right hand rising; 5 right hand passing the left; 6 right hand nearly high again, left hand dropping to chest. Legs step opposite to the hands. All six frames clearly different; no frame repeats or mirrors another. Head and torso stay centred with under 2 px bob. Feet point at x=256, y=460 in every cell, same scale as the poses sheet. Flat pure magenta #FF00FF background, no ground shadow, no text.
```

### 16C. Avatar bust  →  `sentinel-void.webp`

```text
Head-and-shoulders bust of the same Void Sentinel, three-quarter front view facing slightly right, framed exactly like the attached wraith.webp: the hood and pauldrons fill a square edge to edge, cut off at the chest. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, cyan #42eff6, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing cyan eyes behind a narrow visor with a soft bloom in a shadowed face. Wears a Void hood over the helm, the crystal blades spiking out through the top and the visor glowing inside the opening. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. The eyes are the brightest point. Exactly 1024 x 1024 px, real transparent background (alpha channel, not a painted checkerboard), no text.
```

### 16D. Store showcase (optional)  →  `sentinel-void-showcase.png`

```text
Full-body hero render of the same Void Sentinel, three-quarter front view, confident idle stance, arms slightly out, centred with the feet in the bottom 10% of the frame. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, cyan #42eff6, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing cyan eyes behind a narrow visor with a soft bloom in a shadowed face. Wears a Void hood over the helm, the crystal blades spiking out through the top and the visor glowing inside the opening. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. Add a warm orange rim light from behind, as if standing in front of a lava field. Exactly 1536 x 1536 px, real transparent background, no pedestal, no text.
```

### 16E. Turntable (optional)  →  `sentinel-void-turn-0.png` … `-turn-7.png`

```text
Eight separate 1024 x 1024 renders of the exact same Void Sentinel in the same idle pose, rotated around its vertical axis in 45 degree steps: 0 front, 1 front-right, 2 right, 3 back-right, 4 back, 5 back-left, 6 left, 7 front-left. Same scale, same foot position, same lighting in all eight. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, cyan #42eff6, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Glowing cyan eyes behind a narrow visor with a soft bloom in a shadowed face. Wears a Void hood over the helm, the crystal blades spiking out through the top and the visor glowing inside the opening. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. Real transparent background, no text.
```


---

## 17. Void Viking  (`viking-void`)

**Accent:** orange `#f4661c` · **Keying background:** pure magenta #FF00FF · **Character:** a horned warrior in a closed great-helm with a pointed beak-like nasal guard, two large curved horns sweeping up and out, and spiky layered pauldrons.

**Upload with every prompt below:** `references/wraith-poses-192.png`, `references/wraith.webp`, `references/viking.webp`, `references/viking-poses-192.png`  (climb prompt: also `references/wraith-climb-192.png`)

**Return these files** to `paid-characters/art/viking-void/`:

| File | Size | Needed by the game? |
|---|---|---|
| `viking-void-poses.png` | 2048 × 1024 | Yes |
| `viking-void-climb.png` | 3072 × 512 | Yes |
| `viking-void.webp` (or .png) | 1024 × 1024 | Yes |
| `viking-void-showcase.png` | 1536 × 1536 | Optional |
| `viking-void-turn-0.png` … `-turn-7.png` | 1024 × 1024 each | Optional |

### 17A. Poses sheet  →  `viking-void-poses.png`

```text
Make the VOID VIKING: the Viking from the attached viking.webp and viking-poses-192.png, redesigned in the Wraith's look. Identity to keep: a horned warrior in a closed great-helm with a pointed beak-like nasal guard, two large curved horns sweeping up and out, and spiky layered pauldrons. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, orange #f4661c, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. A glowing orange eye slit with a soft bloom in a shadowed face. Wears a Void hood over the great-helm, the two horns breaking out through the sides and the eye slit glowing inside. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons.

Output ONE sprite sheet, exactly 2048 x 1024 px: 4 columns x 2 rows of 512 x 512 cells, one figure per cell, nothing crossing a cell edge. Same poses, order and framing as the attached wraith-poses-192.png. Left to right, top row first: 1 idle standing; 2 running stride, near leg forward and far leg back; 3 running stride, near leg back and far leg forward (the mirror of 2); 4 right arm reaching straight overhead; 5 left arm reaching straight overhead; 6 falling, arms and legs spread; 7 both arms raised in celebration; 8 crouched down low, defeated. Every pose faces three-quarter right; never mirror a frame. In every cell the point between the feet is at x=256, y=460; airborne poses hang from that same point. Identical character scale in all 8 cells, sized like the Wraith: in idle the top of the hood is at about y=75 and the figure is about 255 px wide. The crouch must be shorter than idle. At least 30 px empty margin to every cell edge. Flat pure magenta #FF00FF background filling every cell, no gradient, no ground shadow, no motion blur, no text, no grid lines.
```

### 17B. Climb strip  →  `viking-void-climb.png`

```text
The exact same Void Viking from the poses sheet, seen from directly behind, climbing a ladder (the ladder itself is NOT drawn). Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, orange #f4661c, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. A glowing orange eye slit with a soft bloom in a shadowed face. Wears a Void hood over the great-helm, the two horns breaking out through the sides and the eye slit glowing inside. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons.

Output ONE strip, exactly 3072 x 512 px: 6 cells of 512 x 512 in a row, like the attached wraith-climb-192.png. Back of the hood centred, the orange chevron visible across the shoulders. Hand-over-hand cycle that travels upward, never bounces: 1 right hand high gripping, left hand at chest; 2 left hand rising past the right; 3 left hand high gripping, right hand low; 4 right hand rising; 5 right hand passing the left; 6 right hand nearly high again, left hand dropping to chest. Legs step opposite to the hands. All six frames clearly different; no frame repeats or mirrors another. Head and torso stay centred with under 2 px bob. Feet point at x=256, y=460 in every cell, same scale as the poses sheet. Flat pure magenta #FF00FF background, no ground shadow, no text.
```

### 17C. Avatar bust  →  `viking-void.webp`

```text
Head-and-shoulders bust of the same Void Viking, three-quarter front view facing slightly right, framed exactly like the attached wraith.webp: the hood and pauldrons fill a square edge to edge, cut off at the chest. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, orange #f4661c, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. A glowing orange eye slit with a soft bloom in a shadowed face. Wears a Void hood over the great-helm, the two horns breaking out through the sides and the eye slit glowing inside. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. The eyes are the brightest point. Exactly 1024 x 1024 px, real transparent background (alpha channel, not a painted checkerboard), no text.
```

### 17D. Store showcase (optional)  →  `viking-void-showcase.png`

```text
Full-body hero render of the same Void Viking, three-quarter front view, confident idle stance, arms slightly out, centred with the feet in the bottom 10% of the frame. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, orange #f4661c, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. A glowing orange eye slit with a soft bloom in a shadowed face. Wears a Void hood over the great-helm, the two horns breaking out through the sides and the eye slit glowing inside. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. Add a warm orange rim light from behind, as if standing in front of a lava field. Exactly 1536 x 1536 px, real transparent background, no pedestal, no text.
```

### 17E. Turntable (optional)  →  `viking-void-turn-0.png` … `-turn-7.png`

```text
Eight separate 1024 x 1024 renders of the exact same Void Viking in the same idle pose, rotated around its vertical axis in 45 degree steps: 0 front, 1 front-right, 2 right, 3 back-right, 4 back, 5 back-left, 6 left, 7 front-left. Same scale, same foot position, same lighting in all eight. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, orange #f4661c, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. A glowing orange eye slit with a soft bloom in a shadowed face. Wears a Void hood over the great-helm, the two horns breaking out through the sides and the eye slit glowing inside. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. Real transparent background, no text.
```


---

## 18. Void Gecko  (`gecko-void`)

**Accent:** lime `#b2ef2f` · **Keying background:** pure magenta #FF00FF · **Character:** a gecko scout with a wide lizard head, huge bulging eyes, a wide flat snout, splayed sticky toe pads and a long tail.

**Upload with every prompt below:** `references/wraith-poses-192.png`, `references/wraith.webp`, `references/gecko.webp`, `references/gecko-poses-192.png`  (climb prompt: also `references/wraith-climb-192.png`)

**Return these files** to `paid-characters/art/gecko-void/`:

| File | Size | Needed by the game? |
|---|---|---|
| `gecko-void-poses.png` | 2048 × 1024 | Yes |
| `gecko-void-climb.png` | 3072 × 512 | Yes |
| `gecko-void.webp` (or .png) | 1024 × 1024 | Yes |
| `gecko-void-showcase.png` | 1536 × 1536 | Optional |
| `gecko-void-turn-0.png` … `-turn-7.png` | 1024 × 1024 each | Optional |

### 18A. Poses sheet  →  `gecko-void-poses.png`

```text
Make the VOID GECKO: the Gecko from the attached gecko.webp and gecko-poses-192.png, redesigned in the Wraith's look. Identity to keep: a gecko scout with a wide lizard head, huge bulging eyes, a wide flat snout, splayed sticky toe pads and a long tail. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, lime #b2ef2f, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Huge glowing lime eyes with black slit pupils with a soft bloom in a shadowed face. Wears a short Void cowl sitting behind the bulging eyes so both stay fully visible; the tail trails out from under the cloak. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons.

Output ONE sprite sheet, exactly 2048 x 1024 px: 4 columns x 2 rows of 512 x 512 cells, one figure per cell, nothing crossing a cell edge. Same poses, order and framing as the attached wraith-poses-192.png. Left to right, top row first: 1 idle standing; 2 running stride, near leg forward and far leg back; 3 running stride, near leg back and far leg forward (the mirror of 2); 4 right arm reaching straight overhead; 5 left arm reaching straight overhead; 6 falling, arms and legs spread; 7 both arms raised in celebration; 8 crouched down low, defeated. Every pose faces three-quarter right; never mirror a frame. In every cell the point between the feet is at x=256, y=460; airborne poses hang from that same point. Identical character scale in all 8 cells, sized like the Wraith: in idle the top of the hood is at about y=75 and the figure is about 255 px wide. The crouch must be shorter than idle. At least 30 px empty margin to every cell edge. Flat pure magenta #FF00FF background filling every cell, no gradient, no ground shadow, no motion blur, no text, no grid lines.
```

### 18B. Climb strip  →  `gecko-void-climb.png`

```text
The exact same Void Gecko from the poses sheet, seen from directly behind, climbing a ladder (the ladder itself is NOT drawn). Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, lime #b2ef2f, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Huge glowing lime eyes with black slit pupils with a soft bloom in a shadowed face. Wears a short Void cowl sitting behind the bulging eyes so both stay fully visible; the tail trails out from under the cloak. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons.

Output ONE strip, exactly 3072 x 512 px: 6 cells of 512 x 512 in a row, like the attached wraith-climb-192.png. Back of the hood centred, the lime chevron visible across the shoulders. Hand-over-hand cycle that travels upward, never bounces: 1 right hand high gripping, left hand at chest; 2 left hand rising past the right; 3 left hand high gripping, right hand low; 4 right hand rising; 5 right hand passing the left; 6 right hand nearly high again, left hand dropping to chest. Legs step opposite to the hands. All six frames clearly different; no frame repeats or mirrors another. Head and torso stay centred with under 2 px bob. Feet point at x=256, y=460 in every cell, same scale as the poses sheet. Flat pure magenta #FF00FF background, no ground shadow, no text.
```

### 18C. Avatar bust  →  `gecko-void.webp`

```text
Head-and-shoulders bust of the same Void Gecko, three-quarter front view facing slightly right, framed exactly like the attached wraith.webp: the hood and pauldrons fill a square edge to edge, cut off at the chest. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, lime #b2ef2f, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Huge glowing lime eyes with black slit pupils with a soft bloom in a shadowed face. Wears a short Void cowl sitting behind the bulging eyes so both stay fully visible; the tail trails out from under the cloak. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. The eyes are the brightest point. Exactly 1024 x 1024 px, real transparent background (alpha channel, not a painted checkerboard), no text.
```

### 18D. Store showcase (optional)  →  `gecko-void-showcase.png`

```text
Full-body hero render of the same Void Gecko, three-quarter front view, confident idle stance, arms slightly out, centred with the feet in the bottom 10% of the frame. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, lime #b2ef2f, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Huge glowing lime eyes with black slit pupils with a soft bloom in a shadowed face. Wears a short Void cowl sitting behind the bulging eyes so both stay fully visible; the tail trails out from under the cloak. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. Add a warm orange rim light from behind, as if standing in front of a lava field. Exactly 1536 x 1536 px, real transparent background, no pedestal, no text.
```

### 18E. Turntable (optional)  →  `gecko-void-turn-0.png` … `-turn-7.png`

```text
Eight separate 1024 x 1024 renders of the exact same Void Gecko in the same idle pose, rotated around its vertical axis in 45 degree steps: 0 front, 1 front-right, 2 right, 3 back-right, 4 back, 5 back-left, 6 left, 7 front-left. Same scale, same foot position, same lighting in all eight. Exact same render style, materials and proportions as the attached Wraith: premium chibi low-poly 3D, big head about 40% of body height, short chunky limbs, stocky torso. Every surface is sharp faceted shards like cut obsidian, near-black and charcoal greys (#0e0e12, #2a2a2d, #4a4a50) with crisp light and dark facets. ONE neon accent colour only, lime #b2ef2f, on the hood rim, shoulder pauldrons, forearm guards, knee guards, boot tips and a V-chevron on the chest, glowing slightly. Huge glowing lime eyes with black slit pupils with a soft bloom in a shadowed face. Wears a short Void cowl sitting behind the bulging eyes so both stay fully visible; the tail trails out from under the cloak. Soft top-left studio light, subtle rim light, no outline stroke, no texture noise, no text, no weapons. Real transparent background, no text.
```


---

## What happens after you drop the files in

For each character I'll:

1. Key the background out to real transparency and clean the edges.
2. Check the foot anchor, scale and stride against the Wraith, then
   downscale each 512 cell to 192 and compress under ~50 KB:
   `app/public/climb/<id>-void-poses-192.png` (768 × 384) and
   `<id>-void-climb-192.png` (1152 × 192).
3. Save the bust as `app/mobile/src/assets/avatars/<id>-void.webp`
   (512 × 512).
4. Add one line per skin to `VOID_SKIN_SHEETS` in `climberCharacters.ts`
   with its measured skull height, run the tests and open a PR.

Your 512 px masters stay in `paid-characters/art/` in case we want sharper
sheets for the store preview later.
