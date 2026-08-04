/**
 * T009 — the Data Safety gate (constitution gate 6, NFR-006).
 *
 * Scans the built client output for any trace of a database credential. A
 * non-zero exit is a release blocker, not a warning: a build that ships the
 * service key to the browser is a defect, not a configuration choice.
 *
 * The scan is structural rather than procedural. Vite only inlines variables
 * prefixed `VITE_`, so a credential can only reach `dist/` through a naming
 * mistake or a hardcoded literal — and both of those are exactly what the
 * patterns below catch.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = 'dist';

/** Things that must never appear in client output. */
const FORBIDDEN_PATTERNS: { name: string; test: (text: string) => number[] }[] = [
  {
    name: 'SUPABASE_SERVICE literal',
    test: (text) => allIndexesOf(text, 'SUPABASE_SERVICE'),
  },
  {
    name: 'SUPABASE_SERVICE_KEY literal',
    test: (text) => allIndexesOf(text, 'SUPABASE_SERVICE_KEY'),
  },
  {
    name: 'VITE_-prefixed Supabase variable (would be inlined by Vite)',
    test: (text) => allIndexesOf(text, 'VITE_SUPABASE'),
  },
  {
    name: 'service_role JWT claim',
    test: (text) => allIndexesOf(text, 'service_role'),
  },
  {
    name: 'the live value of SUPABASE_SERVICE_KEY from the environment',
    test: (text) => {
      const key = process.env.SUPABASE_SERVICE_KEY;
      if (!key || key.length < 16) return [];
      return allIndexesOf(text, key);
    },
  },
];

function allIndexesOf(haystack: string, needle: string): number[] {
  const hits: number[] = [];
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return hits;
    hits.push(at);
    from = at + needle.length;
  }
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function main(): void {
  if (!existsSync(DIST)) {
    console.error(`check:bundle — no ${DIST}/ directory. Run \`npm run build\` first.`);
    process.exit(1);
  }

  const files = walk(DIST);
  const findings: string[] = [];

  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const pattern of FORBIDDEN_PATTERNS) {
      const hits = pattern.test(text);
      if (hits.length > 0) {
        findings.push(`  ${relative('.', file)} — ${pattern.name} (${hits.length}x)`);
      }
    }
  }

  if (findings.length > 0) {
    console.error('check:bundle FAILED — credential material found in client output:\n');
    console.error(findings.join('\n'));
    console.error(
      '\nThe credential must exist only in server-side configuration, read exclusively\n' +
        'inside api/. See NFR-006 and the constitution Data Safety gate.',
    );
    process.exit(1);
  }

  console.error(`check:bundle OK — scanned ${files.length} file(s) in ${DIST}/, no credential found.`);
}

main();
