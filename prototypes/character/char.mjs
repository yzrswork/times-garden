// 試作09「キャラ層」のレンダラー。rig（prototypes/character/rig.mjs）と
// 体の設計図（viewer/plan.mjs）から、キャラとして立った1体を SVG にする。
//
// 本番の viewer/draw.mjs は置き換えない（この試作は組み込まない）。
// 設計図の読み方は draw.mjs と同じで、形質の解釈はしない。違うのは見せ方だけ:
//   1 シルエット  すべての部位を塗りの形にして、輪郭で種を言い分けられるようにする
//                （触手や脚も、線ではなく先細りの帯にする）
//   2 焦点        目／核／発光のうち1つだけを、いちばん強い明暗差で見せる
//   3 ポーズと比率 rig の傾き・振り・倍率で、同じ型でも性格が出るようにする
//   4 陰影の様式   2〜3段のセル陰影 ＋ 光の当たる側だけの縁の光 ＋ 接地影。型をまたいで同じ
import { bodyPlan, cellPlan, VB, C0, wob } from '../../viewer/plan.mjs';
import { hsl, hsla, scene, palette } from '../../viewer/palette.mjs';
import { rigFor, LIGHT } from './rig.mjs';

const n2 = v => Math.round(v * 100) / 100;
const P = p => `${n2(p[0])} ${n2(p[1])}`;

/* ---------- 設計図の語彙を、すべて「塗る形」に直す ---------- */
// 線（触手や脚）のままだとシルエットに出ないので、先細りの帯にして塗る。

const ellPath = (cx, cy, rx, ry) =>
  `M${n2(cx - rx)} ${n2(cy)}a${n2(rx)} ${n2(ry)} 0 1 0 ${n2(rx * 2)} 0a${n2(rx)} ${n2(ry)} 0 1 0 ${n2(-rx * 2)} 0Z`;

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

const domePath = s => {
  let d = `M${P(s.pts[0])}`;
  for (let i = 1; i < s.pts.length; i++) d += `Q${n2((s.pts[i - 1][0] + s.pts[i][0]) / 2)} ${n2(s.pts[i][1] - s.apexDrop)} ${P(s.pts[i])}`;
  return d + `Q${P(s.skirt)} ${P(s.pts[0])}Z`;
};

const spikePath = s => s.straight
  ? `M${P(s.base)}L${P(s.tip)}L${P(s.end)}Z`
  : `M${P(s.base)}Q${P(s.mid)} ${P(s.tip)}Q${P(s.mid2)} ${P(s.end)}Z`;

const membranePath = s => `M${P(s.base)}Q${P(s.ctrl1)} ${P(s.far)}Q${P(s.ctrl2)} ${P(s.end)}Z`;

// 紐（触手、脚）を先細りの帯にする。根元 w0 から先 w1 へ細り、先は丸く閉じる。
function strandPath(s) {
  const pts = s.pts, n = pts.length;
  if (n < 2) return '';
  // 太さは線分の長さで抑える。急に曲がる紐で帯が自分と交わり、ギザギザになるのを防ぐ
  let minSeg = Infinity;
  for (let i = 1; i < n; i++) minSeg = Math.min(minSeg, Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const cap = Math.max(0.4, minSeg * 0.9);
  const wAt = i => Math.min(cap, (s.w0 + (s.w1 - s.w0) * (n <= 2 ? 0 : i / (n - 1))) / 2);
  const left = [], right = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len, w = wAt(i);
    left.push([pts[i][0] + nx * w, pts[i][1] + ny * w]);
    right.push([pts[i][0] - nx * w, pts[i][1] - ny * w]);
  }
  const tipR = wAt(n - 1);
  let d = `M${P(left[0])}`;
  for (let i = 1; i < n; i++) d += `L${P(left[i])}`;
  d += `a${n2(tipR)} ${n2(tipR)} 0 0 1 ${n2(right[n - 1][0] - left[n - 1][0])} ${n2(right[n - 1][1] - left[n - 1][1])}`;
  for (let i = n - 2; i >= 0; i--) d += `L${P(right[i])}`;
  return d + 'Z';
}

const pathOf = s => s.type === 'ellipsoid' ? ellPath(s.cx, s.cy, s.rx, s.ry)
  : s.type === 'loop' ? loopPath(s.pts)
  : s.type === 'dome' ? domePath(s)
  : s.type === 'spike' ? spikePath(s)
  : s.type === 'membrane' ? membranePath(s)
  : s.type === 'strand' ? strandPath(s) : '';

