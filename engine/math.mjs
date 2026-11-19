// 決定論の数学。エンジン間で結果がずれうる Math.sin、cos、exp、pow、log は使わない。
// 使ってよいのは四則演算、Math.sqrt（IEEE 754 で正確に丸めると決まっている）、Math.min、max、round、imul。

export const LN2 = 0.6931471805599453;

// 自然対数。x を [1, 2) に寄せてから、atanh の級数で計算する。
export function ln(x) {
  if (!(x > 0)) return -1e9;
  let k = 0; while (x > 2) { x /= 2; k++; } while (x < 1) { x *= 2; k--; }
  const y = (x - 1) / (x + 1), y2 = y * y; let s = y, t = y;
  for (let n = 3; n <= 17; n += 2) { t *= y2; s += t / n; }
  return 2 * s + k * LN2;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const qrt = x => Math.sqrt(Math.sqrt(x)); // 4乗根
export const r4 = v => Math.round(v * 1e4) / 1e4; // 記録（観測データ）に書く精度
