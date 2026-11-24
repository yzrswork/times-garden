// 単細胞を顕微鏡で覗いた高密度な静止画を SVG で描く（図鑑の焼きカードの元）。
//
// GitHub Actions で画像に焼く前提なので、スマホでは重くて使えない手（ぼかし、ゆがみ、粒）を使ってよい。
// 計算コストは GitHub Actions が1回だけ払い、スマホは画像を1枚置くだけになる。これが試作08の仮説。
//
// 形質の解釈はしない。本番の viewer/plan.mjs の cellPlan() が作る設計図を読むだけ。
// 背景の礫と粒だけは場面の飾りなので、ここで系統の id から決定論的に散らす
// （viewer/draw.mjs が場面の塵を描くのと同じ扱い）。
//
// v2 で足したもの: 膜を厚みのある帯にして縞を桟として走らせる、核の縞を球に巻きつく弧にする、
// 内部器官を20個台にしてアクセント色で地と対比させる、背景に奥行きの層を置く、明度と彩度の幅を広げる。
// 追わないもの: 濡れた質感と全面の鏡面ハイライト（art-bible 9）、紫×青緑の色そのもの（art-bible 4）。
import { cellPlan, VB, C0 } from './plan.mjs';
import { hsl, hsla, palette, LIGHT } from './palette.mjs';

const n2 = v => Math.round(v * 100) / 100;
const P = p => `${n2(p[0])} ${n2(p[1])}`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const wob = (id, i) => { const x = Math.sin((id * 12.9898 + i * 78.233)) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; };

// 点を滑らかにつないだ閉じた輪郭（図鑑カードと同じつなぎ方）
function loopPath(pts) {
  let d = '';
  for (let i = 0; i < pts.length; i++) {
    const q = pts[(i + 1) % pts.length], r = pts[(i + 2) % pts.length];
    const m1 = [(pts[i][0] + q[0]) / 2, (pts[i][1] + q[1]) / 2];
    const m2 = [(q[0] + r[0]) / 2, (q[1] + r[1]) / 2];
    d += (i === 0 ? `M${P(m1)}` : '') + `Q${P(q)} ${P(m2)}`;
  }
  return d + 'Z';
}
// 輪郭の上を角度 a で進んだ点（帯の桟を引くのに使う）
const onRing = (plan, k, a) => [
  C0 + Math.cos(a) * plan.R * k * (1 + wob(plan.id, Math.round(a * 1.75)) * 0.12),
  C0 + Math.sin(a) * plan.R * k * (1 + wob(plan.id, Math.round(a * 1.75)) * 0.12) * plan.ratio,
];

/* ---------- 内部器官（共有の部品。個体ごとの手置きはしない） ---------- */

function organelle(o, c, acc, i) {
  const g = `translate(${n2(o.cx)} ${n2(o.cy)}) rotate(${n2(o.rot)})`;
  if (o.kind === 'mito') { // ミトコンドリア: 内部にひだ
    const n = 5;
    const cr = [];
    for (let k = 0; k < n; k++) {
      const x = -o.rx * 0.66 + (k * o.rx * 1.32) / (n - 1);
      cr.push(`<path d="M${n2(x)} ${n2(-o.ry * 0.62)}q${n2(o.rx * 0.16)} ${n2(o.ry * 0.6)} 0 ${n2(o.ry * 1.24)}" fill="none" stroke="${acc(0.75, -18)}" stroke-width=".55"/>`);
    }
    return `<g transform="${g}"><rect x="${n2(-o.rx)}" y="${n2(-o.ry)}" width="${n2(o.rx * 2)}" height="${n2(o.ry * 2)}" rx="${n2(o.ry)}" fill="${acc(0.3, 8)}" stroke="${acc(0.85, -6)}" stroke-width=".8"/>${cr.join('')}</g>`;
  }
  if (o.kind === 'vacuole') // 液胞: 中が抜けた丸
    return `<g transform="${g}"><ellipse rx="${n2(o.rx)}" ry="${n2(o.ry)}" fill="${hsla(c, 0.22, 26)}" stroke="${acc(0.6, 4)}" stroke-width=".7"/>`
      + `<ellipse cx="${n2(-o.rx * 0.32)}" cy="${n2(-o.ry * 0.32)}" rx="${n2(o.rx * 0.3)}" ry="${n2(o.ry * 0.28)}" fill="#fff" opacity=".3"/></g>`;
  if (o.kind === 'grain') { // 顆粒: 小さな粒の群れ
    const out = [];
    for (let k = 0; k < 7; k++) {
      const a = (Math.PI * 2 * k) / 7 + i;
      out.push(`<circle cx="${n2(Math.cos(a) * o.rx * 0.72)}" cy="${n2(Math.sin(a) * o.ry * 0.72)}" r="${n2(o.rx * 0.3)}" fill="${acc(0.9, -12)}"/>`);
    }
    return `<g transform="${g}">${out.join('')}</g>`;
  }
  // コイル: 折りたたまれたリボン
  let d = `M${n2(-o.rx)} 0`;
  for (let k = 1; k <= 16; k++) {
    const t = k / 16, a = t * Math.PI * 3.4, r = o.rx * (1 - t * 0.78);
    d += `L${n2(Math.cos(a) * r)} ${n2(Math.sin(a) * r * (o.ry / o.rx))}`;
  }
  return `<g transform="${g}"><path d="${d}" fill="none" stroke="${acc(0.85, 2)}" stroke-width="${n2(o.rx * 0.34)}" stroke-linecap="round" stroke-linejoin="round"/></g>`;
}

