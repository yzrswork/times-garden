// 計算（engine/）のテスト: 決定論、主役の惑星の歴史、禁止した Math 関数、定数の書き方。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { runAll, summarize, historyHash } from '../engine/world.mjs';
import { stateHash } from '../engine/checkpoint.mjs';
import { CONSTANTS } from '../engine/constants.mjs';
import { describe as describeEvent, EVENT_KINDS } from '../engine/events.mjs';
import { ROOT, LEDGER, MAIN_SEED, synthLedger } from './helpers.mjs';

test('決定論: 同じ台帳と種で2回計算すると、状態と全史のハッシュが一致する', () => {
  const a = runAll(MAIN_SEED, LEDGER), b = runAll(MAIN_SEED, LEDGER);
  assert.equal(stateHash(a.W), stateHash(b.W));
  assert.equal(historyHash(summarize(a.W, a.snapshots)), historyHash(summarize(b.W, b.snapshots)));
});

// 試作04（eco-0.1）とビット単位で同じ計算であることは、書き直したときに12万号ぶん比べて確かめた（README の更新ログ）。
// ここでは主役の惑星の最初の238号を固定する。計算か定数を変えて歴史が変わったら、このテストが落ちる。
// 意図した変更なら、SIM_VERSION を上げ、ここの値を新しい歴史に合わせて書き換える。
test('主役の惑星の最初の238号: 全史のハッシュと主な出来事が変わっていない', () => {
  const ledger = LEDGER.slice(0, 238);
  const { W, snapshots } = runAll(MAIN_SEED, ledger);
  assert.equal(W.star, 'blue');
  assert.equal(historyHash(summarize(W, snapshots)), '1bace83ddb19e8b82ae6896d09638974');
  const ev = snapshots.flatMap(s => s.events.filter(e => !['super'].includes(e.k) && !(e.k === 'impact' && e.size === 'small')).map(e => `#${s.issueNo} ${describeEvent(e)}`));
  assert.deepEqual(ev, [
    '#6 海で最初の生命が生まれた', '#8 光合成をする生き物が現れた', '#42 大気に酸素がたまり始めた（大酸化イベント）',
    '#43 細胞の中に小部屋を持つ生き物（真核生物）が現れた', '#47 大きな隕石が落ちた', '#68 多細胞の生き物が現れた', '#69 生き物が陸に上がった',
    '#82 巨大な隕石が落ちた', '#82 惑星全体が凍りついた（全球凍結）', '#82 すべての生き物が絶滅した', '#82 全球凍結が解けた', '#82 大量絶滅（系統の100%が消えた）',
    '#97 生命がふたたび生まれた', '#165 大きく複雑な生き物が現れた', '#218 大きな隕石が落ちた', '#231 巨大な隕石が落ちた', '#231 大量絶滅（系統の83%が消えた）',
  ]);
});

test('出来事の種類はすべて説明の文章を持つ', () => {
  const kinds = new Set();
  for (let k = 0; k < 6; k++) for (const s of runAll('kinds-' + k, synthLedger('kinds-' + k, 1500)).snapshots) for (const e of s.events) kinds.add(e.k);
  for (const k of kinds) assert.ok(EVENT_KINDS.includes(k), `未知の出来事 ${k}`);
  for (const k of EVENT_KINDS) assert.notEqual(describeEvent({ k, size: 'small', lost: 0.5 }), k);
  assert.ok(kinds.size >= 12, `合成の号で出た出来事の種類が少ない（${[...kinds].join(', ')}）`);
});

test('engine/ は Math.random と、エンジン間でずれうる Math 関数を使わない', () => {
  const banned = /Math\.(random|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|pow|log|log2|log10|log1p|cbrt|hypot)\b|\*\*/;
  for (const f of readdirSync(ROOT + 'engine').filter(f => f.endsWith('.mjs'))) {
    const code = readFileSync(ROOT + 'engine/' + f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, banned, `engine/${f}`);
  }
});

test('定数はすべて、値、単位、意味、出典、状態（合意 / 論争 / 思弁）を持つ', () => {
  for (const [k, o] of Object.entries(CONSTANTS)) {
    assert.ok(o.v !== undefined, k);
    for (const f of ['unit', 'note', 'src']) assert.equal(typeof o[f], 'string', `${k}.${f}`);
    assert.match(o.status, /^(合意|論争|思弁)/, `${k}.status`);
  }
});
