// 決定論の乱数とハッシュ。Math.random() は使わない。
// 乱数は文字列の種を cyrb128 でハッシュし、sfc32 で作る。

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

export function sfc32(a, b, c, d) {
  return function () {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21 | c >>> 11);
    d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0; return (t >>> 0) / 4294967296;
  };
}

// 種の部品を '|' でつないだ文字列から、[0, 1) の乱数を返す関数を作る。最初の12個は捨てる。
export function rng(...parts) {
  const f = sfc32(...cyrb128(parts.join('|')));
  for (let i = 0; i < 12; i++) f();
  return f;
}

// 一様乱数4つの和で作る、平均0の山形の乱数。標準偏差は約0.5（√(4/12) × 0.866）。
// 試作04のコメントには「分散おおよそ1」とあったが、実際は標準偏差0.5。値は試作04のまま。
export const gauss = r => (r() + r() + r() + r() - 2) * 0.866;

// 128ビットのハッシュを16進32文字で返す。壊れたデータの検出用で、改ざん対策ではない。
export const hash = s => cyrb128(s).map(x => x.toString(16).padStart(8, '0')).join('');
