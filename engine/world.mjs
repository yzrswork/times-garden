// 世界: 惑星の状態 W を作り、1号ずつ進める。試作04（prototypes/ecosystem-core/sim.mjs）を書き直したもの。
// 同じ入力台帳と同じ種からは、どの環境でも同じ歴史になる。乱数は号ごとに（種、号番号、digest）から作り直すので、
// 号をまたぐ乱数の状態はない。状態はすべて W にあり、JSON でそのまま保存できる値だけを持つ（engine/checkpoint.mjs）。
import { C } from './constants.mjs';
import { clamp, r4 } from './math.mjs';
import { rng, hash } from './random.mjs';
import { tempFor, volcanism, solveCO2 } from './climate.mjs';
import { lifeStep, massKill, firstLife } from './life.mjs';
import { planetLook } from './traits.mjs';
import { timingFor } from './era.mjs';
import { birthEvents, endingFor, trackSterile, makeVolume, nextSeed } from './planet.mjs';
import { civStep } from './civ.mjs';

// sim の計算か、状態 W の形を変えたら上げる。定数の変更は RULES_HASH が自動で拾う。
// eco-2: 見た目の層（惑星の重力と大気、系統の見た目の性質）を状態に足した。計算そのものは変えていない。
// eco-3: 惑星の1年（docs/creatures.md 段階3）。1号の時間を時代ごとに変え、誕生の時代を足し、
//   観測の終わりと次の星への切り替えを入れた。timingFrom より前の号は1号2,000万年のままなので、
//   主役の惑星の #1 から #264 の記録は eco-1、eco-2 とビット単位で同じ（tests/era.test.mjs が固定）。
// eco-4: 文明（docs/creatures.md 段階4）。文明の段階、住まいの種類、遺跡、星を出ることを足した。
//   文明の計算は文明の時代の号でだけ動き、乱数も文明だけの流れから作るので、形の時代までの歴史は変わらない
//   （tests/civ.test.mjs が固定）。状態に civs、ruins、exodus が増えたので版を上げる。
// 状態の形が変わると、前の版の途中経過はそのままでは続きを計算できないので、版を上げて作り直す。
export const SIM_VERSION = 'eco-4';
export const RULES_HASH = hash(SIM_VERSION + '\n' + JSON.stringify(C));

// timingFrom: この号から新しい時間の配分で進める。主役の惑星は creatures.md のとおり途中から
// （それまでの歴史は変えない）。新しく生まれる星は、その星の最初の号から。
export function initWorld(seed, { timingFrom = 1, planetNo = 1, planetFrom = 0, volumes = [], universeSeed = seed } = {}) {
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
    // seed はいま観測している惑星の種（星ごとに変わる）。universeSeed は宇宙そのものの種で、
    // 次の星へ移っても変わらない。途中経過と観測データの身元は universeSeed で照合する。
    universeSeed, seed, star, L0, brighten, gravity, air, t: 0, issueNo: planetFrom,
    CO2: C.co2Initial, O2: 0, reductant: C.o2Reservoir, ocean: 1, land, superPhase,
    T: 0, snowball: false, dust: 0, lip: 0, life: false, species: [], nextId: 1,
    flags: {}, extinct: 0, superAnnounced: false,
    // 惑星の一生（docs/creatures.md「惑星の1年」）
    timingFrom, planetNo, planetFrom, plan: timingFrom <= planetFrom + 1, volumes,
    sterileSince: 0, lastGiant: 0,
    // 文明（docs/creatures.md「文明」）。文明の時代の号でだけ動く（engine/civ.mjs）
    civs: [], ruins: [], exodus: 0,
  };
}

