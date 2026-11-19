// 見た目の層（engine/traits.mjs）のテスト。
// いちばん大事なのは最初のテスト: 見た目の層を足しても、1号ごとの記録（歴史）が変わっていないこと。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAll, initWorld, stepIssue } from '../engine/world.mjs';
import { chainHash, encodeState, stateHash } from '../engine/checkpoint.mjs';
import { C } from '../engine/constants.mjs';
import { planetLook, firstLook, inheritLook, bodySize, bodyColor, bestiary, describeLook, sizeLabel, FORMS, COVERS, LIMBS, DEPTHS, PATTERNS, EYE_KINDS } from '../engine/traits.mjs';
import { LEDGER, MAIN_SEED, NO_PLAN, synthLedger } from './helpers.mjs';

// 合成の号は helpers.mjs の synthLedger と同じ作り方。基準値は見た目の層を足す前（eco-1）に取った。
// ここでは時間の配分を使わない設定（NO_PLAN、1号いつも2,000万年）で回す。eco-3 の時間の配分は
// 歴史を変える意図の変更なので、それとは分けて「見た目の層だけでは歴史が変わらない」ことを確かめる。
const HISTORY = [
  { what: '主役の惑星 238号', ledger: () => LEDGER.slice(0, 238), seed: MAIN_SEED, chain: '569a8463b771ebc02d3eedf547be73c8' },
  { what: '主役の惑星 264号', ledger: () => LEDGER, seed: MAIN_SEED, chain: '9d939ce2f0ae183eb9ee58ec654bf5e5' },
  { what: '合成 base-red 600号', ledger: () => synthLedger('base-red', 600), seed: 'base-red', chain: '694c33b7bae8bb500ea6ee09922c5d95' },
  { what: '合成 base-yellow 600号', ledger: () => synthLedger('base-yellow', 600), seed: 'base-yellow', chain: 'f919babeacc59aadb9551b5c334aaa42' },
  { what: '合成 base-blue 600号', ledger: () => synthLedger('base-blue', 600), seed: 'base-blue', chain: '3567d5dc16fdf8cee4d0264bdf79d5c0' },
];

// docs/creatures.md 確定事項5: 見た目の値は気候や個体数の計算には使わない（これまでの歴史を変えない）。
// 見た目の乱数を計算の乱数 r から取ってしまうと、ここが落ちる。
test('見た目の層は歴史を変えない: 1号ごとの記録のハッシュが eco-1 と一致する', () => {
  for (const h of HISTORY) {
    const { snapshots } = runAll(h.seed, h.ledger(), NO_PLAN);
    assert.equal(chainHash(snapshots), h.chain, `${h.what} の歴史が変わっている`);
  }
});

test('決定論: 同じ種なら見た目も同じ', () => {
  const a = runAll(MAIN_SEED, LEDGER, NO_PLAN), b = runAll(MAIN_SEED, LEDGER, NO_PLAN);
  assert.equal(stateHash(a.W), stateHash(b.W));
  assert.deepEqual(a.W.species.map(s => s.look), b.W.species.map(s => s.look));
  assert.deepEqual([a.W.gravity, a.W.air], [b.W.gravity, b.W.air]);
});

test('惑星の重力と大気: 種から1回決まり、範囲の中に入り、号が進んでも変わらない', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const { gravity, air } = planetLook('p-' + i);
    assert.ok(gravity >= C.gravityRange[0] && gravity <= C.gravityRange[1], `重力 ${gravity}`);
    assert.ok(air >= C.airRange[0] && air <= C.airRange[1], `大気 ${air}`);
    seen.add(gravity + '/' + air);
  }
  assert.ok(seen.size > 150, `重力と大気の組み合わせが少ない（${seen.size}）`);
  const W = initWorld(MAIN_SEED);
  const before = [W.gravity, W.air];
  for (const issue of LEDGER.slice(0, 100)) stepIssue(W, issue);
  assert.deepEqual([W.gravity, W.air], before);
});

test('状態は JSON で往復できる（-0、undefined、共有された物がない）', () => {
  const { W } = runAll(MAIN_SEED, LEDGER, NO_PLAN);
  assert.doesNotThrow(() => encodeState(W)); // check() が -0 や undefined、同じ物の共有で止める
  assert.ok(W.species.every(s => s.look && typeof s.look === 'object'));
  // 親子で look の物を共有していないこと（共有していると encodeState が止まる）
  const objs = new Set(W.species.map(s => s.look));
  assert.equal(objs.size, W.species.length);
});

