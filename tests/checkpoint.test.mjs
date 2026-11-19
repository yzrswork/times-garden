// 途中経過のテスト: 保存して再開した歴史が、創刊号からの計算とハッシュ一致するか。合わない途中経過は使わないか。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initWorld, stepIssue, runAll, summarize, historyHash } from '../engine/world.mjs';
import { C } from '../engine/constants.mjs';
import {
  encodeState, stateHash, makeCheckpoint, loadCheckpoint, resume, latestUsable, chainHash, CHAIN0, CheckpointError,
} from '../engine/checkpoint.mjs';
import { LEDGER, MAIN_SEED, MAIN, NO_PLAN, synthLedger } from './helpers.mjs';

const viaText = cp => JSON.parse(JSON.stringify(cp) + '\n'); // ファイルに書いた文字列から読み戻す
const full = runAll(MAIN_SEED, LEDGER, MAIN);
const fullHash = historyHash(summarize(full.W, full.snapshots)), fullState = stateHash(full.W);
const stateAt = n => { const W = initWorld(MAIN_SEED, MAIN); for (let i = 0; i < n; i++) stepIssue(W, LEDGER[i]); return W; };

test('実データ: すべての号で保存して読み戻し、最後まで計算すると、創刊号からの計算と一致する', () => {
  const W = initWorld(MAIN_SEED, MAIN), snaps = [];
  let chain = CHAIN0, checked = 0;
  const tryAt = () => {
    const cp = viaText(makeCheckpoint(W, LEDGER, snaps.length, snaps, chain));
    assert.equal(stateHash(loadCheckpoint(cp, LEDGER, { seed: MAIN_SEED })), stateHash(W), `#${snaps.length} 読み戻し`);
    const r = resume(cp, LEDGER, { seed: MAIN_SEED, prior: full.snapshots.slice(0, cp.count) });
    assert.equal(historyHash(summarize(r.W, r.snapshots)), fullHash, `#${cp.count} から再開した全史`);
    assert.equal(stateHash(r.W), fullState, `#${cp.count} から再開した最後の状態`);
    checked++;
  };
  tryAt();
  for (const issue of LEDGER) { const s = stepIssue(W, issue); snaps.push(s); chain = chainHash([s], chain); tryAt(); }
  assert.equal(checked, LEDGER.length + 1);
});

test('合成の号: 全球凍結の最中や全滅のあとなど、特別な状態でも保存と再開ができる', () => {
  const LEN = 1200, AHEAD = 30, KINDS = ['snowball', 'thaw', 'sterile', 'abio2', 'oceanLost', 'lip', 'impact', 'mass', 'super'];
  // 半分は時間の配分あり（1年で次の星へ移る）、半分はなし（1号2,000万年）。
  // どちらの進み方でも、途中経過の保存と再開ができることを確かめる。
  // soak-4 と soak-8 は、配分なしで海が蒸発する種（この状態での保存を試すために選んである）。
  const RUNS = [
    ['soak-0', { timingFrom: 1 }], ['soak-1', { timingFrom: 1 }], ['soak-2', { timingFrom: 1 }],
    ['soak-4', NO_PLAN], ['soak-8', NO_PLAN], ['soak-5', NO_PLAN],
  ];
  const cover = { snowball: 0, sterile: 0, oceanLost: 0, lip: 0, superAnnounced: 0, fullSpecies: 0, switched: 0 };
  let tried = 0;
  for (const [seed, opts] of RUNS) {
    const L = synthLedger(seed, LEN);
    const W = initWorld(seed, opts), hs = [stateHash(W)], snaps = [], at = new Map(), seen = {};
    let chain = CHAIN0;
    for (let i = 0; i < L.length; i++) {
      const s = stepIssue(W, L[i]); snaps.push(s); chain = chainHash([s], chain); hs.push(stateHash(W));
      let pick = (i + 1) % 50 === 0;
      for (const e of s.events) if (KINDS.includes(e.k)) { seen[e.k] = (seen[e.k] || 0) + 1; if (seen[e.k] % 4 === 1) pick = true; }
      if (!pick) continue;
      at.set(i + 1, viaText(makeCheckpoint(W, L, i + 1, snaps, chain)));
      if (W.snowball) cover.snowball++; if (!W.life && W.flags.abio) cover.sterile++; if (W.flags.oceanLost) cover.oceanLost++;
      if (W.lip > 0.01) cover.lip++; if (W.superAnnounced) cover.superAnnounced++; if (W.species.length >= C.maxSpecies) cover.fullSpecies++;
      if (W.volumes.length) cover.switched++; // 次の星へ移ったあとの状態でも保存と再開ができるか
    }
    for (const [count, cp] of at) {
      const R = loadCheckpoint(cp, L, { seed, opts });
      assert.equal(stateHash(R), hs[count], `${seed} #${count} 読み戻し`);
      for (let i = count; i < Math.min(L.length, count + AHEAD); i++) { stepIssue(R, L[i]); assert.equal(stateHash(R), hs[i + 1], `${seed} #${count} から再開して #${i + 1}`); }
      tried++;
    }
    const mid = [...at.keys()][Math.floor(at.size / 2)];
    const r = resume(at.get(mid), L, { seed, prior: snaps.slice(0, mid), opts });
    assert.equal(historyHash(summarize(r.W, r.snapshots)), historyHash(summarize(W, snaps)), `${seed} #${mid} から最後まで`);
  }
  for (const [k, n] of Object.entries(cover)) assert.ok(n > 0, `特別な状態 ${k} で保存を試していない`);
  assert.ok(tried > 300, `試した途中経過が少ない（${tried}）`);
});