// 1号ぶん進め、その号の記録（観測データの1号ぶん）を返す。
// 1号の時間は時代で変わる（engine/era.mjs）。1号の中は100万年ずつ計算し、その回数が時間で変わる。
// 号ごとに決まる事件（隕石、洪水玄武岩、大陸の育ち方）は、1号の時間に合わせて確率と量を縮める。
// 1号が2,000万年のときは eco-1 とビット単位で同じ結果になる（試作06 で確かめ、tests/era.test.mjs が固定）。
export function stepIssue(W, issue) {
  const r = rng('issue', W.seed, issue.issueNo, issue.digest);
  W.issueNo = issue.issueNo; const ev = [];
  const { myr, steps } = timingFor(W, issue.issueNo);
  const f = myr / C.myrPerIssue; // 1号の時間が基準（2,000万年）の何倍か
  const innov = 1 + Math.min(issue.newKeywords, C.innovCap) / C.innovScale;
  const volcMod = C.volcModBase + C.volcModGain * clamp(issue.meanTemp / C.articleTempMax, 0, 1);
  // 記事が起こす事件
  const pImpact = clamp((C.impactBase + C.impactPerGem * issue.gems) * f, 0, C.impactMax);
  let impact = null;
  if (r() < pImpact) { const s = r(); impact = C.impacts.find(x => s < x.upTo); }
  if (issue.meanTemp > C.lipHot && r() < C.lipChance * f) { W.lip = C.lipFlux[0] + r() * C.lipFlux[1]; ev.push({ k: 'lip' }); }
  birthEvents(W, ev);
  const species0 = W.species.length;
  const impactAt = Math.min(C.impactSubstep, steps - 1);
  for (let k = 0; k < steps; k++) {
    W.t += 1;
    W.superPhase += 1 / C.myrPerIssue; // 超大陸の周期は時間で決まる（号の数ではない）
    if (k === impactAt && impact) {
      const lost = massKill(W, r, impact.kill[0], impact.kill[1]);
      W.dust = impact.dust;
      if (impact.size === 'giant') W.lastGiant = W.issueNo;
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
  // 文明の時代は進化と気候の計算をほぼ止め、時間だけ進める（docs/creatures.md「時間の配分」）。
  // 隕石だけは効かせる（文明が滅びることがある）。
  if (steps === 0) {
    W.t += myr;
    if (impact) {
      const lost = massKill(W, r, impact.kill[0], impact.kill[1]);
      if (impact.size === 'giant') W.lastGiant = W.issueNo;
      ev.push({ k: 'impact', size: impact.size, lost: r4(lost) });
    }
    // 塵と洪水玄武岩は1号の中の計算で薄れていくので、計算をしないこの時代でも薄らせる
    // （気候の計算はしないので結果には効かない。状態に残り続けないようにするため）
    W.dust *= C.dustDecay; W.lip *= C.lipDecay;
    // 文明の歩み（隕石と洪水玄武岩を滅びる理由として読むので、打撃のあとに呼ぶ）
    civStep(W, issue, ev);
  }
  // 超大陸（周期の始めの1号で告知する）
  const ph = W.superPhase % C.superPeriod;
  if (ph < 1 && !W.superAnnounced) { W.superAnnounced = true; ev.push({ k: 'super' }); }
  if (ph >= 1) W.superAnnounced = false;
  W.land = clamp(W.land + C.landDrift * f + (r() - 0.5) * C.landJitter * Math.sqrt(f), C.landRange[0], C.landRange[1]);
  const lostFrac = species0 ? (species0 - W.species.filter(s => s.born < W.issueNo).length) / species0 : 0;
  if (species0 >= C.massMinSpecies && lostFrac >= C.massFrac) ev.push({ k: 'mass', lost: r4(lostFrac) });
  trackSterile(W);
  // 観測の終わりと、次の星への切り替え（docs/creatures.md「惑星の最期と引き継ぎ」）
  const end = endingFor(W);
  if (end) ev.push({ k: 'planetEnd', end }, { k: 'newPlanet' });
  const snap = snapshot(W, issue, ev);
  if (end) switchPlanet(W, issue, end);
  return snap;
}

// 終わった惑星を巻にして年表に残し、次の星を始める。W は同じ物のまま中身を入れ替える
// （呼び出し側が持っている状態をそのまま差し替えるため）。次の星の種は切り替わる号の内容から作る。
function switchPlanet(W, issue, end) {
  const volumes = W.volumes.concat([makeVolume(W, end)]);
  const next = initWorld(nextSeed(W, issue), {
    timingFrom: W.timingFrom, planetNo: W.planetNo + 1, planetFrom: issue.issueNo, volumes,
    universeSeed: W.universeSeed,
  });
  for (const k of Object.keys(W)) delete W[k];
  Object.assign(W, next);
}

// 1号ぶんの記録。数は小数4桁に丸める（状態そのものは丸めない）。
function snapshot(W, issue, ev) {
  let ocean = 0, land = 0, maxCx = 0;
  for (const s of W.species) { if (s.hab === 'ocean') ocean += s.pop; else land += s.pop; maxCx = Math.max(maxCx, s.cx); }
  const top = W.species.reduce((m, s) => Math.max(m, s.pop), 0), tot = ocean + land;
  // 文明は、あるときだけ記録に書く（文明のない号の記録は、文明を足す前と1ビットも変わらない）
  const civ = W.civs.length || W.ruins.length
    ? { civs: W.civs.map(c => ({ id: c.id, stage: c.stage, dwelling: c.dwelling })), ruins: W.ruins.length }
    : null;
  return {
    issueNo: issue.issueNo, date: issue.date, edition: issue.edition, gyr: r4(W.t / 1000), T: r4(W.T), CO2: Math.round(W.CO2), O2: r4(W.O2),
    snowball: W.snowball, ocean: r4(W.ocean), land: r4(W.land), nSpecies: W.species.length, bioOcean: r4(ocean), bioLand: r4(land),
    maxCx, topShare: tot > 0 ? r4(top / tot) : 0, extinctTotal: W.extinct, ...(civ ?? {}), events: ev,
  };
}

// 創刊号から台帳の最後まで計算する。
export function runAll(seed, ledger, opts) {
  const W = initWorld(seed, opts), snapshots = [];
  for (const issue of ledger) snapshots.push(stepIssue(W, issue));
  return { W, snapshots };
}

// 全史のまとめ（試作04の runHistory と同じ形）と、そのハッシュ。
export const summarize = (W, snapshots) => ({
  seed: W.seed, version: SIM_VERSION, star: W.star, flags: W.flags, snapshots,
  species: W.species.map(s => ({ ...s, pop: r4(s.pop), topt: r4(s.topt), tol: r4(s.tol), alb: r4(s.alb) })),
});
export const historyHash = summary => hash(JSON.stringify(summary));
