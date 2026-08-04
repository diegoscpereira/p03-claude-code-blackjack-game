import type { Config } from 'tailwindcss';

/**
 * T003 — colour tokens.
 *
 * Constitution Principle III requires WCAG 2.1 AA contrast on interactive
 * elements, and NFR-008 makes it testable. Keeping every colour here means the
 * contrast audit (T123) has one file to check rather than a codebase to grep.
 *
 * Measured contrast ratios (sRGB relative luminance, WCAG 2.1 formula):
 *
 *   ink       on felt    9.25:1   ink       on panel  14.77:1
 *   muted     on felt    5.66:1   muted     on panel   9.04:1
 *   accent    on felt    5.42:1   accent    on panel   8.65:1
 *   win       on felt    6.40:1   loss      on felt     4.95:1
 *   info      on felt    5.58:1   ink-inverse on accent 9.20:1
 *
 * All are >= 4.5:1, the AA threshold for normal-size text. `border` is
 * decorative only and never carries text; focus rings use `accent`, which
 * clears the 3:1 non-text threshold against both surfaces.
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        felt: {
          DEFAULT: '#0F4D33',
          deep: '#0A3524',
        },
        panel: '#10261D',
        border: '#2C5545',
        ink: {
          DEFAULT: '#F5F7F5',
          muted: '#B9C7BF',
          inverse: '#0A1F16',
        },
        accent: '#E8B84B',
        win: '#7EE3A8',
        loss: '#FF9B9E',
        info: '#8FC7FF',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
