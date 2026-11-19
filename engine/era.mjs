// 時代と、1号あたりの時間（docs/creatures.md「惑星の1年」）。
// 1つの惑星をおよそ1年（1日2号で約730号）観測する。時代ごとに1号の時間を変え、
// 生き物の時代ほど細かくする。配分は長期運転テスト（tests/soak.mjs）で号数の目安に合わせる。
//
// 時代の決め方は状態から。号数で区切らないので、早く文明が来る星も、文明が来ない星もある。
import { C } from './constants.mjs';

export const ERAS = ['birth', 'simple', 'form', 'civ'];
export const ERA_JA = { birth: '誕生', simple: '単純な生命', form: '形の時代', civ: '文明' };

// birth  誕生: 恒星と惑星ができ、最初の生命が生まれるまで
// simple 単純な生命: 生命から多細胞まで
// form   形の時代: 多細胞から考える生き物まで
// civ    文明: 考える生き物が現れてから観測の終わりまで（進化と気候の計算はほぼ止める）
//
// 文明の時代は「考える生き物が現れたか」で決める（いま生きているかではない）。
// docs/creatures.md の「文明（考える生き物から観測の終わりまで）」のとおり。
// 現れた系統がすぐ絶えることもあるが、そのときは生き物が絶えた扱いで観測が終わる（engine/planet.mjs）。
export function eraOf(W) {
  if (!W.flags.abio) return 'birth';
  if (W.flags.mind) return 'civ';
  return W.flags.multi ? 'form' : 'simple';
}

// 1号あたりの時間（百万年）。birth、simple、form は整数（1号の中を100万年ずつ計算するため）。
// civ だけは数千年なので、1号の中の計算はせず、時間だけ進める。
export const myrOf = era => C.myrByEra[era];

// この号を、新しい時間の配分で進めるか。
// 主役の惑星は creatures.md のとおり、配分を入れた号（timingFrom）から先だけを新しい配分で進める。
// それより前は、これまでどおり1号2000万年（eco-1 とビット単位で同じ）。
export const planned = (W, issueNo) => issueNo >= (W.timingFrom ?? 1);

// この号の時間（百万年）と、1号の中の計算回数。
export function timingFor(W, issueNo) {
  if (!planned(W, issueNo)) return { era: eraOf(W), myr: C.myrPerIssue, steps: C.myrPerIssue };
  const era = eraOf(W), myr = myrOf(era);
  return { era, myr, steps: era === 'civ' ? 0 : myr };
}
