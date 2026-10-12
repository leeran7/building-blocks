# Doomstack on CrazyGames

Everything needed to submit the CrazyGames build. Paste the listing text below
into the Developer Portal as is.

## What to upload

| Field | File / value |
|-------|--------------|
| Game files | `doomstack-crazygames.zip`: download it from the **doomstack-crazygames** artifact of the latest CI run on `main` (Actions → CI → run → Artifacts), or build it with `cd app && pnpm portal:package crazygames` (writes `app/mobile/dist-zips/crazygames.zip`) |
| Landscape cover (1920x1080) | [`covers/cover-landscape-1920x1080.png`](covers/cover-landscape-1920x1080.png) |
| Portrait cover (800x1200) | [`covers/cover-portrait-800x1200.png`](covers/cover-portrait-800x1200.png) |
| Square cover (800x800) | [`covers/cover-square-800x800.png`](covers/cover-square-800x800.png) |
| Engine | HTML5 (React + Canvas 2D) |
| Devices | Desktop and mobile |
| Mobile orientation | Portrait |
| Languages | English |
| Category / tags | Platformer; tags: Arcade, Climbing, Endless, Lava, Jumping |
| Age rating | Suitable for PEGI 12 and under (cartoon peril, no blood, no chat) |
| Multiplayer | No |
| Ads / in-game purchases | None at Basic Launch. Midgame ads are already wired and only run once CrazyGames enables ads for the game |

## Listing text

**Title**

Doomstack

**Short description**

Climb the tower before the lava catches you.

**Description**

The lava is rising and the only way out is up. Doomstack is an endless
climbing platformer: run across crumbling floors, scramble up ladders and jump
gaps while the lava climbs after you, a little faster every floor.

Grab glowing orbs for power-ups that boost your jump, slow the lava or carry
you up several floors at once. Every run is a new tower, so the only question
is how high you can get. Beat your best height and try again.

- Endless towers, a new layout every run
- Power-ups that change how you climb
- Quick runs: one try takes about a minute
- Plays with the keyboard or with on-screen buttons on mobile

**Controls**

- Arrow keys or WASD: move and climb ladders
- Space: jump
- P: pause
- Mobile: on-screen buttons to move, climb and jump

## Submission steps

1. Create a developer account at <https://developer.crazygames.com> and
   accept the developer terms.
2. Choose **Submit a game**, pick HTML5, and upload `doomstack-crazygames.zip`
   (it has `index.html` at the root, relative paths, 88 files, about 9 MB).
3. Open the **Preview / QA tool** on the uploaded build and play one run on
   desktop and one in the mobile preview. Check: the game starts on the
   Start screen, Escape leaves fullscreen, P pauses, the best height is kept
   after a reload.
4. Fill in the listing from the tables above and upload the three covers.
5. Submit. CrazyGames reviews it for **Basic Launch** (a limited test with
   ads switched off). If its numbers are good they move it to Full Launch and
   turn ads on; nothing in the build needs to change for that.

## SDK hookup (already in the build)

The build loads CrazyGames SDK v3 and calls `loadingStart`/`loadingStop`,
`gameplayStart`/`gameplayStop` (start of a run, pause, game over),
`happytime` on a new best height, and the data module for the best height
(falling back to localStorage). A `midgame` ad is requested on Play again,
never in the first 3 minutes. If the SDK is blocked, the game still runs.
Details and the rules for changing the game: [`context/platforms.md`](../../context/platforms.md).

## Regenerating the covers

The covers are screenshots of the real CrazyGames build with the logo on top:

```sh
cd app
pnpm mobile:build --mode crazygames
CHROMIUM_PATH=/path/to/chromium pnpm portal:covers
```

This writes the three PNGs to `docs/crazygames/covers/`. CrazyGames asks for
the title only on covers: no borders, no store badges, no other text.
