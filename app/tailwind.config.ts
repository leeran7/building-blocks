import type { Config } from "tailwindcss";

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
        // V2 design tokens (AC-33–AC-35, design.md §1)
        void: "#0a0a0f",
        surface: "#111118",
        elevated: "#16161f",
        "border-subtle": "#1e1e2e",
        "border-focus": "#2e2e4e",
        "text-primary": "#f0f0ff",
        "text-muted": "#6b6b8a",
        "text-disabled": "#3a3a5c",
        // Category accents — see ADR-1: accent-business and accent-gaming DECORATIVE ONLY
        "accent-tech": "#00d4ff",    // 5.2:1 on #0a0a0f — safe for text
        "accent-design": "#ff6b9d",  // 4.6:1 on #0a0a0f — safe for text
        "accent-business": "#ffd700", // 1.8:1 — DECORATIVE ONLY: borders, bars, icons
        "accent-creative": "#9b59b6", // 3.1:1 — large text (18px+) or decorative only
        "accent-gaming": "#00ff88",   // 2.1:1 — DECORATIVE ONLY: borders, bars, icons
        "accent-science": "#ff8c00",  // 3.5:1 — large text (18px+) or decorative only
        danger: "#ff4444",
        success: "#00cc66",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "Courier New", "monospace"],
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
