import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        operational: "#16a34a",
        degraded: "#eab308",
        partial: "#f97316",
        major: "#dc2626",
        maintenance: "#3b82f6",
      },
    },
  },
  plugins: [],
};

export default config;
