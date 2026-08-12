import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Primary = deep teal (a clear, professional departure from generic navy —
        // teal + gold is a classic heritage boardroom pairing; conservative, not loud).
        brand: {
          50: "#ecf6f6",
          100: "#cfe9e9",
          200: "#a1d2d4",
          300: "#69b3b7",
          400: "#3a9197",
          500: "#1f757c",
          600: "#155c64",
          700: "#134a52",
          800: "#103a42",
          900: "#0b2930",
          950: "#06171c",
        },
        // Iridescent accents — kept for subtle glass edges only (used sparingly).
        iris: {
          teal: "#5eead4",
          aqua: "#67c7f7",
          blue: "#6b9bf7",
          violet: "#a78bfa",
          orchid: "#e7a9f5",
        },
        // Accent = warm amber-gold (a little more luminous and saturated than the
        // old champagne, for a richer but still restrained accent).
        gold: {
          50: "#fcf8ed",
          100: "#f7edcf",
          200: "#eed89c",
          300: "#e4c069",
          400: "#dcae47",
          500: "#cb9a36",
          600: "#a87c2d",
          700: "#855f2b",
          800: "#6b4c28",
          900: "#593f22",
        },
        // Deep teal-ink for dark surfaces (matches the teal brand ramp).
        ink: {
          800: "#103138",
          900: "#0b2329",
          950: "#06171c",
        },
        // Ivory surfaces (a hair cooler so the sapphire reads crisp on top).
        cream: {
          50: "#fffefb",
          100: "#f8f6f0",
          200: "#f1ecdf",
          300: "#e9e1cf",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "Segoe UI", "Arial", "sans-serif"],
        serif: ["var(--font-serif)", "Playfair Display", "Georgia", "ui-serif", "serif"],
      },
      boxShadow: {
        // --- Dimensional elevation scale (sun from top) -----------------------
        // A consistent 4-step ladder gives the UI real depth instead of flatness.
        // Each step pairs a tight contact shadow with a soft ambient one, plus a
        // hairline top highlight so surfaces read as gently convex.
        e1: "inset 0 1px 0 0 rgba(255,255,255,0.75), 0 1px 1px rgba(13,23,48,0.05), 0 2px 4px -1px rgba(13,23,48,0.08)",
        e2: "inset 0 1px 0 0 rgba(255,255,255,0.75), 0 2px 4px -1px rgba(13,23,48,0.07), 0 6px 12px -3px rgba(13,23,48,0.10)",
        e3: "inset 0 1px 0 0 rgba(255,255,255,0.80), 0 6px 12px -4px rgba(13,23,48,0.10), 0 16px 28px -8px rgba(13,23,48,0.16)",
        e4: "inset 0 1px 0 0 rgba(255,255,255,0.85), 0 12px 24px -8px rgba(13,23,48,0.14), 0 28px 56px -16px rgba(13,23,48,0.24)",
        // Concave (pressed / inputs) — light catches the bottom inner edge.
        inset: "inset 0 1px 2px rgba(13,23,48,0.10), inset 0 1px 1px rgba(13,23,48,0.05)",
        // Tactile button depth (drop + inner top highlight).
        btn: "inset 0 1px 0 0 rgba(255,255,255,0.18), 0 1px 2px rgba(13,23,48,0.20), 0 3px 8px -2px rgba(13,23,48,0.28)",
        "btn-hover": "inset 0 1px 0 0 rgba(255,255,255,0.22), 0 2px 4px rgba(13,23,48,0.22), 0 8px 18px -4px rgba(13,23,48,0.34)",

        // --- Legacy aliases (kept so existing components stay consistent) ------
        card: "inset 0 1px 0 0 rgba(255,255,255,0.75), 0 1px 1px rgba(13,23,48,0.05), 0 2px 4px -1px rgba(13,23,48,0.08)",
        soft: "inset 0 1px 0 0 rgba(255,255,255,0.75), 0 2px 4px -1px rgba(13,23,48,0.07), 0 6px 12px -3px rgba(13,23,48,0.10)",
        lift: "inset 0 1px 0 0 rgba(255,255,255,0.80), 0 6px 12px -4px rgba(13,23,48,0.10), 0 16px 28px -8px rgba(13,23,48,0.16)",
        pop: "0 12px 24px -8px rgba(9,19,36,0.28), 0 28px 56px -16px rgba(9,19,36,0.45)",
        gold: "0 0 0 1px rgba(203,154,54,0.32), 0 10px 28px -12px rgba(203,154,54,0.45)",
        hairline: "inset 0 1px 0 0 rgba(255,255,255,0.70)",
        glass: "inset 0 1px 0 0 rgba(255,255,255,0.65), 0 8px 24px -8px rgba(9,19,36,0.16), 0 18px 40px -16px rgba(9,19,36,0.20)",
      },
      borderRadius: {
        lg: "0.625rem",
        xl: "0.875rem",
        "2xl": "1.125rem",
        "3xl": "1.5rem",
      },
      transitionTimingFunction: {
        premium: "cubic-bezier(0.22, 1, 0.36, 1)",
        "premium-in": "cubic-bezier(0.65, 0, 0.35, 1)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "scale-in": { from: { opacity: "0", transform: "scale(0.97)" }, to: { opacity: "1", transform: "scale(1)" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-12px)" } },
        sheen: { "0%": { transform: "translateX(-120%) skewX(-12deg)" }, "60%,100%": { transform: "translateX(220%) skewX(-12deg)" } },
        "pulse-ring": { "0%": { boxShadow: "0 0 0 0 rgba(195,154,60,0.45)" }, "70%": { boxShadow: "0 0 0 8px rgba(195,154,60,0)" }, "100%": { boxShadow: "0 0 0 0 rgba(195,154,60,0)" } },
        aurora: {
          "0%, 100%": { transform: "translate3d(0,0,0) scale(1)" },
          "33%": { transform: "translate3d(5%,-4%,0) scale(1.12)" },
          "66%": { transform: "translate3d(-4%,5%,0) scale(0.94)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.6s cubic-bezier(0.22,1,0.36,1) both",
        "scale-in": "scale-in 0.4s cubic-bezier(0.22,1,0.36,1) both",
        float: "float 16s ease-in-out infinite",
        shimmer: "shimmer 1.6s infinite",
        sheen: "sheen 6s ease-in-out infinite",
        "pulse-ring": "pulse-ring 2.4s cubic-bezier(0.22,1,0.36,1) infinite",
        "aurora-slow": "aurora 26s ease-in-out infinite",
        "aurora-mid": "aurora 20s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
