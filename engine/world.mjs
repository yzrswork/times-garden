// 世界: 惑星の状態 W を作り、1号ずつ進める。試作04（prototypes/ecosystem-core/sim.mjs）を書き直したもの。
// 同じ入力台帳と同じ種からは、どの環境でも同じ歴史になる。乱数は号ごとに（種、号番号、digest）から作り直すので、
// 号をまたぐ乱数の状態はない。状態はすべて W にあり、JSON でそのまま保存できる値だけを持つ（engine/checkpoint.mjs）。
import { C } from './constants.mjs';
import { clamp, r4 } from './math.mjs';
import { rng, hash } from './random.mjs';
import { tempFor, volcanism, solveCO2 } from './climate.mjs';
import { lifeStep, massKill, firstLife } from './life.mjs';
import { planetLook } from './traits.mjs';

// sim の計算か、状態 W の形を変えたら上げる。定数の変更は RULES_HASH が自動で拾う。
// eco-2: 見た目の層（惑星の重力と大気、系統の見た目の性質）を状態に足した。計算そのものは変えていない。
// 歴史（1号ごとの記録）は eco-1 とビット単位で同じで、tests/traits.test.mjs がそれを固定している。
// 状態の形が変わると、eco-1 の途中経過はそのままでは続きを計算できないので、版を上げて作り直す。
export const SIM_VERSION = 'eco-2';
export const RULES_HASH = hash(SIM_VERSION + '\n' + JSON.stringify(C));

export function initWorld(seed) {
  const r = rng('world', seed);
  const roll = r();
  const star = roll < C.starShare[0] ? 'red' : roll < C.starShare[1] ? 'yellow' : 'blue';
  const L0 = star === 'red' ? C.redL0[0] + r() * C.redL0[1]
    : star === 'yellow' ? C.sunL0 + (r() - 0.5) * C.sunL0Span
    : C.blueL0[0] + r() * C.blueL0[1];
  const brighten = star === 'red' ? C.redBrighten : star === 'yellow' ? C.sunBrighten : C.blueBrighten;
  const land = C.landInitial[0] + r() * C.landInitial[1];
  const superPhase = r() * C.superPeriod;
  // 見た目の層: 重力と大気の濃さ。別の乱数の流れから作るので、計算の歴史は変わらない（docs/creatures.md 確定事項5）
  const { gravity, air } = planetLook(seed);
  return {
    seed, star, L0, brighten, gravity, air, t: 0, issueNo: 0,
    CO2: C.co2Initial, O2: 0, reductant: C.o2Reservoir, ocean: 1, land, superPhase,
    T: 0, snowball: false, dust: 0, lip: 0, life: false, species: [], nextId: 1,
    flags: {}, extinct: 0, superAnnounced: false,
  };
}

