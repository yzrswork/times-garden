// 生き物の姿を SVG で描く（docs/art-bible.md）。
// 1枚のカードを小さなジオラマとして描く: 恒星の色に染まった空、住む場所の層、生き物、ビネット。
// 平らな塗りと黒い輪郭にしない。体はグラデーションで厚みを出し、縁は光の当たる側を明るく、
// 影の側を暗くする（リムライト）。発光は加算で、暗いところでだけ目立たせる。
//
// 形は環境と系統の理由だけで決める。理由のない装飾は付けない（アートバイブル3）。
// 描画なので Math.sin/cos を使ってよい（CLAUDE.md「描画側では使ってよい」）。乱数は使わず系統の id から作る。
// 場面の部品は rect / circle / ellipse だけで描き、path は生き物にだけ使う。
import { bodyHSL, hsl, hsla, palette, scene, LIGHT } from './palette.mjs';

const VB = 120;
const C0 = VB / 2;

export const FORMS = ['blob', 'seg', 'bell', 'radial', 'spore'];
export const EYE_KINDS = ['none', 'lens', 'compound'];
export const COVERS = ['bare', 'shell', 'scale', 'fur'];
export const LIMBS = ['none', 'fin', 'leg', 'wing', 'tentacle'];
export const PATTERNS = ['plain', 'spots', 'stripes', 'bands', 'glow'];

// 系統の id から作る、決まった小さな揺れ（-1〜1）。輪郭のゆがみと配置にだけ使う。
function wob(id, i) {
  const x = Math.sin((id * 12.9898 + i * 78.233) * 1.0) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n2 = v => Math.round(v * 100) / 100;

/* ---------- 体の輪郭 ---------- */

// 丸い塊をなめらかにつないだ閉じた輪郭。pts は [角度, 半径] の列。
function blobPath(cx, cy, pts, sy = 1) {
  const xy = pts.map(([a, r]) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r * sy]);
  let d = '';
  for (let i = 0; i < xy.length; i++) {
    const q = xy[(i + 1) % xy.length], r = xy[(i + 2) % xy.length];
    const m1 = [(xy[i][0] + q[0]) / 2, (xy[i][1] + q[1]) / 2];
    const m2 = [(q[0] + r[0]) / 2, (q[1] + r[1]) / 2];
    d += (i === 0 ? `M${n2(m1[0])} ${n2(m1[1])}` : '') + `Q${n2(q[0])} ${n2(q[1])} ${n2(m2[0])} ${n2(m2[1])}`;
  }
  return d + 'Z';
}

// 重力が強いほど低く平たい（アートバイブル3「形は環境の理由で決める」）。
function proportions(gravity) {
  const g = Math.min(2.4, Math.max(0.35, gravity || 1));
  const flat = 1 + (g - 1) * 0.45;
  return { w: 32 * flat, h: 32 / flat };
}

// 体の大きさ（6段階）を絵の大きさに出す。
const SIZE_SCALE = [0.44, 0.55, 0.68, 0.82, 0.93, 1];