/* ---------- 比率（rig の deform）を設計図のコピーにかける ---------- */
// 回転は SVG の group に任せる（楕円の形が崩れないように）。ここでかけるのは倍率だけ。

const mapPt = (p, f) => f(p[0], p[1]);
function scaleShape(s, pivot, kx, ky) {
  const f = (x, y) => [pivot[0] + (x - pivot[0]) * kx, pivot[1] + (y - pivot[1]) * ky];
  const o = { ...s };
  if (s.type === 'ellipsoid') { [o.cx, o.cy] = f(s.cx, s.cy); o.rx = s.rx * kx; o.ry = s.ry * ky; return o; }
  for (const k of ['base', 'mid', 'mid2', 'tip', 'end', 'ctrl1', 'ctrl2', 'far', 'skirt']) if (s[k]) o[k] = mapPt(s[k], f);
  if (s.pts) o.pts = s.pts.map(p => mapPt(p, f));
  if (s.apexDrop) o.apexDrop = s.apexDrop * ky;
  if (s.w0 !== undefined) { o.w0 = s.w0 * (kx + ky) / 2; o.w1 = s.w1 * (kx + ky) / 2; }
  return o;
}

// 点を回す（付属器を根元から振る）。楕円は回すと崩れるので、点で持つ形にだけ使う。
function rotateShape(s, pivot, deg) {
  const a = deg * Math.PI / 180, co = Math.cos(a), si = Math.sin(a);
  const f = (x, y) => [pivot[0] + (x - pivot[0]) * co - (y - pivot[1]) * si,
                       pivot[1] + (x - pivot[0]) * si + (y - pivot[1]) * co];
  const o = { ...s };
  for (const k of ['base', 'mid', 'mid2', 'tip', 'end', 'ctrl1', 'ctrl2', 'far']) if (s[k]) o[k] = mapPt(s[k], f);
  if (s.pts) o.pts = s.pts.map(p => mapPt(p, f));
  return o;
}

// 付属器の根元（ここを軸に振る）
const rootOf = s => s.pts ? s.pts[0] : (s.base ?? [C0, C0]);

// 設計図（body / back / limbs）に rig の比率をかけた写しを返す。plan そのものは変えない。
function deform(plan, rig) {
  const d = rig.deform, C = [C0, C0];
  const body = plan.body.map((s, i) => {
    let o = scaleShape(s, C, d.bodyX, d.bodyY);
    // 先頭の塊（体節型なら前の節、それ以外は焦点にいちばん近い塊）を大きく見せる
    if (i === plan.headIndex) {
      const pv = s.type === 'ellipsoid' ? [s.cx, s.cy] : C;
      o = scaleShape(o, [C[0] + (pv[0] - C0) * d.bodyX, C[1] + (pv[1] - C0) * d.bodyY], d.head, d.head);
    } else if (plan.form === 'seg') {
      o = scaleShape(o, C, 1, d.taper + (1 - d.taper) * (1 - i / Math.max(1, plan.body.length - 1)));
    }
    return o;
  });
  // 付属器: 外へ張り出させてから、ポーズで振る。
  //   翼は左右へ持ち上げて、シルエットの外に出す（体に埋もれると翼4本が絵に出ない）
  //   触手と脚は、前後で交互に振って、止まったままの絵にしない
  const limbs = plan.limbs.map((s, i) => {
    let o = scaleShape(s, C, d.limb, d.limb);
    const root = rootOf(o);
    const side = root[0] < C0 ? -1 : 1;
    const alt = i % 2 ? 1 : -1;
    const deg = s.type === 'membrane'
      ? -side * (d.lift || 0) * (i >= 2 ? 0.3 : 1)   // 後ろの対は低いままにして、前後2対が数えられるようにする
      : alt * rig.pose.swing * (0.6 + 0.4 * ((i % 4) / 3));
    return deg ? rotateShape(o, root, deg) : o;
  });
  // 目にも体と同じ比率をかける（かけないと、大きくした頭から目がずれる）。
  // 目の数と「体のどこに付くか」は plan.mjs の決定のまま。ここでは変形に追従させるだけ。
  const head = plan.body[plan.headIndex];
  const eyes = plan.eyes.map(e => {
    const x = C0 + (e.x - C0) * d.bodyX, y = C0 + (e.y - C0) * d.bodyY;
    if (plan.form === 'seg' && head?.type === 'ellipsoid') {
      const hx = C0 + (head.cx - C0) * d.bodyX, hy = C0 + (head.cy - C0) * d.bodyY;
      if (Math.abs(x - hx) < head.rx * d.bodyX * d.head) return { ...e, x: hx + (x - hx) * d.head, y: hy + (y - hy) * d.head };
    }
    return { ...e, x, y };
  });
  return { body, back: plan.back.map(s => scaleShape(s, C, d.bodyX * d.limb, d.bodyY * d.limb)), limbs, eyes };
}

