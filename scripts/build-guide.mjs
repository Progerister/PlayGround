#!/usr/bin/env node
/**
 * Generates the runtime guide payload from guide/source.json.
 *
 *   node scripts/build-guide.mjs            offline build (keeps last known checks)
 *   node scripts/build-guide.mjs --online   re-checks every source URL
 *
 * Outputs:
 *   app/src/main/assets/data/guide.json     primary, fetched at runtime
 *   app/src/main/assets/js/guide-data.js    bundled fallback snapshot
 *   guide/sources.json                      source check report
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const online = process.argv.includes('--online');
const src = JSON.parse(readFileSync(resolve(root, 'guide/source.json'), 'utf8'));

const CHECK_FILE = resolve(root, 'guide/sources.json');
const previous = existsSync(CHECK_FILE) ? JSON.parse(readFileSync(CHECK_FILE, 'utf8')) : { checks: [] };
const prevById = new Map(previous.checks.map((c) => [c.id, c]));

async function checkSource(s) {
  const prev = prevById.get(s.id) || {};
  const started = Date.now();
  let status = 'err';
  let http = 0;
  let title = prev.title || '';
  let error = '';
  try {
    const res = await fetch(s.url, {
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
        accept: 'text/html,application/xhtml+xml,*/*'
      },
      signal: AbortSignal.timeout(15000)
    });
    http = res.status;
    if (res.ok) {
      status = 'ok';
      const html = await res.text();
      const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (m) title = m[1].replace(/\s+/g, ' ').trim().slice(0, 160);
    } else {
      error = `HTTP ${res.status}`;
    }
  } catch (e) {
    error = String(e && e.message ? e.message : e).slice(0, 120);
  }
  return {
    id: s.id,
    name: s.name,
    url: s.url,
    note: s.note,
    status,
    http,
    title,
    error,
    ms: Date.now() - started,
    checkedAt: status === 'ok' ? new Date().toISOString() : (prev.checkedAt || null)
  };
}

const checks = await Promise.all(src.sources.map(checkSource));
const report = {
  builtAt: new Date().toISOString(),
  online,
  checks
};
mkdirSync(dirname(CHECK_FILE), { recursive: true });
writeFileSync(CHECK_FILE, JSON.stringify(report, null, 2) + '\n');

const okCount = checks.filter((c) => c.status === 'ok').length;
const payload = {
  meta: {
    ...src.meta,
    builtAt: new Date().toISOString(),
    sourcesOk: okCount,
    sourcesTotal: checks.length
  },
  feedNote: src.feedNote,
  updates: src.updates,
  stages: src.stages,
  farmCats: src.farmCats,
  farm: src.farm,
  arcana: src.arcana,
  tables: src.tables,
  checklist: src.checklist,
  pitfalls: src.pitfalls,
  nextHints: src.nextHints,
  sources: src.sources.map((s) => {
    const c = checks.find((x) => x.id === s.id) || {};
    return { ...s, status: c.status || 'unknown', checkedAt: c.checkedAt || null, title: c.title || '' };
  })
};

const json = JSON.stringify(payload, null, 2) + '\n';
const outDirs = [
  resolve(root, 'app/src/main/assets/data'),
  resolve(root, 'app/src/main/assets/js'),
];
for (const dir of outDirs) mkdirSync(dir, { recursive: true });
writeFileSync(resolve(root, 'app/src/main/assets/data/guide.json'), json);
writeFileSync(
  resolve(root, 'app/src/main/assets/js/guide-data.js'),
  'window.GUIDE_BUNDLE = ' + JSON.stringify(payload) + ';\n'
);
for (const dir of [resolve(root, 'web/data'), resolve(root, 'web/js')]) {
  if (existsSync(dirname(dir))) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'guide.json'), json);
    if (dir.endsWith('/js')) {
      writeFileSync(resolve(dir, 'guide-data.js'), 'window.GUIDE_BUNDLE = ' + JSON.stringify(payload) + ';\n');
    }
  }
}

const bytes = Buffer.byteLength(json);
console.log(`guide v${payload.meta.version} built at ${payload.meta.builtAt} (${bytes} bytes)`);
console.log(`sources: ${okCount}/${checks.length} ok ${online ? '(online)' : '(offline, previous checks reused)'}`);
for (const c of checks) console.log(`  ${c.status === 'ok' ? 'ok  ' : 'ERR '} ${c.id.padEnd(10)} ${c.http || '-'} ${c.title ? c.title.slice(0, 60) : c.error || ''}`);
