// 形質から「体の設計図」を作る層。
//
// ここが正本で、描き方を知らない。SVG（viewer/draw.mjs）も、あとで作る3Dも、
// 同じ設計図を読んで描く。形質の解釈をレンダラーごとに書くと必ずずれるので、
// 解釈はこのファイルだけに置く。
//
// 座標は 120 四方の枠の中。向きは左上から光が当たる前提（palette.mjs の LIGHT）。
// 設計図の語彙:
//   ellipsoid 丸い塊          { cx, cy, rx, ry }
//   loop      やわらかい閉じた輪郭（点を滑らかにつなぐ） { pts }
//   dome      傘（波打つ縁のドーム）  { pts, apexDrop, skirt }
//   spike     先の細い突起（放射腕、胞子の棘） { base, mid, tip, baseHalf }
//   strand    先が細くなる紐（触手、脚）  { pts, w0, w1, layer }
//   membrane  透ける膜（ひれ、翼）        { base, ctrl1, far, ctrl2, end, layer }
import { bodyHSL } from './palette.mjs';

export const VB = 120;
export const C0 = VB / 2;

// 系統の id から作る、決まった小さな揺れ（-1〜1）。乱数は使わない。
export function wob(id, i) {
  const x = Math.sin((id * 12.9898 + i * 78.233) * 1.0) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

// 重力が強いほど低く平たい（docs/art-bible.md 3「形は環境の理由で決める」）。
export function proportions(gravity) {
  const g = Math.min(2.4, Math.max(0.35, gravity || 1));
  const flat = 1 + (g - 1) * 0.45;
  return { w: 32 * flat, h: 32 / flat };
}

// 体の大きさ（6段階）を絵の大きさに出す。
export const SIZE_SCALE = [0.44, 0.55, 0.68, 0.82, 0.93, 1];

/* ---------- 体の型 ---------- */

function formParts(look, id, w, h) {
  const form = look.form;
  const body = [], back = [];
  if (form === 'seg') { // 体節型: 丸い節が前から後ろへ細くなる
    const n = 5, step = (w * 1.7) / n;
    for (let i = 0; i < n; i++) {
      const k = 1 - i * 0.12;
      body.push({ type: 'ellipsoid', cx: C0 - w * 0.78 + step * i + step * 0.6, cy: C0 + wob(id, i) * 1.4, rx: h * 0.5 * k * 1.08, ry: h * 0.5 * k });
    }
  } else if (form === 'bell') { // 傘型: 波打つ縁のドーム
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, a = Math.PI + Math.PI * t;
      const r = w * (0.96 + Math.sin(t * Math.PI * 3) * 0.045 + wob(id, i) * 0.03);
      pts.push([C0 + Math.cos(a) * r, C0 + h * 0.26 + Math.sin(a) * r * 0.86]);
    }
    body.push({ type: 'dome', pts, apexDrop: h * 0.1, skirt: [C0, C0 + h * 0.5], soft: true });
  } else if (form === 'radial') { // 放射腕: 中央の塊から腕が放射状に出る（型そのものなので必ず描く）
    const rx = w * 0.58, ry = h * 0.58;
    for (const arm of arms(look, id)) {
      const px = (g, k) => C0 + Math.cos(g) * rx * k, py = (g, k) => C0 + Math.sin(g) * ry * k;
      const { a, reach, half: sp, tip } = arm;
      // 先の形: とがる / こん棒（先がふくらむ）/ かぎ（先が曲がる）
      const bulge = tip === 'club' ? 0.55 : tip === 'hook' ? 0.2 : 0.6;
      const skew = tip === 'hook' ? sp * 1.1 : 0;
      body.push({ type: 'spike', tip,
        base: [px(a - sp, 0.95), py(a - sp, 0.95)],
        mid: [px(a - sp * bulge + skew, reach * 0.8), py(a - sp * bulge + skew, reach * 0.8)],
        tip: [px(a + skew, reach), py(a + skew, reach)],
        mid2: [px(a + sp * bulge + skew, reach * 0.8), py(a + sp * bulge + skew, reach * 0.8)],
        end: [px(a + sp, 0.95), py(a + sp, 0.95)] });
    }
    body.push({ type: 'ellipsoid', cx: C0, cy: C0, rx, ry });
  } else if (form === 'spore') { // 胞子型: 小さな丸と、先の細い突起
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + wob(id, i) * 0.1, sp = 0.1;
      const px = (g, k) => C0 + Math.cos(g) * w * 0.48 * k, py = (g, k) => C0 + Math.sin(g) * h * 0.48 * k;
      back.push({ type: 'spike', straight: true,
        base: [px(a - sp, 0.9), py(a - sp, 0.9)], tip: [px(a, 1.9), py(a, 1.9)], end: [px(a + sp, 0.9), py(a + sp, 0.9)] });
    }
    body.push({ type: 'ellipsoid', cx: C0, cy: C0, rx: w * 0.5, ry: h * 0.5 });
  } else { // 不定形: ゆがんだやわらかい塊
    const pts = [];
    for (let i = 0; i < 11; i++) {
      const a = (Math.PI * 2 * i) / 11, r = (w * 0.7) * (1 + wob(id, i) * 0.24);
      pts.push([C0 + Math.cos(a) * r, C0 + Math.sin(a) * r * (h / w)]);
    }
    body.push({ type: 'loop', pts, soft: true });
  }
  return { body, back };
}

