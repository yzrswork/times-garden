// viewer.html に計算コードと台帳を埋め込み、単体で開ける index.html を作る。
// 使い方: node build.mjs（先に node run.mjs で history.json と soak.json を作っておく）
import { readFileSync, writeFileSync } from 'node:fs';
import { historyHash, runHistory } from './sim.mjs';
const here = f => new URL('./' + f, import.meta.url).pathname;
const strip = src => src.replace(/^import .*$/gm, '').replace(/^export /gm, '');
const sim = strip(readFileSync(here('constants.mjs'), 'utf8')) + '\n' + strip(readFileSync(here('sim.mjs'), 'utf8'));
const ledger = JSON.parse(readFileSync(here('ledger.json'), 'utf8'));
const soak = JSON.parse(readFileSync(here('soak.json'), 'utf8'));
const hash = historyHash(runHistory('times-garden-v1', ledger.issues));
const html = '<!doctype html>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n' +
  readFileSync(here('viewer.html'), 'utf8').replace('/*__SIM__*/', () => sim).replace('/*__LEDGER__*/', () => JSON.stringify(ledger)).replace('/*__SOAK__*/', () => JSON.stringify(soak)).replace('/*__HASH__*/', () => JSON.stringify(hash));
writeFileSync(here('index.html'), html);
console.log('index.html', html.length, 'bytes, hash', hash);
