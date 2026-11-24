// 生き物の姿を SVG で描く（docs/art-bible.md 3「丸い塊をなめらかにつないだ体と、暗く一貫した輪郭線」）。
// 形は環境と系統の理由だけで決める。理由のない装飾は付けない。
// 描画なので Math.sin/cos を使ってよい（CLAUDE.md「描画側では使ってよい」）。乱数は使わず、系統の id から作る。
import { bodyFill, palette } from './palette.mjs';

const VB = 120; // viewBox の一辺
const C0 = VB / 2;

// 系統の id から作る、決まった小さな揺れ（-1〜1）。輪郭のゆがみだけに使う。
function wob(id, i) {
  const x = Math.sin((id * 12.9898 + i * 78.233) * 1.0) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n2 = v => Math.round(v * 100) / 100;

// 丸い塊をなめらかにつないだ閉じた輪郭。points は [角度, 半径] の列。
function blobPath(cx, cy, pts) {
  const xy = pts.map(([a, r]) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  let d = '';
  for (let i = 0; i < xy.length; i++) {
    const p = xy[i], q = xy[(i + 1) % xy.length];
    const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    d += i === 0 ? `M${n2(m[0])} ${n2(m[1])}` : '';
    const r = xy[(i + 1) % xy.length], s = xy[(i + 2) % xy.length];
    const m2 = [(r[0] + s[0]) / 2, (r[1] + s[1]) / 2];
    d += `Q${n2(q[0])} ${n2(q[1])} ${n2(m2[0])} ${n2(m2[1])}`;
  }
  return d + 'Z';
}

// 体の幅と高さ。重力が強いほど低く平たい（docs/art-bible.md 3、docs/creatures.md）。
function proportions(gravity) {
  const g = Math.min(2.4, Math.max(0.35, gravity || 1));
  const flat = 1 + (g - 1) * 0.45; // 重力1で1.0、2.4で約1.63
  return { w: 34 * flat, h: 34 / flat };
}

/* ---------- 体の型ごとの輪郭 ---------- */

function formShape(form, id, w, h) {
  const parts = [];
  if (form === 'seg') { // 体節型: 丸い節を並べる
    const n = 4, step = (w * 1.7) / n;
    for (let i = 0; i < n; i++) {
      const r = h * (0.52 - i * 0.055);
      parts.push({ el: 'ellipse', cx: C0 - w * 0.75 + step * i + step / 2, cy: C0 + wob(id, i) * 1.6, rx: r * 1.05, ry: r });
    }
  } else if (form === 'bell') { // 傘型: 丸い傘
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = Math.PI + (Math.PI * i) / 9;
      pts.push([a, (i === 0 || i === 9 ? w * 0.9 : w) * (1 + wob(id, i) * 0.05)]);
    }
    const xy = pts.map(([a, r]) => [C0 + Math.cos(a) * r, C0 + h * 0.3 + Math.sin(a) * r * 0.92]);
    let d = `M${n2(xy[0][0])} ${n2(xy[0][1])}`;
    for (let i = 1; i < xy.length; i++) d += `Q${n2(xy[i - 1][0] + (xy[i][0] - xy[i - 1][0]) * 0.5)} ${n2(xy[i][1] - 3)} ${n2(xy[i][0])} ${n2(xy[i][1])}`;
    parts.push({ el: 'path', d: d + 'Z' });
  } else if (form === 'radial') { // 放射腕: 中央の塊から腕が放射状に出る
    // 腕は体の型そのものなので、動く部分（触手など）を持たない系統でも必ず描く。
    // 先に腕を描き、あとから中央の塊を重ねて付け根を隠す。
    const arms = 4 + Math.floor(Math.abs(wob(id, 3)) * 4); // 4〜7本
    const rx = w * 0.6, ry = h * 0.6;
    for (let i = 0; i < arms; i++) {
      const a = (Math.PI * 2 * i) / arms + wob(id, i) * 0.1, sp = 0.3;
      const px = (ang, k) => C0 + Math.cos(ang) * rx * k, py = (ang, k) => C0 + Math.sin(ang) * ry * k;
      const tipX = px(a, 1.85), tipY = py(a, 1.85);
      parts.push({ el: 'path', d:
        `M${n2(px(a - sp, 0.95))} ${n2(py(a - sp, 0.95))}`
        + `Q${n2(px(a - sp * 0.7, 1.5))} ${n2(py(a - sp * 0.7, 1.5))} ${n2(tipX)} ${n2(tipY)}`
        + `Q${n2(px(a + sp * 0.7, 1.5))} ${n2(py(a + sp * 0.7, 1.5))} ${n2(px(a + sp, 0.95))} ${n2(py(a + sp, 0.95))}Z` });
    }
    parts.push({ el: 'ellipse', cx: C0, cy: C0, rx, ry });
  } else if (form === 'spore') { // 胞子型: 小さな丸と突起
    parts.push({ el: 'ellipse', cx: C0, cy: C0, rx: w * 0.52, ry: h * 0.52 });
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8 + wob(id, i) * 0.12;
      parts.push({ el: 'line', x1: C0 + Math.cos(a) * w * 0.5, y1: C0 + Math.sin(a) * h * 0.5, x2: C0 + Math.cos(a) * w * 0.78, y2: C0 + Math.sin(a) * h * 0.78 });
    }
  } else { // 不定形: ゆがんだ塊
    const pts = [];
    for (let i = 0; i < 9; i++) pts.push([(Math.PI * 2 * i) / 9, (w * 0.72) * (1 + wob(id, i) * 0.26)]);
    parts.push({ el: 'path', d: blobPath(C0, C0, pts) });
  }
  return parts;
}