// 変形後の形から、絵の中での広がりを測る（枠に収めるため）。
function bboxOf(shapes) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y, m = 0) => { x0 = Math.min(x0, x - m); y0 = Math.min(y0, y - m); x1 = Math.max(x1, x + m); y1 = Math.max(y1, y + m); };
  for (const s of shapes) {
    if (s.type === 'ellipsoid') { add(s.cx, s.cy, Math.max(s.rx, s.ry)); continue; }
    const m = s.w0 ? Math.max(s.w0, s.w1) / 2 : 0;
    for (const k of ['base', 'mid', 'mid2', 'tip', 'end', 'ctrl1', 'ctrl2', 'far', 'skirt']) if (s[k]) add(s[k][0], s[k][1], m);
    if (s.pts) for (const p of s.pts) add(p[0], p[1], m);
  }
  if (!Number.isFinite(x0)) return { x0: 0, y0: 0, x1: VB, y1: VB, w: VB, h: VB, cx: C0, cy: C0 };
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

// 先頭の塊（比率で大きくするもの）。体節型は前の節、放射腕と胞子型は中心の塊、それ以外は最後の塊。
function headIndexOf(plan) {
  if (plan.form === 'seg') return 0;
  if (plan.form === 'radial' || plan.form === 'spore') return plan.body.findIndex(s => s.type === 'ellipsoid');
  return plan.body.length - 1;
}

/* ---------- 様式（陰影、縁の光、輪郭、接地影、焦点） ---------- */

// 体の広がり（陰影の円の大きさに使う）
const spanOf = plan => Math.max(plan.w, plan.h) * 1.1;

// 2〜3段のセル陰影。シルエットで切り抜いた中に、平らな色を置くだけ。
function celShade(uid, c, rig, span, cx, cy) {
  const sh = rig.shade;
  const dark = hsl(c, -17, 5, -5), lite = hsl(c, 15, -6, 5);
  const off = span * (0.55 + sh.term * 0.7);
  const out = [`<rect x="${n2(cx - span * 2)}" y="${n2(cy - span * 2)}" width="${n2(span * 4)}" height="${n2(span * 4)}" fill="${hsl(c, 0)}"/>`];
  // 影: 光の反対側に置いた大きな円。円なので明暗の境が弧になり、丸みが出る
  out.push(`<circle cx="${n2(cx - LIGHT.x * off)}" cy="${n2(cy - LIGHT.y * off)}" r="${n2(span * 1.28)}" fill="${dark}"/>`);
  // 光: 3段のときだけ。光の側に小さく置く
  if (sh.steps >= 3) out.push(`<circle cx="${n2(cx + LIGHT.x * span * 0.5)}" cy="${n2(cy + LIGHT.y * span * 0.5)}" r="${n2(span * sh.light)}" fill="${lite}"/>`);
  return out.join('');
}

// 接地影。地面に着く種は小さく濃く、浮く種は広く薄く、少しずらす。
function groundShadow(rig, plan, S, y) {
  const g = rig.ground, w = plan.w * g.spread;
  const slide = g.kind === 'float' ? plan.w * 0.18 : 0;
  const core = g.kind === 'contact'
    ? `<ellipse cx="${n2(C0 + slide * 0.4)}" cy="${n2(y)}" rx="${n2(w * 0.42)}" ry="${n2(plan.h * g.depth * 0.5)}" fill="${S.ink}" opacity="${n2(g.opacity * 1.3)}"/>`
    : '';
  return `<ellipse cx="${n2(C0 + slide)}" cy="${n2(y)}" rx="${n2(w)}" ry="${n2(plan.h * g.depth)}" fill="${S.ink}" opacity="${g.opacity}"/>` + core;
}

