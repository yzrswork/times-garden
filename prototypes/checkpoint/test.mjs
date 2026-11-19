// 途中経過のテスト。失敗が1つでもあれば終了コード1。
// 使い方: node test.mjs（合成の号の本数と長さは SYNTH_RUNS、SYNTH_LEN で変えられる）
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { runHistory, historyHash, initWorld, stepIssue, rng } from '../ecosystem-core/sim.mjs';
import { C } from '../ecosystem-core/constants.mjs';
import {
  encodeState, stateHash, makeCheckpoint, loadCheckpoint, resume, resultOf, latestUsable,
  checkpointText, checkpointName, runWithCheckpoints, chainHash, CHAIN0, CheckpointError,
} from './checkpoint.mjs';
import { K, MAIN_SEED } from './constants.mjs';

const here = f => new URL('./' + f, import.meta.url).pathname;
const ledger = JSON.parse(readFileSync(here('../ecosystem-core/ledger.json'), 'utf8')).issues;
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ok ' : '  NG '} ${msg}`); if (!cond) failures++; };
const t0 = Date.now();
let tSec = Date.now();
const lap = () => { const s = ((Date.now() - tSec) / 1000).toFixed(1); tSec = Date.now(); return s; };
// 保存して、ファイルに書いた文字列から読み戻す（実際の使い方と同じ道を通す）
const viaText = cp => JSON.parse(checkpointText(cp));

/* 1) 実データ: すべての号で保存し、そこから最後まで計算して、創刊号からの全史と比べる */
console.log(`1) 実データ ${ledger.length}号: 0号目から${ledger.length}号目まで、すべての号で途中経過を保存して再開`);
const full = runHistory(MAIN_SEED, ledger), fullHash = historyHash(full);
{
  const W = initWorld(MAIN_SEED), cps = [viaText(makeCheckpoint(W, ledger, 0, []))];
  const stateHashes = [stateHash(W)];
  let chain = CHAIN0;
  for (let i = 0; i < ledger.length; i++) {
    chain = chainHash([stepIssue(W, ledger[i])], chain);
    cps.push(viaText(makeCheckpoint(W, ledger, i + 1, W.history, chain)));
    stateHashes.push(stateHash(W));
  }
  const finalState = stateHashes[stateHashes.length - 1];
  let histOk = 0, stateOk = 0, roundOk = 0;
  for (const cp of cps) {
    const back = loadCheckpoint(cp, ledger, { seed: MAIN_SEED });
    if (stateHash(back) === stateHashes[cp.count]) roundOk++;
    const { W: R, result } = resume(cp, ledger, { seed: MAIN_SEED, prior: full.snapshots.slice(0, cp.count) });
    if (historyHash(result) === fullHash) histOk++;
    if (stateHash(R) === finalState) stateOk++;
  }
  ok(historyHash(resultOf(W, W.history)) === fullHash, `途中経過の仕組みで計算した全史が、試作04の runHistory と一致（${fullHash}）`);
  ok(roundOk === cps.length, `保存して読み戻した状態のハッシュが、保存前と一致 ${roundOk}/${cps.length}`);
  ok(histOk === cps.length, `途中から最後まで計算した全史のハッシュが、創刊号からの計算と一致 ${histOk}/${cps.length}`);
  ok(stateOk === cps.length, `最後の状態のハッシュも一致 ${stateOk}/${cps.length}（${finalState}）`);
  const size = cps.map(cp => checkpointText(cp).length);
  console.log(`     途中経過1つの大きさ ${Math.min(...size)}〜${Math.max(...size)} バイト（${lap()}秒）`);
}

