# Motion styles: names and what they mean

A shared vocabulary for animation in UI. When someone asks for "a sticky
header" or "a scroll-triggered reveal", use this file to agree on what they
mean before building or reviewing it. Each entry says what the style is, when
it earns its place, and how it is usually built: plain CSS first, then Motion
(motion.dev, `motion/react`) where the repo uses it. How this repo wires these
(tokens, components, scroll containers) lives in `context/ux-patterns.md`.

## Scroll

The two names people mix up most:

| | Scroll-triggered | Scroll-linked |
|--|--|--|
| Also called | reveal on scroll, animate on scroll, in-view | scroll-driven, scrubbed, scroll-bound |
| What drives it | Crossing a threshold starts it; it then runs on its own clock | Scroll position *is* the playhead; scrolling back reverses it |
| Motion | `whileInView` + `viewport={{ once, amount, margin, root }}`, `useInView`, `inView()` | `useScroll()` → `useTransform()`, `scroll()` |
| CSS | IntersectionObserver toggling a class | `animation-timeline: scroll()` / `view()` + `animation-range` |

- **Sticky** (`position: sticky`): the element scrolls with the page until it
  hits an offset (`top: 0`, `bottom: 0`), then holds there until its parent
  scrolls past. Not an animation by itself: it is the base of sticky headers,
  sticky section titles, sticky footers/CTAs, and of pinning. Sticks only
  inside its scroll container and parent; `overflow: hidden` on an ancestor
  silently breaks it.
- **Pinning** (pin and scrub, sticky scroll): a tall wrapper with a sticky child.
  Scrolling through the wrapper holds the child in place while scroll progress
  drives its animation. Motion: `useScroll({ target: wrapperRef, offset:
  ["start start", "end end"] })`, child `className="sticky top-0"`.
- **Scrollytelling**: a pinned graphic plus text steps; each step that scrolls
  in triggers (or scrubs) a change in the graphic. Pinning + scroll-triggered.
- **Parallax**: layers move at different speeds against the scroll to fake
  depth. Motion: `useTransform(scrollYProgress, [0, 1], ["0%", "-30%"])` per
  layer. *Pointer/tilt parallax* is the same idea driven by cursor or device
  tilt instead of scroll.
- **Horizontal scroll section**: vertical scroll inside a pinned section drives
  a horizontal `x` translate.
- **Scroll progress indicator**: a bar whose `scaleX` is `scrollYProgress`.
- **Hide-on-scroll header** (scroll-direction aware): header slides away on
  scroll down, back on scroll up. Motion: `useMotionValueEvent(scrollY,
  "change", …)` comparing `scrollY.getPrevious()`.
- **Scroll snap**: CSS `scroll-snap-type` / `scroll-snap-align` makes a
  scroller settle on items or pages. Carousels, paged onboarding. No JS.
- **Overscroll / rubber band / pull to refresh**: content stretches past its
  edge with damped resistance, then springs back.
- **Scroll-jacking**: overriding native scroll speed or direction. An
  anti-pattern on touch devices; prefer pinning, which keeps native scroll.

## Entrances, exits and sequences

- **Enter / exit** (mount, unmount, presence): animate in when added, out
  before removal. Motion: `initial` / `animate` / `exit` inside
  `<AnimatePresence>`; without it, exits are cut.
- **Fade, slide, scale, zoom, fade-up / rise-in**: the basic enter/exit
  shapes. Rise-in = fade + small upward `y`.
- **Stagger** (cascade): children enter one after another with a fixed delay.
  Motion: `stagger()` or variants with `delayChildren` / `staggerChildren`.
  Cap the count so long lists don't drag.
- **Sequence / timeline / orchestration**: several animations in a scripted
  order. Motion: `animate([[el, a], [el2, b, { at: "-0.1" }]])`, `useAnimate`.
- **Keyframes**: one property passes through several values
  (`animate={{ x: [0, 20, 0] }}`).
- **Loop / ambient / idle**: repeating motion that signals life (pulse,
  breathing glow, floating). `repeat: Infinity`. Keep it subtle and off the
  main content.
- **Skeleton shimmer, spinner, progress bar, indeterminate**: loading
  motion. Skeleton for layout, spinner for an action, bar for known progress.
