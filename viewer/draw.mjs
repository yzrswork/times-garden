// 体の設計図（viewer/plan.mjs）を SVG にする。
//
// このファイルは形質を解釈しない。腕の本数も目の位置も設計図が決めている。
// あとで3Dを作るときも同じ設計図を読むので、形質の解釈は二重に書かない。
//
// 1枚のカードを小さなジオラマとして描く: 恒星の色に染まった空、住む場所の層、生き物、ビネット。
// 平らな塗りと黒い輪郭にしない。体はグラデーションで厚みを出し、縁は光の当たる側を明るく、
// 影の側を暗くする（リムライト）。発光は加算で、暗いところでだけ目立たせる（docs/art-bible.md）。
// 場面の部品は rect / circle / ellipse だけで描き、path は生き物にだけ使う。
import { hsl, hsla, scene, LIGHT } from './palette.mjs';
import { bodyPlan, wob, VB, C0 } from './plan.mjs';

export const FORMS = ['blob', 'seg', 'bell', 'radial', 'spore'];
export const EYE_KINDS = ['none', 'lens', 'compound'];
export const COVERS = ['bare', 'shell', 'scale', 'fur'];
export const LIMBS = ['none', 'fin', 'leg', 'wing', 'tentacle'];
export const PATTERNS = ['plain', 'spots', 'stripes', 'bands', 'glow'];

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n2 = v => Math.round(v * 100) / 100;
const P = p => `${n2(p[0])} ${n2(p[1])}`;

/* ---------- 設計図の部品を SVG の形にする ---------- */

// 点を滑らかにつないだ閉じた輪郭。
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

function domePath(s) {
  const pts = s.pts;
  let d = `M${P(pts[0])}`;
  for (let i = 1; i < pts.length; i++)
    d += `Q${n2((pts[i - 1][0] + pts[i][0]) / 2)} ${n2(pts[i][1] - s.apexDrop)} ${P(pts[i])}`;
  return d + `Q${P(s.skirt)} ${P(pts[0])}Z`;
}

const spikePath = s => s.straight
  ? `M${P(s.base)}L${P(s.tip)}L${P(s.end)}Z`
  : `M${P(s.base)}Q${P(s.mid)} ${P(s.tip)}Q${P(s.mid2)} ${P(s.end)}Z`;

// 塗る形の輪郭（属性を付ける前まで）。
function openTag(s) {
  if (s.type === 'ellipsoid') return `<ellipse cx="${n2(s.cx)}" cy="${n2(s.cy)}" rx="${n2(s.rx)}" ry="${n2(s.ry)}"`;
  const d = s.type === 'loop' ? loopPath(s.pts) : s.type === 'dome' ? domePath(s) : spikePath(s);
  return `<path d="${d}"`;
}

// 根元から先へ細くなる紐。1本を数本の線分に割り、太さを変えていく。
function strand(s, stroke, opacity) {
  const out = [];
  for (let i = 0; i < s.pts.length - 1; i++) {
    const t = s.pts.length <= 2 ? 0 : i / (s.pts.length - 2);
    out.push(`<line x1="${n2(s.pts[i][0])}" y1="${n2(s.pts[i][1])}" x2="${n2(s.pts[i + 1][0])}" y2="${n2(s.pts[i + 1][1])}"`
      + ` stroke="${stroke}" stroke-width="${n2(s.w0 + (s.w1 - s.w0) * t)}" stroke-linecap="round" opacity="${opacity}"/>`);
  }
  return out.join('');
}

const membrane = (s, c, back) =>
  `<path d="M${P(s.base)}Q${P(s.ctrl1)} ${P(s.far)}Q${P(s.ctrl2)} ${P(s.end)}Z"`
  + ` fill="${hsla(c, back ? 0.45 : 0.7, back ? -18 : 6)}" stroke="${hsl(c, -22)}" stroke-width="1" stroke-linejoin="round"/>`;

function limbSVG(plan, layer) {
  const c = plan.color, lit = hsl(c, 14), dim = hsl(c, -26, 4);
  return plan.limbs.filter(s => s.layer === layer).map(s => s.type === 'membrane'
    ? membrane(s, c, layer === 'back')
    : strand(s, layer === 'back' ? dim : lit, layer === 'back' ? (s.w0 > 3.2 ? 0.8 : 0.75) : 1)).join('');
}

/* ---------- 目、体の覆い、模様 ---------- */

