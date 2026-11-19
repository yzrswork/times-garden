// 試作06: 1号の時間を時代ごとに変えて進める。本番の engine/world.mjs の stepIssue を写して、時間の部分だけ変えたもの。
// 1号の中は100万年ずつ計算し（本番と同じ刻み）、1号あたりの回数を時代で変える。
// 号ごとに決まる事件（隕石、洪水玄武岩、大陸の育ち方）は、1号の時間に合わせて確率と量を縮める。
// 1号が2000万年のときは本番とビット単位で同じになる（run.mjs で確かめる）。
import { C } from '../../engine/constants.mjs';
import { clamp, r4 } from '../../engine/math.mjs';
import { rng } from '../../engine/random.mjs';
import { tempFor, volcanism, solveCO2 } from '../../engine/climate.mjs';
import { lifeStep, massKill, firstLife } from '../../engine/life.mjs';

export const eraOf = W => (W.flags.complex ? 'complex' : W.flags.multi ? 'multi' : W.flags.abio ? 'life' : 'early');
export const myrFor = (W, issue, sched) => (sched.from && issue.issueNo >= sched.from ? sched.after : sched[eraOf(W)]);

export function stepIssueFlow(W, issue, sched) {
  const myr = myrFor(W, issue, sched), f = myr / C.myrPerIssue;
  const r = rng('issue', W.seed, issue.issueNo, issue.digest);
  W.issueNo = issue.issueNo; const ev = [];
  const innov = 1 + Math.min(issue.newKeywords, C.innovCap) / C.innovScale;
  const volcMod = C.volcModBase + C.volcModGain * clamp(issue.meanTemp / C.articleTempMax, 0, 1);
  const pImpact = clamp((C.impactBase + C.impactPerGem * issue.gems) * f, 0, C.impactMax);
  let impact = null;
  if (r() < pImpact) { const s = r(); impact = C.impacts.find(x => s < x.upTo); }
  if (issue.meanTemp > C.lipHot && r() < C.lipChance * f) { W.lip = C.lipFlux[0] + r() * C.lipFlux[1]; ev.push({ k: 'lip' }); }
  const species0 = W.species.length, id0 = W.nextId, ext0 = W.extinct;
  const impactAt = Math.min(C.impactSubstep, myr - 1);
  for (let k = 0; k < myr; k++) {
    W.t += 1;
    W.superPhase += 1 / C.myrPerIssue; // 超大陸の周期は時間で決まる（号の数ではない）
    if (k === impactAt && impact) {
      const lost = massKill(W, r, impact.kill[0], impact.kill[1]);
      W.dust = impact.dust;
      ev.push({ k: 'impact', size: impact.size, lost: r4(lost) });
    }
    const V = volcanism(W, volcMod);
    if (W.snowball) {
      W.CO2 += V * C.snowballCO2;
      W.T = tempFor(W, W.CO2, true);
      if (W.T > C.thawT) { W.snowball = false; ev.push({ k: 'thaw' }); W.CO2 = Math.min(W.CO2, C.co2Range[1]); W.T = tempFor(W, W.CO2, false); }
    } else {
      const eq = solveCO2(W, V);
      W.CO2 = Math.sqrt(W.CO2 * Math.sqrt(W.CO2 * eq));
      W.T = tempFor(W, W.CO2, false);
      if (W.T < C.snowballEnter) { W.snowball = true; ev.push({ k: 'snowball' }); W.T = tempFor(W, W.CO2, true); }
    }
    if (W.T > C.evapT) {
      W.ocean = Math.max(0, W.ocean - C.evapRate);
      if (W.ocean < C.oceanLostAt && !W.flags.oceanLost) { W.flags.oceanLost = W.issueNo; ev.push({ k: 'oceanLost' }); }
    }
    let photo = 0; for (const s of W.species) if (s.photo || s.hab === 'land') photo += s.pop;
    const prod = C.o2Prod * photo;
    W.reductant += C.reductantPerVolc * V;
    const use = Math.min(W.reductant, prod); W.reductant -= use;
    const before = W.O2; W.O2 = clamp(W.O2 + (prod - use) - C.o2Decay * W.O2, 0, C.o2Max);
    if (before < C.goeO2 && W.O2 >= C.goeO2 && !W.flags.goe) { W.flags.goe = W.issueNo; ev.push({ k: 'goe' }); }
    if (!W.life && !W.flags.oceanLost && !W.snowball && W.T > C.abioT[0] && W.T < C.abioT[1] && W.t > C.abioAfterMyr && r() < C.abiogenesis * innov) {
      W.life = true; W.species.push(firstLife(W));
      if (!W.flags.abio) { W.flags.abio = W.issueNo; ev.push({ k: 'abio' }); } else ev.push({ k: 'abio2' });
    }
    if (W.life) lifeStep(W, r, innov, ev);
    W.dust *= C.dustDecay; W.lip *= C.lipDecay;
  }
  const ph = W.superPhase % C.superPeriod;
  if (ph < 1 && !W.superAnnounced) { W.superAnnounced = true; ev.push({ k: 'super' }); }
  if (ph >= 1) W.superAnnounced = false;
  W.land = clamp(W.land + C.landDrift * f + (r() - 0.5) * C.landJitter * Math.sqrt(f), C.landRange[0], C.landRange[1]);
  const lostFrac = species0 ? (species0 - W.species.filter(s => s.born < W.issueNo).length) / species0 : 0;
  if (species0 >= C.massMinSpecies && lostFrac >= C.massFrac) ev.push({ k: 'mass', lost: r4(lostFrac) });
  let ocean = 0, land = 0, maxCx = 0;
  for (const s of W.species) { if (s.hab === 'ocean') ocean += s.pop; else land += s.pop; maxCx = Math.max(maxCx, s.cx); }
  const top = W.species.reduce((m, s) => Math.max(m, s.pop), 0), tot = ocean + land;
  const snap = {
    issueNo: issue.issueNo, date: issue.date, edition: issue.edition, gyr: r4(W.t / 1000), T: r4(W.T), CO2: Math.round(W.CO2), O2: r4(W.O2),
    snowball: W.snowball, ocean: r4(W.ocean), land: r4(W.land), nSpecies: W.species.length, bioOcean: r4(ocean), bioLand: r4(land),
    maxCx, topShare: tot > 0 ? r4(top / tot) : 0, extinctTotal: W.extinct, events: ev,
  };
  return { snap, myr, born: W.nextId - id0, died: W.extinct - ext0 };
}
