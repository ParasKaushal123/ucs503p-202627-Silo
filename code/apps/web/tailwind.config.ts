import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Every colour reads a theme variable from globals.css, so pages switch
      // between the light (landing, dashboard) and dark (App Room, Workbench) themes.
      colors: {
        white: "rgb(var(--surface) / <alpha-value>)",
        black: "rgb(var(--ink) / <alpha-value>)",
        neutral: Object.fromEntries(
          [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((n) => [
            n,
            `rgb(var(--neutral-${n}) / <alpha-value>)`,
          ]),
        ),
        canvas: "rgb(var(--canvas) / <alpha-value>)",
        onaccent: "rgb(var(--on-accent) / <alpha-value>)",
        silo: {
          blue: "rgb(var(--sky) / <alpha-value>)",
          purple: "rgb(var(--forest-accent) / <alpha-value>)",
          yellow: "rgb(var(--peach) / <alpha-value>)",
          green: "rgb(var(--mint) / <alpha-value>)",
          red: "rgb(var(--danger) / <alpha-value>)",
          lilac: "rgb(var(--lilac) / <alpha-value>)",
          sky: "rgb(var(--sky) / <alpha-value>)",
          cream: "rgb(var(--canvas) / <alpha-value>)",
          forest: "rgb(var(--forest) / <alpha-value>)",
          live: "rgb(var(--live) / <alpha-value>)",
          pink: "rgb(var(--pink) / <alpha-value>)",
        },
      },
      borderColor: {
        black: "rgb(var(--line-strong) / <alpha-value>)",
        DEFAULT: "rgb(var(--line-strong) / <alpha-value>)",
      },
      borderRadius: {
        pill: "1600px",
        panel: "22px",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["'Space Grotesk'", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      keyframes: {
        "silo-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: ".45" },
        },
        "silo-rise": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "silo-marquee": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "silo-pulse": "silo-pulse 1.1s ease-in-out infinite",
        "silo-rise": "silo-rise 220ms ease both",
        "silo-marquee": "silo-marquee 20s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