/* 2) 合成の号: 実データでは起きない状態（全球凍結の最中、全滅のあと、海の蒸発、洪水玄武岩）でも保存と再開ができるか */
function synthLedger(seed, n) { // 試作04 run.mjs の synthLedger と同じ
  const r = rng('synth', seed); const out = [];
  for (let i = 1; i <= n; i++) out.push({ issueNo: i, date: '', edition: i % 2 ? 'morning' : 'midday', gems: r() < 0.25 ? 1 : r() < 0.05 ? 2 : 0, meanTemp: 45 + r() * 45, newKeywords: Math.floor(r() * 16), digest: String(i) });
  return out;
}
const RUNS = Number(process.env.SYNTH_RUNS || 8), LEN = Number(process.env.SYNTH_LEN || 1500), AHEAD = 30, EVERY = 50;
const EVENT_KINDS = ['snowball', 'thaw', 'sterile', 'abio2', 'oceanLost', 'lip', 'impact', 'mass', 'super'];
console.log(`2) 合成の号 ${RUNS}本 x ${LEN}号: ${EVERY}号ごとと、事件の起きた号（種類ごとに1回目と以後4回に1回）で保存して再開し、その先${AHEAD}号の状態を毎号比べる。各本の途中1か所からは最後まで計算する`);
{
  const cover = { snowball: 0, sterile: 0, oceanLost: 0, lip: 0, superAnn: 0, fullSpecies: 0 };
  let states = 0, tried = 0, matched = 0, toEnd = 0, toEndOk = 0;
  for (let k = 0; k < RUNS; k++) {
    const seed = 'soak-' + k, L = synthLedger(seed, LEN);
    const W = initWorld(seed), hs = [stateHash(W)], at = new Map(), seen = {};
    let chain = CHAIN0;
    for (let i = 0; i < L.length; i++) {
      chain = chainHash([stepIssue(W, L[i])], chain); hs.push(stateHash(W)); states++;
      let pick = (i + 1) % EVERY === 0;
      for (const e of W.history[i].events) if (EVENT_KINDS.includes(e.k)) { seen[e.k] = (seen[e.k] || 0) + 1; if (seen[e.k] % 4 === 1) pick = true; }
      if (!pick) continue;
      at.set(i + 1, viaText(makeCheckpoint(W, L, i + 1, W.history, chain)));
      if (W.snowball) cover.snowball++; if (!W.life && W.flags.abio) cover.sterile++; if (W.flags.oceanLost) cover.oceanLost++;
      if (W.lip > 0.01) cover.lip++; if (W._superAnn) cover.superAnn++; if (W.species.length >= C.maxSpecies) cover.fullSpecies++;
    }
    const fullH = historyHash(resultOf(W, W.history));
    for (const [count, cp] of at) {
      tried++;
      const R = loadCheckpoint(cp, L, { seed });
      let good = stateHash(R) === hs[count];
      for (let i = count; good && i < Math.min(L.length, count + AHEAD); i++) { stepIssue(R, L[i]); good = stateHash(R) === hs[i + 1]; }
      if (good) matched++;
    }
    const mid = [...at.keys()][Math.floor(at.size / 2)];
    const { result } = resume(at.get(mid), L, { seed, prior: W.history.slice(0, mid) });
    toEnd++; if (historyHash(result) === fullH) toEndOk++;
  }
  ok(matched === tried, `再開した状態が、創刊号からの計算と毎号一致 ${matched}/${tried}（比べた状態 ${states}個）`);
  ok(toEndOk === toEnd, `途中から最後まで計算した全史のハッシュが一致 ${toEndOk}/${toEnd}`);
  console.log(`     保存した途中経過のうち: 全球凍結の最中 ${cover.snowball} / 全滅のあと ${cover.sterile} / 海の蒸発後 ${cover.oceanLost} / 洪水玄武岩の最中 ${cover.lip} / 超大陸の告知直後 ${cover.superAnn} / 系統が上限 ${cover.fullSpecies}`);
  ok(Object.values(cover).every(v => v > 0), 'どの特別な状態でも、少なくとも1回は保存と再開を試した');
  ok(true, `保存できない値（-0、NaN、Infinity など）は、${states}個のどの状態にも出なかった（${lap()}秒）`);
}

