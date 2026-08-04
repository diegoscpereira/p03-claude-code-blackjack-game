/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Deterministic output keeps `check:bundle` scanning a stable surface.
    sourcemap: false,
    target: 'es2022',
  },
  test: {
    globals: true,
    // T004: engine/strategy/progression tests run in Node with no DOM at all —
    // an accidental React import in src/engine must break them, not be papered
    // over by a jsdom global. Component tests opt in to jsdom by directory.
    environment: 'node',
    environmentMatchGlobs: [['tests/integration/**', 'jsdom']],
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    // Constitution Principle IV: the unit + integration suite is budgeted at 30s.
    testTimeout: 10_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/data/**', 'src/main.tsx', 'src/**/*.d.ts'],
      // T005: a hard 90% line gate, scoped to the rules and scoring modules.
      // Presentation code has no minimum (constitution Principle II).
      thresholds: {
        'src/engine/**': { lines: 90 },
        'src/strategy/**': { lines: 90 },
      },
    },
  },
});
