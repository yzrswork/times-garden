// 文明の町の姿（docs/creatures.md「文明」の段階と住まいの種類）。
//
// 段階（痕跡、集落、町、都市、未来都市）が建物の数と高さを決め、住まいの種類（土の家、崖、地下、
// 水中、木や植物、高い塔）が並べ方を決める。同じ「サイバーパンクの都市」でも、星ごとに違う姿になる。
//
// アートバイブル（docs/art-bible.md 3、4）:
//   - 地形は角を丸めた塊。鋭い直線は人工物にだけ使う（町は人工物なので、段階が上がるほど直線に寄せる）
//   - 色は恒星のパレットから。生の乱数で色を作らない。発光は暗いところでだけ目立たせる
//   - 文字は入れない（説明は HTML 側で書く）
//
// 形のばらつきは id から作る（同じ文明なら、いつ描いても同じ町になる）。描画側なので Math.sin は使える。
import { hsl, hsla, scene, palette } from './palette.mjs';

export const VB_W = 320, VB_H = 120;
const GROUND = 94;      // 地面の高さ（上から）
const UNDER_TOP = 50;   // 地下の町のときの地表

const n2 = v => Math.round(v * 100) / 100;
// id と添え字から作る、見た目だけのばらつき（0〜1）
const nz = (id, i) => { const x = Math.sin((id + 1) * 12.9898 + i * 78.233) * 43758.5453; return x - Math.floor(x); };
const mix = ([a, b], t) => a + (b - a) * t;

// 段階ごとの建物の数、幅、高さ、角の丸み、窓の密度、発光の強さ
const STAGE = {
  trace:   { n: [2, 4],   w: [7, 12],  h: [3, 7],   r: 1,    win: 0, glow: 0.5 },
  village: { n: [4, 7],   w: [14, 22], h: [9, 16],  r: 0.75, win: 0, glow: 0.12 },
  town:    { n: [6, 10],  w: [13, 22], h: [14, 26], r: 0.4,  win: 1, glow: 0.16 },
  city:    { n: [9, 13],  w: [14, 24], h: [24, 52], r: 0.12, win: 2, glow: 0.3 },
  future:  { n: [11, 16], w: [10, 22], h: [34, 76], r: 0.08, win: 3, glow: 0.75 },
};
export const TOWN_STAGES = Object.keys(STAGE);

// 建物の置き方。y は塊の上端。地下だけは地表から下に向けて掘る。
function layout(stage, dwelling, id) {
  const s = STAGE[stage] ?? STAGE.trace;
  const n = Math.round(mix(s.n, nz(id, 1)));
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    let x = 26 + t * (VB_W - 52) + (nz(id, i + 31) - 0.5) * 12;
    let w = mix(s.w, nz(id, i + 2)), h = mix(s.h, nz(id, i + 3));
    let base = GROUND, trunk = 0;
    if (dwelling === 'tower') { w *= 0.55; h *= 1.7; }            // 重力が弱い: 細く高い
    if (dwelling === 'water') { w *= 1.1; h *= 0.7; }             // 水中: 低いドーム
    if (dwelling === 'cliff') base = GROUND - cliffTop(x);        // 崖: 段々の上に建てる
    if (dwelling === 'tree') { trunk = mix([14, 34], nz(id, i + 11)); base = GROUND - trunk; h *= 0.6; w *= 0.8; }
    if (dwelling === 'under') { // 地下: 地表から下へ掘る（地上には出ない）
      h = Math.min(h, VB_H - UNDER_TOP - 16);
      base = UNDER_TOP + 10 + h;
    }
    out.push({ x: n2(x - w / 2), w: n2(w), h: n2(h), y: n2(base - h), base: n2(base), trunk: n2(trunk) });
  }
  return { blocks: out.sort((a, b) => a.x - b.x), s };
}

// 崖の高さ（左から右へ3段）。崖の住まいは、この段の上に乗る。
const cliffTop = x => (x < VB_W * 0.36 ? 40 : x < VB_W * 0.68 ? 22 : 6);

/* ---------- 描く ---------- */

const rect = (b, fill, r, extra = '') =>
  `<rect x="${b.x}" y="${n2(b.y)}" width="${b.w}" height="${n2(b.h)}" rx="${n2(r)}" fill="${fill}"${extra}/>`;