/* 3) テストに見る力があるか: よくある壊れ方の途中経過を作り、比べ方で見つかるか */
const POINTS = [70, 130, 210]; // 超大陸の周期（20号）の倍数を避ける。倍数だと位相が初期値と同じになり、比べられない
console.log(`3) 見る力の確認: ${POINTS.join('、')}号目の途中経過を、よくある壊れ方で作って最後まで計算する`);
{
  const fullFinal = (() => { const w = initWorld(MAIN_SEED); for (const i of ledger) stepIssue(w, i); return stateHash(w); })();
  const init = initWorld(MAIN_SEED);
  const bases = POINTS.map(n => { const w = initWorld(MAIN_SEED); for (let i = 0; i < n; i++) stepIssue(w, ledger[i]); return makeCheckpoint(w, ledger, n, full.snapshots.slice(0, n)); });
  const run = (base, mutate) => {
    const W2 = loadCheckpoint(base, ledger); mutate(W2);
    const prior = full.snapshots.slice(0, base.count);
    const { W, result } = resume(makeCheckpoint(W2, ledger, base.count, prior), ledger, { prior });
    return { hist: historyHash(result) !== fullHash, state: stateHash(W) !== fullFinal };
  };
  const roundAll = v => typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : Array.isArray(v) ? v.map(roundAll) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, roundAll(x)])) : v;
  const rounded = bases.filter(b => run(b, w => { for (const k of Object.keys(w)) if (k !== 'history') w[k] = roundAll(w[k]); }).hist).length;
  ok(rounded === bases.length, `状態を記録（観測データ）と同じ小数4桁に丸めて保存すると、全史が変わる ${rounded}/${bases.length}（丸めた保存は見つかる）`);
  // 保存し忘れた項目が、読み込み側で初期値になる、という壊れ方。いまの値が初期値と同じ点では比べられないので飛ばす
  const keys = Object.keys(bases[0].state).filter(k => !['seed', 'issueNo'].includes(k));
  const caught = [], missed = [], same = [];
  for (const k of keys) {
    const pts = bases.filter(b => JSON.stringify(b.state[k]) !== JSON.stringify(init[k]));
    if (!pts.length) { same.push(k); continue; }
    (pts.some(b => run(b, w => { if (k in init) w[k] = structuredClone(init[k]); else delete w[k]; }).hist) ? caught : missed).push(k);
  }
  const core = ['t', 'CO2', 'O2', 'R', 'land', 'superPhase', 'species', 'flags', 'life'];
  ok(core.every(k => caught.includes(k)), `項目を1つ保存し忘れて初期値に戻ると、全史が変わる ${caught.length}/${caught.length + missed.length}（気候、酸素、大陸、生き物の項目はすべて見つかる）`);
  console.log(`     変わらなかった項目: ${missed.join(', ') || 'なし'} / どの点でも初期値と同じで比べられない項目: ${same.join(', ') || 'なし'}`);
  // 参考: 最小単位（1 ulp）のずれ
  const f64 = new Float64Array(1), u64 = new BigUint64Array(f64.buffer);
  const nudge = x => { if (x === 0) return Number.MIN_VALUE; f64[0] = x; u64[0] += 1n; return f64[0]; };
  const nums = keys.filter(k => typeof bases[1].state[k] === 'number' && !['nextId', 'extinct'].includes(k));
  const res = nums.map(k => ({ k, ...run(bases[1], w => { w[k] = nudge(w[k]); }) }));
  console.log(`     参考: ${POINTS[1]}号目で連続な値を1つずつ最小単位（1 ulp）だけずらすと、最後の状態が変わったのは ${res.filter(r => r.state).length}/${nums.length}、全史（記録は小数4桁）が変わったのは ${res.filter(r => r.hist).length}/${nums.length}（${lap()}秒）`);
}