test('見た目の値は決めた選択肢と範囲の中に入る', () => {
  for (let k = 0; k < 4; k++) {
    const { W } = runAll('look-' + k, synthLedger('look-' + k, 900), NO_PLAN);
    for (const s of W.species) {
      const L = s.look;
      assert.ok(FORMS.includes(L.form), `form ${L.form}`);
      assert.ok(EYE_KINDS.includes(L.eyeKind), `eyeKind ${L.eyeKind}`);
      assert.ok(COVERS.includes(L.cover), `cover ${L.cover}`);
      assert.ok(LIMBS.includes(L.limb), `limb ${L.limb}`);
      assert.ok(PATTERNS.includes(L.pattern), `pattern ${L.pattern}`);
      assert.ok(L.depth === '' || DEPTHS.includes(L.depth), `depth ${L.depth}`);
      assert.ok([0, 1].includes(L.asym), `asym ${L.asym}`);
      assert.ok(L.joint >= C.lookJointRange[0] && L.joint <= C.lookJointRange[1], `joint ${L.joint}`);
      assert.ok(L.drift >= -C.lookDriftSpan && L.drift <= C.lookDriftSpan, `drift ${L.drift}`);
      assert.ok(Number.isInteger(L.eyeN) && L.eyeN >= 0 && L.eyeN <= C.lookEyeNRange[1], `eyeN ${L.eyeN}`);
      assert.ok(L.eyeSize >= 0 && L.eyeSize <= C.lookEyeSizeRange[1], `eyeSize ${L.eyeSize}`);
      if (L.eyeKind === 'none') assert.equal(L.eyeN, 0, '目がないのに数がある');
      else assert.ok(L.eyeN >= C.lookEyeNRange[0], '目があるのに数が0');
      if (s.hab === 'land') assert.equal(L.depth, '', '陸の系統が住む深さを持っている');
      else assert.notEqual(L.depth, '', '海の系統が住む深さを持っていない');
      if (L.limb === 'none') assert.equal(L.limbN, 0);
      else assert.ok(L.limbN >= 2, `limbN ${L.limbN}`);
    }
  }
});

test('単細胞のうちは目も動く部分も持たない（複雑さが上がってから形が分かれる）', () => {
  let checked = 0;
  for (let k = 0; k < 6; k++) {
    const { W } = runAll('simple-' + k, synthLedger('simple-' + k, 900), NO_PLAN);
    for (const s of W.species) {
      if (s.cx >= C.lookCxEye) continue;
      checked++;
      assert.equal(s.look.eyeKind, 'none', `複雑さ${s.cx}なのに目がある`);
      assert.equal(s.look.limb, 'none', `複雑さ${s.cx}なのに動く部分がある`);
      assert.equal(s.look.cover, 'bare', `複雑さ${s.cx}なのに体の覆いがある`);
      assert.equal(s.look.form, 'blob', `複雑さ${s.cx}なのに不定形でない`);
    }
  }
  assert.ok(checked > 0, '単細胞の系統が1つも出なかった');
});

test('受け継ぎ: 1回の分岐で見た目が全部変わることはない', () => {
  const look = { ...firstLook('t', 1, 1), form: 'seg', eyeKind: 'lens', eyeN: 2, eyeSize: 0.3, cover: 'shell', limb: 'fin', limbN: 4, pattern: 'spots', depth: 'mid' };
  const parent = { cx: 4, hab: 'ocean', look };
  const fields = ['form', 'eyeKind', 'cover', 'limb', 'pattern', 'depth', 'asym', 'joint'];
  let total = 0, changedAll = 0;
  for (let id = 2; id < 500; id++) {
    const child = inheritLook(parent, { id, born: 10, cx: 4, hab: 'ocean' }, 't');
    const changed = fields.filter(f => child[f] !== look[f]).length;
    assert.notEqual(child, look, '親と同じ物を返している');
    total += changed;
    if (changed === fields.length) changedAll++;
  }
  assert.equal(changedAll, 0, '1回の分岐で見た目が全部変わった');
  const mean = total / 498;
  assert.ok(mean > 0.3 && mean < 3, `1回の分岐で変わる項目の平均が極端（${mean.toFixed(2)}）`);
});

test('多細胞になった分岐で、体の型と動く部分を持ち始める', () => {
  const parent = { cx: 2, hab: 'ocean', look: firstLook('t', 1, 1) };
  const forms = new Set(), limbs = new Set();
  for (let id = 2; id < 400; id++) {
    const child = inheritLook(parent, { id, born: 10, cx: 3, hab: 'ocean' }, 'multi');
    forms.add(child.form); limbs.add(child.limb);
    assert.notEqual(child.limb, 'leg', '海の系統が脚を持っている');
    assert.notEqual(child.limb, 'wing', '海の系統が翼を持っている');
  }
  assert.equal(forms.size, FORMS.length, `多細胞になるときに体の型が出そろわない（${[...forms].join(', ')}）`);
  assert.ok(limbs.size >= 2, `動く部分が1種類しか出ない（${[...limbs].join(', ')}）`);
  // 単細胞のままの分岐では、まだ不定形
  const stay = inheritLook(parent, { id: 999, born: 10, cx: 2, hab: 'ocean' }, 'multi');
  assert.equal(stay.form, 'blob');
  assert.equal(stay.limb, 'none');
});

