// 試作09「キャラ層」: 体の型ごとの rig をデータとして持つ。
//
// ここは描かない。viewer/plan.mjs が作った「体の設計図」を受け取り、
// どう立たせるか（比率、焦点、ポーズ、陰影、接地影）を数にして返すだけ。
//
// 守ること:
//   - plan.mjs の「形質 → 形の設計図」の決定は上書きしない。
//     腕の本数は drift、先の形は joint、左右の非対称は asym、という決定規則はそのまま使う。
//     ここでやるのは、できあがった形の見せ方（倍率、回転、陰影の段）だけ。
//   - エンジン（engine/）には触らない。歴史は1ビットも動かさない。
//   - 形質にない器官は作らない。焦点は「その種にあるもの」からしか選ばない。
import { wob, C0, VB } from '../../viewer/plan.mjs';

// 光の向き（viewer/palette.mjs の LIGHT と同じ。左上から）
export const LIGHT = { x: -0.38, y: -0.46 };

// 体の型ごとの rig。数はすべて「設計図の寸法に対する倍率」か「度」。
//   deform  比率。head は焦点に近い塊の倍率、limb は付属器を外へ張り出させる倍率、
//           eye は目の倍率（デフォルメ。目の数と位置は plan のまま）、lift は翼を持ち上げる角（度）
//   focus   焦点にする器官の優先順。その種が持っていないものは飛ばす
//   pose    ポーズ。lean は傾き（度）、swing は付属器を交互に振る角（度）、rise は浮かせる量
//   shade   陰影。steps は段数（2か3）、term は明暗の境の位置、rim は縁の光の太さ
//   ground  接地影。kind は contact（地面に着く）か float（浮いている）
export const RIGS = {
  seg: {
    ja: '体節型', pose_ja: '前傾の構え',
    deform: { head: 1.42, taper: 0.86, bodyX: 1, bodyY: 1, limb: 1.16, eye: 2.4, lift: 26 },
    focus: ['eye', 'glow', 'core'],
    pose: { lean: -6, swing: 14, rise: 0, drop: 0.02 },
    shade: { steps: 3, term: 0.54, light: 0.4, rim: 2.3 },
    ground: { kind: 'contact', spread: 1.12, depth: 0.15, opacity: 0.45 },
    note: '先頭の節を大きく、後ろへ強く細く。前へ踏み出す角度で止める',
  },
  radial: {
    ja: '放射腕', pose_ja: '面に貼りつく',
    deform: { head: 0.86, taper: 1, bodyX: 0.9, bodyY: 0.9, limb: 1.24, eye: 2.2, lift: 0 },
    focus: ['eye', 'glow', 'core'],
    pose: { lean: -9, swing: 10, rise: 0.02, drop: 0 },
    shade: { steps: 3, term: 0.5, light: 0.44, rim: 2.1 },
    ground: { kind: 'float', spread: 1.3, depth: 0.1, opacity: 0.3 },
    note: '中心の塊を小さく、腕を外へ。腕の広がりがそのままシルエットになる',
  },
  bell: {
    ja: '傘型', pose_ja: '開いた瞬間',
    deform: { head: 1.1, taper: 1, bodyX: 1.14, bodyY: 0.9, limb: 1.3, eye: 2.2, lift: 0 },
    focus: ['glow', 'eye', 'core'],
    pose: { lean: -3, swing: 16, rise: 0.06, drop: 0 },
    shade: { steps: 2, term: 0.46, light: 0.5, rim: 2.6 },
    ground: { kind: 'float', spread: 1.1, depth: 0.08, opacity: 0.24 },
    note: '傘を横に広げ、触手を長く垂らす。透けるので陰影は2段',
  },
  spore: {
    ja: '胞子型', pose_ja: '静止',
    deform: { head: 0.92, taper: 1, bodyX: 0.94, bodyY: 0.94, limb: 1.1, eye: 2, lift: 0 },
    focus: ['glow', 'eye', 'core'],
    pose: { lean: 4, swing: 6, rise: 0, drop: 0.04 },
    shade: { steps: 2, term: 0.56, light: 0.38, rim: 2 },
    ground: { kind: 'contact', spread: 0.8, depth: 0.2, opacity: 0.5 },
    note: '本体を小さく、棘を放射に。重さを感じる濃い接地影',
  },
  blob: {
    ja: '不定形', pose_ja: 'たゆたう',
    deform: { head: 1.18, taper: 1, bodyX: 1.02, bodyY: 0.98, limb: 1.1, eye: 2.2, lift: 0 },
    focus: ['nucleus', 'glow', 'eye', 'core'],
    pose: { lean: -4, swing: 8, rise: 0.04, drop: 0 },
    shade: { steps: 2, term: 0.48, light: 0.46, rim: 2.4 },
    ground: { kind: 'float', spread: 0.9, depth: 0.1, opacity: 0.26 },
    note: '核（あれば）を大きく。輪郭はやわらかく、浮いている影',
  },
};

