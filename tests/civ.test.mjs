// 文明（engine/civ.mjs、docs/creatures.md 段階4）のテスト。
// いちばん大事なのは最初のテスト: 文明を足しても、文明の時代より前の歴史が1ビットも変わっていないこと。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initWorld, stepIssue, runAll } from '../engine/world.mjs';
import { chainHash, stateHash, makeCheckpoint, loadCheckpoint, encodeState } from '../engine/checkpoint.mjs';
import { eraOf } from '../engine/era.mjs';
import { endingFor } from '../engine/planet.mjs';
import { CIV_STAGES, CIV_JA, DWELLINGS, DWELL_JA, FALL_WHYS, techOf, dwellingFor, civReach, stageIndex } from '../engine/civ.mjs';
import { C } from '../engine/constants.mjs';
import { describe as describeEvent } from '../engine/events.mjs';
import { LEDGER, MAIN_SEED, MAIN, synthLedger } from './helpers.mjs';

// 1つの惑星を、文明の時代に入るまで回す。
function runToCiv(seed, len = 1600) {
  const L = synthLedger(seed, len), W = initWorld(seed, { timingFrom: 1 }), snaps = [];
  for (const issue of L) {
    snaps.push(stepIssue(W, issue));
    if (eraOf(W) === 'civ' && W.species.some(s => s.cx >= C.maxCx)) return { W, L, snaps, at: issue.issueNo };
  }
  return { W, L, snaps, at: 0 };
}

// 考える生き物が1系統いる、文明の時代の惑星を組み立てる（計算を最初から回さずに文明だけを見るため）。
// tests/era.test.mjs の「文明の時代は計算が止まる」と同じ作り方。
function civWorld(seed, { stage = '', tech = 0 } = {}) {
  const W = initWorld(seed, { timingFrom: 1 });
  W.flags = { ...W.flags, abio: 1, multi: 2, complex: 3, mind: 4 };
  W.life = true; W.T = 20; W.CO2 = 400; W.O2 = 1; W.t = 3000; W.issueNo = 100;
  W.species = [{
    id: 1, parent: 0, born: 4, cx: 5, hab: 'land', topt: 20, tol: 25, alb: 0, photo: false, aerobe: true, pop: 0.3,
    look: { form: 'seg', eyeN: 2, eyeKind: 'lens', eyeSize: 0.3, cover: 'scale', limb: 'leg', limbN: 4, depth: '', pattern: 'plain', asym: 0, joint: 0, drift: 0 },
  }];
  if (stage) W.civs = [{ id: 1, from: 100, stage, stageFrom: 0, dwelling: stage === 'trace' ? '' : 'earth', tech }];
  assert.equal(eraOf(W), 'civ');
  return W;
}

// 技術の記事の本数をそろえた号（気候と生命に渡す値は同じまま）。
function techLedger(seed, n, nTech) {
  const L = synthLedger(seed, n);
  for (const e of L) { e.issueNo += 100; e.categories = { tech: nTech, news: Math.max(0, 12 - nTech) }; }
  return L;
}

// 文明の時代に入ってからの出来事を集める。
function civEvents(seed, len = 1600) {
  const L = synthLedger(seed, len), W = initWorld(seed, { timingFrom: 1 }), out = [];
  for (const issue of L) for (const e of stepIssue(W, issue).events) if (['civ', 'civFall', 'exodus', 'planetEnd', 'newPlanet'].includes(e.k)) out.push({ ...e, at: issue.issueNo, planet: W.planetNo });
  return { W, out };
}

