# Character art

The user's corrected direction is authoritative: every new skin must retain
the face, silhouette, colors, and materials of its **Choose Character** portrait.
See [ART-DIRECTION.md](ART-DIRECTION.md). The hooded designs in the original
generation pack were rejected and are not production inputs.

Each of the 18 directories in `art/` contains:

- `<id>-void.png`: a transparent 1024px upscale of the original portrait.
  This preserves identity exactly; it is not newly generated portrait detail.
- `<id>-void-poses.png`: the corrected eight-pose master, four columns by two
  rows, with a magenta or green keying background.
- `<id>-void-climb-grid.png`: six rear-view climb frames, three columns by two
  rows. The compiler assembles them into the required horizontal strip.
- Optional `*-pose-N.png` files: individually regenerated replacement frames
  already assembled into the pose master.

`drafts/`, the older Kestrel keyed bust, and the older Kestrel wide climb strip
are historical generation attempts, not accepted runtime inputs. The compiler
always prefers `climb-grid.png` over `climb.png`.
Historical drafts and rejected Kestrel variants are kept out of the published
source pack; only the accepted portrait, pose, and climb masters are included.

Sprites were produced with the built-in image generation tool, using the original
portraits for identity and existing sheets for pose/layout references. Generation
sizes vary; the regular grid aspect ratio is preserved. Runtime export applies
chroma keying, uniform scaling, and recorded foot-alignment translations.

The original prompt pack is preserved in `generation-pack.md` and `prompts.json`
for provenance. Their hood and restricted-palette instructions are superseded by
`ART-DIRECTION.md`; `second-half-prompts.json` records additional generation and
correction prompts. The final shared prompt direction is:

> Match the existing Choose Character portrait exactly in face/head shape,
> silhouette, full color palette, and faceted materials. Extend that design into
> the specified full-body poses. Do not add a Wraith hood or replace the character's
> identity. Keep a consistent body scale and right-facing pose orientation;
> use distinct opposite running strides and six rear-facing hand-over-hand climb
> frames. Keep complete anatomy inside every cell, with a solid keying background.

Rebuild and validate the runtime PNGs using the documented
[compiler workflow](../scripts/climber-art/README.md). Numeric checks do not
replace the visual and in-app animation review recorded in `loop/qa-report.md`.
