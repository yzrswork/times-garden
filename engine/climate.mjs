// 気候: 恒星の明るさ、アルベド、温室効果、火山と風化（炭素とケイ酸塩のサーモスタット）。
import { C } from './constants.mjs';
import { LN2, ln, clamp, qrt } from './math.mjs';

export const lum = W => W.L0 * (1 + W.brighten * W.t / 1000) * (1 - W.dust); // t は百万年、brighten は10億年あたり
export const iceFraction = T => clamp((C.iceStartT - T) / C.iceSpanT, C.iceRange[0], C.iceRange[1]);

function lifeAlbedo(W) {
  let a = 0; for (const s of W.species) a += s.pop * s.alb;
  return clamp(a * C.lifeAlbedoGain, -C.lifeAlbedoMax, C.lifeAlbedoMax);
}
const ghCH4 = W => (W.life ? C.ch4Warm * (1 - clamp(W.O2 / C.ch4VanishO2, 0, 1)) : 0);

// CO2 が co2 のときの気温（℃）。snow は全球凍結中か。
export function tempFor(W, co2, snow) {
  const L = lum(W), la = lifeAlbedo(W);
  const gh = C.greenhouse0 + C.climateSens * ln(Math.max(co2, C.co2Range[0]) / C.co2Ref) / LN2 + ghCH4(W);
  if (snow) return C.T0 * qrt(L * (1 - C.snowballAlbedo) / C.absorbRef) - 273.15 + gh;
  let T = W.T || C.tempGuess;
  for (let i = 0; i < C.tempIters; i++) {
    const A = clamp(C.albedoBase + iceFraction(T) * C.iceAlbedo + la, C.albedoRange[0], C.albedoRange[1]);
    let Tn = C.T0 * qrt(L * (1 - A) / C.absorbRef) - 273.15 + gh;
    if (Tn > C.vaporT) Tn += (Tn - C.vaporT) * C.vaporGain;
    // 値は Tn と同じだが、丸めの差まで試作04と同じにするため、この式のまま残す。
    T = (T + Tn) / 2 + (Tn - T) / 2;
  }
  return T;
}

// 火山の CO2 放出（現在比）。mod は記事の平均温度による倍率。
export const volcanism = (W, mod) =>
  C.volcano0 * clamp(C.volcEarly - C.volcDecline * W.t / C.volcAgeRef, C.volcMin, C.volcEarly) * mod + W.lip;

const superFactor = W => ((W.superPhase % C.superPeriod) / C.superPeriod < C.superPart ? C.superWeathering : 1);

function weathering(W, co2, T) {
  const wT = clamp(1 + C.weatherT * (T - C.weatherRefT), C.weatherRange[0], C.weatherRange[1]);
  let plants = 0; for (const s of W.species) if (s.hab === 'land') plants += s.pop;
  return Math.sqrt(co2 / C.co2Ref) * wT * (W.land / C.landRef) * superFactor(W) * (1 + plants * C.plantWeathering) * W.ocean;
}

// 火山の放出 V と風化が釣り合う CO2 を、二分法（対数の中点）で探す。
export function solveCO2(W, V) {
  let lo = C.co2Range[0], hi = C.co2Range[1];
  for (let i = 0; i < C.solveIters; i++) {
    const mid = Math.sqrt(lo * hi), T = tempFor(W, mid, false);
    if (V - weathering(W, mid, T) > 0) lo = mid; else hi = mid;
  }
  return Math.sqrt(lo * hi);
}
