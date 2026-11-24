// 惑星の一生（docs/creatures.md「惑星の最期と引き継ぎ」）。
// 1つの惑星をおよそ1年観測し、終わったら次の星へ移る。観測した星は「巻」として残り、年表になる。
// 終わり方もガチャ。決定論は保つ（次の星の種は、切り替わる号の内容から作る）。
import { C } from './constants.mjs';
import { eraOf, planned } from './era.mjs';
import { civReach } from './civ.mjs';

// 終わり方。珍しさは docs/creatures.md の表。
export const END_KINDS = ['nextStar', 'scorched', 'dead', 'frozen', 'impact', 'exodus'];

// 惑星の始まりからの号数。
export const planetAge = W => W.issueNo - (W.planetFrom ?? 0);

// 誕生の時代の出来事（惑星の始まりからの号で出す）。新しい配分で始まった惑星だけ。
export function birthEvents(W, ev) {
  if (!W.plan) return;
  const age = planetAge(W);
  for (const [at, k] of C.birthEvents) if (age === at) ev.push({ k });
}

// 生き物が絶えた理由。終わり方の名前になる。
function causeOf(W) {
  if (W.flags.oceanLost) return 'scorched';
  if (W.snowball) return 'frozen';
  if (W.lastGiant && W.sterileSince && W.sterileSince - W.lastGiant <= C.giantRecent) return 'impact';
  return 'dead';
}

// 観測を終える理由があるか。なければ null。
// 生き物が絶えてからしばらく待つ（全滅のあとに生命がふたたび生まれることもあるため）。
// まだ生命が生まれていない惑星は「絶えた」ではないので、1年の区切りまで待つ（誕生の時代）。
export function endingFor(W) {
  if (!planned(W, W.issueNo)) return null; // 配分を入れる前の号では終わらせない（歴史を変えない）
  if (W.exodus) return 'exodus'; // 文明が星を出た（伝説級。docs/creatures.md「文明が星を出る」）
  if (planetAge(W) >= C.yearIssues) return W.species.length ? 'nextStar' : causeOf(W); // 1年の区切り
  if (W.flags.abio && W.sterileSince && W.issueNo - W.sterileSince >= C.deadAfter) return causeOf(W);
  return null;
}

// 生き物が絶えた号を覚える（戻ってきたら忘れる）。stepIssue の終わりに呼ぶ。
export function trackSterile(W) {
  if (W.species.length === 0) { if (!W.sterileSince) W.sterileSince = W.issueNo; }
  else W.sterileSince = 0;
}

// 終わった惑星の巻（年表の1行）。途中経過すべてに入るので、小さく保つ（約250バイト）。
// 終わった惑星の図鑑そのものは入れない。全史は毎回創刊号から計算し直すので、
// 必要になったら作り直せる（公開するかどうかは段階5か6で決める）。
export function makeVolume(W, endKind) {
  return {
    planetNo: W.planetNo, seed: W.seed, star: W.star, gravity: W.gravity, air: W.air,
    from: (W.planetFrom ?? 0) + 1, to: W.issueNo,
    gyr: Math.round(W.t / 1000 * 100) / 100,
    era: eraOf(W), endKind,
    maxCx: W.species.reduce((m, s) => Math.max(m, s.cx), 0),
    species: W.species.length, lineages: W.nextId - 1, extinct: W.extinct,
    // 文明がどこまで届いたか（年表に出す）。遺跡だけ残った星も、届いた段階は残る
    civ: civReach(W), ruins: W.ruins.length,
    flags: { ...W.flags },
  };
}

// 次の星の種。切り替わる号の内容から作るので、台帳が同じなら同じ星になる。
export const nextSeed = (W, issue) => `${W.seed}/p${W.planetNo + 1}/${issue.issueNo}/${issue.digest}`;
