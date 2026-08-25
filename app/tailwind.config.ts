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

        // ── Dark editorial palette (semantic) ───────────────────────────────
        void: "#0a0a0f",
        surface: "#111118",
        "surface-raised": "#15151f",
        elevated: "#1a1a26",
        "border-subtle": "#1e1e2e",
        "border-strong": "#2a2a3d",
        "border-focus": "#3a3a5c",
        "text-primary": "#f4f4ff",
        "text-secondary": "#a5a5c4",
        "text-muted": "#6b6b8a",
        "text-disabled": "#3a3a5c",

        // Active accent — resolves to the themed category via --accent-rgb
        // (default = brand cyan). Supports opacity: bg-accent/10, etc.
        accent: {
          DEFAULT: "rgb(var(--accent-rgb, 0 212 255) / <alpha-value>)",
          tech: "#00d4ff",
          design: "#ff6b9d",
          business: "#ffd700",
          creative: "#b07cd6",
          gaming: "#00ff88",
          science: "#ff8c00",
        },
        brand: "#00d4ff",

        danger: "#ff5470",
        warning: "#ffb020",
        success: "#28d17c",
      },

      boxShadow: {
        // Subtle single-layer elevation on dark surfaces
        card: "0 1px 2px 0 rgb(0 0 0 / 0.25)",
        lifted: "0 8px 24px -12px rgb(0 0 0 / 0.55)",
      },

      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "monospace"],
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
      },
      animation: {
        sway: "sway 4s ease-in-out infinite",
        slideOut: "slideOut 0.4s ease-in forwards",
        slideIn: "slideIn 0.4s ease-out forwards",
        crossFade: "crossFade 0.4s ease-in-out",
        rise: "rise 0.6s ease-out",
      },
    },
  },
  plugins: [],
};
export default config;