// 窓。都市と未来都市は格子に、町は点々に。発光は加算で重ねる（アートバイブル 4）
function windows(b, density, c, glow) {
  if (!density) return '';
  const cols = Math.max(1, Math.floor(b.w / (density > 1 ? 8 : 9)));
  const rows = Math.max(1, Math.floor(b.h / (density > 1 ? 10 : 12)));
  const out = [];
  for (let cx = 0; cx < cols; cx++) for (let cy = 0; cy < rows; cy++) {
    if (nz(b.x + cx, cy + b.h) > 0.3 + density * 0.1) continue;
    const w = density > 1 ? 2 : 1.6, h = density > 2 ? 3 : 2;
    out.push(`<rect x="${n2(b.x + 3 + cx * (b.w - 6) / cols)}" y="${n2(b.y + 4 + cy * (b.h - 6) / rows)}" width="${w}" height="${h}" rx=".6" fill="${glow}" opacity=".75"/>`);
  }
  return out.join('');
}

// 町の絵。civ は { id, stage, dwelling }。ruin が true なら、崩れて草に埋もれた遺跡として描く。
export function townSVG(civ, world, { size = 320, ruin = false } = {}) {
  const stage = STAGE[civ?.stage] ? civ.stage : 'trace';
  const dwelling = civ?.dwelling || 'earth';
  const id = Number.isFinite(civ?.id) ? civ.id : 1;
  const sc = scene(world?.star ?? 'yellow', dwelling === 'water' ? 'deep' : 'shallow');
  const { blocks, s } = layout(stage, dwelling, id);
  const uid = `t${id}-${stage}-${dwelling}${ruin ? '-r' : ''}`;
  // 壁の色は恒星のパレットから（docs/art-bible.md 4: 恒星の種類が世界全体の色温度を決める）。
  // 人工物なので彩度は落とし、明度だけで段階と光を出す。
  const [hue] = palette(world?.star ?? 'yellow').body[0];
  const body = { h: hue, s: 10, l: ruin ? 24 : 32 };
  const wall = hsl(body, dwelling === 'under' ? 10 : 0);
  const lit = hsl(body, 16);
  const o = ruin ? 0.7 : 1;
  const parts = [];

  parts.push(`<defs><linearGradient id="${uid}-sky" x1="0" y1="0" x2="0" y2="1">`
    + `<stop offset="0" stop-color="${sc.sky1}"/><stop offset="1" stop-color="${sc.sky0}"/></linearGradient>`
    + `<radialGradient id="${uid}-glow"><stop offset="0" stop-color="${sc.haze}" stop-opacity=".5"/>`
    + `<stop offset="1" stop-color="${sc.haze}" stop-opacity="0"/></radialGradient></defs>`);
  parts.push(`<rect width="${VB_W}" height="${VB_H}" fill="url(#${uid}-sky)"/>`);
  // 恒星の光（低い位置の薄明かり）
  parts.push(`<circle cx="${VB_W * 0.78}" cy="${GROUND - 48}" r="34" fill="url(#${uid}-glow)"/>`);
  parts.push(`<circle cx="${VB_W * 0.78}" cy="${GROUND - 48}" r="3.2" fill="${sc.star}" opacity=".9"/>`);

  // 地面（角を丸めた塊として置く。地下の町は地表を上げて、断面として見せる）
  const top = dwelling === 'under' ? UNDER_TOP : GROUND;
  if (dwelling === 'cliff') {
    parts.push(`<path d="M0 ${VB_H}L0 ${GROUND - 40}Q6 ${GROUND - 46} 20 ${GROUND - 44}`
      + `L${VB_W * 0.34} ${GROUND - 42}Q${VB_W * 0.38} ${GROUND - 40} ${VB_W * 0.38} ${GROUND - 24}`
      + `L${VB_W * 0.66} ${GROUND - 23}Q${VB_W * 0.7} ${GROUND - 22} ${VB_W * 0.7} ${GROUND - 6}`
      + `L${VB_W} ${GROUND - 5}L${VB_W} ${VB_H}Z" fill="${sc.ground}"/>`);
  } else if (dwelling === 'under') {
    // 断面として見せる: 地表の下は暗い土、掘った空洞だけが明るい
    parts.push(`<rect y="${UNDER_TOP}" width="${VB_W}" height="${VB_H - UNDER_TOP}" fill="${hsl(body, -22, -4)}"/>`);
    parts.push(`<rect y="${UNDER_TOP}" width="${VB_W}" height="4" fill="${sc.ground}"/>`);
  } else {
    parts.push(`<rect y="${top}" width="${VB_W}" height="${VB_H - top}" fill="${sc.ground}"/>`);
  }

  // 建物
  for (const b of blocks) {
    const r = Math.min(b.w, b.h) * s.r * 0.5;
    if (b.trunk) { // 木や植物の町: 幹の上に乗る
      parts.push(`<rect x="${n2(b.x + b.w / 2 - 2)}" y="${n2(b.base)}" width="4" height="${n2(b.trunk + 2)}" rx="2" fill="${hsl(body, -8)}" opacity="${o}"/>`);
      parts.push(`<ellipse cx="${n2(b.x + b.w / 2)}" cy="${n2(b.base + 2)}" rx="${n2(b.w * 0.8)}" ry="4" fill="${hsl(body, -4)}" opacity="${o * 0.8}"/>`);
    }
    if (dwelling === 'under') { // 地下: 掘った空洞として明るく抜き、地表へ縦穴をつなぐ
      parts.push(`<rect x="${n2(b.x + b.w / 2 - 1.8)}" y="${UNDER_TOP + 2}" width="3.6" height="${n2(b.y - UNDER_TOP)}" rx="1.8" fill="${hsl(body, -8)}" opacity="${o}"/>`);
      parts.push(rect(b, hsl(body, 10), r, ` opacity="${o}"`));
      parts.push(`<rect x="${n2(b.x + 1.5)}" y="${n2(b.y + 1.5)}" width="${n2(Math.max(1, b.w - 3))}" height="${n2(Math.max(1, b.h - 3))}" rx="${n2(r)}" fill="${sc.accent}" opacity="${o * 0.1}"/>`);
    } else {
      parts.push(rect(b, wall, r, ` opacity="${o}"`));
      // 光の当たる側のふち（リムライト）
      parts.push(`<rect x="${b.x}" y="${n2(b.y)}" width="${n2(Math.min(2.5, b.w / 4))}" height="${n2(b.h)}" rx="${n2(r)}" fill="${lit}" opacity="${o * 0.5}"/>`);
    }
    if (!ruin) parts.push(windows(b, s.win, body, sc.accent));
    if (stage === 'future' && !ruin) { // 未来都市: 細い塔と、縦の光の帯
      parts.push(`<rect x="${n2(b.x + b.w / 2 - 0.6)}" y="${n2(b.y - 10)}" width="1.2" height="10" fill="${sc.accent}" opacity=".6"/>`);
      parts.push(`<rect x="${n2(b.x + b.w - 3)}" y="${n2(b.y + 3)}" width="1.2" height="${n2(b.h - 8)}" fill="${sc.star}" opacity=".5"/>`);
    }
    if (ruin) { // 崩れた壁として、上を欠かせる
      parts.push(`<rect x="${n2(b.x - 1)}" y="${n2(b.y - 1)}" width="${n2(b.w * 0.5)}" height="${n2(3 + b.h * 0.25)}" fill="${sc.sky0}" opacity=".85"/>`);
    }
  }

  // 痕跡の段階: 火と石の並び
  if (stage === 'trace') {
    const fx = VB_W * 0.5, fy = GROUND - 2;
    if (!ruin) {
      parts.push(`<circle cx="${n2(fx)}" cy="${n2(fy - 4)}" r="17" fill="${sc.haze}" opacity=".22"/>`);
      parts.push(`<ellipse cx="${n2(fx)}" cy="${n2(fy - 4)}" rx="3" ry="5" fill="${sc.haze}" opacity=".95"/>`);
    }
    for (let i = 0; i < 8; i++) { // 石の並び（火を囲む輪）
      const a = i / 8 * Math.PI * 2;
      parts.push(`<circle cx="${n2(fx + Math.cos(a) * 26)}" cy="${n2(fy + 1 + Math.sin(a) * 6)}" r="2.2" fill="${hsl(body, 8)}" opacity="${o}"/>`);
    }
  }

  // 水中の町: 水の層と泡（いちばん上に重ねる）
  if (dwelling === 'water') {
    parts.push(`<rect width="${VB_W}" height="${VB_H}" fill="${hsla({ h: 200, s: 40, l: 40 }, 0.22)}"/>`);
    for (let i = 0; i < 9; i++) {
      parts.push(`<circle cx="${n2(nz(id, i + 50) * VB_W)}" cy="${n2(14 + nz(id, i + 70) * (GROUND - 20))}" r="${n2(0.8 + nz(id, i + 90) * 1.8)}" fill="${sc.star}" opacity=".3"/>`);
    }
  }
  // 遺跡は草に埋もれていく（地面の色をうすく重ねる）
  if (ruin) parts.push(`<rect y="${n2(GROUND - 5)}" width="${VB_W}" height="${n2(VB_H - GROUND + 5)}" fill="${sc.ground}" opacity=".5"/>`);
  // ビネット（アートバイブル 6: 軽く）
  parts.push(`<rect width="${VB_W}" height="${VB_H}" fill="none" stroke="${sc.ink}" stroke-width="10" opacity=".25"/>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB_W} ${VB_H}" width="${size}" height="${n2(size * VB_H / VB_W)}" role="img">${parts.join('')}</svg>`;
}
