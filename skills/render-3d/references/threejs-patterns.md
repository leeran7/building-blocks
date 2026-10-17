# Three.js Patterns

Placement defaults the generator should follow. The model system prompt
in `lib/system-prompt.mjs` encodes the same rules; this file is the
human-readable reference.

## `hero` (default)

- Wide composition; camera at z ≈ 8–12, fov 45–60.
- Keep the vertical center-left third calm — headline text overlays there.
- Depth cue required: fog or layered background geometry.
- Slow ambient motion is fine (rotation), but the still frame must stand
  alone — the preview screenshot is a still.
- Background: gradient via large sphere with BackSide material, or scene
  fog + solid clear color. No pure black unless `style` asks.

## `product`

- Single hero object centered at origin, fills ~60% of frame height.
- Studio lighting: key (directional, warm), fill (hemisphere), rim
  (directional from behind).
- Ground: large circle with ShadowMaterial or soft radial darkening —
  no hard grid unless requested.
- Camera slightly above (y ≈ 2–3), lookAt origin.

## `background`

- Full-bleed ambient field; no focal object.
- Low contrast, desaturated; it sits behind text.
- Cheap to render: instanced or merged geometry, `budget: low` default.

## Lighting baseline (all placements)

- Always add `AmbientLight` or `HemisphereLight` — an unlit scene reads
  as broken in the preview.
- Renderer: `antialias: true`, `setPixelRatio(1)` in headless preview
  (deterministic screenshots), tone mapping ACESFilmic for product.

## Performance budgets

| budget | triangles | post-processing | notes |
|---|---|---|---|
| `low` | ≤ 50k | none | backgrounds, mobile heroes |
| `medium` | ≤ 200k | none | default |
| `high` | ≤ 500k | one pass max | statement pieces |

Count rule of thumb: `SphereGeometry(r, w, h)` ≈ `2*w*h` triangles.
Prefer `InstancedMesh` over cloned meshes past ~100 instances.

## Camera contract

The module must export `scene` and `camera` at top level. The preview
harness appends a runner to the same module scope and renders 5 frames.
Anything async (it should not be — no external assets) must resolve
before frame 5 or the preview reports an error.
