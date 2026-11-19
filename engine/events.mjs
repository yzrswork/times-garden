// 出来事の種類と、日本語の説明。計算（world.mjs、life.mjs）は種類と数だけを記録し、文章はここで作る。
const TEXT = {
  abio: '海で最初の生命が生まれた',
  abio2: '生命がふたたび生まれた',
  photo: '光合成をする生き物が現れた',
  goe: '大気に酸素がたまり始めた（大酸化イベント）',
  euk: '細胞の中に小部屋を持つ生き物（真核生物）が現れた',
  multi: '多細胞の生き物が現れた',
  complex: '大きく複雑な生き物が現れた',
  mind: '考える生き物が現れた',
  land: '生き物が陸に上がった',
  sterile: 'すべての生き物が絶滅した',
  snowball: '惑星全体が凍りついた（全球凍結）',
  thaw: '全球凍結が解けた',
  oceanLost: '海が蒸発して失われた',
  lip: '大規模な火山活動（洪水玄武岩）が始まった',
  super: '大陸が集まって超大陸ができた',
};
const IMPACT = { small: '小さな隕石が落ちた', large: '大きな隕石が落ちた', giant: '巨大な隕石が落ちた' };

export const EVENT_KINDS = [...Object.keys(TEXT), 'impact', 'mass'];

export function describe(e) {
  if (e.k === 'impact') return IMPACT[e.size];
  if (e.k === 'mass') return `大量絶滅（系統の${Math.round(e.lost * 100)}%が消えた）`;
  return TEXT[e.k] ?? e.k;
}
