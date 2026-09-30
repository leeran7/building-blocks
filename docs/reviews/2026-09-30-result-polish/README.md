# Level result polish

Phone size (390x844 @2x), mocked API. "Before" for the stars and the unlock
line are Leeran's screenshots from the live 2.0 app.

## Stars on the level cleared card

The glow was a CSS drop-shadow on each star's svg, which WebKit clips to the
svg's box, so every new star sat in a square. The glow is gone: plain green
stars.

| Before | After |
|--|--|
| <img src="before-stars.jpg" width="330" alt="Stars in square glow boxes"> | <img src="after-stars.jpg" width="330" alt="Plain green stars"> |

## A new character

Before, a plain pill. Now the character gets the full-screen reward reveal (the
one a purchase gets) once the stars land, one reveal per character, and the
card keeps a lime line naming them.

| Before | After: the reveal | After: the card |
|--|--|--|
| <img src="before-unlock-line.jpg" width="260" alt="Plain New character unlocked: Wolf pill"> | <img src="after-unlock-reveal.jpg" width="220" alt="Wolf revealed on rays, New character unlocked"> | <img src="after-unlock-card.jpg" width="220" alt="Level cleared card with lime unlock line"> |

## Fade above Save on Choose Character

The grid faded out over 18px just above Save, which read as a hard line across
the tiles over the lava. It now fades over 48px, and the grid's end padding is
never less than the fade, so the last row can still scroll fully into view.

| Before | After |
|--|--|
| <img src="before-choose-character.jpg" width="330" alt="Tiles cut off in a hard line above Save"> | <img src="after-choose-character.jpg" width="330" alt="Tiles fading out softly above Save"> |
