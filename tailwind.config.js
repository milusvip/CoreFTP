/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        app: "rgb(var(--color-bg) / <alpha-value>)",
        fg: {
          DEFAULT: "rgb(var(--color-fg) / <alpha-value>)",
          muted: "rgb(var(--color-fg-muted) / <alpha-value>)",
          subtle: "rgb(var(--color-fg-subtle) / <alpha-value>)",
          faint: "rgb(var(--color-fg-faint) / <alpha-value>)",
        },
        menu: {
          fg: "rgb(var(--color-menu-fg) / <alpha-value>)",
        },
        surface: {
          DEFAULT: "rgb(var(--color-surface) / <alpha-value>)",
          alt: "rgb(var(--color-surface-alt) / <alpha-value>)",
          darker: "rgb(var(--color-surface-darker) / <alpha-value>)",
          light: "rgb(var(--color-surface-light) / <alpha-value>)",
          hover: "rgb(var(--color-surface-hover) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--color-accent) / <alpha-value>)",
          hover: "rgb(var(--color-accent-hover) / <alpha-value>)",
        },
      },
    },
  },
  plugins: [],
};
