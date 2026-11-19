// 台帳から、途中経過、観測データのまとまり、manifest を作って data/ に書く。
// 使い方: node pipeline/advance.mjs [--check]
// 毎回創刊号から計算し直し、保存済みのファイルと照らし合わせる。途中経過と観測データは凍結する。
// 同じ形式ときまりなのに中身が違えば、何も書かずに止まる（Fail Closed。計算を変えたのに版を上げ忘れた、などを見つける）。
// 形式かきまりが変わったときは作り直す。--check は何も書かず、書き換えが要るなら終了コード1で知らせる。
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { SIM_VERSION, RULES_HASH, summarize, historyHash } from '../engine/world.mjs';
import { runWithCheckpoints, stateHash } from '../engine/checkpoint.mjs';
import { makeChunk, restore, fileName, MANIFEST_FORMAT } from '../engine/observations.mjs';
import { OPS, MAIN_SEED, MAIN_TIMING_FROM, PATHS } from './config.mjs';

export class FreezeError extends Error {}
const FROZEN_DIRS = ['checkpoints/', 'observations/'];
const DATA = PATHS.root + 'data/';

// 台帳から data/ の中身（相対パス → 文字列）を作る。作ったものから復元し直して、同じ全史になるかも確かめる。
export function buildFiles(ledger, { seed = MAIN_SEED, every = OPS.checkpointEvery, timingFrom = MAIN_TIMING_FROM } = {}) {
  const opts = { timingFrom };
  const { W, snapshots, checkpoints } = runWithCheckpoints(seed, ledger, every, opts);
  const files = new Map(), chunks = [];
  for (const cp of checkpoints) {
    const chunk = makeChunk(seed, snapshots, cp.count - every, cp.count);
    chunks.push(chunk);
    files.set('checkpoints/' + fileName(cp.count), JSON.stringify(cp) + '\n');
    files.set('observations/' + fileName(cp.count), JSON.stringify(chunk) + '\n');
  }
  const manifest = {
    format: MANIFEST_FORMAT, simVersion: SIM_VERSION, rulesHash: RULES_HASH, seed, every, timingFrom,
    ledgerCount: ledger.length, lastIssueNo: ledger.at(-1)?.issueNo ?? 0,
    checkpoints: checkpoints.map(c => c.count),
    historyHash: historyHash(summarize(W, snapshots)), stateHash: stateHash(W),
  };
  files.set('manifest.json', JSON.stringify(manifest, null, 1) + '\n');
  // ファイルの文字列から読み戻して復元する（ブラウザと同じ道）
  const back = p => JSON.parse(files.get(p));
  const r = restore({
    manifest: back('manifest.json'), ledger,
    chunks: checkpoints.map(c => back('observations/' + fileName(c.count))),
    checkpoints: checkpoints.map(c => back('checkpoints/' + fileName(c.count))),
  });
  const lastCp = checkpoints.at(-1)?.count ?? 0;
  if (r.from !== lastCp || r.problems.length || historyHash(summarize(r.W, r.snapshots)) !== manifest.historyHash || stateHash(r.W) !== manifest.stateHash) {
    throw new Error(`作った途中経過から復元した全史が、創刊号からの計算と合わない（from ${r.from}、${r.problems.join(' / ')}）`);
  }
  return { files, manifest };
}

// 保存済みのファイルと比べて、書き換えの計画を作る。凍結したファイルが同じきまりのまま違っていたら FreezeError。
export function planWrites(files, existing) {
  const plan = [];
  for (const [rel, text] of files) {
    const old = existing.get(rel);
    if (old === undefined) { plan.push({ rel, text, what: '新規' }); continue; }
    if (old === text) continue;
    if (FROZEN_DIRS.some(d => rel.startsWith(d))) {
      let o; try { o = JSON.parse(old); } catch { throw new FreezeError(`${rel} が壊れている（JSON として読めない）。手で確かめる`); }
      const n = JSON.parse(text);
      if (o.format === n.format && o.simVersion === n.simVersion && o.rulesHash === n.rulesHash) {
        throw new FreezeError(`${rel} は同じ形式ときまりで保存済みなのに中身が違う。計算を変えたなら SIM_VERSION を、形式を変えたなら FORMAT を上げる`);
      }
      plan.push({ rel, text, what: `作り直し（${o.simVersion} → ${n.simVersion}）` });
    } else plan.push({ rel, text, what: '更新' });
  }
  for (const rel of existing.keys()) if (!files.has(rel) && FROZEN_DIRS.some(d => rel.startsWith(d))) plan.push({ rel, text: null, what: '削除（いまの計画にない）' });
  return plan;
}

function readExisting() {
  const m = new Map();
  if (existsSync(PATHS.manifest)) m.set('manifest.json', readFileSync(PATHS.manifest, 'utf8'));
  for (const d of FROZEN_DIRS) if (existsSync(DATA + d)) for (const f of readdirSync(DATA + d)) if (f.endsWith('.json')) m.set(d + f, readFileSync(DATA + d + f, 'utf8'));
  return m;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const check = process.argv.includes('--check');
  const ledger = JSON.parse(readFileSync(PATHS.ledger, 'utf8')).issues;
  let plan, manifest;
  try {
    const built = buildFiles(ledger);
    manifest = built.manifest;
    plan = planWrites(built.files, readExisting());
  } catch (e) {
    if (!(e instanceof FreezeError)) throw e;
    console.error('FAIL CLOSED: ' + e.message + '（何も書いていない）');
    process.exit(1);
  }
  for (const p of plan) console.log(`${p.rel} ${p.what}`);
  console.log(`台帳 ${manifest.ledgerCount}号（#${manifest.lastIssueNo} まで）、途中経過 ${manifest.checkpoints.length}個、全史のハッシュ ${manifest.historyHash}`);
  if (check) { if (plan.length) { console.error('data/ が台帳と合っていない（--check）'); process.exit(1); } console.log('data/ は台帳と合っている'); process.exit(0); }
  for (const d of FROZEN_DIRS) mkdirSync(DATA + d, { recursive: true });
  for (const p of plan) { if (p.text === null) unlinkSync(DATA + p.rel); else writeFileSync(DATA + p.rel, p.text); }
}
