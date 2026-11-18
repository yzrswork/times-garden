// ブラウザ（Chromium）で、Node が保存した途中経過から続きを計算し、Node の全史とハッシュを比べる。
// 使い方: node browser-test.mjs（Playwright と Chromium が必要。モジュールはファイルのまま読み込み、書き換えない）
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { runHistory, historyHash, initWorld, stepIssue } from '../ecosystem-core/sim.mjs';
import { stateHash } from './checkpoint.mjs';
import { MAIN_SEED } from './constants.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = resolve(new URL('..', import.meta.url).pathname); // prototypes/
const ledger = JSON.parse(readFileSync(root + '/ecosystem-core/ledger.json', 'utf8')).issues;
const nodeHash = historyHash(runHistory(MAIN_SEED, ledger));
const nodeState = (() => { const w = initWorld(MAIN_SEED); for (const i of ledger) stepIssue(w, i); return stateHash(w); })();
const files = readdirSync(root + '/checkpoint/checkpoints').filter(f => f.endsWith('.json')).sort();

const browser = await chromium.launch();
const page = await browser.newPage();
const types = { '.mjs': 'text/javascript', '.json': 'application/json', '.html': 'text/html' };
await page.route('http://garden.test/**', route => {
  const p = decodeURIComponent(new URL(route.request().url()).pathname);
  if (p === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>checkpoint test</title>' });
  const f = resolve(root, '.' + p);
  if (!f.startsWith(root + sep) || !types[extname(f)]) return route.fulfill({ status: 404, body: '' });
  try { return route.fulfill({ contentType: types[extname(f)], body: readFileSync(f) }); } catch { return route.fulfill({ status: 404, body: '' }); }
});
await page.goto('http://garden.test/');
const out = await page.evaluate(async ({ files, seed }) => {
  const sim = await import('/ecosystem-core/sim.mjs');
  const cpm = await import('/checkpoint/checkpoint.mjs');
  const get = async p => (await fetch(p)).json();
  const ledger = (await get('/ecosystem-core/ledger.json')).issues;
  const observed = (await get('/ecosystem-core/history.json')).snapshots; // これまでの記録（観測データ）として使う
  const cps = await Promise.all(files.map(f => get('/checkpoint/checkpoints/' + f)));
  const median = f => { const ts = []; let v; for (let i = 0; i < 7; i++) { const t = performance.now(); v = f(); ts.push(performance.now() - t); } ts.sort((a, b) => a - b); return { v, ms: Math.round(ts[3] * 10) / 10 }; };
  const full = median(() => sim.runHistory(seed, ledger));
  const each = cps.map(cp => { const { v, ms } = median(() => cpm.resume(cp, ledger, { seed, prior: observed.slice(0, cp.count) })); return { from: cp.count, ms, hash: sim.historyHash(v.result), state: cpm.stateHash(v.W) }; });
  const latest = cpm.latestUsable(cps, ledger, { seed, prior: observed });
  return { ua: navigator.userAgent, fullHash: sim.historyHash(full.v), fullMs: full.ms, each, latest: { from: latest.from, hash: sim.historyHash(latest.result), skipped: latest.skipped.length } };
}, { files, seed: MAIN_SEED });
await browser.close();

let failures = 0;
const ok = (c, m) => { console.log(`${c ? '  ok ' : '  NG '} ${m}`); if (!c) failures++; };
console.log(`ブラウザ: ${out.ua.match(/(Headless)?Chrome\/[\d.]+/)?.[0] || out.ua}`);
ok(out.fullHash === nodeHash, `創刊号から${ledger.length}号を計算した全史が Node と一致（${out.fullMs}ms）`);
for (const e of out.each) ok(e.hash === nodeHash && e.state === nodeState, `${e.from}号目の途中経過（Node で保存）から${ledger.length - e.from}号を計算した全史と最後の状態が Node と一致（${e.ms}ms）`);
ok(out.latest.from === out.each.at(-1)?.from && out.latest.hash === nodeHash && out.latest.skipped === 0, `いちばん新しい途中経過（${out.latest.from}号目）を自動で選んで計算し、一致`);
console.log(failures ? `失敗 ${failures}件` : 'すべて成功');
process.exit(failures ? 1 : 0);
