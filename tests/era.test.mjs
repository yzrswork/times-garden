// 惑星の1年（docs/creatures.md 段階3）のテスト: 時代ごとの時間の配分、誕生の時代、
// 観測の終わりと次の星への切り替え。
// いちばん大事なのは最初のテスト: 配分を入れる号より前の歴史が、eco-1 とビット単位で同じであること。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initWorld, stepIssue, runAll, SIM_VERSION } from '../engine/world.mjs';
import { chainHash, stateHash, makeCheckpoint, loadCheckpoint, resume, CheckpointError } from '../engine/checkpoint.mjs';
import { eraOf, timingFor, planned, ERAS } from '../engine/era.mjs';
import { endingFor, planetAge, END_KINDS } from '../engine/planet.mjs';
import { C } from '../engine/constants.mjs';
import { describe as describeEvent } from '../engine/events.mjs';
import { LEDGER, MAIN_SEED, MAIN, MAIN_TIMING_FROM, NO_PLAN, synthLedger } from './helpers.mjs';

const viaText = cp => JSON.parse(JSON.stringify(cp) + '\n');
// 1年ぶん回せる合成の号。惑星が切り替わるところまで見る。
const longLedger = (seed, n = 900) => synthLedger(seed, n);

// docs/creatures.md「いまの主役の惑星」: 配分を入れた号から先だけを新しい配分で進める。
// 台帳はいま #264 までなので、主役の惑星の歴史はまるごと配分の前にあたり、eco-1 と一致しなければならない。
test('主役の惑星の #264 までの歴史は eco-1 とビット単位で同じ', () => {
  assert.ok(MAIN_TIMING_FROM > LEDGER.length, `台帳が配分を入れる号（#${MAIN_TIMING_FROM}）に届いたら、この固定値を見直す`);
  for (const [n, want] of [[238, '569a8463b771ebc02d3eedf547be73c8'], [264, '9d939ce2f0ae183eb9ee58ec654bf5e5']]) {
    const { W, snapshots } = runAll(MAIN_SEED, LEDGER.slice(0, n), MAIN);
    assert.equal(chainHash(snapshots), want, `${n}号の歴史が変わっている`);
    assert.equal(W.planetNo, 1, '配分の前に次の星へ移ってしまった');
    assert.equal(W.volumes.length, 0);
  }
});

test('配分を入れる前の号は1号2,000万年、入れたあとは時代ごとの時間', () => {
  const W = initWorld(MAIN_SEED, MAIN);
  assert.equal(planned(W, MAIN_TIMING_FROM - 1), false);
  assert.equal(planned(W, MAIN_TIMING_FROM), true);
  assert.equal(timingFor(W, MAIN_TIMING_FROM - 1).myr, C.myrPerIssue);
  assert.equal(timingFor(W, MAIN_TIMING_FROM - 1).steps, C.myrPerIssue);
  for (const era of ERAS) assert.ok(C.myrByEra[era] > 0, era);
  // 誕生、単純な生命、形の時代は整数（1号の中を100万年ずつ計算するため）。文明は計算しない。
  for (const era of ['birth', 'simple', 'form']) assert.ok(Number.isInteger(C.myrByEra[era]), era);
  assert.ok(C.myrByEra.civ < 1, '文明の時代が100万年より長い');
  const V = initWorld('t', { timingFrom: 1 });
  assert.equal(timingFor(V, 1).era, 'birth');
  assert.equal(timingFor(V, 1).myr, C.myrByEra.birth);
});

test('時代は 誕生 → 単純な生命 → 形の時代 → 文明 の順に進み、戻らない', () => {
  const order = Object.fromEntries(ERAS.map((e, i) => [e, i]));
  let sawCiv = 0;
  for (let k = 0; k < 6; k++) {
    const seed = 'era-' + k, W = initWorld(seed, { timingFrom: 1 });
    let prev = 0, seen = false;
    assert.equal(eraOf(W), 'birth', '生まれたばかりの惑星が誕生の時代ではない');
    for (const issue of longLedger(seed)) {
      const before = W.volumes.length;
      stepIssue(W, issue);
      if (W.volumes.length !== before) { prev = 0; continue; } // 次の星へ移ったら最初から
      const i = order[eraOf(W)];
      assert.ok(i >= prev, `時代が戻った（${ERAS[prev]} → ${ERAS[i]}）`);
      prev = i;
      if (i === order.civ) seen = true;
    }
    if (seen) sawCiv++;
  }
  assert.ok(sawCiv > 0, '文明の時代に入る惑星が1つもない');
});

