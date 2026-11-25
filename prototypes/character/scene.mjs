// 試作09: 文明シーンの方向性サンプル（1枚だけ）。
//
// 段階4の図鑑カード（viewer/town.mjs）は「四角いビル＋窓の点々」で、住んでいる生き物の体が
// 一切出ていなかった。ここで試すのは、その逆:
//   - 建物を建てない。崖に掘った穴、張り出した止まり場、通り道という「体に合った住まい」だけ
//   - 主役は生き物。住まいは脇役（生き物が絵の焦点を取る）
//   - 段階の違いは建物の数ではなく、暮らしの痕跡（穴、止まり場、火、擦り跡）の密度で出す
//
// 対象は #314（体節型・うろこ・レンズの目2つ・翼4本、陸、大きい、重力1.81）の「崖の住まい・町」。
// 体が平たく横に広いので入口も低く横に広い。翼で降りるので、入口の手前に止まり場が要る。
// civ.mjs にも viewer/town.mjs にも手を入れない。この1枚は方向性を見るためだけのもの。
import { scene, hsl, palette } from '../../viewer/palette.mjs';
import { wob } from '../../viewer/plan.mjs';
import { charSVG } from './char.mjs';

export const SW = 360, SH = 200;
const n2 = v => Math.round(v * 100) / 100;

// 段階ごとの「暮らしの痕跡」の密度。建物の数ではなく、使われ方の濃さ。
export const DENSITY = {
  trace:   { holes: 1, perches: 1, fires: 1, scuffs: 5,  folk: 1 },
  village: { holes: 3, perches: 2, fires: 2, scuffs: 12, folk: 2 },
  town:    { holes: 6, perches: 4, fires: 3, scuffs: 24, folk: 3 },
  city:    { holes: 9, perches: 6, fires: 6, scuffs: 36, folk: 3 },
  future:  { holes: 12, perches: 8, fires: 9, scuffs: 48, folk: 3 },
};

// 崖は3段。各段に「平らな上面」と「垂直な面」があり、穴は垂直な面に掘る。
const TERRACES = [
  { top: SH * 0.80, x0: SW * 0.30 },
  { top: SH * 0.58, x0: SW * 0.46 },
  { top: SH * 0.34, x0: SW * 0.64 },
];

function cliffPath() {
  let d = `M${SW} ${SH}L${SW} ${n2(TERRACES[2].top)}`;
  for (let i = TERRACES.length - 1; i >= 0; i--) {
    const t = TERRACES[i], next = TERRACES[i - 1];
    d += `L${n2(t.x0 + 8)} ${n2(t.top)}Q${n2(t.x0)} ${n2(t.top)} ${n2(t.x0)} ${n2(t.top + 6)}`;
    d += `L${n2(t.x0)} ${n2(next ? next.top - 6 : SH)}`;
    if (next) d += `Q${n2(t.x0)} ${n2(next.top)} ${n2(t.x0 - 8)} ${n2(next.top)}`;
  }
  return d + `L${SW} ${SH}Z`;
}

// 穴を掘る場所: 各段の垂直な面に、低く横に広い入口を並べる
function holeSpots(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = TERRACES[i % TERRACES.length];
    const k = Math.floor(i / TERRACES.length);
    const face = (t === TERRACES[0] ? SH : TERRACES[TERRACES.indexOf(t) - 1]?.top ?? SH);
    out.push({
      x: t.x0 + 26 + k * 54 + Math.abs(wob(314, i)) * 14,
      y: t.top + 14 + ((face - t.top) > 34 ? k * 16 : 0),
      w: 26 + Math.abs(wob(314, i + 7)) * 10,
      level: TERRACES.indexOf(t), i,
    });
  }
  return out.filter(s => s.x < SW - 14);
}

