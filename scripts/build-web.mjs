#!/usr/bin/env node
/**
 * Assembles the static web build from the Android assets folder.
 *
 *   node scripts/build-web.mjs                 offline
 *   APK_URL=https://... node scripts/build-web.mjs
 *
 * Output: web/  (pushed to the `web` branch for raw.githack / Pages)
 */
import { cpSync, readFileSync, writeFileSync, rmSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(root, 'app/src/main/assets');
const out = join(root, 'web');

const APK_URL = process.env.APK_URL || '';
const GUIDE_URL = process.env.WEB_GUIDE_URL || 'data/guide.json';

if (existsSync(out)) {
  for (const entry of readdirSync(out)) rmSync(join(out, entry), { recursive: true, force: true });
} else {
  mkdirSync(out, { recursive: true });
}

cpSync(assets, out, { recursive: true });

const cfgPath = join(out, 'js/config.js');
let cfg = readFileSync(cfgPath, 'utf8');
cfg = cfg.replace('__BUILD_AT__', new Date().toISOString());
cfg = cfg.replace('__GUIDE_URL__', GUIDE_URL);
cfg = cfg.replace('__APK_URL__', APK_URL);
writeFileSync(cfgPath, cfg);

writeFileSync(join(out, '.nojekyll'), '');

function count(dir) {
  let n = 0;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    n += statSync(p).isDirectory() ? count(p) : 1;
  }
  return n;
}

console.log(`web build: ${count(out)} files -> web/`);
console.log(`  guide url : ${GUIDE_URL}`);
console.log(`  apk url   : ${APK_URL || '(not set)'}`);
