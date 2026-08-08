import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T114 — constitution Principle I and Additional Constraints: the layering is
 * one-directional, and the engine is usable without a browser.
 *
 * ESLint already enforces this (research.md R6), so why assert it again here?
 * Because the lint rule is configuration, and configuration can be relaxed by
 * the same commit that violates it — a `// eslint-disable-next-line` is one
 * keystroke and reads as routine in a diff. This test cannot be silenced from
 * inside the file it is judging, which makes the two mechanisms independent
 * rather than redundant.
 *
 * It also states the rule in terms a reviewer can read, which is the point of
 * User Story 7: a claim about architecture that no test checks is a comment.
 */

const PURE_LAYERS = ['src/engine', 'src/strategy'];

/** Anything that would drag in React, a store, the network, or the DOM. */
const FORBIDDEN_IMPORTS = [
  /from\s+['"]react/,
  /from\s+['"]react-dom/,
  /from\s+['"]zustand/,
  /from\s+['"]@supabase\//,
  /from\s+['"][^'"]*\/ui\//,
  /from\s+['"][^'"]*\/store\//,
  /from\s+['"][^'"]*\/sync\//,
  /from\s+['"][^'"]*\/bots\//,
];

/** Globals that betray I/O, a clock, or unseeded randomness. */
const FORBIDDEN_GLOBALS = [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bwindow\./,
  /\bdocument\./,
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
  /\bMath\.random\b/,
  /\bDate\.now\b/,
  /\bnew Date\b/,
];

function sourceFiles(directory: string): string[] {
  const root = resolve(process.cwd(), directory);
  const found: string[] = [];

  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      // `data/` holds generated JSON, which has no imports to police.
      else if (/\.tsx?$/.test(entry.name)) found.push(path);
    }
  };

  walk(root);
  return found;
}

const FILES = PURE_LAYERS.flatMap(sourceFiles);

/** Comments describe the rule; only code can break it. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('the pure layers (Principle I)', () => {
  it('finds the files it claims to be checking', () => {
    // A walk that silently returned nothing would make every assertion below
    // pass while checking exactly nothing.
    expect(FILES.length).toBeGreaterThan(10);
  });

  it.each(FILES.map((file) => relative(process.cwd(), file)))(
    'Principle I: %s imports nothing from React, the store, sync, or bots',
    (file) => {
      const source = stripComments(readFileSync(resolve(process.cwd(), file), 'utf8'));
      for (const pattern of FORBIDDEN_IMPORTS) {
        expect(source, `${file} violates ${pattern}`).not.toMatch(pattern);
      }
    },
  );

  it.each(FILES.map((file) => relative(process.cwd(), file)))(
    'Principle I: %s performs no I/O, reads no clock, and uses no unseeded randomness',
    (file) => {
      const source = stripComments(readFileSync(resolve(process.cwd(), file), 'utf8'));
      for (const pattern of FORBIDDEN_GLOBALS) {
        expect(source, `${file} violates ${pattern}`).not.toMatch(pattern);
      }
    },
  );

  it('Additional Constraints: the engine imports only from within the engine', () => {
    for (const file of sourceFiles('src/engine')) {
      const source = stripComments(readFileSync(file, 'utf8'));
      const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]!);
      for (const specifier of imports) {
        // Relative and inside `src/engine`, or a Node-free type-only builtin.
        expect(specifier.startsWith('./'), `${file} imports ${specifier}`).toBe(true);
      }
    }
  });

  it('Additional Constraints: strategy reaches only into the engine and its own data', () => {
    for (const file of sourceFiles('src/strategy')) {
      const source = stripComments(readFileSync(file, 'utf8'));
      const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]!);
      for (const specifier of imports) {
        expect(
          specifier.startsWith('./') || specifier.startsWith('../engine/'),
          `${file} imports ${specifier}`,
        ).toBe(true);
      }
    }
  });
});