// 体の型ごとの輪郭。body は塗る形、back は体の後ろに描く付属器。
function formShape(form, id, w, h) {
  const body = [], back = [];
  if (form === 'seg') { // 体節型: 丸い節が前から後ろへ細くなる
    const n = 5, step = (w * 1.7) / n;
    for (let i = 0; i < n; i++) {
      const k = 1 - i * 0.12;
      body.push({ el: 'ellipse', cx: C0 - w * 0.78 + step * i + step * 0.6, cy: C0 + wob(id, i) * 1.4, rx: h * 0.5 * k * 1.08, ry: h * 0.5 * k });
    }
  } else if (form === 'bell') { // 傘型: 波打つ縁のドーム
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, a = Math.PI + Math.PI * t;
      pts.push([a, w * (0.96 + Math.sin(t * Math.PI * 3) * 0.045 + wob(id, i) * 0.03)]);
    }
    const xy = pts.map(([a, r]) => [C0 + Math.cos(a) * r, C0 + h * 0.26 + Math.sin(a) * r * 0.86]);
    let d = `M${n2(xy[0][0])} ${n2(xy[0][1])}`;
    for (let i = 1; i < xy.length; i++) d += `Q${n2((xy[i - 1][0] + xy[i][0]) / 2)} ${n2(xy[i][1] - h * 0.1)} ${n2(xy[i][0])} ${n2(xy[i][1])}`;
    body.push({ el: 'path', d: d + `Q${n2(C0)} ${n2(C0 + h * 0.5)} ${n2(xy[0][0])} ${n2(xy[0][1])}Z`, soft: true });
  } else if (form === 'radial') { // 放射腕: 中央の塊から腕が放射状に出る（型そのものなので必ず描く）
    const arms = 4 + Math.floor(Math.abs(wob(id, 3)) * 4);
    const rx = w * 0.58, ry = h * 0.58;
    for (let i = 0; i < arms; i++) {
      const a = (Math.PI * 2 * i) / arms + wob(id, i) * 0.1, sp = 0.3;
      const px = (g, k) => C0 + Math.cos(g) * rx * k, py = (g, k) => C0 + Math.sin(g) * ry * k;
      body.push({ el: 'path', d:
        `M${n2(px(a - sp, 0.95))} ${n2(py(a - sp, 0.95))}`
        + `Q${n2(px(a - sp * 0.6, 1.55))} ${n2(py(a - sp * 0.6, 1.55))} ${n2(px(a, 1.95))} ${n2(py(a, 1.95))}`
        + `Q${n2(px(a + sp * 0.6, 1.55))} ${n2(py(a + sp * 0.6, 1.55))} ${n2(px(a + sp, 0.95))} ${n2(py(a + sp, 0.95))}Z` });
    }
    body.push({ el: 'ellipse', cx: C0, cy: C0, rx, ry });
  } else if (form === 'spore') { // 胞子型: 小さな丸と、先の細い突起
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + wob(id, i) * 0.1, sp = 0.1;
      const px = (g, k) => C0 + Math.cos(g) * w * 0.48 * k, py = (g, k) => C0 + Math.sin(g) * h * 0.48 * k;
      back.push({ el: 'path', d:
        `M${n2(px(a - sp, 0.9))} ${n2(py(a - sp, 0.9))}L${n2(px(a, 1.9))} ${n2(py(a, 1.9))}`
        + `L${n2(px(a + sp, 0.9))} ${n2(py(a + sp, 0.9))}Z` });
    }
    body.push({ el: 'ellipse', cx: C0, cy: C0, rx: w * 0.5, ry: h * 0.5 });
  } else { // 不定形: ゆがんだやわらかい塊
    const pts = [];
    for (let i = 0; i < 11; i++) pts.push([(Math.PI * 2 * i) / 11, (w * 0.7) * (1 + wob(id, i) * 0.24)]);
    body.push({ el: 'path', d: blobPath(C0, C0, pts, h / w), soft: true });
  }
  return { body, back };
}

/* ---------- 付属器（先が細くなる曲線） ---------- */

// 根元から先へ細くなる線。1本を数本の線分に割り、太さを変えていく。
function taper(pts, w0, w1, stroke, opacity = 1) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const t = pts.length <= 2 ? 0 : i / (pts.length - 2);
    out.push(`<line x1="${n2(pts[i][0])}" y1="${n2(pts[i][1])}" x2="${n2(pts[i + 1][0])}" y2="${n2(pts[i + 1][1])}"`
      + ` stroke="${stroke}" stroke-width="${n2(w0 + (w1 - w0) * t)}" stroke-linecap="round" opacity="${opacity}"/>`);
  }
  return out.join('');
}

// 根元 (x,y) から角度 ang へ、少しずつ曲がりながら伸びる列。
function chain(x, y, ang, len, bend, n = 5) {
  const pts = [[x, y]];
  let a = ang;
  for (let i = 0; i < n; i++) { a += bend; x += Math.cos(a) * len; y += Math.sin(a) * len; pts.push([x, y]); }
  return pts;
}

