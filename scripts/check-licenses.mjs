#!/usr/bin/env node
// Fails if any dependency uses a licence outside the allowlist (PLAN.md §10.5).
// Works on private repositories, unlike GitHub's dependency review.
// All dependencies are checked, not only production ones: UI libraries are
// dev dependencies but end up bundled inside the app.
import { execFileSync } from 'node:child_process';

const ALLOWED = new Set([
  '0BSD',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC-BY-4.0',
  'CC0-1.0',
  'ISC',
  'MIT',
  'MIT-0',
  'MPL-2.0',
  'OFL-1.1',
  'Python-2.0',
  'Unlicense',
  'WTFPL',
  'Zlib',
]);

/**
 * Packages whose package.json names a licence loosely, checked by reading
 * their LICENSE file. Name → the licence that file actually is.
 */
const REVIEWED = new Map([
  // Used by mammoth (Word import). package.json says "BSD"; LICENSE is BSD-2-Clause.
  ['duck', 'BSD-2-Clause'],
]);

/** "MIT (http://…)" → "MIT"; "(MIT OR CC0-1.0)" → alternatives; AND needs all parts. */
export function isAllowed(expression) {
  const cleaned = expression
    .replace(/\s*\(https?:[^)]*\)/g, '')
    .replace(/^\((.*)\)$/, '$1')
    .trim();
  return cleaned.split(/\s+OR\s+/i).some((option) =>
    option
      .replace(/[()]/g, '')
      .split(/\s+AND\s+/i)
      .every((part) => ALLOWED.has(part.trim())),
  );
}

const output = execFileSync('pnpm', ['licenses', 'list', '--json'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
  maxBuffer: 64 * 1024 * 1024,
});
const byLicense = JSON.parse(output);
const problems = Object.entries(byLicense)
  .filter(([license]) => !isAllowed(license))
  .flatMap(([license, packages]) =>
    packages
      .filter((p) => !isAllowed(REVIEWED.get(p.name) ?? ''))
      .map((p) => `${p.name}@${p.versions.join(',')}: ${license}`),
  );

if (problems.length > 0) {
  console.error('Dependencies with licences outside the allowlist:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(`Licences OK (${Object.keys(byLicense).length} licence types checked).`);
