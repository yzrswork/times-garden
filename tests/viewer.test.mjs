// 見る画面（viewer/）のテスト。描画は文字列（SVG）を作るだけなので Node で確かめられる。
// 実際の見え方は node tests/browser.mjs とスクリーンショットで確認する（CLAUDE.md 確認）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAll } from '../engine/world.mjs';
import { bestiary, FORMS, COVERS, LIMBS, PATTERNS, EYE_KINDS } from '../engine/traits.mjs';
import { creatureSVG } from '../viewer/draw.mjs';
import { townSVG, TOWN_STAGES, VB_W, VB_H } from '../viewer/town.mjs';
import { CIV_STAGES, DWELLINGS } from '../engine/civ.mjs';
import { palette, bodyFill } from '../viewer/palette.mjs';
import { LEDGER, MAIN_SEED, MAIN, synthLedger } from './helpers.mjs';

const STARS = ['red', 'yellow', 'blue'];

test('図鑑の姿: 主役の惑星のすべての系統が、壊れていない SVG になる', () => {
  const { W } = runAll(MAIN_SEED, LEDGER, MAIN);
  for (const e of bestiary(W)) {
    const svg = creatureSVG(e, W);
    assert.doesNotMatch(svg, /NaN|undefined|Infinity/, `#${e.id} の SVG が壊れている`);
    assert.match(svg, /^<svg /);
    assert.match(svg, /<\/svg>$/);
    assert.ok(svg.length < 20000, `#${e.id} の SVG が大きすぎる（${svg.length}バイト）`);
  }
});

test('見た目のどの組み合わせでも壊れない（体の型、覆い、動く部分、目、模様、恒星、重力）', () => {
  let n = 0;
  for (const form of FORMS) for (const cover of COVERS) for (const limb of LIMBS) for (const eyeKind of EYE_KINDS) {
    for (const star of STARS) for (const gravity of [0.35, 1, 2.4]) {
      const e = {
        id: ++n, cx: 4, hab: 'ocean', sizeStep: n % 6,
        look: { form, cover, limb, limbN: limb === 'none' ? 0 : 1 + (n % 10), eyeKind, eyeN: eyeKind === 'none' ? 0 : 1 + (n % 8), eyeSize: 0.3, depth: 'mid', pattern: PATTERNS[n % PATTERNS.length], asym: n % 2, joint: (n % 5) - 2, drift: (n % 61) - 30 },
        color: { light: (n % 10) / 10 }, text: 'テスト',
      };
      const svg = creatureSVG(e, { star, gravity });
      assert.doesNotMatch(svg, /NaN|undefined|Infinity/, `${form}/${cover}/${limb}/${eyeKind}/${star}/g${gravity}`);
    }
  }
  assert.ok(n > 500, `組み合わせが少ない（${n}）`);
});

test('決定論: 同じ系統からは同じ SVG が出る', () => {
  const { W } = runAll(MAIN_SEED, LEDGER, MAIN);
  const a = bestiary(W).map(e => creatureSVG(e, W));
  const b = bestiary(W).map(e => creatureSVG(e, W));
  assert.deepEqual(a, b);
});