// 焦点。目なら瞳と映り込み、核なら明るい球、発光なら光の芯。どれも「その種にあるもの」。
function focusSVG(plan, rig, c, S, uid) {
  const f = rig.focus, out = [];
  const eyeK = rig.deform.eye || 1;
  // 焦点のまわりだけ、わずかに明るい空気（加算）。器官は増やさない
  out.push(`<circle cx="${n2(f.x)}" cy="${n2(f.y)}" r="${n2(f.r * (f.kind === 'eye' ? eyeK * 1.7 : 2.6))}" fill="url(#${uid}-foc)" style="mix-blend-mode:screen"/>`);
  if (f.kind === 'eye') {
    for (const e of plan.eyes) {
      const r = e.r * eyeK;
      if (e.kind === 'compound') {
        out.push(`<circle cx="${n2(e.x)}" cy="${n2(e.y)}" r="${n2(r)}" fill="${hsl(c, -28, 12, -6)}" stroke="${hsl(c, -40)}" stroke-width=".9"/>`);
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI * 2 * k) / 6;
          out.push(`<circle cx="${n2(e.x + Math.cos(a) * r * 0.5)}" cy="${n2(e.y + Math.sin(a) * r * 0.5)}" r="${n2(r * 0.3)}" fill="${hsl(c, -20, 14, -8)}" opacity=".9"/>`);
        }
        out.push(`<circle cx="${n2(e.x - r * 0.34)}" cy="${n2(e.y - r * 0.36)}" r="${n2(r * 0.2)}" fill="${S.star}" opacity=".85"/>`);
        continue;
      }
      // レンズの目: 白目を暗く、瞳を大きく、映り込みは1つだけ（焦点をぼかさない）
      out.push(`<ellipse cx="${n2(e.x)}" cy="${n2(e.y)}" rx="${n2(r)}" ry="${n2(r * 1.04)}" fill="${hsl(c, 30, -18, 4)}" stroke="${hsl(c, -42)}" stroke-width="1.1"/>`);
      out.push(`<ellipse cx="${n2(e.x + r * 0.1)}" cy="${n2(e.y + r * 0.08)}" rx="${n2(r * 0.52)}" ry="${n2(r * 0.6)}" fill="${hsl(c, -52, 6, -4)}"/>`);
      out.push(`<circle cx="${n2(e.x - r * 0.3)}" cy="${n2(e.y - r * 0.34)}" r="${n2(r * 0.2)}" fill="${S.star}" opacity=".9"/>`);
    }
    return out.join('');
  }
  if (f.kind === 'nucleus') return out.join(''); // 核そのものは細胞の層で描く（ここでは空気だけ）
  if (f.kind === 'glow') out.push(`<circle cx="${n2(f.x)}" cy="${n2(f.y)}" r="${n2(f.r * 0.5)}" fill="${S.star}" opacity=".5" style="mix-blend-mode:screen"/>`);
  return out.join('');
}

/* ---------- 体の覆いと模様（形質が絵に出ることを確かめる層） ---------- */

function coverSVG(plan, c) {
  const { cover: kind, w, h } = plan;
  const out = [];
  if (kind === 'scale') {
    for (let row = 0; row < 5; row++) for (let col = 0; col < 6; col++) {
      const x = C0 - w * 0.6 + (col * w * 1.2) / 5.5, y = C0 - h * 0.34 + row * h * 0.19;
      out.push(`<path d="M${n2(x)} ${n2(y)}q${n2(w * 0.09)} ${n2(-h * 0.09)} ${n2(w * 0.18)} 0" fill="none" stroke="${hsl(c, -24)}" stroke-width=".9" opacity=".6"/>`);
    }
  } else if (kind === 'fur') {
    for (let i = 0; i < 30; i++) {
      const a = (Math.PI * 2 * i) / 30, k = 1.1 + Math.abs(wob(plan.id, i)) * 0.14;
      out.push(`<line x1="${n2(C0 + Math.cos(a) * w * 0.58)}" y1="${n2(C0 + Math.sin(a) * h * 0.58)}" x2="${n2(C0 + Math.cos(a) * w * 0.58 * k)}" y2="${n2(C0 + Math.sin(a) * h * 0.58 * k)}" stroke="${hsl(c, 8)}" stroke-width="1" stroke-linecap="round" opacity=".7"/>`);
    }
  } else if (kind === 'shell') {
    out.push(`<path d="M${n2(C0 - w * 0.62)} ${n2(C0 + h * 0.02)}a${n2(w * 0.62)} ${n2(h * 0.66)} 0 0 1 ${n2(w * 1.24)} 0Z" fill="${hsla(c, 0.4, -12, 6)}" stroke="${hsl(c, -32)}" stroke-width="1.4" stroke-linejoin="round"/>`);
  }
  return out.join('');
}