// 固定値は文明を足す前（eco-3）に取った。count は、その種で文明の時代に入る号の1つ前。
// ここが落ちたら、文明の計算が形の時代までの歴史に漏れている（乱数の流れを分けていない、など）。
const BEFORE_CIV = [
  { seed: 'era-0', count: 620, chain: 'f9f1853d777af9cb01abc445fe0fce03' },
  { seed: 'det-1', count: 290, chain: '456825db1cbd584fe94bd3d525fae72b' },
  { seed: 'soak-0', count: 316, chain: 'b8f4639a8f4e52dcfc65ac57eb8a0c82' },
  // この2つは1600号まで考える生き物が現れない。文明を足しても全号そのまま
  { seed: 'era-1', count: 900, chain: '353ba7d91eec321511aa42dbfaed8ba1' },
  { seed: 'soak-1', count: 900, chain: '681cbf9c17439ca3b05a7f9455db5b80' },
];

test('文明は、文明の時代より前の歴史を変えない（記録のハッシュが eco-3 と一致する）', () => {
  for (const h of BEFORE_CIV) {
    const { snapshots } = runAll(h.seed, synthLedger(h.seed, h.count), { timingFrom: 1 });
    assert.equal(snapshots.length, h.count);
    assert.equal(chainHash(snapshots), h.chain, `${h.seed} の ${h.count}号までの歴史が変わっている`);
    assert.ok(!snapshots.some(s => s.civs), `${h.seed}: 文明の時代より前の記録に文明が入っている`);
  }
});

test('主役の惑星はまだ文明の時代に入っていない（入ったら、この先の設計を Owner と確かめる）', () => {
  const { W } = runAll(MAIN_SEED, LEDGER, MAIN);
  assert.notEqual(eraOf(W), 'civ', '主役の惑星が文明の時代に入った。docs/creatures.md の「いまの主役の惑星」を更新すること');
  assert.deepEqual(W.civs, []);
  assert.deepEqual(W.ruins, []);
  assert.equal(W.exodus, 0);
});

// docs/creatures.md「どの段階でも、滅びることがある」。考える生き物が現れた号に系統が切り捨てられると、
// 文明の時代に入ったまま担う系統がいなくなり、残りの観測（ときに数百号）で何も起きない（柱3）。
// eco-3 までは、系統が上限いっぱいの惑星でこれが起きていた（engine/life.mjs の回帰テスト）。
test('考える生き物は、系統の数の上限で切り捨てられない', () => {
  let appeared = 0;
  for (let k = 0; k < 12; k++) {
    const seed = 'soak-' + k, W = initWorld(seed, { timingFrom: 1 });
    let prev = 0;
    for (const issue of synthLedger(seed, 1600)) {
      stepIssue(W, issue);
      if (W.flags.mind && W.flags.mind !== prev) {
        appeared++;
        assert.ok(W.species.some(s => s.cx >= C.maxCx),
          `${seed} #${issue.issueNo}: 考える生き物が現れた号に、その系統が残っていない（系統 ${W.species.length}）`);
      }
      prev = W.flags.mind;
    }
  }
  assert.ok(appeared >= 8, `考える生き物が現れた回数が少ない（${appeared}）`);
});

test('文明の時代に入った惑星では、ほとんどで文明が立ち上がる（柱3: 何も起きない惑星にしない）', () => {
  let civEra = 0, withCiv = 0;
  for (let k = 0; k < 12; k++) {
    const { W, out } = civEvents('soak-' + k);
    const planets = new Set(), civPlanets = new Set();
    for (const e of out) { if (e.k === 'civ') civPlanets.add(e.planet); }
    // 文明の時代に入った惑星を、巻（年表）から数える
    for (const v of W.volumes) if (v.flags.mind) planets.add(v.planetNo);
    for (const p of planets) { civEra++; if (civPlanets.has(p)) withCiv++; }
  }
  assert.ok(civEra >= 8, `文明の時代に入った惑星が少ない（${civEra}）`);
  assert.ok(withCiv / civEra >= 0.8, `文明が立ち上がらない惑星が多い（${withCiv}/${civEra}）`);
});