/* ---------- 目、体の覆い、動く部分、模様 ---------- */

function eyes(look, w, h, ink) {
  if (!look.eyeKind || look.eyeKind === 'none' || !look.eyeN) return '';
  const n = Math.min(look.eyeN, 8), r = Math.max(1.6, look.eyeSize * h * 0.3);
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const x = C0 + (t - 0.5) * w * 0.9, y = C0 - h * 0.22 + (look.asym ? (i % 2) * 2.4 : 0);
    if (look.eyeKind === 'compound') { // 複眼: 小さな丸の集まり
      for (let k = 0; k < 4; k++) {
        const a = (Math.PI * 2 * k) / 4;
        out.push(`<circle cx="${n2(x + Math.cos(a) * r * 0.5)}" cy="${n2(y + Math.sin(a) * r * 0.5)}" r="${n2(r * 0.44)}" fill="${ink}" opacity="0.85"/>`);
      }
    } else { // レンズの目: 白目と瞳
      out.push(`<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(r)}" fill="#f2efe6" stroke="${ink}" stroke-width="1.1"/>`);
      out.push(`<circle cx="${n2(x + r * 0.18)}" cy="${n2(y)}" r="${n2(r * 0.46)}" fill="${ink}"/>`);
    }
  }
  return out.join('');
}

function cover(kind, w, h, ink) {
  if (kind === 'scale') { // うろこ: 小さな弧
    const out = [];
    for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
      const x = C0 - w * 0.5 + (col * w) / 3.4, y = C0 - h * 0.05 + row * h * 0.26;
      out.push(`<path d="M${n2(x)} ${n2(y)} q${n2(w * 0.11)} ${n2(-h * 0.1)} ${n2(w * 0.22)} 0" fill="none" stroke="${ink}" stroke-width="0.9" opacity="0.5"/>`);
    }
    return out.join('');
  }
  if (kind === 'fur') { // 毛: 短い線
    const out = [];
    for (let i = 0; i < 16; i++) {
      const a = (Math.PI * 2 * i) / 16;
      out.push(`<line x1="${n2(C0 + Math.cos(a) * w * 0.66)}" y1="${n2(C0 + Math.sin(a) * h * 0.66)}" x2="${n2(C0 + Math.cos(a) * w * 0.82)}" y2="${n2(C0 + Math.sin(a) * h * 0.82)}" stroke="${ink}" stroke-width="1" opacity="0.6" stroke-linecap="round"/>`);
    }
    return out.join('');
  }
  if (kind === 'shell') { // 殻: 厚い板を1枚かぶせる
    return `<path d="M${n2(C0 - w * 0.72)} ${n2(C0)} a${n2(w * 0.72)} ${n2(h * 0.74)} 0 0 1 ${n2(w * 1.44)} 0" fill="rgba(0,0,0,0.22)" stroke="${ink}" stroke-width="1.6"/>`;
  }
  return '';
}

