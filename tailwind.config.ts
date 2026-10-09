import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950: "#070b14", 900: "#0b1220", 850: "#0f172a", 800: "#141d33", 700: "#1e2a45", 600: "#2a3a5c" },
      },
    },
  },
  plugins: [],
} satisfies Config;
