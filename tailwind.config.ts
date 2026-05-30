import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#071a0a",
        surface: "#0b2410",
        border: "#1a4a25",
        pitch: "#1e5229",
        gold: "#e8b820",
        "gold-light": "#f5c842",
        chalk: "#f5f0e8",
        "line-white": "rgba(255,255,255,0.5)",
      },
      fontFamily: {
        mono: ["var(--font-mono)", "monospace"],
        display: ["var(--font-display)", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