test('誕生の時代の出来事は、新しく始まった惑星にだけ出る', () => {
  const seed = 'birth-1', W = initWorld(seed, { timingFrom: 1 });
  const got = [];
  for (const issue of synthLedger(seed, 12)) for (const e of stepIssue(W, issue).events) if (['cloud', 'star', 'system', 'surface'].includes(e.k)) got.push([issue.issueNo, e.k]);
  assert.deepEqual(got, C.birthEvents, '誕生の出来事が、決めた号に決めた順で出ていない');
  for (const [, k] of C.birthEvents) assert.notEqual(describeEvent({ k }), k, `${k} に説明の文章がない`);
  // 主役の惑星は配分の途中から入るので、誕生の出来事は出ない（これまでの歴史を変えない）
  const M = initWorld(MAIN_SEED, MAIN);
  assert.equal(M.plan, false);
  const mainEvents = [];
  for (const issue of LEDGER.slice(0, 12)) for (const e of stepIssue(M, issue).events) mainEvents.push(e.k);
  for (const [, k] of C.birthEvents) assert.ok(!mainEvents.includes(k), `主役の惑星に誕生の出来事 ${k} が出た`);
});

test('1年の区切りまで生き物が続いたら、観測を終えて次の星へ移る', () => {
  const seed = 'year-1', W = initWorld(seed, { timingFrom: 1 });
  const before = { universeSeed: W.universeSeed, seed: W.seed, star: W.star };
  let switched = null;
  for (const issue of longLedger(seed, 1500)) {
    const snap = stepIssue(W, issue);
    const end = snap.events.find(e => e.k === 'planetEnd');
    if (end) { switched = { at: issue.issueNo, end: end.end, hasNew: snap.events.some(e => e.k === 'newPlanet') }; break; }
  }
  assert.ok(switched, '1500号まで回しても観測が終わらなかった');
  assert.ok(END_KINDS.includes(switched.end), `知らない終わり方（${switched.end}）`);
  assert.ok(switched.hasNew, '次の星へ移った出来事がない');
  assert.ok(switched.at <= C.yearIssues, `1年の区切りを超えて続いた（#${switched.at}）`);
  assert.equal(W.planetNo, 2);
  assert.equal(W.volumes.length, 1);
  const v = W.volumes[0];
  assert.equal(v.planetNo, 1); assert.equal(v.to, switched.at); assert.equal(v.endKind, switched.end);
  assert.equal(v.star, before.star);
  // 宇宙の種は変わらず、惑星の種だけ変わる
  assert.equal(W.universeSeed, before.universeSeed);
  assert.notEqual(W.seed, before.seed);
  assert.equal(planetAge(W), 0);
  assert.equal(W.plan, true, '新しい星は最初から配分で進む');
  assert.equal(W.t, 0); assert.equal(W.species.length, 0);
});

test('終わり方は、生き物が絶えた理由で決まる', () => {
  const base = { timingFrom: 1, issueNo: 500, planetFrom: 0, species: [], flags: { abio: 10 }, sterileSince: 400, snowball: false, lastGiant: 0, volumes: [] };
  assert.equal(endingFor({ ...base }), 'dead');
  assert.equal(endingFor({ ...base, snowball: true }), 'frozen');
  assert.equal(endingFor({ ...base, flags: { abio: 10, oceanLost: 300 } }), 'scorched');
  assert.equal(endingFor({ ...base, lastGiant: 400 - C.giantRecent }), 'impact');
  assert.equal(endingFor({ ...base, lastGiant: 400 - C.giantRecent - 1 }), 'dead', '古い隕石のせいにしている');
  // まだ待つ間は終わらせない
  assert.equal(endingFor({ ...base, sterileSince: 500 - C.deadAfter + 1 }), null);
  // 生命がまだ生まれていない惑星は「絶えた」ではない（誕生の時代のまま待つ）
  assert.equal(endingFor({ ...base, flags: {} }), null);
  // 1年の区切りでは、生き物がいれば次の星へ、いなければ絶えた理由で
  assert.equal(endingFor({ ...base, issueNo: C.yearIssues, species: [{}] }), 'nextStar');
  assert.equal(endingFor({ ...base, issueNo: C.yearIssues }), 'dead');
  // 配分を入れる前の号では終わらせない（これまでの歴史を変えない）
  assert.equal(endingFor({ ...base, timingFrom: 1000 }), null);
});

