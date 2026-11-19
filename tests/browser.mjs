// ブラウザ（Chromium）で、公開データ（data/）から全史を組み立て、Node（pipeline）の結果とハッシュを比べる。
// 使い方: node tests/browser.mjs（Playwright と Chromium が必要。engine/ はファイルのまま読み込み、書き換えない）
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = resolve(new URL('..', import.meta.url).pathname);
const manifest = JSON.parse(readFileSync(root + '/data/manifest.json', 'utf8'));
const types = { '.mjs': 'text/javascript', '.json': 'application/json' };

const browser = await chromium.launch();
const page = await browser.newPage();
await page.route('http://garden.test/**', route => {
  const p = decodeURIComponent(new URL(route.request().url()).pathname);
  if (p === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>browser test</title>' });
  const f = resolve(root, '.' + p);
  const allowed = (f.startsWith(root + sep + 'engine' + sep) || f.startsWith(root + sep + 'data' + sep)) && types[extname(f)];
  if (!allowed) return route.fulfill({ status: 404, body: '' });
  try { return route.fulfill({ contentType: types[extname(f)], body: readFileSync(f) }); } catch { return route.fulfill({ status: 404, body: '' }); }
});
await page.goto('http://garden.test/');
const out = await page.evaluate(async () => {
  const W = await import('/engine/world.mjs'), CP = await import('/engine/checkpoint.mjs'), O = await import('/engine/observations.mjs');
  const get = async p => (await fetch(p)).json();
  const manifest = await get('/data/manifest.json');
  const ledger = (await get('/data/ledger.json')).issues;
  const chunks = await Promise.all(manifest.checkpoints.map(n => get('/data/observations/' + O.fileName(n))));
  const checkpoints = await Promise.all(manifest.checkpoints.map(n => get('/data/checkpoints/' + O.fileName(n))));
  const median = f => { const ts = []; let v; for (let i = 0; i < 7; i++) { const t = performance.now(); v = f(); ts.push(performance.now() - t); } ts.sort((a, b) => a - b); return { v, ms: Math.round(ts[3] * 10) / 10 }; };
  const r = median(() => O.restore({ manifest, ledger, chunks, checkpoints }));
  const full = median(() => W.runAll(manifest.seed, ledger));
  return {
    ua: navigator.userAgent, issues: ledger.length,
    restored: { from: r.v.from, problems: r.v.problems, ms: r.ms, hash: W.historyHash(W.summarize(r.v.W, r.v.snapshots)), state: CP.stateHash(r.v.W) },
    full: { ms: full.ms, hash: W.historyHash(W.summarize(full.v.W, full.v.snapshots)), state: CP.stateHash(full.v.W) },
  };
});
await browser.close();

let failures = 0;
const ok = (c, m) => { console.log(`${c ? '  ok ' : '  NG '} ${m}`); if (!c) failures++; };
console.log(`ブラウザ: ${out.ua.match(/(Headless)?Chrome\/[\d.]+/)?.[0] || out.ua}、台帳 ${out.issues}号`);
ok(out.restored.from === manifest.checkpoints.at(-1) && out.restored.problems.length === 0, `いちばん新しい途中経過（${out.restored.from}号目）を使った（問題 ${out.restored.problems.length}件）`);
ok(out.restored.hash === manifest.historyHash && out.restored.state === manifest.stateHash, `途中経過から ${out.issues - out.restored.from}号を計算した全史と最後の状態が Node と一致（観測データの読み込みと照合を含めて ${out.restored.ms}ms）`);
ok(out.full.hash === manifest.historyHash && out.full.state === manifest.stateHash, `創刊号から ${out.issues}号を計算した全史と最後の状態も Node と一致（${out.full.ms}ms）`);
console.log(failures ? `失敗 ${failures}件` : 'すべて成功');
process.exit(failures ? 1 : 0);