// 放射腕の腕。本数も長さも先の形も、親から受け継ぐ形質から決める（id の雑音では決めない）。
// 一覧でいちばん効くのはシルエットなので、受け継がれる差がそのまま輪郭の差になるようにする。
//   本数 ← 色味のずれ drift（3〜8本）。少ないほど長く太く、多いほど短く細い
//   先の形 ← 関節の向き joint（こん棒 / とがる / かぎ）
//   左右の非対称 asym ← 腕の長さと間隔を交互にずらす
export function arms(look, id) {
  const drift = look?.drift ?? 0, joint = look?.joint ?? 0;
  const n = 3 + (Math.abs(drift) % 6);
  const tip = joint < 0 ? 'club' : joint > 0 ? 'hook' : 'point';
  const long = 2.35 - n * 0.09;      // 本数が少ないほど長い
  const half = 0.42 - n * 0.022;     // 本数が少ないほど太い
  const out = [];
  for (let i = 0; i < n; i++) {
    const lop = look?.asym ? (i % 2 ? -1 : 1) : 0;
    out.push({
      a: (Math.PI * 2 * i) / n + wob(id, i) * 0.06 + lop * 0.16,
      reach: long * (1 + lop * 0.18),
      half,
      tip,
    });
  }
  return out;
}

/* ---------- 付属器 ---------- */

// 根元から角度 ang へ、少しずつ曲がりながら伸びる列。
function chain(x, y, ang, len, bend, n = 5) {
  const pts = [[x, y]];
  let a = ang;
  for (let i = 0; i < n; i++) { a += bend; x += Math.cos(a) * len; y += Math.sin(a) * len; pts.push([x, y]); }
  return pts;
}

function limbParts(look, w, h, id) {
  const kind = look.limb, n = Math.min(look.limbN || 0, 10);
  if (!kind || kind === 'none' || !n) return [];
  const out = [];
  if (kind === 'tentacle') {
    const half = look.form === 'bell' || look.form === 'radial';
    const turn = (look.joint || 0) * 0.04;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const a = half ? Math.PI * (0.1 + t * 0.8) : Math.PI * 2 * (i / n) + Math.PI / 2;
      const len = h * (0.26 + Math.abs(wob(id, i + 7)) * 0.14);
      out.push({ type: 'strand', layer: i % 2 ? 'back' : 'front', w0: 3.1, w1: 0.9,
        pts: chain(C0 + Math.cos(a) * w * 0.5, C0 + Math.sin(a) * h * 0.5, a, len, turn + wob(id, i) * 0.14, 5) });
    }
    return out;
  }
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1, row = Math.floor(i / 2), layer = i % 2 ? 'back' : 'front';
    const bx = C0 + side * w * 0.5, by = C0 - h * 0.12 + row * h * 0.26;
    if (kind === 'fin' || kind === 'wing') {
      const reach = kind === 'wing' ? 1.0 : 0.62, drop = kind === 'wing' ? -0.5 : -0.18;
      out.push({ type: 'membrane', layer,
        base: [bx, by], ctrl1: [bx + side * w * reach * 0.7, by + h * drop],
        far: [bx + side * w * reach, by + h * 0.22],
        ctrl2: [bx + side * w * reach * 0.42, by + h * 0.3], end: [bx, by + h * 0.12] });
    } else {
      const turn = (look.joint || 0) * 0.16;
      out.push({ type: 'strand', layer, w0: 3.4, w1: 1.8,
        pts: [[bx, by], [bx + side * w * 0.26, by + h * 0.3], [bx + side * w * 0.34 + turn * 5, by + h * 0.62]] });
    }
  }
  return out;
}

/* ---------- 目 ---------- */

function eyeParts(look, w, h, dark) {
  if (!look.eyeKind || look.eyeKind === 'none' || !look.eyeN) return [];
  const n = Math.min(look.eyeN, 8);
  const r = Math.max(1.8, (look.eyeSize || 0.3) * h * 0.3) * (dark ? 1.25 : 1);
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    out.push({ kind: look.eyeKind, r,
      x: C0 + (t - 0.5) * w * 0.86,
      y: C0 - h * 0.2 + (look.asym ? (i % 2) * 2.4 : 0) });
  }
  return out;
}

/* ---------- 設計図 ---------- */

// entry は engine/traits.mjs の bestiary() の1件。world は { star, gravity }。
export function bodyPlan(entry, world) {
  const look = entry.look || {}, id = entry.id;
  const base = proportions(world.gravity);
  const k = SIZE_SCALE[entry.sizeStep ?? SIZE_SCALE.length - 1] ?? 1;
  const w = base.w * k, h = base.h * k;
  const { body, back } = formParts(look, id, w, h);
  const dark = world.star === 'red' || look.depth === 'deep';
  return {
    id, form: look.form, w, h,
    land: entry.hab === 'land', deep: look.depth === 'deep', dark,
    soft: body.some(s => s.soft),
    color: bodyHSL(world.star, look, entry.color?.light ?? 0.5),
    body, back,
    limbs: limbParts(look, w, h, id),
    eyes: eyeParts(look, w, h, dark),
    cover: look.cover, pattern: look.pattern,
    glowing: look.pattern === 'glow',
    asym: !!look.asym, joint: look.joint || 0,
  };
}