test('文明の時代は、進化と気候の計算が止まる（時間だけ進む）', () => {
  const seed = 'civ-1', W = initWorld(seed, { timingFrom: 1 });
  // 考える生き物が現れた状態を作る
  W.flags = { ...W.flags, abio: 1, multi: 2, mind: 3 };
  W.life = true;
  W.species = [{ id: 1, parent: 0, born: 1, cx: 5, hab: 'ocean', topt: 20, tol: 25, alb: 0, photo: false, aerobe: true, pop: 0.3, look: { form: 'blob', eyeN: 0, eyeKind: 'none', eyeSize: 0, cover: 'bare', limb: 'none', limbN: 0, depth: 'shallow', pattern: 'plain', asym: 0, joint: 0, drift: 0 } }];
  W.T = 20; W.CO2 = 400; W.O2 = 1; W.t = 3000;
  assert.equal(eraOf(W), 'civ');
  const before = { T: W.T, CO2: W.CO2, O2: W.O2, n: W.species.length, pop: W.species[0].pop, nextId: W.nextId };
  const t0 = W.t;
  for (const issue of synthLedger(seed, 40)) stepIssue(W, issue);
  assert.equal(W.T, before.T, '気温が動いた');
  assert.equal(W.CO2, before.CO2, 'CO2 が動いた');
  assert.equal(W.O2, before.O2, '酸素が動いた');
  assert.equal(W.species[0].pop, before.pop, '個体数が動いた');
  assert.equal(W.nextId, before.nextId, '新しい系統が生まれた');
  const dt = W.t - t0;
  assert.ok(dt > 0 && dt < 1, `文明の時代の40号で進んだ時間が想定外（${dt}百万年）`);
});

test('決定論: 同じ台帳からは同じ星の並びになる', () => {
  const run = () => { const W = initWorld('det-1', { timingFrom: 1 }); for (const i of longLedger('det-1', 1600)) stepIssue(W, i); return W; };
  const a = run(), b = run();
  assert.equal(stateHash(a), stateHash(b));
  assert.deepEqual(a.volumes, b.volumes);
  assert.ok(a.volumes.length >= 2, `星が2つ以上に切り替わらなかった（${a.volumes.length}）`);
  assert.deepEqual(a.volumes.map(v => v.planetNo), a.volumes.map((_, i) => i + 1));
  assert.equal(new Set(a.volumes.map(v => v.seed)).size, a.volumes.length, '同じ種の星が並んでいる');
});

test('途中経過: 次の星へ移ったあとでも、保存して再開すると同じ歴史になる', () => {
  const seed = 'cp-1', L = longLedger(seed, 1200);
  const W = initWorld(seed, { timingFrom: 1 }), snaps = [], hs = [];
  for (const issue of L) { snaps.push(stepIssue(W, issue)); hs.push(stateHash(W)); }
  assert.ok(W.volumes.length >= 1, '星が切り替わらなかった');
  const at = W.volumes[0].to; // 切り替わった号のすぐあと
  for (const count of [at, at + 1, at + 20]) {
    const R = initWorld(seed, { timingFrom: 1 });
    for (let i = 0; i < count; i++) stepIssue(R, L[i]);
    const cp = viaText(makeCheckpoint(R, L, count, snaps.slice(0, count)));
    const back = loadCheckpoint(cp, L, { seed, opts: { timingFrom: 1 } });
    assert.equal(stateHash(back), hs[count - 1], `#${count} の読み戻し`);
    const r = resume(cp, L, { seed, prior: snaps.slice(0, count), opts: { timingFrom: 1 } });
    assert.equal(stateHash(r.W), hs.at(-1), `#${count} から最後まで`);
    assert.equal(chainHash(r.snapshots), chainHash(snaps), `#${count} から最後までの記録`);
  }
});

test('Fail Closed: 配分を入れる号が違う途中経過は読み込まない', () => {
  const L = LEDGER.slice(0, 100);
  const W = initWorld(MAIN_SEED, MAIN), snaps = [];
  for (const issue of L) snaps.push(stepIssue(W, issue));
  const cp = viaText(makeCheckpoint(W, L, L.length, snaps));
  assert.doesNotThrow(() => loadCheckpoint(cp, L, { seed: MAIN_SEED, opts: MAIN }));
  assert.throws(() => loadCheckpoint(cp, L, { seed: MAIN_SEED, opts: { timingFrom: 1 } }), CheckpointError);
  assert.throws(() => loadCheckpoint(cp, L, { seed: MAIN_SEED, opts: NO_PLAN }), CheckpointError);
});

test('計算の版は eco-3 以上（時間の配分は歴史を変える変更）', () => {
  assert.match(SIM_VERSION, /^eco-(\d+)/);
  assert.ok(Number(SIM_VERSION.match(/^eco-(\d+)/)[1]) >= 3);
});
