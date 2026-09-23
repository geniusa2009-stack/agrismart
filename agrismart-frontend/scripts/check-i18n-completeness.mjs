#!/usr/bin/env node
/**
 * scripts/check-i18n-completeness.mjs
 *
 * Diffs en.js / ar.js / ar-eg.js key sets. ar-eg.js is a deliberate
 * SPARSE override (see its own header) so it is only checked for keys
 * that don't exist at all in ar.js (a typo'd/orphaned key), not for
 * "missing" keys relative to en/ar — those are expected and fall back
 * by design. en.js and ar.js are checked against each other in full:
 * any key present in one and missing in the other is a real gap.
 *
 * Exit code 1 if en/ar are out of sync or ar-eg has an orphaned key;
 * 0 otherwise. Run: node scripts/check-i18n-completeness.mjs
 */
import en from '../src/i18n/locales/en.js';
import ar from '../src/i18n/locales/ar.js';
import arEg from '../src/i18n/locales/ar-eg.js';

function flatten(obj, prefix = '') {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flatten(value, path));
    } else {
      out[path] = value;
    }
  }
  return out;
}

const enKeys = new Set(Object.keys(flatten(en)));
const arKeys = new Set(Object.keys(flatten(ar)));
const arEgKeys = new Set(Object.keys(flatten(arEg)));

const missingInAr = [...enKeys].filter((k) => !arKeys.has(k));
const missingInEn = [...arKeys].filter((k) => !enKeys.has(k));
const orphanedArEg = [...arEgKeys].filter((k) => !arKeys.has(k));

let failed = false;

if (missingInAr.length) {
  failed = true;
  console.error(`\n✗ ${missingInAr.length} key(s) present in en.js but missing in ar.js:`);
  missingInAr.forEach((k) => console.error(`  - ${k}`));
}

if (missingInEn.length) {
  failed = true;
  console.error(`\n✗ ${missingInEn.length} key(s) present in ar.js but missing in en.js:`);
  missingInEn.forEach((k) => console.error(`  - ${k}`));
}

if (orphanedArEg.length) {
  failed = true;
  console.error(`\n✗ ${orphanedArEg.length} key(s) in ar-eg.js don't exist in ar.js (orphaned override):`);
  orphanedArEg.forEach((k) => console.error(`  - ${k}`));
}

if (!failed) {
  console.log(`✓ i18n completeness OK — en.js and ar.js both have ${enKeys.size} keys, fully matched.`);
  console.log(`✓ ar-eg.js overrides ${arEgKeys.size} keys, all valid (exist in ar.js).`);
}

process.exit(failed ? 1 : 0);
