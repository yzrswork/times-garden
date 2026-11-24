// 新しく取り込んだ号で起きた出来事と、いまの惑星の様子を短く書き出す。
// 使い方: node pipeline/report.mjs <取り込む前の号数>
// 毎日の更新（daily.sh）が、コミットメッセージと GitHub Actions の実行結果の概要に使う。
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { runAll } from '../engine/world.mjs';
import { describe } from '../engine/events.mjs';
import { PATHS, MAIN_SEED, MAIN_TIMING_FROM } from './config.mjs';

const EDITION = { morning: '朝刊', midday: '昼刊' };
// 毎号のように起きる小さな出来事は省く
const notable = e => !(e.k === 'super' || (e.k === 'impact' && e.size === 'small'));

// 公開データ（data/）と同じ世界を報告する。時間の配分を渡し忘れると、別の歴史の数字を書いてしまう。
export function report(ledger, from, { seed = MAIN_SEED, timingFrom = MAIN_TIMING_FROM } = {}) {
  const { snapshots } = runAll(seed, ledger, { timingFrom });
  const lines = [];
  for (const s of snapshots.slice(from)) {
    const ev = s.events.filter(notable).map(describe);
    if (ev.length) lines.push(`#${s.issueNo}（${s.date} ${EDITION[s.edition] || s.edition}）${ev.join('、')}`);
  }
  if (!lines.length && snapshots.length > from) lines.push('大きな出来事はなかった');
  const s = snapshots.at(-1);
  if (s) {
    const cx = ['生き物なし', '単純な細胞', '真核生物', '多細胞', '大型の生き物', '考える生き物'][s.maxCx];
    lines.push(`#${s.issueNo} の惑星: 約${(s.gyr * 10).toFixed(1)}億年目、気温${s.T.toFixed(1)}℃、CO2 ${s.CO2}ppm、酸素はいまの地球の${s.O2}倍、系統${s.nSpecies}、最大の複雑さは${cx}${s.snowball ? '、全球凍結中' : ''}`);
  }
  return lines;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const from = Number(process.argv[2] || 0);
  if (!Number.isInteger(from) || from < 0) { console.error('usage: node pipeline/report.mjs <取り込む前の号数>'); process.exit(2); }
  const ledger = JSON.parse(readFileSync(PATHS.ledger, 'utf8')).issues;
  console.log(report(ledger, from).join('\n'));
}
