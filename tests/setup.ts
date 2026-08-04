/**
 * Shared Vitest setup.
 *
 * Deliberately thin. Unit tests run in a Node environment with no DOM, so
 * anything browser-specific has to be guarded — an unguarded jsdom assumption
 * here would silently let a browser dependency leak into `tests/unit/`, which
 * is the failure mode quickstart.md's troubleshooting table warns about.
 */
import { afterEach } from 'vitest';

const hasDom = typeof globalThis.document !== 'undefined';

if (hasDom) {
  await import('@testing-library/jest-dom/vitest');
  const { cleanup } = await import('@testing-library/react');
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });
}
