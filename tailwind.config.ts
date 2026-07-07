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
        operational: "#0a9d58",
        degraded: "#f4c20d",
        partial: "#e8710a",
        major: "#d93025",
        maintenance: "#2f80ed",
      },
    },
  },
  plugins: [],
};

export default config;