test('段階は痕跡から順に進み、飛ばさない。住まいは集落で決まり、その先も変わらない', () => {
  let seen = 0, villages = 0;
  for (let k = 0; k < 12; k++) {
    const { out } = civEvents('soak-' + k);
    const stage = new Map(), dwell = new Map(); // 惑星ごと、いまの段階と住まい
    for (const e of out) {
      if (e.k === 'civ') {
        const i = stageIndex(e.stage);
        assert.ok(i >= 0, `知らない段階 ${e.stage}`);
        const prev = stage.get(e.planet);
        if (prev === undefined) assert.equal(e.stage, 'trace', `#${e.at}: 痕跡より先から始まった（${e.stage}）`);
        else assert.equal(i, prev + 1, `#${e.at}: 段階が飛んだか戻った（${CIV_STAGES[prev]} → ${e.stage}）`);
        stage.set(e.planet, i);
        if (e.stage === 'trace') assert.equal(e.dwell, '', '痕跡の段階で住まいが決まっている');
        if (e.stage === 'village') { villages++; assert.ok(DWELLINGS.includes(e.dwell), `知らない住まい ${e.dwell}`); dwell.set(e.planet, e.dwell); }
        if (i >= stageIndex('village')) assert.equal(e.dwell, dwell.get(e.planet), `#${e.at}: 住まいが途中で変わった`);
        seen++;
      }
      // 滅びたら、その惑星の文明は痕跡からやり直す（docs/creatures.md の再興。遺跡は残る）
      if (e.k === 'civFall') { stage.delete(e.planet); dwell.delete(e.planet); }
      if (e.k === 'planetEnd') { stage.clear(); dwell.clear(); }
    }
  }
  assert.ok(seen >= 20 && villages >= 5, `文明の出来事が少ない（段階 ${seen}、集落 ${villages}）`);
});

test('住まいの種類は、惑星と系統の条件で決まる', () => {
  const base = {
    gravity: 1, air: 1, T: 20, species: [],
    issueNo: 100,
  };
  const land = { hab: 'land', topt: 20, tol: 25, photo: false, cx: 5, look: { limb: 'leg' } };
  assert.equal(dwellingFor({ ...base }, land), 'earth');
  assert.equal(dwellingFor({ ...base }, { ...land, hab: 'ocean' }), 'water');
  assert.equal(dwellingFor({ ...base, gravity: C.civTowerGravity }, land), 'tower');
  assert.equal(dwellingFor({ ...base, T: 20 + 25 * C.civUnderTol }, land), 'under');
  assert.equal(dwellingFor({ ...base }, { ...land, look: { limb: 'wing' } }), 'cliff');
  // 植物のような系統（光合成・陸・動く部分なし）が多い星
  const plants = Array.from({ length: 10 }, (_, i) => ({ id: i, hab: 'land', cx: 3, photo: true, look: { limb: 'none' } }));
  assert.equal(dwellingFor({ ...base, species: plants }, land), 'tree');
  // 陸の大型の生き物が多い星（外敵が多い）
  const big = Array.from({ length: C.civCliffBig }, (_, i) => ({ id: i, hab: 'land', cx: 4, photo: false, look: { limb: 'leg' } }));
  assert.equal(dwellingFor({ ...base, species: big }, land), 'cliff');
  for (const d of DWELLINGS) assert.ok(DWELL_JA[d], `${d} に日本語の名前がない`);
});

test('滅びた文明は遺跡として残り、上限を超えない。理由は決めた中のどれか', () => {
  let falls = 0;
  for (let k = 0; k < 12; k++) {
    const { W, out } = civEvents('soak-' + k);
    for (const e of out) if (e.k === 'civFall') { falls++; assert.ok(FALL_WHYS.includes(e.why), `知らない理由 ${e.why}`); }
    assert.ok(W.ruins.length <= C.maxRuins, `遺跡が上限を超えた（${W.ruins.length}）`);
    for (const r of W.ruins) {
      assert.ok(CIV_STAGES.includes(r.stage) && r.to >= r.from, JSON.stringify(r));
      assert.ok(FALL_WHYS.includes(r.why), JSON.stringify(r));
    }
  }
  assert.ok(falls >= 10, `滅びた文明が少ない（${falls}）`);
});

