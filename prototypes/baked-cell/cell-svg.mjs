// 試作08: 単細胞を顕微鏡で覗いた高密度な静止画を SVG で描く。
//
// 焼く（画像にする）前提なので、スマホでは重くて使えない手（ぼかし、ゆがみ、粒）を使ってよい。
// 計算コストは GitHub Actions が1回だけ払い、スマホは画像を1枚置くだけになる。これが試作08の仮説。
//
// 形質の解釈はしない。本番の viewer/plan.mjs の cellPlan() が作る設計図を読むだけ。
import { cellPlan, VB, C0 } from '../../viewer/plan.mjs';
import { hsl, hsla, palette, LIGHT } from '../../viewer/palette.mjs';

const n2 = v => Math.round(v * 100) / 100;
const P = p => `${n2(p[0])} ${n2(p[1])}`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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

// 内部器官。共有の部品3種を組み合わせるだけ
function organelle(o, c, i) {
  const g = `translate(${n2(o.cx)} ${n2(o.cy)})`;
  if (o.kind === 'vacuole') // 液胞: 中が抜けた丸
    return `<g transform="${g}"><ellipse rx="${n2(o.rx)}" ry="${n2(o.ry)}" fill="${hsla(c, 0.3, 16)}" stroke="${hsla(c, 0.6, -14)}" stroke-width=".7"/>`
      + `<ellipse cx="${n2(-o.rx * 0.3)}" cy="${n2(-o.ry * 0.3)}" rx="${n2(o.rx * 0.3)}" ry="${n2(o.ry * 0.28)}" fill="#fff" opacity=".2"/></g>`;
  if (o.kind === 'grain') { // 顆粒: 小さな粒の群れ
    const out = [];
    for (let k = 0; k < 7; k++) {
      const a = (Math.PI * 2 * k) / 7 + i;
      out.push(`<circle cx="${n2(Math.cos(a) * o.rx * 0.7)}" cy="${n2(Math.sin(a) * o.ry * 0.7)}" r="${n2(o.rx * 0.26)}" fill="${hsla(c, 0.75, -20, 10)}"/>`);
    }
    return `<g transform="${g}">${out.join('')}</g>`;
  }
  // コイル: 巻いた器官
  let d = `M${n2(-o.rx)} 0`;
  for (let k = 1; k <= 14; k++) {
    const t = k / 14, a = t * Math.PI * 3.2, r = o.rx * (1 - t * 0.8);
    d += `L${n2(Math.cos(a) * r)} ${n2(Math.sin(a) * r * (o.ry / o.rx))}`;
  }
  return `<g transform="${g}"><path d="${d}" fill="none" stroke="${hsla(c, 0.7, -8, 8)}" stroke-width="${n2(o.rx * 0.3)}" stroke-linecap="round" stroke-linejoin="round"/></g>`;
}

