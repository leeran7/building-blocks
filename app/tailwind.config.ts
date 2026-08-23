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
