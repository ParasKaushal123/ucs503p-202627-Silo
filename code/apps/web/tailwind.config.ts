import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        silo: {
          blue: "#4da2ff",
          purple: "#5c4ade",
          yellow: "#ffd731",
          green: "#55db9c",
          red: "#fb4903",
          lilac: "#e9ccff",
          sky: "#dceeff",
          cream: "#f7f7f5",
        },
      },
      borderRadius: {
        pill: "1600px",
      },
      fontFamily: {
        display: ["'Anton'", "sans-serif"],
        body: ["'Archivo'", "sans-serif"],
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
