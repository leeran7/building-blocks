/**
 * Climb Feel 1.2× — presentation only.
 * Mirror grain/topo/motion numbers in [data-climb-chrome] CSS vars and
 * climb-scoped keyframes (see app/app/globals.css). Do not change game physics.
 */

// HUD / VFX
export const HUD_ALTITUDE_FONT_UI = 16;
export const PICKUP_SHAKE_AMP_UI = 2.64;
export const EMBER_MAX = 105; // climbBackground — was 88

// Motion forks (AC-17) — shared enter/climb/groundRise baselines untouched
export const CLIMB_ENTER_TRANSLATE_Y_PX = 19;
export const CLIMB_ENTER_DURATION_S = 0.58;
export const CLIMB_PUNCH_TRANSLATE_Y_PX = 7.2;
export const CLIMB_PUNCH_DURATION_S = 0.67;
export const CLIMB_GROUND_RISE_DURATION_S = 4.8;
export const CLIMB_GROUND_RISE_AMP_PERCENT = 4.8;

// Atmosphere (AC-18) — CSS: --climb-grain-opacity / --climb-topo-signal-alpha
export const CLIMB_GRAIN_OPACITY = 0.042;
export const CLIMB_TOPO_SIGNAL_ALPHA = 0.06;

// Power-up HUD (tune in place)
export const POWER_UP_ENTER_DURATION_S = 0.375;
export const POWER_UP_ENTER_SCALE_FROM = 0.784;
export const POWER_UP_ENTER_SCALE_PEAK = 1.072;
export const POWER_UP_URGENT_DURATION_S = 0.625;
export const POWER_UP_URGENT_SCALE_PEAK = 1.048;

// Type class contracts (AC-8 / AC-9)
export const CLIMB_PANEL_INTRO_TITLE_CLASS =
  "font-display text-3xl md:text-4xl font-bold text-text-primary tracking-tight";
export const FREE_LEADERBOARD_HEADING_CLASS =
  "font-display text-3xl md:text-4xl text-text-secondary mt-3";
export const FREE_CLIMB_RANK_CLASS =
  "font-mono text-[2.7rem] font-bold text-text-primary tabular-nums";
