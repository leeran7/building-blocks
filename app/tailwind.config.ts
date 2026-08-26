import type { Config } from "tailwindcss";

/**
 * Tower — dark editorial design system.
 * Dark, high-contrast, data-dense. Single cyan brand accent; category color is
 * functional wayfinding via --accent-rgb. Restrained radii + subtle shadows.
 * Semantic tokens are the source of truth — see app/DESIGN.md.
 */
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // V1 tower tokens — unchanged for backward compat
        tower: {
          sky: "#0ea5e9",
          ground: "#92400e",
          buried: "#9ca3af",
          amber: "#f59e0b",
          gold: "#eab308",
          base: "#0f172a",
          surface: "#1e293b",
          border: "#334155",
          text: "#f8fafc",
          muted: "#94a3b8",
        },

        // ── ASCENT palette (semantic) ───────────────────────────────────────
        // Warm obsidian canvas; duotone identity = signal-lime (ascent) vs
        // ember (the rising ground / burial). See app/DESIGN.md.
        void: "#0a0a0c",
        surface: "#121116",
        "surface-raised": "#17161c",
        elevated: "#1e1c24",
        "border-subtle": "#24222c",
        "border-strong": "#37343f",
        "border-focus": "#4a4656",
        "text-primary": "#f4f2ec",
        "text-secondary": "#a8a4b2",
        "text-muted": "#74707e",
        "text-disabled": "#4a4656",

        // Active accent — resolves via --accent-rgb (default = signal lime).
        // Per-category hues remain functional wayfinding on tower screens.
        accent: {
          DEFAULT: "rgb(var(--accent-rgb, 203 242 77) / <alpha-value>)",
          tech: "#00d4ff",
          design: "#ff6b9d",
          business: "#ffd700",
          creative: "#b07cd6",
          gaming: "#00ff88",
          science: "#ff8c00",
        },
        // Duotone brand poles
        signal: "#cbf24d", // ascent · you · #1 · primary CTA
        ember: "#ff5a2c", // the rising ground · danger · burial
        brand: "#cbf24d",

        danger: "#ff5a2c",
        warning: "#ffb020",
        success: "#8fd14f",
      },

      boxShadow: {
        // Subtle single-layer elevation on dark surfaces
        card: "0 1px 2px 0 rgb(0 0 0 / 0.25)",
        lifted: "0 18px 40px -20px rgb(0 0 0 / 0.75)",
        // Signature glows for the duotone poles
        signal: "0 0 0 1px rgb(203 242 77 / 0.15), 0 12px 40px -12px rgb(203 242 77 / 0.35)",
        ember: "0 0 0 1px rgb(255 90 44 / 0.18), 0 12px 40px -14px rgb(255 90 44 / 0.4)",
      },

      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },

      keyframes: {
        sway: {
          "0%, 100%": { transform: "translateX(0px)" },
          "50%": { transform: "translateX(2px)" },
        },
        slideOut: {
          "0%": { transform: "translateX(0)", opacity: "1" },
          "100%": { transform: "translateX(-100%)", opacity: "0" },
        },
        slideIn: {
          "0%": { transform: "translateX(100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        crossFade: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        rise: {
          "0%": { transform: "translateY(4px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        // ASCENT — staggered page-load reveal
        enter: {
          "0%": { transform: "translateY(16px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        // ASCENT — the ground gradient breathing/rising at the base
        groundRise: {
          "0%, 100%": { transform: "translateY(4%)", opacity: "0.85" },
          "50%": { transform: "translateY(0)", opacity: "1" },
        },
        // ASCENT — signal marker climbing the altimeter
        climb: {
          "0%": { transform: "translateY(6px)", opacity: "0.4" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        sway: "sway 4s ease-in-out infinite",
        slideOut: "slideOut 0.4s ease-in forwards",
        slideIn: "slideIn 0.4s ease-out forwards",
        crossFade: "crossFade 0.4s ease-in-out",
        rise: "rise 0.6s ease-out",
        enter: "enter 0.7s cubic-bezier(0.16, 1, 0.3, 1) both",
        groundRise: "groundRise 6s ease-in-out infinite",
        climb: "climb 0.8s cubic-bezier(0.16, 1, 0.3, 1) both",
        marquee: "marquee 40s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