function limbs(look, w, h, id, c) {
  const kind = look.limb, n = Math.min(look.limbN || 0, 10);
  if (!kind || kind === 'none' || !n) return { back: '', front: '' };
  const lit = hsl(c, 14), dim = hsl(c, -26, 4);
  const back = [], front = [];
  if (kind === 'tentacle') { // 体のまわりから垂れて流れる
    const half = look.form === 'bell' || look.form === 'radial';
    const turn = (look.joint || 0) * 0.04;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const a = half ? Math.PI * (0.1 + t * 0.8) : Math.PI * 2 * (i / n) + Math.PI / 2;
      const len = h * (0.26 + Math.abs(wob(id, i + 7)) * 0.14);
      const pts = chain(C0 + Math.cos(a) * w * 0.5, C0 + Math.sin(a) * h * 0.5, a, len, turn + wob(id, i) * 0.14, 5);
      (i % 2 ? back : front).push(taper(pts, 3.1, 0.9, i % 2 ? dim : lit, i % 2 ? 0.75 : 1));
    }
  } else {
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1, row = Math.floor(i / 2);
      const bx = C0 + side * w * 0.5, by = C0 - h * 0.12 + row * h * 0.26;
      if (kind === 'fin' || kind === 'wing') { // ひれと翼: 透ける膜
        const reach = kind === 'wing' ? 1.0 : 0.62, drop = kind === 'wing' ? -0.5 : -0.18;
        const d = `M${n2(bx)} ${n2(by)}Q${n2(bx + side * w * reach * 0.7)} ${n2(by + h * drop)} ${n2(bx + side * w * reach)} ${n2(by + h * 0.22)}`
          + `Q${n2(bx + side * w * reach * 0.42)} ${n2(by + h * 0.3)} ${n2(bx)} ${n2(by + h * 0.12)}Z`;
        (i % 2 ? back : front).push(`<path d="${d}" fill="${hsla(c, i % 2 ? 0.45 : 0.7, i % 2 ? -18 : 6)}" stroke="${hsl(c, -22)}" stroke-width="1" stroke-linejoin="round"/>`);
      } else { // 脚: 2段の関節。関節の向きのずれが出る
        const turn = (look.joint || 0) * 0.16;
        const pts = [[bx, by], [bx + side * w * 0.26, by + h * 0.3], [bx + side * w * 0.34 + turn * 5, by + h * 0.62]];
        (i % 2 ? back : front).push(taper(pts, 3.4, 1.8, i % 2 ? dim : lit, i % 2 ? 0.8 : 1));
      }
    }
  }
  return { back: back.join(''), front: front.join('') };
}

/* ---------- 目、体の覆い、模様 ---------- */

function eyes(look, w, h, c, dark) {
  if (!look.eyeKind || look.eyeKind === 'none' || !look.eyeN) return '';
  const n = Math.min(look.eyeN, 8), r = Math.max(1.8, (look.eyeSize || 0.3) * h * 0.3) * (dark ? 1.25 : 1);
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const x = C0 + (t - 0.5) * w * 0.86, y = C0 - h * 0.2 + (look.asym ? (i % 2) * 2.4 : 0);
    if (look.eyeKind === 'compound') { // 複眼: 小さな面の集まり
      for (let k = 0; k < 7; k++) {
        const a = (Math.PI * 2 * k) / 6, rr = k === 6 ? 0 : r * 0.52;
        out.push(`<circle cx="${n2(x + Math.cos(a) * rr)}" cy="${n2(y + Math.sin(a) * rr)}" r="${n2(r * 0.4)}" fill="${hsl(c, -30, 10, -10)}" opacity=".92"/>`);
      }
      out.push(`<circle cx="${n2(x - r * 0.3)}" cy="${n2(y - r * 0.35)}" r="${n2(r * 0.22)}" fill="#fff" opacity=".5"/>`);
    } else { // レンズの目: 白目、瞳、ハイライト
      out.push(`<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(r)}" fill="#f4f1e8"/>`);
      out.push(`<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(r)}" fill="none" stroke="${hsl(c, -34)}" stroke-width=".9" opacity=".8"/>`);
      out.push(`<circle cx="${n2(x + r * 0.16)}" cy="${n2(y + r * 0.06)}" r="${n2(r * 0.46)}" fill="#141019"/>`);
      out.push(`<circle cx="${n2(x - r * 0.26)}" cy="${n2(y - r * 0.3)}" r="${n2(r * 0.24)}" fill="#fff" opacity=".9"/>`);
    }
  }
  return out.join('');
}

