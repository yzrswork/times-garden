// 実データで全史を計算し、決定論のテストと長期運転テストを行う。
// 使い方: node run.mjs [ledger.json] [history.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { runHistory, historyHash, rng } from './sim.mjs';

const ledgerPath = process.argv[2] || new URL('./ledger.json', import.meta.url).pathname;
const outPath = process.argv[3] || new URL('./history.json', import.meta.url).pathname;
const SEED = 'times-garden-v1';
const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8')).issues;

// 1) 実データの全史
const h1 = runHistory(SEED, ledger), h2 = runHistory(SEED, ledger);
const a = historyHash(h1), b = historyHash(h2);
console.log(`決定論テスト: ${a === b ? '一致' : '不一致'} (${a})`);
if (a !== b) process.exit(1);
writeFileSync(outPath, JSON.stringify(h1) + '\n');
const last = h1.snapshots[h1.snapshots.length - 1];
console.log(`実データ ${ledger.length}号: 恒星=${h1.star} 最終 ${last.gyr}Gyr T=${last.T}℃ CO2=${last.CO2}ppm O2=${last.O2}PAL 系統=${last.nSpecies} 最大の複雑さ=${last.maxCx}`);
console.log('出来事:', h1.snapshots.flatMap(s => s.events.map(e => `#${s.issueNo} ${e.t}`)).filter(x => !/小さな隕石|超大陸/.test(x)).join(' / '));

// 2) 長期運転テスト: 合成の号で 2000 号ぶん、種を変えて回す
function synthLedger(seed, n) {
  const r = rng('synth', seed); const out = [];
  for (let i = 1; i <= n; i++) out.push({ issueNo: i, date: '', edition: i % 2 ? 'morning' : 'midday', gems: r() < 0.25 ? 1 : r() < 0.05 ? 2 : 0, meanTemp: 45 + r() * 45, newKeywords: Math.floor(r() * 16), digest: String(i) });
  return out;
}
const N = Number(process.env.SOAK_RUNS || 40), LEN = Number(process.env.SOAK_LEN || 2000);
const stats = { noLife: 0, sterileEnd: 0, frozenEnd: 0, hotEnd: 0, reachedCx3: 0, reachedCx4: 0, reachedMind: 0, landed: 0, goe: 0, monoculture: 0, stagnantTail: 0, snowballs: 0, mass: 0 };
for (let k = 0; k < N; k++) {
  const h = runHistory('soak-' + k, synthLedger('soak-' + k, LEN));
  const s = h.snapshots, end = s[s.length - 1], f = h.flags;
  if (!f.abio) stats.noLife++;
  if (f.abio && end.nSpecies === 0) stats.sterileEnd++;
  if (s.slice(-200).every(x => x.snowball)) stats.frozenEnd++;
  if (end.T > 70) stats.hotEnd++;
  if (f.multi) stats.reachedCx3++; if (f.complex) stats.reachedCx4++; if (f.mind) stats.reachedMind++;
  if (f.land) stats.landed++; if (f.goe) stats.goe++;
  const lifeSnaps = s.filter(x => x.nSpecies > 0); if (lifeSnaps.length && lifeSnaps.filter(x => x.topShare > 0.9).length / lifeSnaps.length > 0.5) stats.monoculture++;
  const tail = s.slice(-500); if (!tail.some(x => x.events.some(e => !/small|super/.test(e.k + (e.size || ''))))) stats.stagnantTail++;
  stats.snowballs += s.reduce((n, x) => n + x.events.filter(e => e.k === 'snowball').length, 0);
  stats.mass += s.reduce((n, x) => n + x.events.filter(e => e.k === 'mass').length, 0);
}
const pct = v => `${Math.round(v / N * 100)}%`;
console.log(`長期運転テスト (${N}本 x ${LEN}号):`);
console.log(`  生命が生まれなかった ${pct(stats.noLife)} / 最後に全滅 ${pct(stats.sterileEnd)} / 最後の200号がずっと凍結 ${pct(stats.frozenEnd)} / 最後に灼熱 ${pct(stats.hotEnd)}`);
console.log(`  大酸化 ${pct(stats.goe)} / 多細胞 ${pct(stats.reachedCx3)} / 大型の生き物 ${pct(stats.reachedCx4)} / 陸上進出 ${pct(stats.landed)} / 考える生き物 ${pct(stats.reachedMind)}`);
console.log(`  一種独占（生命期間の半分以上で上位1系統が9割超） ${pct(stats.monoculture)} / 最後の500号で大きな出来事なし ${pct(stats.stagnantTail)}`);
console.log(`  1本あたり 全球凍結 ${(stats.snowballs / N).toFixed(1)}回 / 大量絶滅 ${(stats.mass / N).toFixed(1)}回`);
writeFileSync(new URL('./soak.json', import.meta.url).pathname, JSON.stringify({ runs: N, length: LEN, stats }, null, 1) + '\n');