function patternSVG(plan, c) {
  const { pattern: k, w, h, id } = plan;
  if (!k || k === 'plain' || k === 'glow') return '';
  const col = hsla(c, 0.42, -20, 8, 8), out = [];
  if (k === 'spots') for (let i = 0; i < 10; i++)
    out.push(`<circle cx="${n2(C0 + wob(id, i) * w * 0.52)}" cy="${n2(C0 + wob(id, i + 20) * h * 0.52)}" r="${n2(1.6 + Math.abs(wob(id, i + 40)) * 2.4)}" fill="${col}"/>`);
  if (k === 'stripes') for (let i = -4; i <= 4; i++)
    out.push(`<line x1="${n2(C0 + i * 6.5 - 12)}" y1="${n2(C0 - h)}" x2="${n2(C0 + i * 6.5 + 12)}" y2="${n2(C0 + h)}" stroke="${col}" stroke-width="3.2"/>`);
  if (k === 'bands') for (let i = -2; i <= 2; i++)
    out.push(`<rect x="${n2(C0 - w)}" y="${n2(C0 + i * h * 0.28 - 1.8)}" width="${n2(w * 2)}" height="3.6" fill="${col}"/>`);
  return out.join('');
}

/* ---------- 1体ぶんの SVG ---------- */

// entry は engine/traits.mjs の bestiary() の1件。world は { star, gravity }。
//   render    'body'（図鑑の姿）か 'cell'（顕微鏡の姿。単細胞だけ）
//   mode      'full'（絵）か 'silhouette'（真っ黒塗り）
//   frame     背景と枠を描くか（文明シーンに置くときは false）
export function charSVG(entry, world, { size = 360, render = 'body', mode = 'full', frame = true, tag = '' } = {}) {
  const isCell = render === 'cell';
  const plan0 = isCell ? cellPlan(entry, world, { fill: 0.78 }) : bodyPlan(entry, world);
  const plan = { ...plan0, headIndex: -1 };
  plan.headIndex = headIndexOf(plan);
  const rig = rigFor(plan, entry);
  const c = plan.color, S = scene(world.star, entry.look?.depth);
  const uid = `ch${plan.id}${isCell ? 'c' : ''}${mode === 'silhouette' ? 's' : ''}${tag}`;
  const span = spanOf(plan);

  // 形を集める（シルエットも本番もこの同じ形を使う）
  let backD = [], mainD = [], inner = '', allShapes = [], bodyShapes = null;
  if (isCell) {
    const b = plan.band;
    mainD = [loopPath(b.outer)];
    backD = plan.cilia.map(c0 => strandPath({ pts: [c0.base, c0.tip], w0: c0.w * 1.25, w1: 0.3 }));
    for (const p of plan.pseudopods) mainD.push(`M${P(p.base)}Q${P(p.ctrl)} ${P(p.tip)}Z`);
    const hues = palette(world.star).body.map(x => x[0]);
    const accH = Math.min(...hues) + (Math.max(...hues) - Math.min(...hues)) * 0.1;
    const acc = (a, dl = 0) => hsla({ h: accH, s: Math.min(100, c.s + 42), l: Math.min(76, c.l + 18) }, a, dl);
    inner = cellInner(plan, c, S, rig, acc);
    allShapes = [{ type: 'loop', pts: b.outer }, ...plan.cilia.map(c0 => ({ type: 'strand', pts: [c0.base, c0.tip], w0: c0.w, w1: 0.3 }))];
  } else {
    const d = deform(plan, rig);
    backD = [...d.back.map(pathOf), ...d.limbs.filter(s => s.layer === 'back').map(pathOf)];
    mainD = [...d.body.map(pathOf), ...d.limbs.filter(s => s.layer !== 'back').map(pathOf)];
    allShapes = [...d.back, ...d.body, ...d.limbs];
    bodyShapes = d.body;
    plan.eyes = d.eyes;                        // 焦点の位置も、変形後の体に合わせる
    rig.focus = rigFor(plan, entry).focus;
  }
  const all = [...backD, ...mainD];

  // 枠に収めてから立ち位置へ置き、ポーズで傾ける。
  // 収めるのは、はみ出す個体だけ（体の大きさは絵の大きさに出したままにする）。
  const box = bboxOf(allShapes);
  const room = VB - rig.anchor.margin * 2;
  // 傾けると角が外へ出るので、その分だけ縮める
  const tilt = 1 / (1 + Math.abs(Math.sin(rig.pose.lean * Math.PI / 180)) * 0.7);
  const fit = Math.min(1, room / Math.max(box.w, box.h, 1)) * tilt;
  const contact = rig.ground.kind === 'contact';
  // 接地する種は、形のいちばん下を地面の線に合わせる。ただし横に広くて背の低い種は、
  // 枠の下に貼りつくと余白が上に寄るので、絵の真ん中へ引き上げる
  const line = Math.min(VB * (0.8 - rig.pose.drop), VB * 0.56 + (box.h * fit) / 2);
  // 地面に着くのは体の底。持ち上げた翼の先は地面より下に行かない範囲で、地面に合わせない
  const foot = bodyShapes ? bboxOf(bodyShapes) : box;
  const tx = C0 - box.cx * fit;
  const ty = contact ? Math.min(line - foot.y1 * fit, VB * 0.94 - box.y1 * fit) : VB * (0.5 - rig.pose.rise) - box.cy * fit;
  const ground = contact ? ty + foot.y1 * fit : ty + box.y1 * fit + plan.h * 0.18;
  const pivot = `${C0} ${n2(ground)}`;
  const body = `<g transform="rotate(${n2(rig.pose.lean)} ${pivot}) translate(${n2(tx)} ${n2(ty)}) scale(${n2(fit)})">`;

  if (mode === 'silhouette') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB} ${VB}" width="${size}" height="${size}" role="img">`
      + `<rect width="${VB}" height="${VB}" fill="#f3f1ec"/>`
      + body + all.map(d => `<path d="${d}" fill="#15161a"/>`).join('') + '</g></svg>';
  }

  const defs = `<defs>`
    + `<linearGradient id="${uid}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${S.sky0}"/><stop offset="1" stop-color="${S.sky1}"/></linearGradient>`
    + `<radialGradient id="${uid}-foc"><stop offset="0" stop-color="${S.star}" stop-opacity=".42"/><stop offset="1" stop-color="${S.star}" stop-opacity="0"/></radialGradient>`
    + `<radialGradient id="${uid}-vig"><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient>`
    + `<clipPath id="${uid}-sil">${mainD.map(d => `<path d="${d}"/>`).join('')}</clipPath>`
    + `<clipPath id="${uid}-back">${backD.map(d => `<path d="${d}"/>`).join('')}</clipPath>`
    + `<clipPath id="${uid}-lit"><circle cx="${n2(C0 + LIGHT.x * span * 0.72)}" cy="${n2(C0 + LIGHT.y * span * 0.72)}" r="${n2(span * 1.12)}"/></clipPath>`
    + `<mask id="${uid}-rim">`
    + `<g fill="#fff">${mainD.map(d => `<path d="${d}"/>`).join('')}</g>`
    + `<g fill="#000" transform="translate(${n2(-LIGHT.x * rig.shade.rim)} ${n2(-LIGHT.y * rig.shade.rim)})">${mainD.map(d => `<path d="${d}"/>`).join('')}</g>`
    + `</mask>`
    + `</defs>`;

  const rimCol = S.star, contour = hsl(c, -36, 2);
  const parts = [];
  // 後ろの部位: 平らな暗い色。前後が重なっても読めるように段を分ける
  parts.push(`<g clip-path="url(#${uid}-back)"><rect width="${VB}" height="${VB}" fill="${hsl(c, -26, 4, -4)}"/></g>`);
  parts.push(backD.map(d => `<path d="${d}" fill="none" stroke="${contour}" stroke-width="1.1" stroke-linejoin="round" opacity=".8"/>`).join(''));
  // 本体: セル陰影 → 模様と覆い → 輪郭 → 縁の光
  // 外の輪郭は塗りの下に敷く（内側の線は塗りで隠れ、外の縁だけが残って1つの塊に見える）
  parts.push(mainD.map(d => `<path d="${d}" fill="${contour}" stroke="${contour}" stroke-width="3.2" stroke-linejoin="round"/>`).join(''));
  parts.push(`<g clip-path="url(#${uid}-sil)"${isCell ? ' opacity=".82"' : ''}>${celShade(uid, c, rig, span, C0, C0)}`
    + (isCell ? '' : patternSVG(plan, c) + coverSVG(plan, c)) + `</g>`);
  // 節や腕の境目は薄く残して、部位が読めるようにする
  parts.push(mainD.map(d => `<path d="${d}" fill="none" stroke="${contour}" stroke-width=".9" stroke-linejoin="round" opacity=".35"/>`).join(''));
  parts.push(`<g mask="url(#${uid}-rim)" clip-path="url(#${uid}-lit)">`
    + `<rect x="${n2(C0 - span * 2)}" y="${n2(C0 - span * 2)}" width="${n2(span * 4)}" height="${n2(span * 4)}" fill="${rimCol}" opacity=".6"/></g>`);
  if (inner) parts.push(inner);
  parts.push(focusSVG(plan, rig, c, S, uid));

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB} ${VB}" width="${size}" height="${size}" role="img" aria-label="${(entry.text || '生き物').replace(/[<>&"]/g, '')}">`
    + defs
    + (frame ? sceneSVG(plan, rig, S, uid, ground) : '')
    + groundShadow(rig, plan, S, ground)
    + body + parts.join('') + `</g>`
    + (frame ? `<rect width="${VB}" height="${VB}" fill="url(#${uid}-vig)"/>` : '')
    + '</svg>';
}

// 背景。恒星の色の空と、地面か水。生き物が浮いて見えない程度に薄く。
function sceneSVG(plan, rig, S, uid, ground) {
  const out = [`<rect width="${VB}" height="${VB}" fill="url(#${uid}-sky)"/>`];
  if (!plan.deep) out.push(`<circle cx="${n2(VB * 0.8)}" cy="${n2(VB * 0.18)}" r="${n2(VB * 0.3)}" fill="url(#${uid}-foc)"/>`);
  if (plan.land) {
    out.push(`<rect y="${n2(ground)}" width="${VB}" height="${n2(Math.max(0, VB - ground))}" fill="${S.ground}"/>`);
    out.push(`<rect y="${n2(ground)}" width="${VB}" height="1.2" fill="${S.haze}" opacity=".25"/>`);
  } else {
    out.push(`<rect width="${VB}" height="${VB}" fill="${hsla({ h: 200, s: 30, l: 30 }, 0.18)}"/>`);
    for (let i = 0; i < 6; i++) out.push(`<circle cx="${n2(((wob(plan.id, i + 60) + 1) / 2) * VB)}" cy="${n2(((wob(plan.id, i + 80) + 1) / 2) * VB)}" r="${n2(0.6 + Math.abs(wob(plan.id, i + 90)) * 0.8)}" fill="${S.haze}" opacity=".3"/>`);
  }
  return out.join('');
}

/* ---------- 単細胞の中身（焦点＝核） ---------- */
// 細胞の設計図（cellPlan）のうち、キャラとして効くものだけを描く。
// 試作08 の密度（繊毛96本、器官18〜32個、桟44〜86本）はそのまま使い、
// 明暗の段と焦点のつけ方だけを変える。
function cellInner(plan, c, S, rig, acc) {
  const out = [], b = plan.band, nuc = plan.nucleus, R = plan.R;
  const on = (k, a) => [C0 + Math.cos(a) * R * k * (1 + wob(plan.id, Math.round(a * 1.75)) * 0.12),
                        C0 + Math.sin(a) * R * k * (1 + wob(plan.id, Math.round(a * 1.75)) * 0.12) * plan.ratio];
  // 膜の帯の模様（試作08 と同じ描き分け。しま＝桟、帯＝太い帯、斑点＝色素の斑）
  const mp = b.pattern;
  if (mp.kind === 'rungs') mp.items.forEach((it, i) => {
    const i0 = on(b.k * 0.97, it.a), o0 = on(1.03, it.a);
    out.push(`<line x1="${n2(i0[0])}" y1="${n2(i0[1])}" x2="${n2(o0[0])}" y2="${n2(o0[1])}" stroke="${i % 2 ? hsla(c, 0.72, -26, 10) : hsla(c, 0.5, 30)}" stroke-width="${n2(R * 0.05)}"/>`);
  });
  else if (mp.kind === 'bands') mp.items.forEach(it => {
    const i0 = on(b.k * 0.95, it.a), o0 = on(1.05, it.a);
    out.push(`<line x1="${n2(i0[0])}" y1="${n2(i0[1])}" x2="${n2(o0[0])}" y2="${n2(o0[1])}" stroke="${hsla(c, 0.78, -28, 12)}" stroke-width="${n2(R * it.half * 2)}"/>`);
  });
  else if (mp.kind === 'spots') mp.items.forEach(it => {
    const q = on(b.k + (1 - b.k) * it.t, it.a);
    out.push(`<ellipse cx="${n2(q[0])}" cy="${n2(q[1])}" rx="${n2(R * it.r)}" ry="${n2(R * it.r * 0.82)}" fill="${hsla(c, 0.72, -26, 12)}"/>`);
  });
  // 帯の内側の境界
  out.push(`<path d="${loopPath(b.inner)}" fill="none" stroke="${hsla(c, 0.5, 18)}" stroke-width="1" />`);
  for (const m of plan.membranes) out.push(`<path d="${loopPath(m.pts)}" fill="none" stroke="${hsla(c, 0.35, 26)}" stroke-width=".7"/>`);
  // 内部器官（試作08 と同じ部品。焦点ではないので、核より明暗差を落とす）
  plan.organelles.forEach((o, i) => {
    const g = `translate(${n2(o.cx)} ${n2(o.cy)}) rotate(${n2(o.rot)})`;
    if (o.kind === 'mito') {
      const cr = [];
      for (let k = 0; k < 5; k++) {
        const x = -o.rx * 0.66 + (k * o.rx * 1.32) / 4;
        cr.push(`<path d="M${n2(x)} ${n2(-o.ry * 0.62)}q${n2(o.rx * 0.16)} ${n2(o.ry * 0.6)} 0 ${n2(o.ry * 1.24)}" fill="none" stroke="${acc(0.7, -18)}" stroke-width=".55"/>`);
      }
      out.push(`<g transform="${g}"><rect x="${n2(-o.rx)}" y="${n2(-o.ry)}" width="${n2(o.rx * 2)}" height="${n2(o.ry * 2)}" rx="${n2(o.ry)}" fill="${acc(0.28, 8)}" stroke="${acc(0.8, -6)}" stroke-width=".8"/>${cr.join('')}</g>`);
    } else if (o.kind === 'vacuole') {
      out.push(`<g transform="${g}"><ellipse rx="${n2(o.rx)}" ry="${n2(o.ry)}" fill="${hsla(c, 0.22, 26)}" stroke="${acc(0.55, 4)}" stroke-width=".7"/>`
        + `<ellipse cx="${n2(-o.rx * 0.32)}" cy="${n2(-o.ry * 0.32)}" rx="${n2(o.rx * 0.3)}" ry="${n2(o.ry * 0.28)}" fill="#fff" opacity=".28"/></g>`);
    } else if (o.kind === 'grain') {
      const gs = [];
      for (let k = 0; k < 7; k++) { const a = (Math.PI * 2 * k) / 7 + i; gs.push(`<circle cx="${n2(Math.cos(a) * o.rx * 0.72)}" cy="${n2(Math.sin(a) * o.ry * 0.72)}" r="${n2(o.rx * 0.3)}" fill="${acc(0.85, -12)}"/>`); }
      out.push(`<g transform="${g}">${gs.join('')}</g>`);
    } else {
      let d = `M${n2(-o.rx)} 0`;
      for (let k = 1; k <= 16; k++) { const t = k / 16, a = t * Math.PI * 3.4, r = o.rx * (1 - t * 0.78); d += `L${n2(Math.cos(a) * r)} ${n2(Math.sin(a) * r * (o.ry / o.rx))}`; }
      out.push(`<g transform="${g}"><path d="${d}" fill="none" stroke="${acc(0.8, 2)}" stroke-width="${n2(o.rx * 0.34)}" stroke-linecap="round" stroke-linejoin="round"/></g>`);
    }
  });
  // 核＝焦点。ここだけ明暗差をいちばん強くし、縁をはっきりさせる（キャラ層の仕事）
  out.push(`<ellipse cx="${n2(nuc.cx)}" cy="${n2(nuc.cy)}" rx="${n2(nuc.rx)}" ry="${n2(nuc.ry)}" fill="${hsl(c, 14, -4, 3)}" stroke="${hsl(c, -38)}" stroke-width="1.5"/>`);
  const np = nuc.pattern;
  if (np.kind === 'arcs') for (const it of np.items)
    out.push(`<path d="M${n2(nuc.cx - it.halfW)} ${n2(it.y)}Q${n2(nuc.cx)} ${n2(it.y + it.bulge)} ${n2(nuc.cx + it.halfW)} ${n2(it.y)}" fill="none" stroke="${hsla(c, 0.6, -30, 14)}" stroke-width="${n2(it.w)}" stroke-linecap="round"/>`);
  else if (np.kind === 'spots') for (const it of np.items)
    out.push(`<ellipse cx="${n2(it.x)}" cy="${n2(it.y)}" rx="${n2(it.rx)}" ry="${n2(it.ry)}" fill="${hsla(c, 0.62, -30, 14)}"/>`);
  // 核の光（焦点の位置を1か所で示す）と、核の落とす影
  out.push(`<ellipse cx="${n2(nuc.cx - LIGHT.x * nuc.rx * 0.5)}" cy="${n2(nuc.cy - LIGHT.y * nuc.ry * 0.5)}" rx="${n2(nuc.rx * 0.92)}" ry="${n2(nuc.ry * 0.9)}" fill="${S.ink}" opacity=".18"/>`);
  out.push(`<ellipse cx="${n2(nuc.cx + LIGHT.x * nuc.rx * 0.42)}" cy="${n2(nuc.cy + LIGHT.y * nuc.ry * 0.42)}" rx="${n2(nuc.rx * 0.4)}" ry="${n2(nuc.ry * 0.36)}" fill="${S.star}" opacity=".34"/>`);
  return out.join('');
}
