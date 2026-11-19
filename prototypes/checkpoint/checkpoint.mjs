// 途中経過（チェックポイント）: 試作04のシミュレーションの状態を丸ごと保存し、そこから続きを計算する。
// Node でもブラウザでも同じコードで動くように、node: のモジュールは使わない。
//
// 前提（試作04の sim.mjs について確かめたこと）
// - 乱数は号ごとに (種, 号番号, 号の digest) から作り直すので、号をまたぐ乱数の状態はない。
// - 状態はすべて World オブジェクト W の中にあり、モジュールの外側に変わる値はない。
// - W.history は出力（観測データ）で、計算の続きには使われない。
// これが崩れたら（たとえば乱数の状態を号をまたいで持つようにしたら）、それも W に数値で持たせる。
// 関数やクラスを W に入れると、保存の時点で止まる。
import { SIM_VERSION, initWorld, stepIssue, cyrb128 } from '../ecosystem-core/sim.mjs';
import { C } from '../ecosystem-core/constants.mjs';

export const FORMAT = 'times-garden-checkpoint/1';
export const hash = s => cyrb128(s).map(x => x.toString(16).padStart(8, '0')).join('');
// 計算のきまり（版と定数）。sim.mjs の計算を変えたら SIM_VERSION を上げる。定数の変更はここで自動的に検出される。
export const RULES_HASH = hash(SIM_VERSION + '\n' + JSON.stringify(C));
const NOT_STATE = new Set(['history']);

export class CheckpointError extends Error {}
const fail = msg => { throw new CheckpointError(msg); };

/* ---------- 状態を正確に文字列にする ---------- */
// JSON は有限の数を正確に往復できる（最短の10進表記）。往復できないもの（-0、NaN、Infinity、undefined、
// 関数、Map など、同じ物の共有、配列の穴）が状態に入っていたら、黙って変えずに止める。
function check(v, path, seen) {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) fail(`${path} が有限の数ではない（${v}）`);
    if (Object.is(v, -0)) fail(`${path} が -0（JSON では 0 になる）`);
    return;
  }
  if (typeof v !== 'object') fail(`${path} は保存できない型（${typeof v}）`);
  if (seen.has(v)) fail(`${path} が別の場所と同じ物を指している（JSON では共有が切れる）`);
  seen.add(v);
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) { if (!(i in v)) fail(`${path}[${i}] が配列の穴`); check(v[i], `${path}[${i}]`, seen); }
    return;
  }
  const p = Object.getPrototypeOf(v);
  if (p !== Object.prototype && p !== null) fail(`${path} がふつうのオブジェクトではない`);
  for (const k of Object.keys(v)) check(v[k], `${path}.${k}`, seen);
}
function same(a, b) {
  if (typeof a !== 'object' || a === null) return Object.is(a, b);
  if (typeof b !== 'object' || b === null || Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && same(a[k], b[k]));
}
export function encodeState(W) {
  const state = {};
  for (const k of Object.keys(W)) if (!NOT_STATE.has(k)) state[k] = W[k];
  check(state, 'W', new Set());
  const text = JSON.stringify(state);
  if (!same(state, JSON.parse(text))) fail('状態が JSON で往復できなかった');
  return text;
}
export const stateHash = W => hash(encodeState(W));
const ledgerHash = (ledger, count) => hash(JSON.stringify(ledger.slice(0, count)));
// これまでの記録（観測データ）のハッシュ。1号ずつ鎖のようにつなぐので、記録が伸びても前回の値から足すだけで済む。
export const CHAIN0 = hash('times-garden/snapshots');
export const chainHash = (snapshots, h = CHAIN0) => { for (const s of snapshots) h = hash(h + JSON.stringify(s)); return h; };

/* ---------- 保存 ---------- */
// W は ledger の先頭 count 号を計算し終えた状態。snapshots はその count 号ぶんの記録（観測データ）。
// chain は snapshots の chainHash。記録を1号ずつ積み上げながら保存する呼び出し側は、手元の値を渡せる。
export function makeCheckpoint(W, ledger, count, snapshots, chain = chainHash(snapshots)) {
  if (!Number.isInteger(count) || count < 0 || count > ledger.length) fail(`count が台帳の範囲外（${count}）`);
  if (W.issueNo !== (count ? ledger[count - 1].issueNo : 0)) fail(`状態の号（#${W.issueNo}）が台帳の ${count} 号目と合わない`);
  if (snapshots.length !== count) fail(`記録の号数（${snapshots.length}）が count（${count}）と合わない`);
  const text = encodeState(W);
  return {
    format: FORMAT, simVersion: SIM_VERSION, rulesHash: RULES_HASH, seed: W.seed,
    count, issueNo: W.issueNo,
    ledgerHash: ledgerHash(ledger, count),
    snapshotsHash: chain,
    stateHash: hash(text),
    state: JSON.parse(text),
  };
}
export const checkpointText = cp => JSON.stringify(cp) + '\n';
export const checkpointName = count => String(count).padStart(5, '0') + '.json';

