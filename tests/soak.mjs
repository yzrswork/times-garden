// 長期運転テスト: 合成の号で何本も先まで回し、時代の配分、終わり方、驚きの量を数字で出す（柱3の確認）。
// 合否は出さず、報告だけ。使い方: node tests/soak.mjs [本数] [号数] [--old]
//   --old を付けると、時間の配分を使わない（1号いつも2,000万年。eco-1 と同じ進み方）。
import { initWorld, stepIssue } from '../engine/world.mjs';
import { eraOf, ERAS, ERA_JA } from '../engine/era.mjs';
import { C } from '../engine/constants.mjs';
import { synthLedger, NO_PLAN } from './helpers.mjs';

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const OLD = process.argv.includes('--old');
const N = Number(args[0] || 40), LEN = Number(args[1] || 1600);
const OPTS = OLD ? NO_PLAN : { timingFrom: 1 };

const med = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const pct = (v, n) => `${Math.round(v / n * 100)}%`;

const eraLen = Object.fromEntries(ERAS.map(e => [e, []]));
const ends = {}, planetSpan = [];
const st = { noLife: 0, noMulti: 0, noComplex: 0, noMind: 0, monoculture: 0 };
let planets = 0, snowballs = 0, masses = 0, bigEvents = 0, issues = 0;
const t0 = Date.now();

for (let k = 0; k < N; k++) {
  const seed = 'soak-' + k, ledger = synthLedger(seed, LEN);
  const W = initWorld(seed, OPTS);
  let prevEra = eraOf(W), eraStart = 0, planetStart = 0;
  const len = Object.fromEntries(ERAS.map(e => [e, 0]));
  const lifeSnaps = [];
  for (const issue of ledger) {
    const s = stepIssue(W, issue); issues++;
    if (s.nSpecies > 0) lifeSnaps.push(s);
    for (const e of s.events) {
      if (e.k === 'snowball') snowballs++;
      if (e.k === 'mass') masses++;
      if (!['super', 'planetEnd', 'newPlanet'].includes(e.k) && !(e.k === 'impact' && e.size === 'small')) bigEvents++;
    }
    const end = s.events.find(e => e.k === 'planetEnd');
    if (!end) {
      const era = eraOf(W);
      if (era !== prevEra) { len[prevEra] += issue.issueNo - eraStart; eraStart = issue.issueNo; prevEra = era; }
      continue;
    }
    // 1つの惑星が終わった
    len[prevEra] += issue.issueNo - eraStart;
    planets++; planetSpan.push(issue.issueNo - planetStart);
    ends[end.end] = (ends[end.end] || 0) + 1;
    const v = W.volumes.at(-1);
    if (!v.flags.abio) st.noLife++;
    if (!v.flags.multi) st.noMulti++;
    if (!v.flags.complex) st.noComplex++;
    if (!v.flags.mind) st.noMind++;
    for (const e of ERAS) eraLen[e].push(len[e]);
    for (const e of ERAS) len[e] = 0;
    prevEra = eraOf(W); eraStart = issue.issueNo; planetStart = issue.issueNo;
  }
  if (lifeSnaps.length && lifeSnaps.filter(x => x.topShare > 0.9).length / lifeSnaps.length > 0.5) st.monoculture++;
}

console.log(`長期運転テスト（${N}本 x ${LEN}号、${((Date.now() - t0) / 1000).toFixed(1)}秒、${OLD ? '時間の配分なし（1号2,000万年）' : '時間の配分あり（1年=' + C.yearIssues + '号）'}）`);
if (!OLD) {
  const target = { birth: 73, simple: 146, form: 330, civ: 180 };
  console.log(`  観測を終えた惑星 ${planets}個 / 1個あたり ${med(planetSpan)}号（中央値）`);
  console.log('  時代ごとの号数（中央値 / docs/creatures.md の目安）:');
  for (const e of ERAS) {
    const m = med(eraLen[e]) ?? 0;
    console.log(`    ${ERA_JA[e].padEnd(6, '　')} ${String(m).padStart(4)}号 (${String(Math.round(m / C.yearIssues * 100)).padStart(2)}%) / ${String(target[e]).padStart(4)}号 (${Math.round(target[e] / C.yearIssues * 100)}%)`);
  }
  console.log('  終わり方:', Object.entries(ends).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v, planets)}`).join(' / '));
  const p = planets || 1;
  console.log(`  たどり着かなかった惑星: 生命 ${pct(st.noLife, p)} / 多細胞 ${pct(st.noMulti, p)} / 大型 ${pct(st.noComplex, p)} / 考える生き物 ${pct(st.noMind, p)}`);
}
console.log(`  一種独占（生命期間の半分以上で上位1系統が9割超） ${pct(st.monoculture, N)}`);
console.log(`  1,000号あたり 全球凍結 ${(snowballs / issues * 1000).toFixed(1)}回 / 大量絶滅 ${(masses / issues * 1000).toFixed(1)}回 / 目立つ出来事 ${(bigEvents / issues * 1000).toFixed(1)}回`);