function cover(kind, w, h, c) {
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
      const a = (Math.PI * 2 * i) / 26;
      const x0 = C0 + Math.cos(a) * w * 0.62, y0 = C0 + Math.sin(a) * h * 0.62;
      const k = 1 + 0.16 + Math.abs(wob(0, i)) * 0.1;
      out.push(`<line x1="${n2(x0)}" y1="${n2(y0)}" x2="${n2(C0 + Math.cos(a) * w * 0.62 * k)}" y2="${n2(C0 + Math.sin(a) * h * 0.62 * k)}" stroke="${hsl(c, 6)}" stroke-width=".9" stroke-linecap="round" opacity=".7"/>`);
    }
    return out.join('');
  }
  if (kind === 'shell') { // 殻: 厚い板と、そこに落ちる影
    return `<path d="M${n2(C0 - w * 0.68)} ${n2(C0 + h * 0.04)}a${n2(w * 0.68)} ${n2(h * 0.72)} 0 0 1 ${n2(w * 1.36)} 0Z" fill="${hsla(c, 0.55, -14, 6)}" stroke="${hsl(c, -30)}" stroke-width="1.4" stroke-linejoin="round"/>`
      + `<path d="M${n2(C0 - w * 0.5)} ${n2(C0 - h * 0.1)}a${n2(w * 0.5)} ${n2(h * 0.5)} 0 0 1 ${n2(w * 0.62)} ${n2(-h * 0.12)}" fill="none" stroke="#fff" stroke-width="1.1" opacity=".22"/>`;
  }
  return '';
}

function pattern(look, w, h, id, c, clip) {
  const k = look.pattern;
  if (!k || k === 'plain' || k === 'glow') return '';
  const col = hsla(c, 0.5, -22, 10, 14);
  const out = [];
  if (k === 'spots') for (let i = 0; i < 9; i++)
    out.push(`<circle cx="${n2(C0 + wob(id, i) * w * 0.58)}" cy="${n2(C0 + wob(id, i + 20) * h * 0.58)}" r="${n2(1.8 + Math.abs(wob(id, i + 40)) * 2.6)}" fill="${col}"/>`);
  if (k === 'stripes') for (let i = -4; i <= 4; i++)
    out.push(`<line x1="${n2(C0 + i * 6.5 - 12)}" y1="${n2(C0 - h)}" x2="${n2(C0 + i * 6.5 + 12)}" y2="${n2(C0 + h)}" stroke="${col}" stroke-width="3.2"/>`);
  if (k === 'bands') for (let i = -2; i <= 2; i++)
    out.push(`<rect x="${n2(C0 - w)}" y="${n2(C0 + i * h * 0.28 - 1.8)}" width="${n2(w * 2)}" height="3.6" fill="${col}"/>`);
  return `<g clip-path="url(#${clip})">${out.join('')}</g>`;
}

/* ---------- 場面（カードを小さなジオラマにする） ---------- */

function sceneLayers(entry, world, S, id) {
  const land = entry.hab === 'land', deep = entry.look?.depth === 'deep';
  const out = [`<rect width="${VB}" height="${VB}" fill="url(#sky${id})"/>`];
  if (!deep) out.push(`<circle cx="${VB * 0.82}" cy="${VB * 0.16}" r="${VB * 0.42}" fill="url(#star${id})"/>`);
  if (!land) out.push(`<rect width="${VB}" height="${VB}" fill="url(#water${id})"/>`); // 水の層
  if (land) out.push(`<rect y="${n2(VB * 0.78)}" width="${VB}" height="${n2(VB * 0.22)}" fill="url(#ground${id})"/>`);
  for (let i = 0; i < 7; i++) { // 塵、あるいは漂うもの
    const x = ((wob(id, i + 60) + 1) / 2) * VB, y = ((wob(id, i + 80) + 1) / 2) * VB;
    out.push(`<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(0.5 + Math.abs(wob(id, i + 90)) * 0.7)}" fill="${S.haze}" opacity=".3"/>`);
  }
  return out.join('');
}

/* ---------- 1体ぶんの SVG ---------- */

