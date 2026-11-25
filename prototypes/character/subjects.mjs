// 試作09 の対象3系統を、公開データと合成の惑星から取り出して subjects.json に固める。
//
// なぜ固めるか: 3体目は主役の惑星にいない（合成の惑星の文明の担い手）。比較ページを開くたびに
// 1,286号ぶん計算するのは重いので、Node で一度だけ取り出して JSON にする。
// 値はすべて engine/traits.mjs の bestiary() の実値で、ここでは1つも作らない。
//
// 使い方: node prototypes/character/subjects.mjs [--write]
import { writeFileSync, readFileSync } from 'node:fs';
import { runAll, initWorld, stepIssue } from '../../engine/world.mjs';
import { bestiary } from '../../engine/traits.mjs';
import { rng } from '../../engine/random.mjs';
import { MAIN_SEED, MAIN_TIMING_FROM, PATHS } from '../../pipeline/config.mjs';

// tests/helpers.mjs の synthLedger と同じ作り方（prototypes から tests を読まないので写してある。
// 食い違うと別の惑星になるので、tests/helpers.mjs を変えたらここも合わせること）。
function synthLedger(seed, n) {
  const r = rng('synth', seed), rc = rng('synth-cat', seed), out = [];
  const techShare = 0.15 + rc() * 0.75;
  for (let i = 1; i <= n; i++) {
    const nArticles = 8 + Math.floor(rc() * 6);
    const nTech = Math.max(0, Math.min(nArticles, Math.round(nArticles * techShare + (rc() - 0.5) * 4)));
    out.push({
      issueNo: i, date: '', edition: i % 2 ? 'morning' : 'midday',
      gems: r() < 0.25 ? 1 : r() < 0.05 ? 2 : 0, meanTemp: 45 + r() * 45, newKeywords: Math.floor(r() * 16),
      nArticles, categories: { tech: nTech, news: nArticles - nTech }, digest: String(i),
    });
  }
  return out;
}

const worldOf = W => ({ star: W.star, gravity: W.gravity, air: W.air, T: Math.round(W.T * 10) / 10 });

// 主役の惑星（公開データの台帳そのまま）
const ledger = JSON.parse(readFileSync(PATHS.ledger, 'utf8')).issues;
const { W: MAIN } = runAll(MAIN_SEED, ledger, { timingFrom: MAIN_TIMING_FROM });
const mainList = bestiary(MAIN);

// 合成の惑星（段階4のスクリーンショットに使ったもの）。文明の担い手を取り出す
const SYN_SEED = 'shot-15', SYN_AT = 1286;
const SYN = initWorld(SYN_SEED, { timingFrom: 1 });
for (const issue of synthLedger(SYN_SEED, SYN_AT)) stepIssue(SYN, issue);
const synList = bestiary(SYN);
const civ = SYN.civs[0];

const pick = (list, f, what) => { const e = list.find(f); if (!e) throw new Error(`${what} が見つからない`); return e; };

const subjects = [
  {
    key: 'cell', label: '単細胞（基準体）', from: `主役の惑星 #${ledger.length}`,
    why: '試作08 v2 の様式（焼きカード）との差分を見る基準体',
    render: 'cell', world: worldOf(MAIN), entry: pick(mainList, e => e.id === 1713, 'id 1713'),
  },
  {
    key: 'radial', label: '放射腕＋触手8本', from: `主役の惑星 #${ledger.length}`,
    why: '試作07（生き物の視点）の3Dと同じ系統',
    render: 'body', world: worldOf(MAIN),
    entry: pick(mainList, e => e.look.form === 'radial' && e.look.limb === 'tentacle', '放射腕＋触手の系統'),
  },
  {
    key: 'seg', label: '体節型・翼4本（文明の担い手）', from: `合成の惑星 ${SYN_SEED} #${SYN_AT}`,
    why: '段階4の「都市・崖の住まい」を建てている当事者',
    render: 'body', world: worldOf(SYN), entry: pick(synList, e => e.id === civ.id, '文明の担い手'),
    civ: { stage: civ.stage, dwelling: civ.dwelling, from: civ.from, ruins: SYN.ruins.length },
  },
];

const out = {
  madeBy: 'node prototypes/character/subjects.mjs --write',
  note: '値は engine/traits.mjs の bestiary() の実値。作り直すと同じ値になる（決定論）。',
  mainSeed: MAIN_SEED, mainIssues: ledger.length, synth: { seed: SYN_SEED, at: SYN_AT },
  subjects,
};

for (const s of subjects) {
  const e = s.entry;
  console.log(`${s.key}: id ${e.id}（生まれた号 #${e.born}）${s.from}`);
  console.log(`  ${e.text}`);
  console.log(`  look ${JSON.stringify(e.look)}`);
  console.log(`  cx ${e.cx} / ${e.hab} / 大きさ ${e.sizeLabel}（段階 ${e.sizeStep}） / 色 ${JSON.stringify(e.color)} / 惑星 ${JSON.stringify(s.world)}`);
  if (s.civ) console.log(`  文明 ${JSON.stringify(s.civ)}`);
}
if (process.argv.includes('--write')) {
  const p = new URL('./subjects.json', import.meta.url).pathname;
  writeFileSync(p, JSON.stringify(out, null, 1) + '\n');
  console.log('書いた: ' + p);
}