// entry は engine/traits.mjs の bestiary() の1件。world は { star, gravity }。
export function cellSVG(entry, world, { size = 360, fill = 0.8 } = {}) {
  const plan = cellPlan(entry, world, { fill });
  const { id, color: c, R, ratio } = plan;
  const p = palette(world.star);
  const outer = loopPath(plan.membranes[0].pts);
  const glow = plan.pattern === 'glow';

  const defs = `<defs>`
    // 顕微鏡の視野: 中央が明るく、周りへ落ちる
    + `<radialGradient id="field${id}"><stop offset="0" stop-color="${hsla({ ...c, l: 58 }, 0.5, 0, -14)}"/>`
    + `<stop offset=".55" stop-color="${p.panel}"/><stop offset="1" stop-color="${p.bg}"/></radialGradient>`
    // 細胞質: 光の向きに厚みが出る
    + `<radialGradient id="cyto${id}" cx="${n2(50 + LIGHT.x * 34)}%" cy="${n2(50 + LIGHT.y * 34)}%" r="78%">`
    + `<stop offset="0" stop-color="${hsl(c, 26, -8, 8)}"/><stop offset=".5" stop-color="${hsl(c, 4)}"/>`
    + `<stop offset="1" stop-color="${hsl(c, -22, 6, -8)}"/></radialGradient>`
    + `<radialGradient id="nuc${id}" cx="36%" cy="30%" r="76%">`
    + `<stop offset="0" stop-color="${hsl(c, 18, 6, 14)}"/><stop offset=".6" stop-color="${hsl(c, -6, 10, 10)}"/>`
    + `<stop offset="1" stop-color="${hsl(c, -28, 14, 4)}"/></radialGradient>`
    // 膜の縁: 光が回り込んで光る（顕微鏡の屈折）
    + `<linearGradient id="rim${id}" x1="12%" y1="2%" x2="86%" y2="98%">`
    + `<stop offset="0" stop-color="${hsl(c, 38, -6, 6)}"/><stop offset=".45" stop-color="${hsl(c, -4)}"/>`
    + `<stop offset="1" stop-color="${hsl(c, -30, 4, -6)}"/></linearGradient>`
    // 焼く前提なので重い手を使う: 膜の表面の粒と、わずかなゆがみ
    + `<filter id="grain${id}" x="-20%" y="-20%" width="140%" height="140%">`
    + `<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="${id % 100}" result="n"/>`
    + `<feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" xChannelSelector="R" yChannelSelector="G"/></filter>`
    + `<filter id="soft${id}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.4"/></filter>`
    + `<filter id="bokeh${id}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="1.8"/></filter>`
    + (glow ? `<filter id="bloom${id}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="4"/></filter>` : '')
    + `<radialGradient id="vig${id}"><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".62"/></radialGradient>`
    + `<clipPath id="cell${id}"><path d="${outer}"/></clipPath>`
    + `<clipPath id="nucc${id}"><ellipse cx="${n2(plan.nucleus.cx)}" cy="${n2(plan.nucleus.cy)}" rx="${n2(plan.nucleus.rx)}" ry="${n2(plan.nucleus.ry)}"/></clipPath>`
    + `</defs>`;

  // ピントの外のもの（顕微鏡らしさ）
  const bokeh = [];
  for (let i = 0; i < 9; i++) {
    const a = (Math.PI * 2 * i) / 9 + id * 0.3, r = VB * (0.3 + ((i * 7) % 5) * 0.06);
    bokeh.push(`<circle cx="${n2(C0 + Math.cos(a) * r)}" cy="${n2(C0 + Math.sin(a) * r)}" r="${n2(1.6 + (i % 4) * 1.1)}" fill="${hsla({ ...c, l: 70 }, 0.16)}" filter="url(#bokeh${id})"/>`);
  }

  // 繊毛: 縁に沿って並ぶ細い毛
  const cilia = plan.cilia.map((s, i) =>
    `<path d="M${P(s.base)}Q${n2((s.base[0] + s.tip[0]) / 2 + Math.sin(i) * 1.2)} ${n2((s.base[1] + s.tip[1]) / 2)} ${P(s.tip)}"`
    + ` fill="none" stroke="${hsla(c, 0.62, 14)}" stroke-width=".55" stroke-linecap="round"/>`).join('');

  // 偽足: 外へ張り出す（いまの決まりでは単細胞に asym は出ないので、ふつうは0本）
  const pods = plan.pseudopods.map(s =>
    `<path d="M${P(s.base)}Q${P(s.ctrl)} ${P(s.tip)}" fill="none" stroke="url(#cyto${id})" stroke-width="${n2(s.half * 2)}" stroke-linecap="round" opacity=".92"/>`).join('');

  // しまは塗りではなく構造として、膜と核をまたぐ帯で出す
  const stripes = plan.stripes.map(s =>
    `<rect x="0" y="${n2(s.y - s.w / 2)}" width="${VB}" height="${n2(s.w)}" fill="${hsla(c, 0.3, -24, 10, 12)}"/>`
    + `<rect x="0" y="${n2(s.y - s.w / 2)}" width="${VB}" height="${n2(s.w * 0.3)}" fill="${hsla(c, 0.22, 24)}"/>`).join('');

  const nuc = plan.nucleus;
  const nucBands = [];
  for (let i = 0; i < nuc.bands; i++) {
    const y = nuc.cy + ((i + 0.5) / nuc.bands - 0.5) * 2 * nuc.ry;
    nucBands.push(`<rect x="${n2(nuc.cx - nuc.rx * 1.1)}" y="${n2(y - nuc.ry * 0.08)}" width="${n2(nuc.rx * 2.2)}" height="${n2(nuc.ry * 0.16)}" fill="${hsla(c, 0.38, -26, 12, 10)}"/>`);
    nucBands.push(`<rect x="${n2(nuc.cx - nuc.rx * 1.1)}" y="${n2(y - nuc.ry * 0.08)}" width="${n2(nuc.rx * 2.2)}" height="${n2(nuc.ry * 0.05)}" fill="${hsla(c, 0.28, 22)}"/>`);
  }

  return `<svg viewBox="0 0 ${VB} ${VB}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(entry.text || '生き物')}">`
    + defs
    + `<rect width="${VB}" height="${VB}" fill="url(#field${id})"/>`
    + bokeh.join('')
    + (glow ? `<ellipse cx="${C0}" cy="${C0}" rx="${n2(R * 1.3)}" ry="${n2(R * 1.3 * ratio)}" fill="${hsla(c, 0.5, 26)}" filter="url(#bloom${id})"/>` : '')
    + pods
    + cilia
    // 外膜（表面に粒とゆがみ）
    + `<g filter="url(#grain${id})">`
    + `<path d="${outer}" fill="url(#cyto${id})" fill-opacity=".92" stroke="url(#rim${id})" stroke-width="1.6"/>`
    + `</g>`
    // 屈折のにじみ
    + `<path d="${outer}" fill="none" stroke="${hsla(c, 0.5, 34)}" stroke-width="2.2" filter="url(#soft${id})"/>`
    + `<g clip-path="url(#cell${id})">`
    + stripes
    // 内側の膜2層。内側が透けて見える
    + plan.membranes.slice(1).map((m, i) =>
        `<path d="${loopPath(m.pts)}" fill="${hsla(c, 0.16 + i * 0.08, 10 - i * 8)}" stroke="${hsla(c, 0.4, -10)}" stroke-width=".8"/>`).join('')
    + plan.organelles.map((o, i) => organelle(o, c, i)).join('')
    // 核。帯が核の上も走る
    + `<ellipse cx="${n2(nuc.cx)}" cy="${n2(nuc.cy)}" rx="${n2(nuc.rx)}" ry="${n2(nuc.ry)}" fill="url(#nuc${id})" stroke="${hsla(c, 0.7, -22)}" stroke-width="1.1"/>`
    + `<g clip-path="url(#nucc${id})">${nucBands.join('')}</g>`
    + `<ellipse cx="${n2(nuc.cx - nuc.rx * 0.22)}" cy="${n2(nuc.cy - nuc.ry * 0.2)}" rx="${n2(nuc.rx * 0.26)}" ry="${n2(nuc.ry * 0.24)}" fill="${hsla(c, 0.55, -30, 14)}"/>`
    + `<ellipse cx="${n2(nuc.cx - nuc.rx * 0.34)}" cy="${n2(nuc.cy - nuc.ry * 0.34)}" rx="${n2(nuc.rx * 0.3)}" ry="${n2(nuc.ry * 0.22)}" fill="#fff" opacity=".13"/>`
    + `</g>`
    + `<rect width="${VB}" height="${VB}" fill="url(#vig${id})"/>`
    + '</svg>';
}