test('体の型と動く部分が噛み合っている（胞子型に脚は生えない）', () => {
  const allowed = { blob: ['none', 'tentacle'], seg: ['leg', 'fin', 'wing'], bell: ['tentacle'], radial: ['tentacle', 'none'], spore: ['none'] };
  for (let k = 0; k < 6; k++) {
    const { W } = runAll('limb-' + k, synthLedger('limb-' + k, 1200), NO_PLAN);
    for (const s of W.species) {
      const L = s.look;
      assert.ok(allowed[L.form].includes(L.limb), `${L.form} に ${L.limb}`);
      if (s.hab === 'ocean') assert.ok(!['leg', 'wing'].includes(L.limb), `海の系統に ${L.limb}`);
    }
  }
});

// 生き残っている系統だけを見る。多細胞になる分岐で型が決まり、そのあとは系統で受け継ぐので、
// 1本の惑星では同じ型の系統が並ぶ（地球でも近い系統は似ている）。12本まとめて見ると出そろう。
// 翼は体節型が陸にいるときだけ出るので、ここでは数に入れない（型の条件は段階2）。
test('長く続けば、体の型も目の種類も出そろう', () => {
  const forms = new Set(), eyes = new Set(), limbs = new Set(), covers = new Set();
  for (let k = 0; k < 12; k++) {
    const { W } = runAll('variety-' + k, synthLedger('variety-' + k, 1200), NO_PLAN);
    for (const s of W.species) { forms.add(s.look.form); eyes.add(s.look.eyeKind); limbs.add(s.look.limb); covers.add(s.look.cover); }
  }
  assert.equal(forms.size, FORMS.length, `体の型が出そろわない（${[...forms].join(', ')}）`);
  assert.equal(eyes.size, EYE_KINDS.length, `目の種類が出そろわない（${[...eyes].join(', ')}）`);
  assert.ok(limbs.size >= 3, `動く部分の種類が少ない（${[...limbs].join(', ')}）`);
  assert.ok(covers.size >= 3, `体の覆いの種類が少ない（${[...covers].join(', ')}）`);
});

test('体の大きさ: 複雑さが上がると大きく、重力が強いと小さい', () => {
  const W = { O2: 0.5, gravity: 1, star: 'yellow', o2Max: C.o2Max };
  const sizes = [1, 2, 3, 4, 5].map(cx => bodySize({ cx, hab: 'ocean', alb: 0 }, W));
  for (let i = 1; i < sizes.length; i++) assert.ok(sizes[i] >= sizes[i - 1], `複雑さ${i + 1}で小さくなった`);
  const light = bodySize({ cx: 4, hab: 'land', alb: 0 }, { ...W, gravity: 0.4 });
  const heavy = bodySize({ cx: 4, hab: 'land', alb: 0 }, { ...W, gravity: 2.2 });
  assert.ok(light > heavy, `重力が強いのに大きい（${light} vs ${heavy}）`);
  const poor = bodySize({ cx: 4, hab: 'land', alb: 0 }, { ...W, O2: 0 });
  const rich = bodySize({ cx: 4, hab: 'land', alb: 0 }, { ...W, O2: C.o2Max });
  assert.ok(rich > poor, '酸素が濃いのに大きくならない');
  assert.ok(['目に見えない', 'とても小さい'].includes(sizeLabel(bodySize({ cx: 1, hab: 'ocean', alb: 0 }, W))));
});

test('色味: 恒星の種類で変わり、系統ごとのずれが乗る', () => {
  const s = { alb: 0, look: { drift: 0 } };
  const hues = ['red', 'yellow', 'blue'].map(star => bodyColor(s, { star }).hue);
  assert.equal(new Set(hues).size, 3, '恒星で色味が変わらない');
  for (const h of hues) assert.ok(h >= 0 && h < 360, `色相 ${h}`);
  const dark = bodyColor({ alb: -0.25, look: { drift: 0 } }, { star: 'yellow' }).light;
  const bright = bodyColor({ alb: 0.25, look: { drift: 0 } }, { star: 'yellow' }).light;
  assert.ok(bright > dark, 'アルベドが明るさに効いていない');
  assert.equal(bodyColor({ alb: 0, look: { drift: -30 } }, { star: 'red' }).hue, 350, '色味のずれが折り返されていない');
});

test('図鑑: いま生きている系統が全部並び、姿の文章が出る', () => {
  const { W } = runAll(MAIN_SEED, LEDGER, NO_PLAN);
  const list = bestiary(W);
  assert.equal(list.length, W.species.length);
  assert.deepEqual(list.map(x => x.id).sort((a, b) => a - b), W.species.map(s => s.id).sort((a, b) => a - b));
  for (const x of list) {
    assert.ok(x.text.length > 5, `姿の文章が短い（${x.text}）`);
    assert.doesNotMatch(x.text, /undefined|NaN|\[object/, `姿の文章が壊れている（${x.text}）`);
    assert.ok(x.size > 0 && Number.isFinite(x.size));
    assert.ok(x.born >= 1 && x.born <= W.issueNo);
  }
  assert.ok(list[0].pop === undefined, '図鑑に個体数を出していない（姿と名前だけ）');
  // 個体数の多い順に並ぶ
  const pops = W.species.slice().sort((a, b) => b.pop - a.pop).map(s => s.id);
  assert.deepEqual(list.map(x => x.id), pops);
  assert.ok(describeLook(W.species[0], W).length > 5);
});