test('星を出るのは未来都市まで進んだ文明だけで、その号に観測が終わる', () => {
  // 未来都市の文明を置いた惑星を回すと、いつか星を出て、その号に観測が終わる
  let exodus = 0, atCity = 0;
  for (let k = 0; k < 10; k++) {
    const W = civWorld('exo-' + k, { stage: 'future', tech: C.civFutureTech });
    for (const issue of techLedger('exo-' + k, 300, 6)) {
      const snap = stepIssue(W, issue);
      if (!snap.events.some(e => e.k === 'exodus')) continue;
      exodus++;
      const end = snap.events.find(e => e.k === 'planetEnd');
      assert.ok(end && end.end === 'exodus', `#${issue.issueNo}: 星を出た号に観測が終わっていない`);
      assert.equal(describeEvent(end), '観測を終えた: 文明が星を出た');
      break;
    }
    // 都市の段階では、星は出ない（未来都市へ進むまでは）
    const V = civWorld('exo-' + k, { stage: 'city', tech: 0 });
    for (const issue of techLedger('exo-' + k, 120, 0)) {
      const snap = stepIssue(V, issue);
      if (snap.events.some(e => e.k === 'civ' && e.stage === 'future')) break; // 未来都市へ進んだら、そこまで
      if (snap.events.some(e => e.k === 'exodus')) atCity++;
    }
  }
  // 未来都市の文明は、星を出る（4%/号）か、その前に滅びる（約3%/号）。半分ほどが星を出る計算
  assert.ok(exodus >= 3, `未来都市の文明が星を出なかった（10本で ${exodus}本）`);
  assert.equal(atCity, 0, '未来都市へ進む前に星を出た');
  // 未来都市でなければ、星を出る理由にはならない
  const W = { timingFrom: 1, issueNo: 500, planetFrom: 0, species: [{}], flags: { abio: 1 }, sterileSince: 0, exodus: 0 };
  assert.equal(endingFor(W), null);
  assert.equal(endingFor({ ...W, exodus: 500 }), 'exodus');
});

test('技術の記事が多い台帳のほうが、文明が速く進む', () => {
  assert.equal(techOf({ categories: { tech: C.civTechCap, news: 0 } }), 1);
  assert.equal(techOf({ categories: { news: 12 } }), 0);
  assert.equal(techOf({}), 0, 'categories のない台帳で落ちる');
  assert.equal(techOf({ categories: { tech: 100 } }), 1, '上限で止まっていない');
  // 同じ惑星・同じ気温の号で、記事の分類だけを変える（categories は気候と生命の計算には使わない）。
  // 1本の種では当たり外れが大きいので、何本も回して段階が進んだ回数を比べる。
  const advances = (nTech) => {
    let n = 0;
    for (let k = 0; k < 10; k++) {
      const W = civWorld('tech-' + k, { stage: 'trace' });
      for (const issue of techLedger('tech-' + k, 200, nTech)) {
        if (W.volumes.length) break;
        for (const e of stepIssue(W, issue).events) if (e.k === 'civ' && e.stage !== 'trace') n++;
      }
    }
    return n;
  };
  const hot = advances(C.civTechCap), cold = advances(0);
  assert.ok(hot > cold * 1.3, `技術の記事が多い台帳のほうが進んでいない（技術いっぱい ${hot}回 / なし ${cold}回）`);
});