test('体の大きさが絵の大きさに出る（小さい系統ほど小さく描く）', () => {
  const look = { form: 'blob', cover: 'bare', limb: 'none', limbN: 0, eyeKind: 'none', eyeN: 0, eyeSize: 0, depth: 'mid', pattern: 'plain', asym: 0, joint: 0, drift: 0 };
  const area = step => {
    const svg = creatureSVG({ id: 1, cx: 4, hab: 'ocean', sizeStep: step, look, color: { light: 0.5 } }, { star: 'blue', gravity: 1 });
    const xs = [...svg.matchAll(/[ML Q](-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map(m => Number(m[1]));
    return Math.max(...xs) - Math.min(...xs);
  };
  const widths = [0, 2, 5].map(area);
  assert.ok(widths[0] < widths[1] && widths[1] < widths[2], `大きさが絵に出ていない（${widths.join(' < ')}）`);
});

test('重力が強いほど低く平たく描く（docs/art-bible.md 3）', () => {
  const look = { form: 'blob', cover: 'bare', limb: 'none', limbN: 0, eyeKind: 'none', eyeN: 0, eyeSize: 0, depth: 'mid', pattern: 'plain', asym: 0, joint: 0, drift: 0 };
  const ratio = gravity => {
    const svg = creatureSVG({ id: 1, cx: 4, hab: 'ocean', sizeStep: 4, look, color: { light: 0.5 } }, { star: 'blue', gravity });
    const pts = [...svg.matchAll(/[ML Q](-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map(m => [Number(m[1]), Number(m[2])]);
    const w = Math.max(...pts.map(p => p[0])) - Math.min(...pts.map(p => p[0]));
    const h = Math.max(...pts.map(p => p[1])) - Math.min(...pts.map(p => p[1]));
    return w / h;
  };
  assert.ok(ratio(2.4) > ratio(1) && ratio(1) > ratio(0.4), '重力で体の比率が変わらない');
});

test('色は恒星ごとのパレットから出る（生の乱数で作らない）', () => {
  for (const star of STARS) {
    const p = palette(star);
    assert.ok(p.body.length >= 2 && p.ink && p.accent, star);
    for (let drift = -30; drift <= 30; drift += 3) for (const light of [0, 0.5, 1]) {
      const c = bodyFill(star, { drift }, light);
      const m = c.match(/^hsl\((-?\d+) (\d+)% (\d+)%\)$/);
      assert.ok(m, `色の形式が違う（${c}）`);
      const [, , , l] = m.map(Number);
      assert.ok(l >= 16 && l <= 82, `明度が範囲外（${c}）`);
    }
  }
  // 色相のずれは小さい（パレットから離れない）
  const hue = d => Number(bodyFill('blue', { drift: d }, 0.5).match(/hsl\((-?\d+)/)[1]);
  for (let d = -30; d <= 30; d += 1) {
    const base = palette('blue').body[Math.abs(d) % palette('blue').body.length][0];
    assert.ok(Math.abs(hue(d) - base) <= 4, `色相のずれが大きい（drift ${d}）`);
  }
});

test('文字は SVG に入れる前に逃がす', () => {
  const e = { id: 1, cx: 4, hab: 'ocean', sizeStep: 3, look: { form: 'blob', cover: 'bare', limb: 'none', limbN: 0, eyeKind: 'none', eyeN: 0, eyeSize: 0, depth: 'mid', pattern: 'plain', asym: 0, joint: 0, drift: 0 }, color: { light: 0.5 }, text: '<script>"&' };
  const svg = creatureSVG(e, { star: 'blue', gravity: 1 });
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /&lt;script&gt;&quot;&amp;/);
});

test('合成の惑星でも、どの恒星でも図鑑が作れる', () => {
  for (let k = 0; k < 6; k++) {
    const { W } = runAll('viewer-' + k, synthLedger('viewer-' + k, 700));
    for (const e of bestiary(W)) assert.doesNotMatch(creatureSVG(e, W), /NaN|undefined/);
  }
});

/* ---------- 文明の町（viewer/town.mjs、docs/creatures.md 段階4） ---------- */

test('町の姿: 段階と住まいのどの組み合わせでも、壊れていない SVG になる', () => {
  assert.deepEqual(TOWN_STAGES, CIV_STAGES, '町の段階が engine/civ.mjs と合っていない');
  let n = 0, max = 0;
  for (const stage of TOWN_STAGES) for (const dwelling of DWELLINGS) for (const star of STARS) for (const ruin of [false, true]) {
    const svg = townSVG({ id: 7 + n, stage, dwelling }, { star }, { ruin });
    assert.doesNotMatch(svg, /NaN|undefined|Infinity/, `${stage}/${dwelling}/${star}${ruin ? '/遺跡' : ''}`);
    assert.match(svg, /^<svg /); assert.match(svg, /<\/svg>$/);
    max = Math.max(max, svg.length); n++;
  }
  assert.ok(n >= 60, `組み合わせが少ない（${n}）`);
  assert.ok(max < 20000, `町の SVG が大きすぎる（${max}バイト）`);
});

test('町の姿: 段階が上がるほど建物が増えて高くなる', () => {
  const boxes = svg => [...svg.matchAll(/<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.]+)" height="([\d.]+)"/g)]
    .map(m => ({ y: Number(m[2]), h: Number(m[4]) })).filter(b => b.h < VB_H && b.y > 0);
  let prevN = 0, prevTop = VB_H;
  for (const stage of TOWN_STAGES) {
    const b = boxes(townSVG({ id: 3, stage, dwelling: 'earth' }, { star: 'blue' }));
    const top = Math.min(...b.map(x => x.y));
    assert.ok(b.length >= prevN, `${stage}: 建物が減った（${prevN} → ${b.length}）`);
    assert.ok(top <= prevTop, `${stage}: 建物が低くなった（上端 ${prevTop} → ${top}）`);
    prevN = b.length; prevTop = top;
  }
  assert.ok(prevTop < VB_H * 0.3, `未来都市が高くない（上端 ${prevTop}）`);
});

test('町の姿: 住まいの種類で並べ方が変わる。遺跡は別の絵になる', () => {
  const seen = new Map();
  for (const d of DWELLINGS) seen.set(d, townSVG({ id: 5, stage: 'town', dwelling: d }, { star: 'blue' }));
  assert.equal(new Set(seen.values()).size, DWELLINGS.length, '住まいが違っても同じ絵になっている');
  // 地下の町は、建物が地表より下にある
  const under = [...seen.get('under').matchAll(/<rect x="[\d.-]+" y="([\d.-]+)"/g)].map(m => Number(m[1]));
  assert.ok(Math.min(...under.filter(y => y > 0)) >= 50, '地下の町の建物が地上に出ている');
  const town = townSVG({ id: 5, stage: 'town', dwelling: 'earth' }, { star: 'blue' });
  assert.notEqual(town, townSVG({ id: 5, stage: 'town', dwelling: 'earth' }, { star: 'blue' }, { ruin: true }));
});

test('町の姿: 決定論（同じ文明なら同じ絵）と、恒星の色が出ること', () => {
  const a = townSVG({ id: 9, stage: 'city', dwelling: 'earth' }, { star: 'red' });
  assert.equal(a, townSVG({ id: 9, stage: 'city', dwelling: 'earth' }, { star: 'red' }));
  assert.notEqual(a, townSVG({ id: 10, stage: 'city', dwelling: 'earth' }, { star: 'red' }));
  for (const star of STARS) {
    const svg = townSVG({ id: 9, stage: 'city', dwelling: 'earth' }, { star });
    const hue = palette(star).body[0][0];
    assert.ok(svg.includes(`hsl(${hue} `), `${star}: 恒星のパレットの色相（${hue}）が使われていない`);
  }
});

test('町の姿: 知らない段階や住まいでも落ちない', () => {
  for (const civ of [null, {}, { id: 1, stage: 'なにか', dwelling: 'どこか' }, { id: NaN, stage: 'city' }]) {
    const svg = townSVG(civ, { star: 'blue' });
    assert.doesNotMatch(svg, /NaN|undefined|Infinity/, JSON.stringify(civ));
  }
  assert.doesNotMatch(townSVG({ id: 1, stage: 'city', dwelling: 'earth' }, {}), /NaN|undefined/);
  assert.ok(townSVG({ id: 1, stage: 'city', dwelling: 'earth' }, { star: 'blue' }).includes(`viewBox="0 0 ${VB_W} ${VB_H}"`));
});
