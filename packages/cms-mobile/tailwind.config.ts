import type { Config } from "tailwindcss";

// Tailwind v3 config for webhouse.app mobile.
// Dark theme by default — matches the iOS app icon (#0D0D0D).
// Brand: #F7BB2E gold accent, #0D0D0D background, white text.
const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          gold: "#F7BB2E",
          goldDark: "#D9A11A",
          dark: "#0D0D0D",
          darkSoft: "#1c1c1c",
          darkPanel: "#212135",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "system-ui",
          "sans-serif",
        ],
      },
      spacing: {
        // 44pt minimum touch target per Apple HIG
        touch: "44px",
        // Safe area inset placeholders — actual values come from CSS env()
        "safe-top": "env(safe-area-inset-top)",
        "safe-bottom": "env(safe-area-inset-bottom)",
      },
    },
  },
  plugins: [],
};

export default config;