/* 4) Fail Closed: 合わない途中経過は使わない */
console.log('4) Fail Closed: 合わない途中経過は読み込まずに止まる');
{
  const W = initWorld(MAIN_SEED); for (let i = 0; i < 100; i++) stepIssue(W, ledger[i]);
  const cp = viaText(makeCheckpoint(W, ledger, 100, W.history));
  const rejects = (label, fn) => { try { fn(); ok(false, `${label}: 止まらなかった`); } catch (e) { ok(e instanceof CheckpointError, `${label}: 止まる（${e.message}）`); } };
  const edit = f => { const c = structuredClone(cp); f(c); return c; };
  rejects('状態の書き換え', () => loadCheckpoint(edit(c => { c.state.CO2 += 1; }), ledger));
  rejects('種の違い', () => loadCheckpoint(cp, ledger, { seed: 'other' }));
  rejects('計算の版の違い', () => loadCheckpoint(edit(c => { c.simVersion = 'eco-0.0'; }), ledger));
  rejects('定数の違い', () => loadCheckpoint(edit(c => { c.rulesHash = '0'.repeat(32); }), ledger));
  rejects('形式の違い', () => loadCheckpoint(edit(c => { c.format = 'x'; }), ledger));
  rejects('凍結済みの号の書き換え', () => loadCheckpoint(cp, ledger.map((e, i) => i === 40 ? { ...e, gems: e.gems + 1 } : e)));
  rejects('台帳が途中経過より短い', () => loadCheckpoint(cp, ledger.slice(0, 80)));
  rejects('観測データの食い違い', () => resume(cp, ledger, { prior: full.snapshots.slice(0, 99) }));
  rejects('状態に -0', () => encodeState({ ...W, history: [], x: -0 }));
  rejects('状態に NaN', () => encodeState({ ...W, history: [], x: NaN }));
  rejects('状態に undefined', () => encodeState({ ...W, history: [], x: undefined }));
  rejects('状態に関数', () => encodeState({ ...W, history: [], r: () => 0 }));
  rejects('状態に Map', () => encodeState({ ...W, history: [], m: new Map() }));
  rejects('同じ物の共有', () => { const s = { a: 1 }; encodeState({ ...W, history: [], p: s, q: s }); });
  // 使えない途中経過は飛ばして、1つ前の途中経過から計算する
  const good50 = viaText(makeCheckpoint((() => { const w = initWorld(MAIN_SEED); for (let i = 0; i < 50; i++) stepIssue(w, ledger[i]); return w; })(), ledger, 50, full.snapshots.slice(0, 50)));
  const bad = edit(c => { c.state.O2 = 0; });
  const r = latestUsable([good50, bad], ledger, { seed: MAIN_SEED, prior: full.snapshots });
  ok(r.from === 50 && r.skipped.length === 1 && historyHash(r.result) === fullHash, `壊れた途中経過（100号目）を飛ばし、50号目から計算して一致（飛ばした理由: ${r.skipped[0]?.reason}）`);
  const r0 = latestUsable([bad], ledger, { seed: MAIN_SEED });
  ok(r0.from === 0 && historyHash(r0.result) === fullHash, `使える途中経過がなければ、創刊号から計算して一致（${lap()}秒）`);
}

/* 5) 保存済みの途中経過（checkpoints/）が、いまの計算で作り直したものと同じか */
console.log(`5) 保存済みの途中経過: checkpoints/ のファイルが、創刊号から計算し直したものとバイト単位で同じか（${K.checkpointEvery}号ごと）`);
{
  const { checkpoints } = runWithCheckpoints(MAIN_SEED, ledger, K.checkpointEvery);
  const dir = here('checkpoints');
  const files = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.json')).sort() : [];
  ok(files.join() === checkpoints.map(cp => checkpointName(cp.count)).join(), `ファイルの並び: ${files.join(', ') || 'なし'}`);
  for (const cp of checkpoints) {
    const p = dir + '/' + checkpointName(cp.count);
    ok(existsSync(p) && readFileSync(p, 'utf8') === checkpointText(cp), `${checkpointName(cp.count)} が作り直したものと同じ`);
  }
  const fromFiles = files.map(f => JSON.parse(readFileSync(dir + '/' + f, 'utf8')));
  const r = latestUsable(fromFiles, ledger, { seed: MAIN_SEED, prior: full.snapshots });
  ok(r.from === checkpoints.at(-1)?.count && historyHash(r.result) === fullHash, `最新の途中経過（${r.from}号目）から${ledger.length - r.from}号ぶん計算して、全史のハッシュが一致（${lap()}秒）`);
}

console.log(`${failures ? `失敗 ${failures}件` : 'すべて成功'}（${((Date.now() - t0) / 1000).toFixed(1)}秒）`);
process.exit(failures ? 1 : 0);
