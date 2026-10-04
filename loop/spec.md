# Goal
Make all 18 new character gameplay assets faithfully match their existing Choose Character portraits. The latest user correction explicitly supersedes the generation pack's generic Wraith hood, dark redesign, and single-accent restrictions. Preserve each portrait's complete palette, visible anatomy, head silhouette, armor and faceted rendering.

# Scope
In: 18 paid `<id>-void` character sprites using their base portraits as identity references, identity-consistent poses and climb animation, web/native asset registration. Exact base ids: kestrel, lynx, raven, panther, wolf, otter, heron, yak, mantis, cobra, badger, falcon, marmot, bison, ibex, sentinel, viking, gecko.
Out: existing base sprite replacement, Wraith/its three color skins, stick figures, prices, ownership/auth flows, physics, new screens, marketing turntables. Existing Choose Character portraits are authoritative and must not be redesigned. Assumption: paid names/ids remain stable; the exact existing base portrait governs the new paid sprites.

# Flows
F-1 (critical: yes): Player finds Choose Character through the current character controls, opens a known character and views its skin preview, then selects an already available character and plays. Preconditions: existing access/unlock requirements. Happy path: portrait -> character/skin idle/walk/climb preview -> selection -> game using the same identity. First run: existing default stick and unlock guidance remain. Failure: existing loading/fallback drawing prevents a crash; retry/relaunch reloads assets. Success next: continue playing or return to picker. Interrupt: leaving/reopening or refreshing retains existing saved selection; repeated preview switches cause no writes. Utilization: retain the existing shortest selection route and existing preview controls.
F-2 (critical: no): Artist/integrator adds validated masters, compiles matching assets, registers them, and verifies web/native packaging. Entry is the established asset folders and registry. Empty: unvalidated/missing output stays unwired. Failure: reject identity mismatch, geometry failure or absent alpha; return to root art generation. Success next: verifier and visual QA. Utilization: use the same identity manifest for all 18.

# Personas
- Player choosing a character from its portrait and expecting that identity in play (F-1).
- Art integrator preserving portrait identity and renderer contracts (F-2).

# Stories
S-1/F-1: As a player, I want the character I play to match its selection image so I recognize my choice. Happy: matching head, palette and armor across poses. Failure: asset loading preserves existing fallback without changing selected id.
S-2/F-2: As an integrator, I want the full 18-character set validated so every shipped sprite renders and bundles correctly. Happy: all sheets pass geometry and visual checks. Failure: reject incomplete or mismatched art before registration.

# ACs
AC-1/S-1: Given each of 18 original portraits, when comparing idle, walk and climb assets of its paid counterpart, then all identifiable head/anatomy features, armor motifs and dominant color groups are preserved and no generic Wraith hood is substituted. Record a side-by-side visual result for every id.
AC-2/S-1: Given first-run, saved selection, refresh, repeated preview changes or an unavailable sheet, when entering the existing selection/game flow, then existing defaults, saved id, reduced motion and loading/fallback behavior remain operational; selection/unlock/payment rules do not change.
AC-3/S-2: Given all registered new sheets, when decoded, then poses are 768x384 RGBA/palette-alpha PNGs, climb is 1152x192, each of six climb frames differs from every other by over 1000 visible differing pixels, idle/run soles occupy rows 170–175, and no subject crosses a cell edge.
AC-4/S-2: Given hyphenated `<id>-void` sheets in mobile glob output, when resolving bundle paths, then both poses and climb bind to that full id and native preview/game use the bundled URLs. Invalid inputs remain ignored.

# NFRs
No dependencies added; no simulation changes; zero new per-frame image loads; existing cached/lazy sprite decode retained; six unique climb frames; 10px target cell gutter; target <=50KB per atlas where achievable without obvious quality loss. Existing accessibility/reduced-motion behavior preserved. Validate all 18 identities rather than a sample.

# Work split
Single reviewable concern on the existing checkout; no additional feature branches or PRs in this delegated discovery task. Root exclusively owns paid-characters/art and prompts; software engineer owns spec/architecture and eventual application registry/assets after root handoff; verifier owns tests; parent coordinates required review/QA/integration. Shared contract is the 18-id list and existing sheet geometry. No art is wired until root confirms it is validated.

# Risks
Generated art may drift in anatomy, colors, pose framing or frame order. Magenta/green chroma keys can damage retained palette colors. Existing base sprites are outside this paid-assets correction scope. Native filename parser currently rejects hyphenated ids. Existing test gates verify geometry, not identity.

# Open Questions
No user clarification needed for identity: selection portraits govern. Root's validated asset handoff determines measured skull heights ; base sheets stay unchanged. Implementation remains pending that handoff.

# Future
Marketing showcase/turntable files are outside gameplay identity correction and are not consumed by the application.