/* ---------- 復元 ---------- */
// 合わないところが1つでもあれば使わない（Fail Closed）。呼び出し側は1つ前の途中経過か、創刊号からの計算に戻る。
export function loadCheckpoint(cp, ledger, { seed } = {}) {
  if (!cp || typeof cp !== 'object' || cp.format !== FORMAT) fail('途中経過の形式が違う');
  if (cp.simVersion !== SIM_VERSION) fail(`計算の版が違う（途中経過 ${cp.simVersion}、いま ${SIM_VERSION}）`);
  if (cp.rulesHash !== RULES_HASH) fail('計算のきまり（版か定数）が保存したときと違う');
  if (seed !== undefined && cp.seed !== seed) fail(`種が違う（${cp.seed}）`);
  if (!Number.isInteger(cp.count) || cp.count < 0 || cp.count > ledger.length) fail(`台帳が途中経過より短い（途中経過 ${cp.count} 号、台帳 ${ledger.length} 号）`);
  if (cp.issueNo !== (cp.count ? ledger[cp.count - 1].issueNo : 0)) fail('途中経過の号番号が台帳と合わない');
  if (ledgerHash(ledger, cp.count) !== cp.ledgerHash) fail('台帳の凍結済みの号が、保存したときと違う');
  const text = JSON.stringify(cp.state);
  if (hash(text) !== cp.stateHash) fail('状態のハッシュが合わない（壊れているか書き換えられている）');
  const W = JSON.parse(text); // 読み込んだ物とは共有しない新しい状態
  if (W.seed !== cp.seed || W.issueNo !== cp.issueNo) fail('状態の中身が見出しと合わない');
  W.history = [];
  return W;
}

// 試作04の runHistory と同じ形の結果を作る（sim.mjs の runHistory の戻り値と同じ式。ずれはテストで検出する）。
const r4 = v => Math.round(v * 1e4) / 1e4;
export function resultOf(W, snapshots) {
  return { seed: W.seed, version: SIM_VERSION, star: W.star, flags: W.flags, snapshots, species: W.species.map(s => ({ ...s, pop: r4(s.pop), topt: r4(s.topt), tol: r4(s.tol), alb: r4(s.alb) })) };
}

// 途中経過から台帳の最後まで計算する。prior（途中経過までの記録）を渡すと、創刊号から計算したときと同じ形の全史も返す。
export function resume(cp, ledger, { seed, prior } = {}) {
  const W = loadCheckpoint(cp, ledger, { seed });
  if (prior && (prior.length !== cp.count || chainHash(prior) !== cp.snapshotsHash)) fail('これまでの記録（観測データ）が途中経過と合わない');
  for (let i = cp.count; i < ledger.length; i++) stepIssue(W, ledger[i]);
  return { W, result: prior ? resultOf(W, prior.concat(W.history)) : null };
}

// 創刊号から計算しながら、every 号ごとに途中経過を作る。
export function runWithCheckpoints(seed, ledger, every) {
  const W = initWorld(seed), cps = [];
  let chain = CHAIN0;
  for (let i = 0; i < ledger.length; i++) {
    chain = chainHash([stepIssue(W, ledger[i])], chain);
    if ((i + 1) % every === 0) cps.push(makeCheckpoint(W, ledger, i + 1, W.history, chain));
  }
  return { W, result: resultOf(W, W.history), checkpoints: cps };
}

// 手元にある途中経過のうち、使えるいちばん新しいものから続きを計算する。どれも使えなければ創刊号から。
export function latestUsable(cps, ledger, { seed, prior } = {}) {
  const skipped = [];
  for (const cp of [...cps].sort((a, b) => (b?.count ?? -1) - (a?.count ?? -1))) {
    try {
      const p = prior ? prior.slice(0, cp.count) : undefined;
      return { from: cp.count, skipped, ...resume(cp, ledger, { seed, prior: p }) };
    } catch (e) { if (!(e instanceof CheckpointError)) throw e; skipped.push({ count: cp?.count, reason: e.message }); }
  }
  const W = initWorld(seed);
  for (const issue of ledger) stepIssue(W, issue);
  return { from: 0, skipped, W, result: resultOf(W, W.history) };
}
