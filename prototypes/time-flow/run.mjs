// 試作06の実験: 時間の流れ方の案ごとに、主役の惑星の歴史と未来、合成の世界の長期運転を比べる。
// 使い方: node run.mjs（結果は results.json にも書く）
import { readFileSync, writeFileSync } from 'node:fs';
import { initWorld, runAll, summarize, historyHash } from '../../engine/world.mjs';
import { rng } from '../../engine/random.mjs';
import { stepIssueFlow } from './flow.mjs';
import { K } from './constants.mjs';

const here = f => new URL('./' + f, import.meta.url).pathname;
const ledger = JSON.parse(readFileSync(here('../../data/ledger.json'), 'utf8')).issues;
const SEED = 'times-garden-v1', PER_YEAR = 730, H = K.horizon, t0 = Date.now();
const notable = e => !(e.k === 'super' || (e.k === 'impact' && e.size === 'small'));
const CX = ['生き物なし', '単純な細胞', '真核生物', '多細胞', '大型', '考える生き物'];
const median = a => { const v = [...a].sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
const pct = (n, d) => `${Math.round(n / d * 100)}%`;

function run(seed, issues, sched, W = initWorld(seed)) {
  const out = [];
  for (const issue of issues) out.push(stepIssueFlow(W, issue, sched));
  return { W, out };
}
// 実際の号の特徴を並べ替えた架空の号（号番号と digest は新しく作る）
function futureIssues(k, from, n) {
  const r = rng('future', k), out = [];
  for (let i = 1; i <= n; i++) { const src = ledger[Math.floor(r() * ledger.length)]; out.push({ ...src, issueNo: from + i, digest: `f${k}-${i}` }); }
  return out;
}
function synthLedger(seed, n) { // tests/helpers.mjs と同じ作り方
  const r = rng('synth', seed); const out = [];
  for (let i = 1; i <= n; i++) out.push({ issueNo: i, date: '', edition: i % 2 ? 'morning' : 'midday', gems: r() < 0.25 ? 1 : r() < 0.05 ? 2 : 0, meanTemp: 45 + r() * 45, newKeywords: Math.floor(r() * 16), digest: String(i) });
  return out;
}
// 1年あたりの数（出来事、新しい系統、消えた系統）
function perDay(out, a, b) {
  const s = out.slice(a, b), days = s.length / 2;
  return {
    events: s.reduce((n, x) => n + x.snap.events.filter(notable).length, 0) / days,
    born: s.reduce((n, x) => n + x.born, 0) / days,
    died: s.reduce((n, x) => n + x.died, 0) / days,
  };
}

// 0) 1号が2000万年のとき、本番とビット単位で同じか
{
  const prod = runAll(SEED, ledger), W = initWorld(SEED), snaps = [];
  for (const issue of ledger) snaps.push(stepIssueFlow(W, issue, K.schedules['eco-1']).snap);
  const same = historyHash(summarize(prod.W, prod.snapshots)) === historyHash(summarize(W, snaps));
  console.log(`0) eco-1 の時間で、本番の engine と全史のハッシュが ${same ? '一致' : '不一致'}`);
  if (!same) process.exit(1);
}

const results = {};
for (const [name, sched] of Object.entries(K.schedules)) {
  const R = results[name] = { note: sched.note };
  // 1) 主役の惑星: 実データの263号
  const hist = run(SEED, ledger, sched);
  const f = hist.W.flags, last = hist.out.at(-1).snap;
  R.history = {
    milestones: Object.fromEntries(['abio', 'goe', 'multi', 'land', 'complex', 'mind', 'sterile'].map(k => [k, k === 'sterile' ? hist.out.filter(x => x.snap.events.some(e => e.k === 'sterile')).map(x => x.snap.issueNo) : f[k] ?? null])),
    notable: hist.out.flatMap(x => x.snap.events.filter(notable).map(e => `#${x.snap.issueNo} ${e.k}${e.size ? ':' + e.size : ''}`)).length,
    at263: { gyr: last.gyr, T: last.T, CO2: last.CO2, nSpecies: last.nSpecies, maxCx: last.maxCx },
  };
  // 2) 主役の惑星の未来（#264 から5年）
  const fut = { lastAliveDay: [], alive1y: 0, alive2y: 0, alive5y: 0, mind: 0, y1: [], y3to5: [], gyr1y: [], T1y: [] };
  for (let k = 0; k < K.futures; k++) {
    const W = structuredClone(hist.W);
    const { out } = run(SEED, futureIssues(k, last.issueNo, H), sched, W);
    let lastAlive = -1; out.forEach((x, i) => { if (x.snap.nSpecies > 0) lastAlive = i; });
    fut.lastAliveDay.push((lastAlive + 1) / 2);
    if (out[PER_YEAR - 1].snap.nSpecies > 0) fut.alive1y++;
    if (out[2 * PER_YEAR - 1].snap.nSpecies > 0) fut.alive2y++;
    if (out.at(-1).snap.nSpecies > 0) fut.alive5y++;
    if (W.flags.mind) fut.mind++;
    fut.y1.push(perDay(out, 0, PER_YEAR)); fut.y3to5.push(perDay(out, 2 * PER_YEAR, H));
    fut.gyr1y.push(out[PER_YEAR - 1].snap.gyr); fut.T1y.push(out[PER_YEAR - 1].snap.T);
  }
  const avg = (a, key) => a.reduce((s, x) => s + x[key], 0) / a.length;
  R.future = {
    alive1y: fut.alive1y, alive2y: fut.alive2y, alive5y: fut.alive5y, mind: fut.mind, of: K.futures,
    medianLastAliveDay: median(fut.lastAliveDay),
    perDayY1: { events: avg(fut.y1, 'events'), born: avg(fut.y1, 'born'), died: avg(fut.y1, 'died') },
    perDayY3to5: { events: avg(fut.y3to5, 'events'), born: avg(fut.y3to5, 'born'), died: avg(fut.y3to5, 'died') },
    medianGyr1y: median(fut.gyr1y), medianT1y: median(fut.T1y),
  };
  // 3) 合成の号で創刊号から5年ぶん（いろいろな恒星と惑星）
  const soak = { alive1y: 0, alive2y: 0, alive5y: 0, complex: 0, mind: 0, y1: [], y3to5: [] };
  for (let k = 0; k < K.soakRuns; k++) {
    const { W, out } = run('soak-' + k, synthLedger('soak-' + k, H), sched);
    if (out[PER_YEAR - 1].snap.nSpecies > 0) soak.alive1y++;
    if (out[2 * PER_YEAR - 1].snap.nSpecies > 0) soak.alive2y++;
    if (out.at(-1).snap.nSpecies > 0) soak.alive5y++;
    if (W.flags.complex) soak.complex++; if (W.flags.mind) soak.mind++;
    soak.y1.push(perDay(out, 0, PER_YEAR)); soak.y3to5.push(perDay(out, 2 * PER_YEAR, H));
  }
  R.soak = {
    alive1y: soak.alive1y, alive2y: soak.alive2y, alive5y: soak.alive5y, complex: soak.complex, mind: soak.mind, of: K.soakRuns,
    perDayY1: { events: avg(soak.y1, 'events'), born: avg(soak.y1, 'born'), died: avg(soak.y1, 'died') },
    perDayY3to5: { events: avg(soak.y3to5, 'events'), born: avg(soak.y3to5, 'born'), died: avg(soak.y3to5, 'died') },
  };
  console.log(`\n== ${name}（${sched.note}）`);
  const m = R.history.milestones;
  console.log(`  主役の惑星の263号: 生命 #${m.abio} / 多細胞 #${m.multi} / 陸 #${m.land} / 大型 #${m.complex} / 考える #${m.mind ?? '-'} / 全滅 ${m.sterile.map(n => '#' + n).join(' ') || 'なし'}。#263 で ${R.history.at263.gyr}Gyr、${R.history.at263.T.toFixed(1)}℃、系統${R.history.at263.nSpecies}、${CX[R.history.at263.maxCx]}`);
  const F = R.future, n1 = F.perDayY1, n3 = F.perDayY3to5;
  console.log(`  主役の惑星の未来（${F.of}通り）: 生き物がいる 1年後 ${pct(F.alive1y, F.of)} / 2年後 ${pct(F.alive2y, F.of)} / 5年後 ${pct(F.alive5y, F.of)}、最後に生き物がいた日の中央値 ${F.medianLastAliveDay}日後、考える生き物 ${pct(F.mind, F.of)}`);
  console.log(`    1年後の惑星 ${F.medianGyr1y}Gyr ${F.medianT1y.toFixed(1)}℃。1日あたり（1年目）出来事 ${n1.events.toFixed(2)}、新しい系統 ${n1.born.toFixed(1)}、消えた系統 ${n1.died.toFixed(1)}。（3〜5年目）出来事 ${n3.events.toFixed(2)}、新しい系統 ${n3.born.toFixed(1)}`);
  const S = R.soak;
  console.log(`  合成の世界（${S.of}本、創刊号から5年）: 生き物がいる 1年後 ${pct(S.alive1y, S.of)} / 2年後 ${pct(S.alive2y, S.of)} / 5年後 ${pct(S.alive5y, S.of)}、大型に到達 ${pct(S.complex, S.of)}、考える生き物 ${pct(S.mind, S.of)}。1日あたり（1年目）出来事 ${S.perDayY1.events.toFixed(2)}、新しい系統 ${S.perDayY1.born.toFixed(1)}`);
}
writeFileSync(here('results.json'), JSON.stringify(results, null, 1) + '\n');
console.log(`\n（${((Date.now() - t0) / 1000).toFixed(0)}秒）`);