function limbs(look, w, h, ink, fill) {
  const kind = look.limb, n = Math.min(look.limbN || 0, 10);
  if (!kind || kind === 'none' || !n) return '';
  const out = [];
  // 触手は体のまわりから放射状に出す（傘型と放射腕は下半分、ほかは全周）
  if (kind === 'tentacle') {
    const half = look.form === 'bell' || look.form === 'radial';
    const turn = (look.joint || 0) * 0.16;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const a = half ? Math.PI * (0.12 + t * 0.76) : Math.PI * 2 * (i / n) + Math.PI / 2;
      const bx = C0 + Math.cos(a) * w * 0.55, by = C0 + Math.sin(a) * h * 0.55;
      const ex = C0 + Math.cos(a + turn) * w * 1.15, ey = C0 + Math.sin(a + turn) * h * 1.2;
      const mx = C0 + Math.cos(a + turn * 2.2) * w * 0.95, my = C0 + Math.sin(a + turn * 2.2) * h * 0.86;
      out.push(`<path d="M${n2(bx)} ${n2(by)} Q${n2(mx)} ${n2(my)} ${n2(ex)} ${n2(ey)}" fill="none" stroke="${ink}" stroke-width="1.8" stroke-linecap="round" opacity="0.9"/>`);
    }
    return out.join('');
  }
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1, row = Math.floor(i / 2);
    const bx = C0 + side * w * 0.6, by = C0 - h * 0.1 + row * h * 0.3;
    if (kind === 'fin') {
      out.push(`<path d="M${n2(bx)} ${n2(by)} q${n2(side * w * 0.42)} ${n2(-h * 0.26)} ${n2(side * w * 0.5)} ${n2(h * 0.2)} q${n2(-side * w * 0.3)} ${n2(h * 0.04)} ${n2(-side * w * 0.5)} ${n2(-h * 0.2)}" fill="${fill}" stroke="${ink}" stroke-width="1.3" stroke-linejoin="round"/>`);
    } else if (kind === 'wing') {
      out.push(`<path d="M${n2(bx)} ${n2(by)} q${n2(side * w * 0.7)} ${n2(-h * 0.68)} ${n2(side * w * 0.92)} ${n2(-h * 0.06)} q${n2(-side * w * 0.44)} ${n2(h * 0.18)} ${n2(-side * w * 0.92)} ${n2(h * 0.06)}" fill="${fill}" stroke="${ink}" stroke-width="1.3" stroke-linejoin="round" opacity="0.92"/>`);
    } else if (kind === 'leg') { // 2段の関節。look.joint で向きがずれる
      const turn = (look.joint || 0) * 0.22;
      const kx = bx + side * w * 0.26, ky = by + h * 0.3;
      out.push(`<path d="M${n2(bx)} ${n2(by)} L${n2(kx)} ${n2(ky)} L${n2(kx + side * w * 0.1 + turn * 6)} ${n2(ky + h * 0.34)}" fill="none" stroke="${ink}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`);
    }
  }
  return out.join('');
}