// entry は engine/traits.mjs の bestiary() の1件。world は { star, gravity }。
export function cellSVG(entry, world, { size = 360, fill = 0.8 } = {}) {
  const plan = cellPlan(entry, world, { fill });
  const { id, color: c, R, ratio, band, nucleus: nuc } = plan;
  const p = palette(world.star);
  const glow = plan.pattern === 'glow';
  // アクセント色。色相は恒星のパレットが持つ body の色相の範囲に収め（art-bible 4）、
  // 対比は彩度と明度で作る。色相そのものを動かすと恒星の決まりを外れる。
  const hues = p.body.map(b => b[0]);
  const accH = Math.min(...hues) + (Math.max(...hues) - Math.min(...hues)) * 0.1;
  const acc = (a, dl = 0) => hsla({ h: accH, s: Math.min(100, c.s + 42), l: Math.min(76, c.l + 18) }, a, dl);

  const outer = loopPath(band.outer), inner = loopPath(band.inner);

  // 膜の帯の上の模様。種類ごとに描き方を変える（設計図が kind と items を決めている）
  const mp = band.pattern, memb = [];
  if (mp.kind === 'rungs') {           // しま: 帯を横切る細い桟
    mp.items.forEach((it, i) => {
      const i0 = onRing(plan, band.k * 0.97, it.a), o0 = onRing(plan, 1.03, it.a);
      memb.push(`<line x1="${n2(i0[0])}" y1="${n2(i0[1])}" x2="${n2(o0[0])}" y2="${n2(o0[1])}"`
        + ` stroke="${i % 2 ? hsla(c, 0.72, -26, 10) : hsla(c, 0.5, 30)}" stroke-width="${n2(R * 0.05)}"/>`);
    });
  } else if (mp.kind === 'bands') {    // 帯: 太い帯が帯を横断する
    mp.items.forEach((it, i) => {
      const i0 = onRing(plan, band.k * 0.95, it.a), o0 = onRing(plan, 1.05, it.a);
      memb.push(`<line x1="${n2(i0[0])}" y1="${n2(i0[1])}" x2="${n2(o0[0])}" y2="${n2(o0[1])}"`
        + ` stroke="${hsla(c, 0.78, -28, 12)}" stroke-width="${n2(R * it.half * 2)}"/>`);
      memb.push(`<line x1="${n2(i0[0])}" y1="${n2(i0[1])}" x2="${n2(o0[0])}" y2="${n2(o0[1])}"`
        + ` stroke="${hsla(c, 0.4, 32)}" stroke-width="${n2(R * it.half * 0.6)}"/>`);
    });
  } else if (mp.kind === 'spots') {    // 斑点: 帯の上に色素の斑
    mp.items.forEach(it => {
      const k = band.k + (1 - band.k) * it.t;
      const q = onRing(plan, k, it.a);
      memb.push(`<ellipse cx="${n2(q[0])}" cy="${n2(q[1])}" rx="${n2(R * it.r)}" ry="${n2(R * it.r * 0.82)}" fill="${hsla(c, 0.72, -26, 12)}"/>`);
      memb.push(`<ellipse cx="${n2(q[0] - R * it.r * 0.26)}" cy="${n2(q[1] - R * it.r * 0.26)}" rx="${n2(R * it.r * 0.34)}" ry="${n2(R * it.r * 0.3)}" fill="${hsla(c, 0.3, 30)}"/>`);
    });
  }

  // 核の模様: 球に巻きつく弧（しま・帯）か、球の上に散る斑（斑点）
  const np = nuc.pattern;
  const nucPat = np.kind === 'spots'
    ? np.items.map(o => `<ellipse cx="${n2(o.x)}" cy="${n2(o.y)}" rx="${n2(o.rx)}" ry="${n2(o.ry)}" fill="${hsla(c, 0.62, -30, 14)}"/>`).join('')
    : np.kind === 'arcs'
      ? np.items.map(o => `<path d="M${n2(nuc.cx - o.halfW)} ${n2(o.y)}Q${n2(nuc.cx)} ${n2(o.y + o.bulge)} ${n2(nuc.cx + o.halfW)} ${n2(o.y)}"`
          + ` fill="none" stroke="${hsla(c, 0.6, -30, 14)}" stroke-width="${n2(o.w)}" stroke-linecap="round"/>`).join('')
      : '';

  // 背景の奥行き: ぼけた礫（前景の粒とは別の層）
  const grit = [];
  for (let i = 0; i < 26; i++) {
    const x = ((wob(id, i + 200) + 1) / 2) * VB, y = ((wob(id, i + 230) + 1) / 2) * VB;
    const r = 2 + Math.abs(wob(id, i + 260)) * 6;
    grit.push(`<ellipse cx="${n2(x)}" cy="${n2(y)}" rx="${n2(r)}" ry="${n2(r * 0.78)}" fill="${hsla({ ...c, s: c.s - 10 }, 0.5, -34 + Math.abs(wob(id, i + 290)) * 16, 0, -14)}"/>`);
  }
  const dust = [];
  for (let i = 0; i < 11; i++) {
    const a = (Math.PI * 2 * i) / 11 + id * 0.3, rr = VB * (0.3 + ((i * 7) % 5) * 0.07);
    dust.push(`<circle cx="${n2(C0 + Math.cos(a) * rr)}" cy="${n2(C0 + Math.sin(a) * rr)}" r="${n2(1.4 + (i % 4) * 1.3)}" fill="${hsla(c, 0.22, 34)}"/>`);
  }

  const defs = `<defs>`
    // 顕微鏡の視野。明度の幅を広げるため、外周をかなり落とす
    + `<radialGradient id="field${id}"><stop offset="0" stop-color="${hsla({ ...c, l: 50 }, 0.55, 0, -10)}"/>`
    + `<stop offset=".5" stop-color="${hsla({ ...c, l: 20 }, 0.9)}"/><stop offset="1" stop-color="${p.ink}"/></radialGradient>`
    // 細胞質
    + `<radialGradient id="cyto${id}" cx="${n2(50 + LIGHT.x * 34)}%" cy="${n2(50 + LIGHT.y * 34)}%" r="80%">`
    + `<stop offset="0" stop-color="${hsl(c, 30, -6, 8)}"/><stop offset=".48" stop-color="${hsl(c, 0)}"/>`
    + `<stop offset="1" stop-color="${hsl(c, -34, 10, -8)}"/></radialGradient>`
    // 膜の帯
    + `<radialGradient id="bandg${id}" cx="${n2(50 + LIGHT.x * 30)}%" cy="${n2(50 + LIGHT.y * 30)}%" r="84%">`
    + `<stop offset="0" stop-color="${hsl(c, 34, -8, 6)}"/><stop offset=".6" stop-color="${hsl(c, 10)}"/>`
    + `<stop offset="1" stop-color="${hsl(c, -28, 8, -6)}"/></radialGradient>`
    + `<radialGradient id="nucg${id}" cx="34%" cy="28%" r="78%">`
    + `<stop offset="0" stop-color="${hsl(c, 26, 8, 12)}"/><stop offset=".58" stop-color="${hsl(c, -4, 12, 8)}"/>`
    + `<stop offset="1" stop-color="${hsl(c, -36, 16, 2)}"/></radialGradient>`
    + `<linearGradient id="rim${id}" x1="12%" y1="2%" x2="86%" y2="98%">`
    + `<stop offset="0" stop-color="${hsl(c, 42, -6, 6)}"/><stop offset=".45" stop-color="${hsl(c, -2)}"/>`
    + `<stop offset="1" stop-color="${hsl(c, -36, 4, -6)}"/></linearGradient>`
    // 焼く前提の重い手
    + `<filter id="grain${id}" x="-20%" y="-20%" width="140%" height="140%">`
    + `<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="${id % 100}" result="n"/>`
    + `<feDisplacementMap in="SourceGraphic" in2="n" scale="1.4" xChannelSelector="R" yChannelSelector="G"/></filter>`
    + `<filter id="soft${id}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.2"/></filter>`
    + `<filter id="far${id}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="3.4"/></filter>`
    + `<filter id="near${id}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="1.4"/></filter>`
    + (glow ? `<filter id="bloom${id}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.6"/></filter>`
      + `<radialGradient id="bio${id}"><stop offset="0" stop-color="${hsla(c, 0.6, 40)}"/><stop offset=".55" stop-color="${hsla(c, 0.3, 30)}"/><stop offset="1" stop-color="${hsla(c, 0, 20)}"/></radialGradient>` : '')
    + `<radialGradient id="vig${id}"><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".72"/></radialGradient>`
    + `<clipPath id="cell${id}"><path d="${inner}"/></clipPath>`
    + `<clipPath id="bandc${id}"><path d="${outer} ${inner}" clip-rule="evenodd"/></clipPath>`
    + `<clipPath id="nucc${id}"><ellipse cx="${n2(nuc.cx)}" cy="${n2(nuc.cy)}" rx="${n2(nuc.rx)}" ry="${n2(nuc.ry)}"/></clipPath>`
    + `</defs>`;

  return `<svg viewBox="0 0 ${VB} ${VB}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(entry.text || '生き物')}">`
    + defs
    + `<rect width="${VB}" height="${VB}" fill="url(#field${id})"/>`
    + `<g filter="url(#far${id})">${grit.join('')}</g>`      // 奥の礫
    // 発光は体の外へ広げない。にじみの半径は膜の内側までで止め、膜と繊毛が光の外に残るようにする
    + (glow ? `<ellipse cx="${C0}" cy="${C0}" rx="${n2(R * band.k * 0.98)}" ry="${n2(R * band.k * 0.98 * ratio)}" fill="${hsla(c, 0.22, 24)}" filter="url(#bloom${id})"/>` : '')
    + plan.pseudopods.map(s => `<path d="M${P(s.base)}Q${P(s.ctrl)} ${P(s.tip)}" fill="none" stroke="url(#cyto${id})" stroke-width="${n2(s.half * 2)}" stroke-linecap="round" opacity=".92"/>`).join('')
    // 繊毛
    + plan.cilia.map((s, i) =>
        `<path d="M${P(s.base)}Q${n2((s.base[0] + s.tip[0]) / 2 + Math.sin(i) * 1.1)} ${n2((s.base[1] + s.tip[1]) / 2)} ${P(s.tip)}"`
        + ` fill="none" stroke="${hsla(c, 0.5 + Math.abs(wob(id, i + 140)) * 0.4, 20 + Math.abs(wob(id, i + 150)) * 22)}" stroke-width="${n2(s.w)}" stroke-linecap="round"/>`).join('')
    // 細胞質（内側）
    + `<path d="${inner}" fill="url(#cyto${id})"/>`
    // 膜の帯と、帯を横切る桟
    + `<g filter="url(#grain${id})">`
    + `<path d="${outer} ${inner}" fill-rule="evenodd" fill="url(#bandg${id})" opacity=".96"/>`
    + `<g clip-path="url(#bandc${id})">${memb.join('')}</g>`
    + `<path d="${outer}" fill="none" stroke="url(#rim${id})" stroke-width="1.4"/>`
    + `<path d="${inner}" fill="none" stroke="${hsla(c, 0.6, -24)}" stroke-width="1"/>`
    + `</g>`
    + `<path d="${outer}" fill="none" stroke="${hsla(c, 0.45, 40)}" stroke-width="2" filter="url(#soft${id})"/>`
    // 内側
    + `<g clip-path="url(#cell${id})">`
    + plan.membranes.map((m, i) =>
        `<path d="${loopPath(m.pts)}" fill="${hsla(c, 0.12 + i * 0.07, 14 - i * 10)}" stroke="${hsla(c, 0.35, -14)}" stroke-width=".7"/>`).join('')
    + (glow ? `<ellipse cx="${C0}" cy="${C0}" rx="${n2(R * band.k * 0.9)}" ry="${n2(R * band.k * 0.9 * ratio)}" fill="url(#bio${id})" filter="url(#bloom${id})" style="mix-blend-mode:screen"/>` : '')
    + plan.organelles.map((o, i) => organelle(o, c, acc, i)).join('')
    + (glow ? plan.organelles.map(o => `<ellipse cx="${n2(o.cx)}" cy="${n2(o.cy)}" rx="${n2(o.rx * 2.1)}" ry="${n2(o.ry * 2.1)}" fill="${hsla(c, 0.3, 36)}" filter="url(#bloom${id})" style="mix-blend-mode:screen"/>`).join('') : '')
    + `<ellipse cx="${n2(nuc.cx)}" cy="${n2(nuc.cy)}" rx="${n2(nuc.rx)}" ry="${n2(nuc.ry)}" fill="url(#nucg${id})" stroke="${hsla(c, 0.8, -26)}" stroke-width="1"/>`
    + `<g clip-path="url(#nucc${id})">${nucPat}</g>`
    + `<ellipse cx="${n2(nuc.cx - nuc.rx * 0.3)}" cy="${n2(nuc.cy - nuc.ry * 0.3)}" rx="${n2(nuc.rx * 0.3)}" ry="${n2(nuc.ry * 0.24)}" fill="#fff" opacity=".16"/>`
    + `</g>`
    + `<g filter="url(#near${id})">${dust.join('')}</g>`      // 手前の粒
    + `<rect width="${VB}" height="${VB}" fill="url(#vig${id})"/>`
    + '</svg>';
}
