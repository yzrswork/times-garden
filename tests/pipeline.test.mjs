// 取り込みと data/ のテスト: graph.json の変換、台帳への追記（凍結と Fail Closed）、途中経過と観測データの作り方。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { convertGraph, GraphFormatError } from '../pipeline/convert.mjs';
import { appendIssues, IngestError } from '../pipeline/ingest.mjs';
import { buildFiles, planWrites, FreezeError } from '../pipeline/advance.mjs';
import { restore, fileName } from '../engine/observations.mjs';
import { summarize, historyHash } from '../engine/world.mjs';
import { CheckpointError } from '../engine/checkpoint.mjs';
import { ROOT, LEDGER, readJSON, makeGraph } from './helpers.mjs';

const base = [
  { no: 1, arts: [{ kw: ['a', 'b'], temp: 70, gem: true }, { kw: ['b', 'c'], temp: 50 }] },
  { no: 2, arts: [{ kw: ['c', 'd'], temp: 90 }] },
  { no: 3, arts: [{ kw: ['e'], temp: 40, cat: 'news' }] },
];
const ledgerOf = issues => ({ version: 1, source: 'x', generatedAt: '', issues });

test('変換: 1号ぶんの入力（記事数、gem、平均温度、新しいキーワード、digest）を作る', () => {
  const { entries } = convertGraph(makeGraph(base));
  assert.deepEqual(entries.map(e => [e.issueNo, e.nArticles, e.gems, e.meanTemp, e.newKeywords]), [[1, 2, 1, 60, 3], [2, 1, 0, 90, 1], [3, 1, 0, 40, 1]]);
  assert.deepEqual(entries[2].categories, { news: 1 });
  assert.match(entries[0].digest, /^[0-9a-f]+$/);
});

test('変換: 形式が想定と違えば GraphFormatError', () => {
  const bad = [
    g => { g.schemaVersion = 3; }, g => { g.issues = {}; }, g => { g.issues[0].issueNo = '1'; },
    g => { g.articles[0].keywords = [1]; }, g => { g.articles[0].temperature = '70'; }, g => { g.articles[0].gem = 'yes'; },
    g => { g.issues[1].issueNo = 1; }, g => { delete g.articles[0].category; },
  ];
  for (const f of bad) { const g = makeGraph(base); f(g); assert.throws(() => convertGraph(g), GraphFormatError, f.toString()); }
});

test('追記: 新しい号だけを足し、凍結済みの号は graph.json が変わっても書き換えない', () => {
  const first = appendIssues(ledgerOf([]), convertGraph(makeGraph(base.slice(0, 2))));
  assert.equal(first.added.length, 2);
  // graph 側で #1 の記事が変わっても、凍結済みの #1 はそのまま
  const changed = structuredClone(base); changed[0].arts[0].temp = 10;
  const second = appendIssues(first.ledger, convertGraph(makeGraph(changed)));
  assert.deepEqual(second.ledger.issues.slice(0, 2), first.ledger.issues);
  assert.deepEqual(second.added.map(e => e.issueNo), [3]);
  // もう一度流しても何も増えない
  assert.equal(appendIssues(second.ledger, convertGraph(makeGraph(changed))).added.length, 0);
});