export const rigOf = form => RIGS[form] ?? RIGS.blob;

// 焦点を1つに決める。その種が持っていないものは選ばない（形質にない器官は作らない）。
//   eye      レンズの目／複眼。2つ以上あるときは、その重心をひとつの焦点とする
//   nucleus  核（単細胞の設計図にだけある）
//   glow     光る模様（pattern が glow のとき）
//   core     体の中心。器官ではなく「光の当たりどころ」なので、どの種にもある
function focusOf(plan, order) {
  for (const kind of order) {
    if (kind === 'eye' && plan.eyes?.length) {
      // 光の当たる側のいちばん大きな目を焦点にする（目が離れていても、間に光が浮かないように）
      const score = e => e.r * 3 - (e.x - C0) * LIGHT.x * 0.1 - (e.y - C0) * LIGHT.y * 0.1;
      const e = [...plan.eyes].sort((a, b) => score(b) - score(a))[0];
      return { kind: 'eye', x: e.x, y: e.y, r: e.r, n: plan.eyes.length };
    }
    if (kind === 'nucleus' && plan.nucleus) {
      const n = plan.nucleus;
      return { kind: 'nucleus', x: n.cx, y: n.cy, r: Math.max(n.rx, n.ry), n: 1 };
    }
    if (kind === 'glow' && plan.glowing) return { kind: 'glow', x: C0, y: C0, r: plan.w * 0.3, n: 1 };
    if (kind === 'core') return { kind: 'core', x: C0 + LIGHT.x * plan.w * 0.22, y: C0 + LIGHT.y * plan.h * 0.22, r: plan.w * 0.26, n: 1 };
  }
  return { kind: 'core', x: C0, y: C0, r: plan.w * 0.26, n: 1 };
}

// 設計図と形質から、この1体ぶんの rig を解く。乱数は使わない（id の決まった揺れだけ）。
export function rigFor(plan, entry) {
  const look = entry?.look ?? {};
  const base = rigOf(plan.form);
  const id = plan.id ?? 1;
  const joint = look.joint || 0, asym = look.asym ? 1 : 0;
  // ポーズは形質で振れる。関節の向きで傾きが変わり、左右の非対称で構えが崩れる
  const lean = base.pose.lean + joint * 2.2 + asym * 3 + wob(id, 201) * 2;
  const swing = base.pose.swing * (1 + joint * 0.12) + asym * 4;
  const rise = base.pose.rise + (plan.land ? 0 : 0.02);
  const drop = plan.land ? base.pose.drop : 0;
  return {
    form: plan.form, ja: base.ja, pose_ja: base.pose_ja, note: base.note,
    deform: { ...base.deform },
    focus: focusOf(plan, base.focus),
    pose: { lean, swing, rise, drop, phase: asym ? 0.65 : 0.5 },
    shade: { ...base.shade },
    ground: { ...base.ground, land: !!plan.land },
    // 絵の中での立ち位置と余白。接地する種は下に寄せ、浮く種は中心に置く。
    // 枠からはみ出す個体は縮めて収める（縮めるのは、はみ出すときだけ。小さい個体は小さいまま）
    anchor: { x: C0, y: base.ground.kind === 'contact' ? VB * 0.60 : VB * 0.48, margin: VB * 0.07 },
  };
}

// 報告用の表（README と比較ページに同じものを出す）
export const rigTable = () => Object.entries(RIGS).map(([form, r]) => ({
  form, ja: r.ja,
  比率: `先頭 x${r.deform.head} / 体 x${r.deform.bodyX}・x${r.deform.bodyY} / 付属器 x${r.deform.limb} / 目 x${r.deform.eye}${r.deform.lift ? ` / 翼を${r.deform.lift}度持ち上げ` : ''}`,
  焦点: r.focus.join(' → '),
  ポーズ: `${r.pose_ja}（傾き ${r.pose.lean}度、振り ${r.pose.swing}度）`,
  陰影: `${r.shade.steps}段 + 縁の光 ${r.shade.rim}`,
  接地影: r.ground.kind === 'contact' ? `接地（広がり x${r.ground.spread}、濃さ ${r.ground.opacity}）` : `浮遊（広がり x${r.ground.spread}、濃さ ${r.ground.opacity}）`,
  note: r.note,
}));