function pattern(look, w, h, id, accent, clip) {
  const k = look.pattern;
  if (!k || k === 'plain') return '';
  const g = `clip-path="url(#${clip})"`;
  if (k === 'spots') {
    const out = [];
    for (let i = 0; i < 7; i++) out.push(`<circle cx="${n2(C0 + wob(id, i) * w * 0.6)}" cy="${n2(C0 + wob(id, i + 20) * h * 0.6)}" r="${n2(2 + Math.abs(wob(id, i + 40)) * 2.4)}" fill="${accent}" opacity="0.5"/>`);
    return `<g ${g}>${out.join('')}</g>`;
  }
  if (k === 'stripes') {
    const out = [];
    for (let i = -3; i <= 3; i++) out.push(`<line x1="${n2(C0 + i * 7 - 10)}" y1="${n2(C0 - h)}" x2="${n2(C0 + i * 7 + 10)}" y2="${n2(C0 + h)}" stroke="${accent}" stroke-width="2.6" opacity="0.4"/>`);
    return `<g ${g}>${out.join('')}</g>`;
  }
  if (k === 'bands') {
    const out = [];
    for (let i = -2; i <= 2; i++) out.push(`<rect x="${n2(C0 - w)}" y="${n2(C0 + i * h * 0.3 - 1.6)}" width="${n2(w * 2)}" height="3.2" fill="${accent}" opacity="0.38"/>`);
    return `<g ${g}>${out.join('')}</g>`;
  }
  return ''; // glow は輪郭の外に描く（下の glowLayer）
}

const glowLayer = (look, w, h, glow) => look.pattern === 'glow'
  ? `<ellipse cx="${C0}" cy="${C0}" rx="${n2(w * 1.05)}" ry="${n2(h * 1.05)}" fill="${glow}" opacity="0.16"/>` : '';

/* ---------- 1体ぶんの SVG ---------- */

// 体の大きさ（6段階）を絵の大きさに出す。目に見えない系統は小さく、とても大きい系統は枠いっぱいに。
const SIZE_SCALE = [0.46, 0.56, 0.68, 0.82, 0.93, 1];

// entry は engine/traits.mjs の bestiary() の1件。world は { star, gravity }。
export function creatureSVG(entry, world, { size = 120 } = {}) {
  const look = entry.look || {}, p = palette(world.star);
  const base = proportions(world.gravity);
  const k = SIZE_SCALE[entry.sizeStep ?? SIZE_SCALE.length - 1] ?? 1;
  const w = base.w * k, h = base.h * k;
  const fill = bodyFill(world.star, look, entry.color?.light ?? 0.5);
  const clip = `c${entry.id}`;
  const shape = formShape(look.form, entry.id, w, h);
  const body = shape.map(s => s.el === 'ellipse'
    ? `<ellipse cx="${n2(s.cx)}" cy="${n2(s.cy)}" rx="${n2(s.rx)}" ry="${n2(s.ry)}" fill="${fill}" stroke="${p.ink}" stroke-width="2"/>`
    : s.el === 'path' ? `<path d="${s.d}" fill="${fill}" stroke="${p.ink}" stroke-width="2" stroke-linejoin="round"/>`
    : `<line x1="${n2(s.x1)}" y1="${n2(s.y1)}" x2="${n2(s.x2)}" y2="${n2(s.y2)}" stroke="${p.ink}" stroke-width="1.8" stroke-linecap="round"/>`).join('');
  const clipShape = shape.filter(s => s.el !== 'line').map(s => s.el === 'ellipse'
    ? `<ellipse cx="${n2(s.cx)}" cy="${n2(s.cy)}" rx="${n2(s.rx)}" ry="${n2(s.ry)}"/>` : `<path d="${s.d}"/>`).join('');
  return `<svg viewBox="0 0 ${VB} ${VB}" width="${size}" height="${size}" role="img" aria-label="${esc(entry.text || '生き物')}">`
    + `<defs><clipPath id="${clip}">${clipShape}</clipPath></defs>`
    + glowLayer(look, w, h, p.glow)
    + limbs(look, w, h, p.ink, fill)
    + body
    + pattern(look, w, h, entry.id, p.accent, clip)
    + cover(look.cover, w, h, p.ink)
    + eyes(look, w, h, p.ink)
    + '</svg>';
}