// entry/world は subjects.json の1件。stage は DENSITY のどれか。
export function cliffTownSVG(entry, world, { stage = 'town', size = SW } = {}) {
  const S = scene(world.star, ''), p = palette(world.star);
  const d = DENSITY[stage] ?? DENSITY.town;
  const hue = p.body[0][0];
  const rock = hsl({ h: hue, s: 10, l: 25 });
  const rockTop = hsl({ h: hue, s: 12, l: 36 });   // 段の上面（光が当たる）
  const rockDark = hsl({ h: hue, s: 8, l: 13 });
  const out = [];

  out.push(`<defs>`
    + `<linearGradient id="sc-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${S.sky1}"/><stop offset="1" stop-color="${S.sky0}"/></linearGradient>`
    + `<radialGradient id="sc-sun"><stop offset="0" stop-color="${S.star}" stop-opacity=".5"/><stop offset="1" stop-color="${S.star}" stop-opacity="0"/></radialGradient>`
    + `<radialGradient id="sc-fire"><stop offset="0" stop-color="${S.accent}" stop-opacity=".95"/><stop offset="1" stop-color="${S.accent}" stop-opacity="0"/></radialGradient>`
    + `<clipPath id="sc-cliff"><path d="${cliffPath()}"/></clipPath>`
    + `</defs>`);
  out.push(`<rect width="${SW}" height="${SH}" fill="url(#sc-sky)"/>`);
  out.push(`<circle cx="${n2(SW * 0.17)}" cy="${n2(SH * 0.26)}" r="${n2(SH * 0.3)}" fill="url(#sc-sun)"/>`);
  out.push(`<circle cx="${n2(SW * 0.17)}" cy="${n2(SH * 0.26)}" r="3.4" fill="${S.star}" opacity=".9"/>`);
  // 奥の崖と谷底（奥行き）
  out.push(`<path d="M0 ${SH}L0 ${n2(SH * 0.84)}Q${n2(SW * 0.2)} ${n2(SH * 0.74)} ${n2(SW * 0.44)} ${n2(SH * 0.82)}L${SW} ${n2(SH * 0.78)}L${SW} ${SH}Z" fill="${rockDark}" opacity=".8"/>`);

  // 手前の崖
  out.push(`<path d="${cliffPath()}" fill="${rock}"/>`);
  out.push(`<g clip-path="url(#sc-cliff)">`);
  // 岩の層（角を丸めた塊。のっぺりさせない）
  for (let i = 0; i < 10; i++) {
    const x = SW * (0.34 + (i * 0.09) % 0.66), y = SH * (0.2 + ((i * 7) % 6) * 0.13);
    out.push(`<ellipse cx="${n2(x)}" cy="${n2(y)}" rx="${n2(20 + Math.abs(wob(314, i + 5)) * 18)}" ry="${n2(7 + Math.abs(wob(314, i + 9)) * 6)}" fill="${i % 2 ? rockTop : rockDark}" opacity=".22"/>`);
  }
  const spots = holeSpots(d.holes);
  // 擦り跡（何度も通ってできた筋）。穴と穴のあいだに散らす
  for (let i = 0; i < d.scuffs && spots.length; i++) {
    const a = spots[i % spots.length], b = spots[(i + 1) % spots.length];
    const t = ((i * 37) % 100) / 100;
    const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t + wob(314, i + 40) * 7;
    out.push(`<path d="M${n2(x)} ${n2(y)}q${n2(5 + wob(314, i) * 3)} ${n2(1.5 + wob(314, i + 3) * 2)} ${n2(11 + wob(314, i + 7) * 5)} ${n2(wob(314, i + 11) * 3)}" fill="none" stroke="${rockTop}" stroke-width=".9" opacity=".4"/>`);
  }
  // 段の上面（光の当たる平らなところ）
  for (const t of TERRACES) {
    out.push(`<rect x="${n2(t.x0)}" y="${n2(t.top)}" width="${n2(SW - t.x0)}" height="3.4" fill="${rockTop}" opacity=".85"/>`);
  }
  // 住まい: 低く横に広い入口。奥は暗く、下の縁に出入りで削れた明るい跡
  for (const s of spots) {
    const w = s.w, h = w * 0.46;
    out.push(`<path d="M${n2(s.x - w / 2)} ${n2(s.y)}a${n2(w / 2)} ${n2(h)} 0 0 1 ${n2(w)} 0Z" fill="${rockDark}"/>`);
    out.push(`<path d="M${n2(s.x - w / 2)} ${n2(s.y)}a${n2(w / 2)} ${n2(h)} 0 0 1 ${n2(w)} 0" fill="none" stroke="${rockTop}" stroke-width="1.3" opacity=".8"/>`);
    out.push(`<ellipse cx="${n2(s.x)}" cy="${n2(s.y)}" rx="${n2(w * 0.56)}" ry="1.8" fill="${rockTop}" opacity=".55"/>`);
  }
  out.push(`</g>`);
  // 止まり場: 崖から空へ張り出す棚。翼で降りて掴まる
  const perches = [];
  for (let i = 0; i < d.perches; i++) {
    const t = TERRACES[i % TERRACES.length];
    const x = t.x0 - 6 - (i >= TERRACES.length ? 14 : 0), y = t.top + 10 + Math.abs(wob(314, i + 30)) * 10;
    perches.push({ x, y });
    out.push(`<path d="M${n2(x + 12)} ${n2(y)}q${n2(-12)} ${n2(-3.2)} ${n2(-26)} ${n2(0.6)}q${n2(14)} ${n2(4.4)} ${n2(26)} ${n2(-0.6)}Z" fill="${rockTop}"/>`);
    out.push(`<path d="M${n2(x - 8)} ${n2(y + 2)}l${n2(2.5)} ${n2(5)}M${n2(x + 3)} ${n2(y + 2.4)}l${n2(-1.6)} ${n2(4.5)}" stroke="${rockDark}" stroke-width="1" opacity=".55"/>`);
  }
  // 火（穴の奥の明かり）
  for (let i = 0; i < d.fires && spots.length; i++) {
    const s = spots[i % spots.length];
    out.push(`<circle cx="${n2(s.x)}" cy="${n2(s.y - 3)}" r="${n2(10 + Math.abs(wob(314, i + 50)) * 5)}" fill="url(#sc-fire)" opacity=".45" style="mix-blend-mode:screen"/>`);
    out.push(`<ellipse cx="${n2(s.x)}" cy="${n2(s.y - 3)}" rx="1.8" ry="2.4" fill="${S.star}" opacity=".9"/>`);
  }

  // 生き物。主役は手前の段の上に大きく、残りは止まり場と空に小さく。
  // 住まいの寸法（入口の幅、棚の長さ）は、この体の幅から決めてある。
  const folk = [];
  folk.push({ x: TERRACES[0].x0 + 42, y: TERRACES[0].top, k: 1.15, tag: 'a' });            // 段の上に立つ
  if (d.folk > 1 && perches[1]) folk.push({ x: perches[1].x - 4, y: perches[1].y, k: 0.52, tag: 'b' }); // 止まり場に掴まる
  if (d.folk > 2) folk.push({ x: SW * 0.2, y: SH * 0.52, k: 0.4, tag: 'c', fly: true });    // 空を横切る
  for (const f of folk) {
    const w = 120 * f.k;
    const body = charSVG(entry, world, { size: 120, frame: false, tag: f.tag })
      .replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
    // charSVG は枠の下（0.8あたり）に接地するので、その高さが足元に来るように置く
    const dy = f.y - (w * 0.80);
    out.push(`<svg x="${n2(f.x - w / 2)}" y="${n2(dy)}" width="${n2(w)}" height="${n2(w)}" viewBox="0 0 120 120"${f.fly ? ' opacity=".9"' : ''}>${body}</svg>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SW} ${SH}" width="${size}" height="${n2(size * SH / SW)}" role="img">${out.join('')}</svg>`;
}