- **Count-up / number ticker**: a number rolls to its new value.
  Motion: `animate(motionValue, to)` and render the rounded value.
- **Text reveal / split text / typewriter**: letters, words or lines enter
  staggered, or type out.
- **Marquee / ticker**: content scrolls endlessly sideways in a loop.
- **Path drawing** (line draw): an SVG stroke draws itself. Motion:
  `pathLength` from 0 to 1. **Morph**: one SVG shape becomes another.

## Layout and navigation

- **Layout animation** (FLIP): an element animates from its old size/position
  to its new one after a layout change (reflow, reorder, expand). Motion:
  `layout` prop. Use `layout="position"` when only the position should move.
- **Shared element transition** (hero, magic move, morph): the same thing on
  two screens flies from one to the other. Motion: matching `layoutId` inside
  a `LayoutGroup`. Browser-native: View Transitions API with
  `view-transition-name` (not on older iOS WebViews).
- **Container transform**: a card grows into the full page it opens (and
  shrinks back). A shared element where the container itself is the hero.
- **Page / route transitions**: how one screen replaces another.
  - *Push / pop*: new screen slides in from the trailing edge, back reverses.
  - *Shared axis*: both screens move together along x, y or z (zoom).
  - *Fade through*: out, then in, for unrelated screens.
  - *Cross-fade* (dissolve): both overlap while one fades into the other.
- **Sheet / drawer / modal / popover presentation**: a surface enters from an
  edge or its trigger, usually on a spring, with a dimming scrim.
- **Expand / collapse** (accordion, disclosure): animating to `height: "auto"`.
- **Moving highlight** (magic underline, sliding pill): one indicator slides
  between tabs or options. Motion: one element with a shared `layoutId`.
- **Reorder**: drag items to reorder; siblings make room with layout animation.
  Motion: `Reorder.Group` / `Reorder.Item`.

## Gesture and interaction

- **Hover / press / focus states**: `whileHover`, `whileTap` (press scale),
  `whileFocus`. Touch has no hover; never hide information behind it.
- **Drag, swipe, fling**: the element follows the finger, then settles with
  momentum. Motion: `drag`, `dragConstraints`, `dragElastic`,
  `dragMomentum`, `onDragEnd` with `info.velocity`.
- **Gesture-driven / interactive transition**: progress follows the finger
  (swipe back, sheet pull-down) and can be released either way. Must be
  interruptible and hand the finger's velocity to the settle spring.
- **Microinteraction**: a small single-purpose response (toggle flip, like
  burst, copied tick, shake on error).
- **Tilt / 3D hover**, **magnetic button**, **cursor follower**: pointer-driven
  desktop-web effects. Rarely right on mobile.

## Timing and physics vocabulary

- **Easing**: the speed curve. *Ease-out* (decelerate) for entering,
  *ease-in* (accelerate) for leaving, *ease-in-out* for moving between two
  on-screen places, *linear* only for continuous loops and scrubbing.
- **Spring**: physics-based timing (stiffness, damping, mass, or duration +
  bounce). Natural for anything touched; keeps velocity when interrupted.
  *Overshoot* = passes the target and settles back.
- **Inertia / momentum / decay**: motion that slows from a starting velocity
  (a flicked list).
- **Interruptible**: a new target mid-animation redirects smoothly from the
  current value and velocity instead of snapping or queueing.
- **Animation principles** (from character animation, useful for games):
  anticipation, squash and stretch, follow-through and overlap, arcs,
  secondary action, slow in / slow out.
- **Game feel / juice**: screen shake, hit-stop (brief freeze on impact),
  particles, punchy scale pops. Feedback for game events; keep it out of
  menus.

## Reviewing a motion request

1. Name the style from this file and confirm it with the requester if two
   names could fit (sticky vs pinned, triggered vs linked).
2. Check purpose: spatial (where did it come from), state (what changed),
   hierarchy (what matters), or feedback. Decoration alone fails review.
3. Check `prefers-reduced-motion`: the fallback is an instant state change or
   a short opacity fade, never a frozen half-state. Parallax, pinning, zoom
   and large travel are the first to go.
4. Check performance: animate `transform` and `opacity`; avoid animating
   `width`, `top`, `box-shadow` or filters on large surfaces every frame.
5. Check scroll styles bind to the real scroll container, not the window,
   when the page scrolls inside an element.
