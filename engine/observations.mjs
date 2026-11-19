// 観測データ: 記録（1号ごとのスナップショット）を、途中経過と同じ区切りのまとまりにしたもの。
// ブラウザは「まとまり + いちばん新しい途中経過 + 台帳の残り」から、創刊号からの全記録を組み立てる。
import { SIM_VERSION, RULES_HASH } from './world.mjs';
import { latestUsable, CheckpointError } from './checkpoint.mjs';

export const OBS_FORMAT = 'times-garden-observations/1';
export const MANIFEST_FORMAT = 'times-garden-manifest/1';
export const fileName = count => String(count).padStart(5, '0') + '.json';

// 台帳の from 号目の次から to 号目までの記録のまとまり。
export function makeChunk(seed, snapshots, from, to) {
  return { format: OBS_FORMAT, simVersion: SIM_VERSION, rulesHash: RULES_HASH, seed, from, to, snapshots: snapshots.slice(from, to) };
}

// まとまりを先頭からつなげる。形式、版、種が合わないか、途切れていたら、そこまでで止める。
export function joinChunks(chunks, seed) {
  const out = [], problems = [];
  for (const c of [...chunks].sort((a, b) => (a?.from ?? 0) - (b?.from ?? 0))) {
    const why = !c || c.format !== OBS_FORMAT ? '形式が違う'
      : c.simVersion !== SIM_VERSION || c.rulesHash !== RULES_HASH ? '計算のきまりが違う'
      : c.seed !== seed ? '種が違う'
      : c.from !== out.length || !Array.isArray(c.snapshots) || c.to !== c.from + c.snapshots.length ? '途切れているか、号数が合わない'
      : null;
    if (why) { problems.push(`観測データ ${c?.from}〜${c?.to}: ${why}`); break; }
    out.push(...c.snapshots);
  }
  return { snapshots: out, problems };
}

// 公開データ（manifest、台帳、観測データのまとまり、途中経過）から、いまの世界と全記録を組み立てる。
// 合わないものは使わず、使えるところから計算し直す（Fail Closed）。
export function restore({ manifest, ledger, chunks = [], checkpoints = [] }) {
  if (!manifest || manifest.format !== MANIFEST_FORMAT) throw new CheckpointError('manifest の形式が違う');
  const seed = manifest.seed;
  const opts = { timingFrom: manifest.timingFrom ?? 1 };
  const { snapshots: prior, problems } = joinChunks(chunks, seed);
  const r = latestUsable(checkpoints, ledger, { seed, prior, opts });
  return { ...r, problems: problems.concat(r.skipped.map(s => `途中経過 ${s.count}: ${s.reason}`)) };
}
