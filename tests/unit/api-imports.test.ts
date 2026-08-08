import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Relative imports under `api/` must carry an explicit file extension.
 *
 * This test exists because of a production incident rather than a hypothesis.
 * `package.json` sets `"type": "module"`, so Vercel runs the compiled functions
 * as ESM — and Node's ESM resolver, unlike a bundler, does not guess
 * extensions. `import ... from './_lib/http'` type-checked, linted, and passed
 * every contract test locally, then failed *every* request in production with:
 *
 *   ERR_MODULE_NOT_FOUND: Cannot find module '/var/task/api/_lib/http'
 *
 * The whole handler crashed at module load, so even the paths that never touch
 * the database — the 400 for a missing `player_id` — returned 500.
 *
 * The contract tests could not catch this: they import the handlers through
 * Vite's resolver, which happily fills the extension in. Only the deployed Node
 * runtime is strict, which is exactly the kind of gap worth a cheap static
 * check rather than another integration test.
 */

const API_ROOT = resolve(process.cwd(), 'api');

function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(path));
    else if (entry.name.endsWith('.ts')) found.push(path);
  }
  return found;
}

const FILES = sourceFiles(API_ROOT).map((file) => relative(process.cwd(), file));

/** Every `from '...'` specifier in a file, comments stripped. */
function importsOf(file: string): string[] {
  const source = readFileSync(resolve(process.cwd(), file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  return [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]!);
}

describe('api/ module resolution (Node ESM)', () => {
  it('finds the handler files it claims to check', () => {
    // A walk that returned nothing would make the assertions below vacuous.
    expect(FILES.length).toBeGreaterThanOrEqual(4);
    expect(FILES.some((file) => file.includes('progress'))).toBe(true);
    expect(FILES.some((file) => file.includes('hands'))).toBe(true);
  });

  it.each(FILES)('%s: every relative import carries an explicit extension', (file) => {
    const offenders = importsOf(file).filter(
      (specifier) => specifier.startsWith('.') && !specifier.endsWith('.js'),
    );
    expect(offenders, `${file} would fail at module load in the Node runtime`).toEqual([]);
  });

  it.each(FILES)('%s: imports no .ts extension, which Node cannot load', (file) => {
    // `allowImportingTsExtensions` is on for the test tooling, so this is a
    // mistake TypeScript would otherwise accept.
    const offenders = importsOf(file).filter((specifier) => specifier.endsWith('.ts'));
    expect(offenders).toEqual([]);
  });

  it('the handlers do not reach into src/, which is bundled for the browser', () => {
    for (const file of FILES) {
      const offenders = importsOf(file).filter((specifier) => specifier.includes('src/'));
      expect(offenders, `${file} imports client code`).toEqual([]);
    }
  });
});
