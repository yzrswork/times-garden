// Times Garden 生態系の核（試作 04）
// 決定論: 乱数は種からだけ作る。計算は四則演算と Math.sqrt だけ（Math.sin/cos/exp/pow/log は使わない）。
import { C } from './constants.mjs';

export const SIM_VERSION = 'eco-0.1';

/* ---------- 乱数 ---------- */
export function cyrb128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067); h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213); h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067); h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213); h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= (h2 ^ h3 ^ h4); h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}
function sfc32(a, b, c, d) {
  return function () {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21 | c >>> 11);
    d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0; return (t >>> 0) / 4294967296;
  };
}
export function rng(...parts) { const f = sfc32(...cyrb128(parts.join('|'))); for (let i = 0; i < 12; i++) f(); return f; }
const gauss = r => (r() + r() + r() + r() - 2) * 0.866; // 平均0、分散おおよそ1

/* ---------- 決定論の数学 ---------- */
const LN2 = 0.6931471805599453;
export function ln(x) {
  if (!(x > 0)) return -1e9;
  let k = 0; while (x > 2) { x /= 2; k++; } while (x < 1) { x *= 2; k--; }
  const y = (x - 1) / (x + 1), y2 = y * y; let s = y, t = y;
  for (let n = 3; n <= 17; n += 2) { t *= y2; s += t / n; }
  return 2 * s + k * LN2;
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const qrt = x => Math.sqrt(Math.sqrt(x));
const r4 = v => Math.round(v * 1e4) / 1e4;

/* ---------- 世界の初期化 ---------- */
export function initWorld(seed) {
  const r = rng('world', seed);
  const starRoll = r();
  const star = starRoll < 0.2 ? 'red' : starRoll < 0.85 ? 'yellow' : 'blue';
  const L0 = star === 'red' ? 0.82 + r() * 0.1 : star === 'yellow' ? C.sunL0 + (r() - 0.5) * 0.06 : 0.78 + r() * 0.06;
  const brighten = star === 'red' ? 0.004 : star === 'yellow' ? C.sunBrighten : 0.16;
  return {
    seed, star, L0, brighten, t: 0, issueNo: 0,
    CO2: 60000, O2: 0, R: C.o2Reservoir, ocean: 1, land: 0.12 + r() * 0.06, superPhase: r() * C.superPeriod,
    T: 0, snowball: false, dust: 0, lip: 0, life: false, species: [], nextId: 1,
    flags: {}, extinct: 0, history: [],
  };
}

/* ---------- 気候 ---------- */
function lum(W) { return W.L0 * (1 + W.brighten * W.t / 1000) * (1 - W.dust); }
function lifeAlbedo(W) {
  let a = 0; for (const s of W.species) a += s.pop * s.alb; return clamp(a * 0.25, -0.08, 0.08);
}
function ghCH4(W) { return W.life ? C.ch4Warm * (1 - clamp(W.O2 / 0.01, 0, 1)) : 0; }
function tempFor(W, co2, snow) {
  const L = lum(W), la = lifeAlbedo(W);
  const gh = C.greenhouse0 + C.climateSens * ln(Math.max(co2, 10) / C.co2Ref) / LN2 + ghCH4(W);
  if (snow) return C.T0 * qrt(L * (1 - C.snowballAlbedo) / 0.7) - 273.15 + gh;
  let T = W.T || 10;
  for (let i = 0; i < 4; i++) {
    const ice = clamp((10 - T) / 40, 0.02, 0.6);
    const A = clamp(0.28 + ice * 0.35 + la, 0.1, 0.7);
    let Tn = C.T0 * qrt(L * (1 - A) / 0.7) - 273.15 + gh;
    if (Tn > 60) Tn += (Tn - 60) * 0.5; // 水蒸気のフィードバック
    T = (T + Tn) / 2 + (Tn - T) / 2;
  }
  return T;
}
function volcanism(W, mod) {
  return C.volcano0 * clamp(3 - 2 * W.t / 4570, 0.6, 3) * mod + W.lip;
}
function weathering(W, co2, T) {
  const wT = clamp(1 + C.weatherT * (T - 15), 0.05, 4);
  const sup = superFactor(W);
  let plants = 0; for (const s of W.species) if (s.hab === 'land') plants += s.pop;
  return Math.sqrt(co2 / C.co2Ref) * wT * (W.land / 0.3) * sup * (1 + plants * 1.5) * W.ocean;
}
function superFactor(W) { const p = (W.superPhase % C.superPeriod) / C.superPeriod; return p < 0.25 ? 0.7 : 1; }
function solveCO2(W, V) {
  let lo = 10, hi = 2e6;
  for (let i = 0; i < 40; i++) {
    const mid = Math.sqrt(lo * hi), T = tempFor(W, mid, false);
    if (V - weathering(W, mid, T) > 0) lo = mid; else hi = mid;
  }
  return Math.sqrt(lo * hi);
}

/* ---------- 生命 ---------- */
function habitatT(W, hab) { return hab === 'ocean' ? W.T * 0.8 + 3 : W.T; }
function beta(s, T) { const d = (T - s.topt) * (25 / s.tol); return 1 - C.daisyK * d * d; }
function capacity(W, hab) {
  if (W.snowball) return hab === 'ocean' ? 0.08 : 0;
  const ice = clamp((10 - W.T) / 40, 0.02, 0.6);
  if (hab === 'ocean') return W.ocean * (1 - ice) * (W.T > 0 && W.T < 95 ? 1 : 0);
  return W.O2 >= 0.1 ? W.land / 0.3 * (1 - ice) * (W.T > -5 && W.T < 50 ? 1 : 0) : 0;
}
function lifeStep(W, r, innov, ev) {
  const sum = { ocean: 0, land: 0 }; for (const s of W.species) sum[s.hab] += s.pop;
  const K = { ocean: capacity(W, 'ocean'), land: capacity(W, 'land') };
  const born = [];
  for (const s of W.species) {
    const T = habitatT(W, s.hab); let b = beta(s, T) * 0.5 * (s.photo || s.hab === 'land' ? 1.6 : 1);
    if (!s.aerobe && W.O2 > 0.05) b -= 0.4 * W.O2;
    const need = C.needO2[s.cx]; if (need > 0 && W.O2 < need) b *= W.O2 / need;
    const k = K[s.hab] > 0 ? 1 - sum[s.hab] / K[s.hab] : -1;
    s.pop = clamp(s.pop + s.pop * ((b > 0 ? b * k : b) - C.deathRate), 0, 1);
    // 分岐と革新
    if (s.pop > 0.01 && r() < C.speciation * s.pop * innov * 6) {
      const d = { ...s, id: W.nextId++, parent: s.id, born: W.issueNo, pop: s.pop * 0.15,
        topt: s.topt + gauss(r) * 4, tol: clamp(s.tol + gauss(r) * 3, 8, 40), alb: clamp(s.alb + gauss(r) * 0.06, -0.25, 0.25) };
      s.pop *= 0.85;
      if (!d.photo && d.hab === 'ocean' && r() < 0.06) { d.photo = true; if (!W.flags.photo) { W.flags.photo = W.issueNo; ev.push({ k: 'photo', t: '光合成をする生き物が現れた' }); } }
      if (d.cx < 5 && r() < [0, 0.05, 0.03, 0.03, 0.002][d.cx] && W.O2 >= C.needO2[d.cx + 1] * 0.8) {
        d.cx++; d.aerobe = d.cx >= 2 || d.aerobe;
        const name = ['', '', 'euk', 'multi', 'complex', 'mind'][d.cx];
        if (!W.flags[name]) { W.flags[name] = W.issueNo; ev.push({ k: name, t: { euk: '細胞の中に小部屋を持つ生き物（真核生物）が現れた', multi: '多細胞の生き物が現れた', complex: '大きく複雑な生き物が現れた', mind: '考える生き物が現れた' }[name] }); }
      }
      if (d.hab === 'ocean' && d.cx >= 2 && W.O2 >= 0.1 && r() < 0.05) {
        d.hab = 'land'; d.topt = W.T;
        if (!W.flags.land) { W.flags.land = W.issueNo; ev.push({ k: 'land', t: '生き物が陸に上がった' }); }
      }
      born.push(d);
    }
  }
  W.species.push(...born);
  const before = W.species.length;
  W.species = W.species.filter(s => s.pop > 1e-4);
  W.extinct += before - W.species.length;
  if (W.species.length > C.maxSpecies) { W.species.sort((a, b) => b.pop - a.pop); W.species.length = C.maxSpecies; }
  if (W.species.length === 0 && W.life) { W.life = false; ev.push({ k: 'sterile', t: 'すべての生き物が絶滅した' }); }
}
function massKill(W, r, lo, hi) {
  const n0 = W.species.length; if (!n0) return 0;
  for (const s of W.species) { const k = lo + (hi - lo) * r() * (0.6 + 0.1 * s.cx); s.pop *= clamp(1 - k, 0, 1); if (r() < k * 0.8) s.pop = 0; }
  W.species = W.species.filter(s => s.pop > 1e-4); W.extinct += n0 - W.species.length;
  return (n0 - W.species.length) / n0;
}

/* ---------- 1号ぶんを進める ---------- */
export function stepIssue(W, issue) {
  const r = rng('issue', W.seed, issue.issueNo, issue.digest);
  W.issueNo = issue.issueNo; const ev = [];
  const innov = 1 + Math.min(issue.newKeywords, 40) / 20;
  const volcMod = 0.7 + 0.6 * clamp(issue.meanTemp / 100, 0, 1);
  // 記事が起こす事件
  const pImpact = clamp(C.impactBase + C.impactPerGem * issue.gems, 0, 0.35);
  let impact = null;
  if (r() < pImpact) { const s = r(); impact = s < 0.7 ? 'small' : s < 0.95 ? 'large' : 'giant'; }
  if (issue.meanTemp > C.lipHot && r() < 0.35) { W.lip = 2 + r() * 6; ev.push({ k: 'lip', t: '大規模な火山活動（洪水玄武岩）が始まった' }); }
  const species0 = W.species.length;
  for (let k = 0; k < C.substeps; k++) {
    W.t += C.myrPerIssue / C.substeps;
    W.superPhase += 1 / C.substeps;
    if (k === 5 && impact) {
      const lost = impact === 'small' ? massKill(W, r, 0.02, 0.12) : impact === 'large' ? massKill(W, r, 0.25, 0.6) : massKill(W, r, 0.6, 0.95);
      W.dust = impact === 'small' ? 0.05 : impact === 'large' ? 0.15 : 0.3;
      ev.push({ k: 'impact', size: impact, t: { small: '小さな隕石が落ちた', large: '大きな隕石が落ちた', giant: '巨大な隕石が落ちた' }[impact], lost: r4(lost) });
    }
    const V = volcanism(W, volcMod);
    if (W.snowball) {
      W.CO2 += V * 1500;
      W.T = tempFor(W, W.CO2, true);
      if (W.T > 0) { W.snowball = false; ev.push({ k: 'thaw', t: '全球凍結が解けた' }); W.CO2 = Math.min(W.CO2, 2e6); W.T = tempFor(W, W.CO2, false); }
    } else {
      const eq = solveCO2(W, V);
      W.CO2 = Math.sqrt(W.CO2 * Math.sqrt(W.CO2 * eq)); // 釣り合いへ少しずつ近づく（1回で対数距離の4分の1）
      W.T = tempFor(W, W.CO2, false);
      if (W.T < C.snowballEnter) { W.snowball = true; ev.push({ k: 'snowball', t: '惑星全体が凍りついた（全球凍結）' }); W.T = tempFor(W, W.CO2, true); }
    }
    if (W.T > 70) { W.ocean = Math.max(0, W.ocean - 0.01); if (W.ocean < 0.05 && !W.flags.oceanLost) { W.flags.oceanLost = W.issueNo; ev.push({ k: 'oceanLost', t: '海が蒸発して失われた' }); } }
    // 酸素
    let photo = 0; for (const s of W.species) if (s.photo || s.hab === 'land') photo += s.pop;
    const prod = C.o2Prod * photo, reduce = 0.00015 * V;
    W.R += reduce; const use = Math.min(W.R, prod); W.R -= use;
    const before = W.O2; W.O2 = clamp(W.O2 + (prod - use) - C.o2Decay * W.O2, 0, 1.6);
    if (before < 0.01 && W.O2 >= 0.01 && !W.flags.goe) { W.flags.goe = W.issueNo; ev.push({ k: 'goe', t: '大気に酸素がたまり始めた（大酸化イベント）' }); }
    // 生命の誕生と営み
    if (!W.life && !W.flags.oceanLost && !W.snowball && W.T > 0 && W.T < 90 && W.t > 100 && r() < C.abiogenesis * innov) {
      W.life = true; W.species.push({ id: W.nextId++, parent: 0, born: W.issueNo, cx: 1, hab: 'ocean', topt: W.T * 0.8 + 3, tol: 25, alb: 0, photo: false, aerobe: false, pop: 0.01 });
      if (!W.flags.abio) { W.flags.abio = W.issueNo; ev.push({ k: 'abio', t: '海で最初の生命が生まれた' }); } else ev.push({ k: 'abio2', t: '生命がふたたび生まれた' });
    }
    if (W.life) lifeStep(W, r, innov, ev);
    W.dust *= 0.6; W.lip *= 0.85;
  }
  // 超大陸
  const ph = W.superPhase % C.superPeriod;
  if (ph < 1 && !W._superAnn) { W._superAnn = true; ev.push({ k: 'super', t: '大陸が集まって超大陸ができた' }); }
  if (ph >= 1) W._superAnn = false;
  W.land = clamp(W.land + 0.004 + (r() - 0.5) * 0.004, 0.08, 0.4);
  const lostFrac = species0 ? (species0 - W.species.filter(s => s.born < W.issueNo).length) / species0 : 0;
  if (species0 >= 6 && lostFrac >= 0.5) ev.push({ k: 'mass', t: `大量絶滅（系統の${Math.round(lostFrac * 100)}%が消えた）` });
  const snap = snapshot(W, issue, ev);
  W.history.push(snap);
  return snap;
}
export function snapshot(W, issue, ev) {
  let ocean = 0, land = 0, maxCx = 0; for (const s of W.species) { if (s.hab === 'ocean') ocean += s.pop; else land += s.pop; maxCx = Math.max(maxCx, s.cx); }
  const top = W.species.reduce((m, s) => Math.max(m, s.pop), 0), tot = ocean + land;
  return { issueNo: issue.issueNo, date: issue.date, edition: issue.edition, gyr: r4(W.t / 1000), T: r4(W.T), CO2: Math.round(W.CO2), O2: r4(W.O2), snowball: W.snowball,
    ocean: r4(W.ocean), land: r4(W.land), nSpecies: W.species.length, bioOcean: r4(ocean), bioLand: r4(land), maxCx, topShare: tot > 0 ? r4(top / tot) : 0, extinctTotal: W.extinct, events: ev };
}

/* ---------- 全史 ---------- */
export function runHistory(seed, ledger) {
  const W = initWorld(seed);
  for (const issue of ledger) stepIssue(W, issue);
  return { seed, version: SIM_VERSION, star: W.star, flags: W.flags, snapshots: W.history, species: W.species.map(s => ({ ...s, pop: r4(s.pop), topt: r4(s.topt), tol: r4(s.tol), alb: r4(s.alb) })) };
}
export function historyHash(h) { return cyrb128(JSON.stringify(h)).map(x => x.toString(16).padStart(8, '0')).join(''); }
