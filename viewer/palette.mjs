// 色の体系（docs/art-bible.md 4）。恒星の種類が世界全体の色温度を決める。
// 生の乱数で色は作らない。系統ごとのずれ（look.drift）は、パレットの中の小さな振れ幅としてだけ使う。
// 役割: 背景、地面、本体、アクセント、発光、輪郭、文字。

const P = {
  red: { // 赤色矮星: 赤く暗い
    bg: '#120b0c', panel: '#1c1113', ground: '#2a1a18',
    body: [[14, 38, 42], [8, 30, 34], [22, 44, 50]], // [色相, 彩度%, 明度%]
    accent: '#d9743f', glow: '#ff9a5c', ink: '#070405', text: '#e8d7cf', dim: '#9b8178',
  },
  yellow: { // 黄色い恒星: 自然な色
    bg: '#0e1012', panel: '#161a1d', ground: '#243027',
    body: [[92, 30, 46], [64, 34, 50], [120, 24, 44]],
    accent: '#e0c267', glow: '#ffe6a3', ink: '#05070a', text: '#e6e9e4', dim: '#8d948f',
  },
  blue: { // 青白い恒星: 寒色で白っぽい
    bg: '#0a0f16', panel: '#121a24', ground: '#1c2a38',
    body: [[198, 26, 54], [214, 30, 60], [182, 22, 50]],
    accent: '#8fd3f0', glow: '#d8f2ff', ink: '#040810', text: '#e3edf5', dim: '#86979f',
  },
};

export const palette = star => P[star] ?? P.yellow;

// 系統の本体の色（色相、彩度、明度）。パレットの3つの候補から系統ごとに1つを選び、
// 明度だけを体の色（アルベド）で動かす。色相のずれは drift を小さく丸めて使う（±4度まで）。
export function bodyHSL(star, look, light) {
  const p = palette(star);
  const i = Math.abs(look?.drift ?? 0) % p.body.length;
  const [h, s, l] = p.body[i];
  return {
    h: h + Math.round((look?.drift ?? 0) / 8),
    s,
    l: Math.min(82, Math.max(16, Math.round(l + (light - 0.5) * 22))),
  };
}

export const hsl = (c, dl = 0, ds = 0, dh = 0) =>
  `hsl(${c.h + dh} ${Math.min(100, Math.max(0, c.s + ds))}% ${Math.min(96, Math.max(4, c.l + dl))}%)`;
export const hsla = (c, a, dl = 0, ds = 0, dh = 0) =>
  `hsl(${c.h + dh} ${Math.min(100, Math.max(0, c.s + ds))}% ${Math.min(96, Math.max(4, c.l + dl))}% / ${a})`;

export const bodyFill = (star, look, light) => hsl(bodyHSL(star, look, light));

// 光の向き（docs/art-bible.md 6「光と色に投資する」）。どの生き物も同じ向きから照らす。
export const LIGHT = { x: -0.38, y: -0.46 };

// 場面の色。恒星の色温度と、生き物の住む場所で変える。
export function scene(star, place) {
  const p = palette(star);
  const deep = place === 'deep';
  return {
    sky0: deep ? p.bg : p.panel,
    sky1: p.bg,
    haze: p.glow,
    ground: p.ground,
    star: p.glow,
    accent: p.accent,
    ink: p.ink,
  };
}