test('文明は進化と気候を動かさない（文明の時代の計算は時間だけ）', () => {
  const { W, L, at } = runToCiv('soak-0');
  assert.ok(at > 0, '文明の時代に入らなかった');
  const before = { T: W.T, CO2: W.CO2, O2: W.O2, nextId: W.nextId, pops: W.species.map(s => s.pop), extinct: W.extinct };
  const rest = L.slice(L.findIndex(i => i.issueNo === at), L.findIndex(i => i.issueNo === at) + 60);
  for (const issue of rest) { if (W.volumes.length) break; stepIssue(W, issue); }
  assert.equal(W.T, before.T); assert.equal(W.CO2, before.CO2); assert.equal(W.O2, before.O2);
  assert.equal(W.nextId, before.nextId);
  assert.deepEqual(W.species.map(s => s.pop), before.pops);
  assert.equal(W.extinct, before.extinct);
});

test('決定論: 文明と遺跡も、同じ種から同じになる。途中経過で往復できる', () => {
  const run = () => { const W = initWorld('civ-det', { timingFrom: 1 }); const L = synthLedger('civ-det', 1200), s = []; for (const i of L) s.push(stepIssue(W, i)); return { W, L, s }; };
  const a = run(), b = run();
  assert.equal(stateHash(a.W), stateHash(b.W));
  assert.deepEqual(a.W.civs, b.W.civs);
  assert.deepEqual(a.W.ruins, b.W.ruins);
  // 文明を持った号で保存して読み戻す
  const { W, L } = a;
  const V = initWorld('civ-det', { timingFrom: 1 }), snaps = [];
  let saved = null;
  for (let i = 0; i < L.length; i++) {
    snaps.push(stepIssue(V, L[i]));
    if (!saved && (V.civs.length || V.ruins.length)) saved = i + 1;
  }
  assert.ok(saved, '文明を持った号がなかった');
  const R = initWorld('civ-det', { timingFrom: 1 });
  for (let i = 0; i < saved; i++) stepIssue(R, L[i]);
  assert.ok(R.civs.length || R.ruins.length);
  const cp = JSON.parse(encodeState(R));
  assert.deepEqual(cp.civs, R.civs, '文明が JSON で往復できない');
  const back = loadCheckpoint(JSON.parse(JSON.stringify(makeCheckpoint(R, L, saved, snaps.slice(0, saved)))), L, { seed: 'civ-det', opts: { timingFrom: 1 } });
  assert.equal(stateHash(back), stateHash(R));
});

test('文明の出来事には、すべて日本語の説明がある', () => {
  for (const s of CIV_STAGES) {
    assert.ok(CIV_JA[s], `${s} に日本語の名前がない`);
    assert.notEqual(describeEvent({ k: 'civ', stage: s, dwell: '' }), s);
    for (const d of DWELLINGS) assert.match(describeEvent({ k: 'civ', stage: s, dwell: d }), /（.+）$/);
  }
  for (const w of FALL_WHYS) assert.match(describeEvent({ k: 'civFall', stage: 'town', why: w }), /^文明が滅びた（町・.+）$/);
  assert.notEqual(describeEvent({ k: 'exodus' }), 'exodus');
});

test('記録と巻に、文明の様子が入る', () => {
  const { W, snaps } = runToCiv('soak-0');
  const withCiv = snaps.filter(s => s.civs);
  assert.ok(!withCiv.length || withCiv.every(s => Array.isArray(s.civs) && typeof s.ruins === 'number'));
  // 文明の時代に入ったあとの号を回して、記録に文明が出るか見る
  const L = synthLedger('soak-0', 1600);
  const from = L.findIndex(i => i.issueNo === W.issueNo) + 1;
  let got = null;
  for (const issue of L.slice(from, from + 200)) {
    const s = stepIssue(W, issue);
    if (s.civs?.length) { got = s; break; }
  }
  assert.ok(got, '文明の時代の200号で、記録に文明が出なかった');
  assert.equal(got.civs[0].stage, 'trace');
  assert.ok(Number.isInteger(got.civs[0].id));
  assert.ok(civReach(W), 'civReach が空');
});