// entry は engine/traits.mjs の bestiary() の1件。world は { star, gravity }。
export function creatureSVG(entry, world, { size = 120 } = {}) {
  const look = entry.look || {}, p = palette(world.star), id = entry.id;
  const S = scene(world.star, look.depth);
  const c = bodyHSL(world.star, look, entry.color?.light ?? 0.5);
  const base = proportions(world.gravity);
  const k = SIZE_SCALE[entry.sizeStep ?? SIZE_SCALE.length - 1] ?? 1;
  const w = base.w * k, h = base.h * k;
  const land = entry.hab === 'land';
  const dark = world.star === 'red' || look.depth === 'deep';
  const { body, back } = formShape(look.form, id, w, h);
  const lim = limbs(look, w, h, id, c);
  const soft = body.some(s => s.soft); // やわらかい体は少し透ける
  const clip = `cl${id}`;

  const shape = s => s.el === 'ellipse'
    ? `<ellipse cx="${n2(s.cx)}" cy="${n2(s.cy)}" rx="${n2(s.rx)}" ry="${n2(s.ry)}"`
    : `<path d="${s.d}"`;
  const fillArgs = ` fill="url(#vol${id})" fill-opacity="${soft ? 0.88 : 1}" stroke="url(#rim${id})" stroke-width="2" stroke-linejoin="round"/>`;

  const defs = `<defs>`
    + `<linearGradient id="sky${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${S.sky0}"/><stop offset="1" stop-color="${S.sky1}"/></linearGradient>`
    + `<radialGradient id="star${id}"><stop offset="0" stop-color="${S.star}" stop-opacity=".5"/><stop offset=".45" stop-color="${S.star}" stop-opacity=".12"/><stop offset="1" stop-color="${S.star}" stop-opacity="0"/></radialGradient>`
    + `<linearGradient id="water${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${S.haze}" stop-opacity=".1"/><stop offset="1" stop-color="${S.ink}" stop-opacity=".5"/></linearGradient>`
    + `<linearGradient id="ground${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${S.ground}"/><stop offset="1" stop-color="${S.ink}"/></linearGradient>`
    // 体の厚み: 光の側が明るく、反対が暗い
    + `<radialGradient id="vol${id}" cx="${n2(50 + LIGHT.x * 42)}%" cy="${n2(50 + LIGHT.y * 42)}%" r="86%">`
    + `<stop offset="0" stop-color="${hsl(c, 22, -6, 8)}"/><stop offset=".48" stop-color="${hsl(c, 1)}"/><stop offset="1" stop-color="${hsl(c, -26, 6, -8)}"/></radialGradient>`
    // 縁: 光の当たる側だけ明るいリムライト
    + `<linearGradient id="rim${id}" x1="14%" y1="4%" x2="82%" y2="98%">`
    + `<stop offset="0" stop-color="${hsl(c, 30, -4, 6)}"/><stop offset=".4" stop-color="${hsl(c, -16)}"/><stop offset="1" stop-color="${hsl(c, -32, 4, -6)}"/></linearGradient>`
    + `<radialGradient id="vig${id}"><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></radialGradient>`
    + (look.pattern === 'glow' ? `<radialGradient id="glow${id}"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".3" stop-color="${S.accent}" stop-opacity=".4"/><stop offset="1" stop-color="${S.accent}" stop-opacity="0"/></radialGradient>` : '')
    + `<clipPath id="${clip}">${body.map(s => shape(s) + '/>').join('')}</clipPath>`
    + `</defs>`;

  const halo = look.pattern === 'glow'
    ? `<ellipse cx="${C0}" cy="${C0}" rx="${n2(w * 1.5)}" ry="${n2(h * 1.5)}" fill="url(#glow${id})" style="mix-blend-mode:screen"/>` : '';
  const shadow = land
    ? `<ellipse cx="${C0}" cy="${n2(VB * 0.8)}" rx="${n2(w * 0.8)}" ry="${n2(h * 0.14)}" fill="#000" opacity=".3"/>` : '';

  return `<svg viewBox="0 0 ${VB} ${VB}" width="${size}" height="${size}" role="img" aria-label="${esc(entry.text || '生き物')}">`
    + defs
    + sceneLayers(entry, world, S, id)
    + halo
    + shadow
    + back.map(s => shape(s) + ` fill="${hsl(c, -24, 4)}" stroke="none"/>`).join('') // 体の後ろの突起
    + lim.back
    + body.map(s => shape(s) + fillArgs).join('')
    + pattern(look, w, h, id, c, clip)
    + cover(look.cover, w, h, c)
    + lim.front
    + eyes(look, w, h, c, dark)
    + `<rect width="${VB}" height="${VB}" fill="url(#vig${id})"/>`
    + '</svg>';
}