function eyesSVG(plan) {
  const c = plan.color;
  return plan.eyes.map(e => {
    const { x, y, r } = e;
    if (e.kind === 'compound') { // 複眼: 小さな面の集まり
      const out = [];
      for (let k = 0; k < 7; k++) {
        const a = (Math.PI * 2 * k) / 6, rr = k === 6 ? 0 : r * 0.52;
        out.push(`<circle cx="${n2(x + Math.cos(a) * rr)}" cy="${n2(y + Math.sin(a) * rr)}" r="${n2(r * 0.4)}" fill="${hsl(c, -30, 10, -10)}" opacity=".92"/>`);
      }
      out.push(`<circle cx="${n2(x - r * 0.3)}" cy="${n2(y - r * 0.35)}" r="${n2(r * 0.22)}" fill="#fff" opacity=".5"/>`);
      return out.join('');
    }
    return `<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(r)}" fill="#f4f1e8"/>`
      + `<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(r)}" fill="none" stroke="${hsl(c, -34)}" stroke-width=".9" opacity=".8"/>`
      + `<circle cx="${n2(x + r * 0.16)}" cy="${n2(y + r * 0.06)}" r="${n2(r * 0.46)}" fill="#141019"/>`
      + `<circle cx="${n2(x - r * 0.26)}" cy="${n2(y - r * 0.3)}" r="${n2(r * 0.24)}" fill="#fff" opacity=".9"/>`;
  }).join('');
}

function coverSVG(plan) {
  const { cover: kind, w, h, color: c } = plan;
  if (kind === 'scale') {
    const out = [];
    for (let row = 0; row < 4; row++) for (let col = 0; col < 5; col++) {
      const x = C0 - w * 0.56 + (col * w * 1.12) / 4.5, y = C0 - h * 0.3 + row * h * 0.22;
      out.push(`<path d="M${n2(x)} ${n2(y)}q${n2(w * 0.1)} ${n2(-h * 0.1)} ${n2(w * 0.2)} 0" fill="none" stroke="${hsl(c, -26)}" stroke-width=".8" opacity=".55"/>`);
    }
    return out.join('');
  }
  if (kind === 'fur') {
    const out = [];
    for (let i = 0; i < 26; i++) {
      const a = (Math.PI * 2 * i) / 26, k = 1.16 + Math.abs(wob(0, i)) * 0.1;
      out.push(`<line x1="${n2(C0 + Math.cos(a) * w * 0.62)}" y1="${n2(C0 + Math.sin(a) * h * 0.62)}" x2="${n2(C0 + Math.cos(a) * w * 0.62 * k)}" y2="${n2(C0 + Math.sin(a) * h * 0.62 * k)}" stroke="${hsl(c, 6)}" stroke-width=".9" stroke-linecap="round" opacity=".7"/>`);
    }
    return out.join('');
  }
  if (kind === 'shell') { // 殻: 厚い板と、そこに乗る反射
    return `<path d="M${n2(C0 - w * 0.68)} ${n2(C0 + h * 0.04)}a${n2(w * 0.68)} ${n2(h * 0.72)} 0 0 1 ${n2(w * 1.36)} 0Z" fill="${hsla(c, 0.55, -14, 6)}" stroke="${hsl(c, -30)}" stroke-width="1.4" stroke-linejoin="round"/>`
      + `<path d="M${n2(C0 - w * 0.5)} ${n2(C0 - h * 0.1)}a${n2(w * 0.5)} ${n2(h * 0.5)} 0 0 1 ${n2(w * 0.62)} ${n2(-h * 0.12)}" fill="none" stroke="#fff" stroke-width="1.1" opacity=".22"/>`;
  }
  return '';
}

function patternSVG(plan, clip) {
  const { pattern: k, w, h, id, color: c } = plan;
  if (!k || k === 'plain' || k === 'glow') return '';
  const col = hsla(c, 0.5, -22, 10, 14), out = [];
  if (k === 'spots') for (let i = 0; i < 9; i++)
    out.push(`<circle cx="${n2(C0 + wob(id, i) * w * 0.58)}" cy="${n2(C0 + wob(id, i + 20) * h * 0.58)}" r="${n2(1.8 + Math.abs(wob(id, i + 40)) * 2.6)}" fill="${col}"/>`);
  if (k === 'stripes') for (let i = -4; i <= 4; i++)
    out.push(`<line x1="${n2(C0 + i * 6.5 - 12)}" y1="${n2(C0 - h)}" x2="${n2(C0 + i * 6.5 + 12)}" y2="${n2(C0 + h)}" stroke="${col}" stroke-width="3.2"/>`);
  if (k === 'bands') for (let i = -2; i <= 2; i++)
    out.push(`<rect x="${n2(C0 - w)}" y="${n2(C0 + i * h * 0.28 - 1.8)}" width="${n2(w * 2)}" height="3.6" fill="${col}"/>`);
  return `<g clip-path="url(#${clip})">${out.join('')}</g>`;
}

/* ---------- 場面 ---------- */

