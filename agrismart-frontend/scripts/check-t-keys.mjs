#!/usr/bin/env node
/**
 * scripts/check-t-keys.mjs
 *
 * Static sanity check standing in for a real build in this sandbox
 * (vite/rolldown/oxlint's native bindings for linux-arm64 aren't
 * installed and the registry is network-blocked here — same
 * environment limitation documented earlier in this project's
 * AGENTS.md/audit notes, not something this pass introduced).
 *
 * Scans every migrated .jsx file for `t('some.key')` / `t("some.key")`
 * calls (including the static half of `t(dynamicVar)` — those are
 * skipped, they can't be statically checked) and verifies each literal
 * key actually resolves in en.js. This is exactly the class of bug
 * `node scripts/check-i18n-completeness.mjs` can't catch (a key that's
 * spelled consistently wrong at both the call site and nowhere in the
 * dictionary is still "complete" by that script's definition) — it's
 * what caught the real `irrigation.commandQueued` vs
 * `commandNotYetConfirmed` mismatch during this pass.
 */
import { readFileSync } from 'fs';
import { globSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import en from '../src/i18n/locales/en.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, '..', 'src');

function flatten(obj, prefix = '') {
  const out = new Set();
  for (const [key, value] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const k of flatten(value, p)) out.add(k);
    } else {
      out.add(p);
    }
  }
  return out;
}

const validKeys = flatten(en);

function walk(dir, files = []) {
  for (const entry of require('fs').readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith('.jsx')) files.push(full);
  }
  return files;
}

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const files = walk(srcDir);
const pattern = /\bt\(\s*['"]([a-zA-Z0-9_.]+)['"]/g;
let missing = [];

for (const file of files) {
  const content = readFileSync(file, 'utf8');
  let m;
  while ((m = pattern.exec(content))) {
    const key = m[1];
    if (!validKeys.has(key)) {
      missing.push({ file: path.relative(srcDir, file), key });
    }
  }
}

if (missing.length) {
  console.error(`\n✗ ${missing.length} t() call(s) reference a key that doesn't exist in en.js:`);
  missing.forEach(({ file, key }) => console.error(`  - ${file}: "${key}"`));
  process.exit(1);
}

console.log(`✓ Every static t('...') key found across ${files.length} .jsx files resolves in en.js.`);