test('追記: 号番号の付け替えは止まり、途切れや記事0本の号の手前で止まる', () => {
  const l2 = appendIssues(ledgerOf([]), convertGraph(makeGraph(base.slice(0, 2)))).ledger;
  const renum = structuredClone(base); renum[1].id = 'i:other';
  assert.throws(() => appendIssues(l2, convertGraph(makeGraph(renum))), IngestError);
  const gap = appendIssues(l2, convertGraph(makeGraph([...base.slice(0, 2), { no: 4, arts: [{ kw: ['z'] }] }])));
  assert.equal(gap.added.length, 0); assert.match(gap.notes.join(), /#3 が graph.json にない/);
  const empty = appendIssues(l2, convertGraph(makeGraph([...base.slice(0, 2), { no: 3, arts: [] }, { no: 4, arts: [{ kw: ['z'] }] }])));
  assert.equal(empty.added.length, 0); assert.match(empty.notes.join(), /記事が0本/);
  const gone = appendIssues(l2, convertGraph(makeGraph([base[1], base[2]])));
  assert.deepEqual(gone.added.map(e => e.issueNo), [3]); assert.match(gone.notes.join(), /#1.*消えている/);
  assert.throws(() => appendIssues({ ...l2, version: 2 }, convertGraph(makeGraph(base))), IngestError);
});

test('data/: 保存済みの途中経過、観測データ、manifest が、台帳から作り直したものと同じ（node pipeline/advance.mjs --check と同じ）', () => {
  const { files } = buildFiles(LEDGER);
  const existing = new Map([['manifest.json', readFileSync(ROOT + 'data/manifest.json', 'utf8')]]);
  for (const d of ['checkpoints/', 'observations/']) for (const f of readdirSync(ROOT + 'data/' + d)) existing.set(d + f, readFileSync(ROOT + 'data/' + d + f, 'utf8'));
  assert.deepEqual(planWrites(files, existing).map(p => `${p.rel} ${p.what}`), []);
});

test('data/: 凍結したファイルが同じきまりのまま違えば止まり、きまりが変われば作り直す', () => {
  const { files } = buildFiles(LEDGER.slice(0, 120));
  const tampered = new Map(files);
  const cp = JSON.parse(files.get('checkpoints/00050.json')); cp.state.CO2 += 1;
  tampered.set('checkpoints/00050.json', JSON.stringify(cp) + '\n');
  assert.throws(() => planWrites(files, tampered), FreezeError);
  const older = new Map(files);
  const ob = JSON.parse(files.get('observations/00100.json')); ob.simVersion = 'eco-0'; ob.snapshots = [];
  older.set('observations/00100.json', JSON.stringify(ob) + '\n');
  older.set('checkpoints/00150.json', '{}');
  assert.deepEqual(planWrites(files, older).map(p => `${p.rel} ${p.what}`), ['observations/00100.json 作り直し（eco-0 → eco-1）', 'checkpoints/00150.json 削除（いまの計画にない）']);
});

test('data/: 公開データから、ブラウザと同じ手順で全史を組み立てられる。欠けや壊れがあれば使えるところから計算し直す', () => {
  const manifest = readJSON('data/manifest.json');
  const load = (d, n) => readJSON(`data/${d}/${fileName(n)}`);
  const chunks = manifest.checkpoints.map(n => load('observations', n)), cps = manifest.checkpoints.map(n => load('checkpoints', n));
  const r = restore({ manifest, ledger: LEDGER, chunks, checkpoints: cps });
  assert.equal(r.from, manifest.checkpoints.at(-1)); assert.deepEqual(r.problems, []);
  assert.equal(historyHash(summarize(r.W, r.snapshots)), manifest.historyHash);
  // いちばん新しい観測データのまとまりが欠けたら、1つ前の途中経過から
  const r2 = restore({ manifest, ledger: LEDGER, chunks: chunks.slice(0, -1), checkpoints: cps });
  assert.equal(r2.from, manifest.checkpoints.at(-2));
  assert.equal(historyHash(summarize(r2.W, r2.snapshots)), manifest.historyHash);
  // 最初のまとまりが壊れていたら、創刊号から
  const broken = structuredClone(chunks); broken[0].snapshots[3].T += 1;
  const r3 = restore({ manifest, ledger: LEDGER, chunks: broken, checkpoints: cps });
  assert.equal(r3.from, 0);
  assert.equal(historyHash(summarize(r3.W, r3.snapshots)), manifest.historyHash);
  assert.throws(() => restore({ manifest: {}, ledger: LEDGER }), CheckpointError);
});

test('台帳: 号番号は1から連番で、id は重ならない', () => {
  LEDGER.forEach((e, i) => assert.equal(e.issueNo, i + 1));
  assert.equal(new Set(LEDGER.map(e => e.id)).size, LEDGER.length);
});