test('見る力: よくある壊れ方の途中経過は、全史のハッシュの比較で見つかる', () => {
  const POINTS = [70, 130, 210]; // 超大陸の周期（20号）の倍数を避ける。倍数だと位相が初期値と同じになり比べられない
  const init = initWorld(MAIN_SEED, MAIN);
  const bases = POINTS.map(n => makeCheckpoint(stateAt(n), LEDGER, n, full.snapshots.slice(0, n)));
  const changes = (base, mutate) => {
    const W2 = loadCheckpoint(base, LEDGER); mutate(W2);
    const prior = full.snapshots.slice(0, base.count);
    const r = resume(makeCheckpoint(W2, LEDGER, base.count, prior), LEDGER, { prior });
    return historyHash(summarize(r.W, r.snapshots)) !== fullHash;
  };
  const roundAll = v => typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : Array.isArray(v) ? v.map(roundAll) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, roundAll(x)])) : v;
  for (const b of bases) assert.ok(changes(b, w => { for (const k of Object.keys(w)) w[k] = roundAll(w[k]); }), `#${b.count}: 記録と同じ小数4桁に丸めた保存が見つからない`);
  // 項目を1つ保存し忘れて、読み込み側で初期値になる壊れ方
  for (const k of ['t', 'CO2', 'O2', 'reductant', 'land', 'superPhase', 'species', 'flags', 'life', 'nextId', 'extinct']) {
    const pts = bases.filter(b => JSON.stringify(b.state[k]) !== JSON.stringify(init[k]));
    assert.ok(pts.some(b => changes(b, w => { w[k] = structuredClone(init[k]); })), `${k} の保存し忘れが見つからない`);
  }
});

test('Fail Closed: 合わない途中経過は読み込まずに止まる', () => {
  const W = stateAt(100);
  const cp = viaText(makeCheckpoint(W, LEDGER, 100, full.snapshots.slice(0, 100)));
  const edit = f => { const c = structuredClone(cp); f(c); return c; };
  const rejects = (fn, re) => assert.throws(fn, e => e instanceof CheckpointError && re.test(e.message));
  rejects(() => loadCheckpoint(edit(c => { c.state.CO2 += 1; }), LEDGER), /状態のハッシュ/);
  rejects(() => loadCheckpoint(cp, LEDGER, { seed: 'other' }), /種が違う/);
  rejects(() => loadCheckpoint(edit(c => { c.simVersion = 'eco-0.1'; }), LEDGER), /計算の版/);
  rejects(() => loadCheckpoint(edit(c => { c.rulesHash = '0'.repeat(32); }), LEDGER), /きまり/);
  rejects(() => loadCheckpoint(edit(c => { c.format = 'x'; }), LEDGER), /形式/);
  rejects(() => loadCheckpoint(cp, LEDGER.map((e, i) => (i === 40 ? { ...e, gems: e.gems + 1 } : e))), /凍結済みの号/);
  rejects(() => loadCheckpoint(cp, LEDGER.slice(0, 80)), /台帳が途中経過より短い/);
  rejects(() => resume(cp, LEDGER, { prior: full.snapshots.slice(0, 99) }), /観測データ/);
  rejects(() => resume(cp, LEDGER, { prior: full.snapshots.slice(1, 101) }), /観測データ/);
  for (const [label, x] of [['-0', -0], ['NaN', NaN], ['Infinity', Infinity], ['undefined', undefined], ['関数', () => 0], ['Map', new Map()]]) {
    assert.throws(() => encodeState({ ...W, x }), CheckpointError, label);
  }
  const shared = { a: 1 };
  assert.throws(() => encodeState({ ...W, p: shared, q: shared }), CheckpointError, '同じ物の共有');
});

test('使えない途中経過は飛ばし、1つ前の途中経過か創刊号から計算する', () => {
  const good50 = viaText(makeCheckpoint(stateAt(50), LEDGER, 50, full.snapshots.slice(0, 50)));
  const bad100 = viaText(makeCheckpoint(stateAt(100), LEDGER, 100, full.snapshots.slice(0, 100)));
  bad100.state.CO2 = bad100.state.CO2 + 1; // 必ず変わる値を壊す（O2 は時代によっては元から0）
  const r = latestUsable([good50, bad100], LEDGER, { seed: MAIN_SEED, prior: full.snapshots, opts: MAIN });
  assert.equal(r.from, 50); assert.equal(r.skipped.length, 1);
  assert.equal(historyHash(summarize(r.W, r.snapshots)), fullHash);
  const r0 = latestUsable([bad100], LEDGER, { seed: MAIN_SEED, prior: full.snapshots, opts: MAIN });
  assert.equal(r0.from, 0);
  assert.equal(historyHash(summarize(r0.W, r0.snapshots)), fullHash);
  // 観測データが途中経過より短いときも、その途中経過は使わない
  const r1 = latestUsable([good50], LEDGER, { seed: MAIN_SEED, prior: full.snapshots.slice(0, 30), opts: MAIN });
  assert.equal(r1.from, 0);
});
