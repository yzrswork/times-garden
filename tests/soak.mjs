// 長期運転テスト: 合成の号で何本も先まで回し、全滅、一種独占、停滞などの割合を出す（柱3の確認）。合否は出さず、報告だけ。
// 使い方: node tests/soak.mjs [本数] [号数]   例: node tests/soak.mjs 40 2000
import { runAll } from '../engine/world.mjs';
import { synthLedger } from './helpers.mjs';

const N = Number(process.argv[2] || 40), LEN = Number(process.argv[3] || 1000);
const st = { noLife: 0, sterileEnd: 0, frozenEnd: 0, hotEnd: 0, goe: 0, multi: 0, complex: 0, land: 0, mind: 0, monoculture: 0, stagnantTail: 0, snowballs: 0, mass: 0 };
const t0 = Date.now();
for (let k = 0; k < N; k++) {
  const { W, snapshots: s } = runAll('soak-' + k, synthLedger('soak-' + k, LEN));
  const end = s.at(-1), f = W.flags;
  if (!f.abio) st.noLife++;
  if (f.abio && end.nSpecies === 0) st.sterileEnd++;
  if (s.slice(-200).every(x => x.snowball)) st.frozenEnd++;
  if (end.T > 70) st.hotEnd++;
  for (const k2 of ['goe', 'multi', 'complex', 'land', 'mind']) if (f[k2]) st[k2]++;
  const lifeSnaps = s.filter(x => x.nSpecies > 0);
  if (lifeSnaps.length && lifeSnaps.filter(x => x.topShare > 0.9).length / lifeSnaps.length > 0.5) st.monoculture++;
  if (!s.slice(-500).some(x => x.events.some(e => !(e.k === 'super' || (e.k === 'impact' && e.size === 'small'))))) st.stagnantTail++;
  st.snowballs += s.reduce((n, x) => n + x.events.filter(e => e.k === 'snowball').length, 0);
  st.mass += s.reduce((n, x) => n + x.events.filter(e => e.k === 'mass').length, 0);
}
const pct = v => `${Math.round(v / N * 100)}%`;
console.log(`長期運転テスト（${N}本 x ${LEN}号、${((Date.now() - t0) / 1000).toFixed(1)}秒）`);
console.log(`  生命が生まれなかった ${pct(st.noLife)} / 最後に全滅 ${pct(st.sterileEnd)} / 最後の200号がずっと凍結 ${pct(st.frozenEnd)} / 最後に灼熱（70℃超） ${pct(st.hotEnd)}`);
console.log(`  大酸化 ${pct(st.goe)} / 多細胞 ${pct(st.multi)} / 大型の生き物 ${pct(st.complex)} / 陸上進出 ${pct(st.land)} / 考える生き物 ${pct(st.mind)}`);
console.log(`  一種独占（生命期間の半分以上で上位1系統が9割超） ${pct(st.monoculture)} / 最後の500号で大きな出来事なし ${pct(st.stagnantTail)}`);
console.log(`  1本あたり 全球凍結 ${(st.snowballs / N).toFixed(1)}回 / 大量絶滅 ${(st.mass / N).toFixed(1)}回`);
