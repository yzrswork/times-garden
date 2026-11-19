// 途中経過（チェックポイント）: 状態 W を丸ごと保存し、そこから続きを計算する。試作05を書き直したもの。
// 項目の一覧は持たず、W の中身を全部書く。JSON で往復できない値が入っていたら、保存の時点で止まる。
// 読み込みは Fail Closed。見出しが1つでも合わない途中経過は使わない。
import { hash } from './random.mjs';
import { SIM_VERSION, RULES_HASH, initWorld, stepIssue } from './world.mjs';

export const FORMAT = 'times-garden-checkpoint/1';
export class CheckpointError extends Error {}
const fail = msg => { throw new CheckpointError(msg); };

/* ---------- 状態を正確に文字列にする ---------- */
// JSON は有限の数を最短の10進表記でビット単位まで往復できる。往復できないもの（-0、NaN、Infinity、undefined、
// 関数、Map など、同じ物の共有、配列の穴）は、黙って変えずに止める。
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
  check(W, 'W', new Set());
  const text = JSON.stringify(W);
  if (!same(W, JSON.parse(text))) fail('状態が JSON で往復できなかった');
  return text;
}
export const stateHash = W => hash(encodeState(W));

/* ---------- 見出し ---------- */
const ledgerHash = (ledger, count) => hash(JSON.stringify(ledger.slice(0, count)));
// これまでの記録（観測データ）のハッシュ。1号ずつ鎖のようにつなぐので、記録が伸びても前の値に足すだけで済む。
export const CHAIN0 = hash('times-garden/snapshots');
export const chainHash = (snapshots, h = CHAIN0) => { for (const s of snapshots) h = hash(h + JSON.stringify(s)); return h; };

/* ---------- 保存 ---------- */
// W は ledger の先頭 count 号を計算し終えた状態。snapshots はその count 号ぶんの記録。
// chain は snapshots の chainHash。記録を1号ずつ積み上げながら保存する呼び出し側は、手元の値を渡せる。
export function makeCheckpoint(W, ledger, count, snapshots, chain = chainHash(snapshots)) {
  if (!Number.isInteger(count) || count < 0 || count > ledger.length) fail(`count が台帳の範囲外（${count}）`);
  if (W.issueNo !== (count ? ledger[count - 1].issueNo : 0)) fail(`状態の号（#${W.issueNo}）が台帳の ${count} 号目と合わない`);
  if (snapshots.length !== count) fail(`記録の号数（${snapshots.length}）が count（${count}）と合わない`);
  const text = encodeState(W);
  return {
    format: FORMAT, simVersion: SIM_VERSION, rulesHash: RULES_HASH, seed: W.universeSeed ?? W.seed,
    count, issueNo: W.issueNo, ledgerHash: ledgerHash(ledger, count), snapshotsHash: chain,
    stateHash: hash(text), state: JSON.parse(text),
  };
}

/* ---------- 復元 ---------- */
export function loadCheckpoint(cp, ledger, { seed, opts } = {}) {
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
  if ((W.universeSeed ?? W.seed) !== cp.seed || W.issueNo !== cp.issueNo) fail('状態の中身が見出しと合わない');
  // 時間の配分を入れる号が変わると、そこから先の歴史が変わる（engine/era.mjs）
  const want = opts?.timingFrom;
  if (want !== undefined && W.timingFrom !== want) fail(`時間の配分を入れる号が違う（途中経過 ${W.timingFrom}、いま ${want}）`);
  return W;
}

// 途中経過から台帳の最後まで計算する。prior（途中経過までの記録）を渡すと、創刊号からの全記録も返す。
export function resume(cp, ledger, { seed, prior, opts } = {}) {
  const W = loadCheckpoint(cp, ledger, { seed, opts });
  if (prior && (prior.length !== cp.count || chainHash(prior) !== cp.snapshotsHash)) fail('これまでの記録（観測データ）が途中経過と合わない');
  const added = [];
  for (let i = cp.count; i < ledger.length; i++) added.push(stepIssue(W, ledger[i]));
  return { W, added, snapshots: prior ? prior.concat(added) : null };
}

// 創刊号から計算しながら、every 号ごとに途中経過を作る。
export function runWithCheckpoints(seed, ledger, every, opts) {
  const W = initWorld(seed, opts), snapshots = [], checkpoints = [];
  let chain = CHAIN0;
  for (let i = 0; i < ledger.length; i++) {
    const s = stepIssue(W, ledger[i]); snapshots.push(s); chain = chainHash([s], chain);
    if ((i + 1) % every === 0) checkpoints.push(makeCheckpoint(W, ledger, i + 1, snapshots, chain));
  }
  return { W, snapshots, checkpoints };
}

// 手元の途中経過のうち、使えるいちばん新しいものから続きを計算する。どれも使えなければ創刊号から。
// prior は観測データ（これまでの記録）。途中経過より短くてもよい（その途中経過は飛ばす）。
export function latestUsable(checkpoints, ledger, { seed, prior = [], opts } = {}) {
  const skipped = [];
  for (const cp of [...checkpoints].sort((a, b) => (b?.count ?? -1) - (a?.count ?? -1))) {
    try {
      const r = resume(cp, ledger, { seed, prior: prior.slice(0, cp?.count), opts });
      return { from: cp.count, skipped, W: r.W, snapshots: r.snapshots };
    } catch (e) { if (!(e instanceof CheckpointError)) throw e; skipped.push({ count: cp?.count, reason: e.message }); }
  }
  const W = initWorld(seed, opts), snapshots = [];
  for (const issue of ledger) snapshots.push(stepIssue(W, issue));
  return { from: 0, skipped, W, snapshots };
}