function sceneSVG(plan, S) {
  const id = plan.id;
  const out = [`<rect width="${VB}" height="${VB}" fill="url(#sky${id})"/>`];
  if (!plan.deep) out.push(`<circle cx="${VB * 0.82}" cy="${VB * 0.16}" r="${VB * 0.42}" fill="url(#star${id})"/>`);
  if (!plan.land) out.push(`<rect width="${VB}" height="${VB}" fill="url(#water${id})"/>`);
  if (plan.land) out.push(`<rect y="${n2(VB * 0.78)}" width="${VB}" height="${n2(VB * 0.22)}" fill="url(#ground${id})"/>`);
  for (let i = 0; i < 7; i++) {
    const x = ((wob(id, i + 60) + 1) / 2) * VB, y = ((wob(id, i + 80) + 1) / 2) * VB;
    out.push(`<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(0.5 + Math.abs(wob(id, i + 90)) * 0.7)}" fill="${S.haze}" opacity=".3"/>`);
  }
  return out.join('');
}

/* ---------- 1体ぶんの SVG ---------- */

// entry は engine/traits.mjs の bestiary() の1件。world は { star, gravity }。
export function creatureSVG(entry, world, { size = 120 } = {}) {
  const plan = bodyPlan(entry, world);
  const { id, w, h, color: c } = plan;
  const S = scene(world.star, entry.look?.depth);
  const clip = `cl${id}`;
  const fillArgs = ` fill="url(#vol${id})" fill-opacity="${plan.soft ? 0.88 : 1}" stroke="url(#rim${id})" stroke-width="2" stroke-linejoin="round"/>`;

  const defs = `<defs>`
    + `<linearGradient id="sky${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${S.sky0}"/><stop offset="1" stop-color="${S.sky1}"/></linearGradient>`
    + `<radialGradient id="star${id}"><stop offset="0" stop-color="${S.star}" stop-opacity=".5"/><stop offset=".45" stop-color="${S.star}" stop-opacity=".12"/><stop offset="1" stop-color="${S.star}" stop-opacity="0"/></radialGradient>`
    + `<linearGradient id="water${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${S.haze}" stop-opacity=".1"/><stop offset="1" stop-color="${S.ink}" stop-opacity=".5"/></linearGradient>`
    + `<linearGradient id="ground${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${S.ground}"/><stop offset="1" stop-color="${S.ink}"/></linearGradient>`
    + `<radialGradient id="vol${id}" cx="${n2(50 + LIGHT.x * 42)}%" cy="${n2(50 + LIGHT.y * 42)}%" r="86%">`
    + `<stop offset="0" stop-color="${hsl(c, 22, -6, 8)}"/><stop offset=".48" stop-color="${hsl(c, 1)}"/><stop offset="1" stop-color="${hsl(c, -26, 6, -8)}"/></radialGradient>`
    + `<linearGradient id="rim${id}" x1="14%" y1="4%" x2="82%" y2="98%">`
    + `<stop offset="0" stop-color="${hsl(c, 30, -4, 6)}"/><stop offset=".4" stop-color="${hsl(c, -16)}"/><stop offset="1" stop-color="${hsl(c, -32, 4, -6)}"/></linearGradient>`
    + `<radialGradient id="vig${id}"><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></radialGradient>`
    + (plan.glowing ? `<radialGradient id="glow${id}"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".3" stop-color="${S.accent}" stop-opacity=".4"/><stop offset="1" stop-color="${S.accent}" stop-opacity="0"/></radialGradient>` : '')
    + `<clipPath id="${clip}">${plan.body.map(s => openTag(s) + '/>').join('')}</clipPath>`
    + `</defs>`;

  return `<svg viewBox="0 0 ${VB} ${VB}" width="${size}" height="${size}" role="img" aria-label="${esc(entry.text || '生き物')}">`
    + defs
    + sceneSVG(plan, S)
    + (plan.glowing ? `<ellipse cx="${C0}" cy="${C0}" rx="${n2(w * 1.5)}" ry="${n2(h * 1.5)}" fill="url(#glow${id})" style="mix-blend-mode:screen"/>` : '')
    + (plan.land ? `<ellipse cx="${C0}" cy="${n2(VB * 0.8)}" rx="${n2(w * 0.8)}" ry="${n2(h * 0.14)}" fill="#000" opacity=".3"/>` : '')
    + plan.back.map(s => openTag(s) + ` fill="${hsl(c, -24, 4)}" stroke="none"/>`).join('')
    + limbSVG(plan, 'back')
    + plan.body.map(s => openTag(s) + fillArgs).join('')
    + patternSVG(plan, clip)
    + coverSVG(plan)
    + limbSVG(plan, 'front')
    + eyesSVG(plan)
    + `<rect width="${VB}" height="${VB}" fill="url(#vig${id})"/>`
    + '</svg>';
}