// 1号ぶん（2,000万年）進め、その号の記録（観測データの1号ぶん）を返す。
export function stepIssue(W, issue) {
  const r = rng('issue', W.seed, issue.issueNo, issue.digest);
  W.issueNo = issue.issueNo; const ev = [];
  const innov = 1 + Math.min(issue.newKeywords, C.innovCap) / C.innovScale;
  const volcMod = C.volcModBase + C.volcModGain * clamp(issue.meanTemp / C.articleTempMax, 0, 1);
  // 記事が起こす事件
  const pImpact = clamp(C.impactBase + C.impactPerGem * issue.gems, 0, C.impactMax);
  let impact = null;
  if (r() < pImpact) { const s = r(); impact = C.impacts.find(x => s < x.upTo); }
  if (issue.meanTemp > C.lipHot && r() < C.lipChance) { W.lip = C.lipFlux[0] + r() * C.lipFlux[1]; ev.push({ k: 'lip' }); }
  const species0 = W.species.length;
  for (let k = 0; k < C.substeps; k++) {
    W.t += C.myrPerIssue / C.substeps;
    W.superPhase += 1 / C.substeps;
    if (k === C.impactSubstep && impact) {
      const lost = massKill(W, r, impact.kill[0], impact.kill[1]);
      W.dust = impact.dust;
      ev.push({ k: 'impact', size: impact.size, lost: r4(lost) });
    }
    // 気候
    const V = volcanism(W, volcMod);
    if (W.snowball) {
      W.CO2 += V * C.snowballCO2;
      W.T = tempFor(W, W.CO2, true);
      if (W.T > C.thawT) {
        W.snowball = false; ev.push({ k: 'thaw' });
        W.CO2 = Math.min(W.CO2, C.co2Range[1]); W.T = tempFor(W, W.CO2, false);
      }
    } else {
      const eq = solveCO2(W, V);
      W.CO2 = Math.sqrt(W.CO2 * Math.sqrt(W.CO2 * eq)); // 釣り合いへ少しずつ近づく（1回で対数距離の4分の1）
      W.T = tempFor(W, W.CO2, false);
      if (W.T < C.snowballEnter) { W.snowball = true; ev.push({ k: 'snowball' }); W.T = tempFor(W, W.CO2, true); }
    }
    if (W.T > C.evapT) {
      W.ocean = Math.max(0, W.ocean - C.evapRate);
      if (W.ocean < C.oceanLostAt && !W.flags.oceanLost) { W.flags.oceanLost = W.issueNo; ev.push({ k: 'oceanLost' }); }
    }
    // 酸素
    let photo = 0; for (const s of W.species) if (s.photo || s.hab === 'land') photo += s.pop;
    const prod = C.o2Prod * photo;
    W.reductant += C.reductantPerVolc * V;
    const use = Math.min(W.reductant, prod); W.reductant -= use;
    const before = W.O2; W.O2 = clamp(W.O2 + (prod - use) - C.o2Decay * W.O2, 0, C.o2Max);
    if (before < C.goeO2 && W.O2 >= C.goeO2 && !W.flags.goe) { W.flags.goe = W.issueNo; ev.push({ k: 'goe' }); }
    // 生命の誕生と営み
    if (!W.life && !W.flags.oceanLost && !W.snowball && W.T > C.abioT[0] && W.T < C.abioT[1] && W.t > C.abioAfterMyr && r() < C.abiogenesis * innov) {
      W.life = true; W.species.push(firstLife(W));
      if (!W.flags.abio) { W.flags.abio = W.issueNo; ev.push({ k: 'abio' }); } else ev.push({ k: 'abio2' });
    }
    if (W.life) lifeStep(W, r, innov, ev);
    W.dust *= C.dustDecay; W.lip *= C.lipDecay;
  }
  // 超大陸（周期の始めの1号で告知する）
  const ph = W.superPhase % C.superPeriod;
  if (ph < 1 && !W.superAnnounced) { W.superAnnounced = true; ev.push({ k: 'super' }); }
  if (ph >= 1) W.superAnnounced = false;
  W.land = clamp(W.land + C.landDrift + (r() - 0.5) * C.landJitter, C.landRange[0], C.landRange[1]);
  const lostFrac = species0 ? (species0 - W.species.filter(s => s.born < W.issueNo).length) / species0 : 0;
  if (species0 >= C.massMinSpecies && lostFrac >= C.massFrac) ev.push({ k: 'mass', lost: r4(lostFrac) });
  return snapshot(W, issue, ev);
}

// 1号ぶんの記録。数は小数4桁に丸める（状態そのものは丸めない）。
function snapshot(W, issue, ev) {
  let ocean = 0, land = 0, maxCx = 0;
  for (const s of W.species) { if (s.hab === 'ocean') ocean += s.pop; else land += s.pop; maxCx = Math.max(maxCx, s.cx); }
  const top = W.species.reduce((m, s) => Math.max(m, s.pop), 0), tot = ocean + land;
  return {
    issueNo: issue.issueNo, date: issue.date, edition: issue.edition, gyr: r4(W.t / 1000), T: r4(W.T), CO2: Math.round(W.CO2), O2: r4(W.O2),
    snowball: W.snowball, ocean: r4(W.ocean), land: r4(W.land), nSpecies: W.species.length, bioOcean: r4(ocean), bioLand: r4(land),
    maxCx, topShare: tot > 0 ? r4(top / tot) : 0, extinctTotal: W.extinct, events: ev,
  };
}

// 創刊号から台帳の最後まで計算する。
export function runAll(seed, ledger) {
  const W = initWorld(seed), snapshots = [];
  for (const issue of ledger) snapshots.push(stepIssue(W, issue));
  return { W, snapshots };
}

// 全史のまとめ（試作04の runHistory と同じ形）と、そのハッシュ。
export const summarize = (W, snapshots) => ({
  seed: W.seed, version: SIM_VERSION, star: W.star, flags: W.flags, snapshots,
  species: W.species.map(s => ({ ...s, pop: r4(s.pop), topt: r4(s.topt), tol: r4(s.tol), alb: r4(s.alb) })),
});
export const historyHash = summary => hash(JSON.stringify(summary));
