// 見た目の層: 惑星の重力と大気、系統の見た目の性質と受け継ぎ。docs/creatures.md の実装の段階1。
//
// この層は気候と個体数の計算には使わない（docs/creatures.md 確定事項5）。歴史を変えないために、
// 乱数はこの層だけの流れ（rng('look', ...) など）から作り、計算の乱数 r には一度も触らない。
// 体の大きさと色味は状態に持たず、見るときに計算する（複雑さと酸素、恒星から決まるため）。
import { C } from './constants.mjs';
import { clamp } from './math.mjs';
import { rng } from './random.mjs';

// 原始の5つの体の型（試作01 生物標本室と同じ）
export const FORMS = ['blob', 'seg', 'bell', 'radial', 'spore'];
export const EYE_KINDS = ['none', 'lens', 'compound'];
export const COVERS = ['bare', 'shell', 'scale', 'fur'];
export const LIMBS = ['none', 'fin', 'leg', 'wing', 'tentacle'];
export const DEPTHS = ['shallow', 'mid', 'deep'];
export const PATTERNS = ['plain', 'spots', 'stripes', 'bands', 'glow'];

// 丸めで -0 が出ると JSON で往復できない（engine/checkpoint.mjs）。0 に直す。
const i0 = v => { const n = Math.round(v); return n === 0 ? 0 : n; };
// 真ん中に寄った [0, 1) の乱数（3つの平均）。Math.pow を使わずに山形にする。
const mid = r => (r() + r() + r()) / 3;
const pick = (r, arr) => arr[Math.min(arr.length - 1, Math.floor(r() * arr.length))];

/* ---------- 惑星ごと（種から1回だけ決める） ---------- */

// 重力と大気の濃さ。惑星が生まれた時点で決まり、その後は変わらない。
export function planetLook(seed) {
  const r = rng('look-planet', seed);
  const g = C.gravityRange, a = C.airRange;
  return {
    gravity: Math.round((g[0] + (g[1] - g[0]) * mid(r)) * 100) / 100,
    air: Math.round((a[0] + (a[1] - a[0]) * mid(r)) * 100) / 100,
  };
}

/* ---------- 系統ごと（親から受け継ぎ、分岐のたびに少しだけ変わる） ---------- */

// 最初の生命の見た目。単細胞なので、目も動く部分もない不定形。
export function firstLook(seed, issueNo, id) {
  const r = rng('look-first', seed, issueNo, id);
  return {
    form: 'blob', eyeN: 0, eyeKind: 'none', eyeSize: 0, cover: 'bare', limb: 'none', limbN: 0,
    depth: 'shallow', pattern: 'plain', asym: 0, joint: 0,
    drift: i0(mid(r) * C.lookDriftSpan - C.lookDriftSpan / 2), // 色味の系統ごとのずれ
  };
}

// 体の型から、動く部分とその本数を決める。海では脚がひれになる。
function limbForForm(r, form, hab) {
  const opts = C.limbByForm[form] ?? C.limbByForm.blob;
  let limb = pick(r, opts);
  if (hab === 'ocean' && (limb === 'leg' || limb === 'wing')) limb = 'fin'; // 海では脚も翼もひれになる
  if (hab === 'land' && limb === 'fin') limb = 'leg';
  const n = limb === 'none' ? 0 : limb === 'fin' ? 2 + i0(r() * 4) : limb === 'tentacle' ? 4 + 2 * i0(r() * 4) : 2 + 2 * i0(r() * 3);
  return { limb, limbN: n };
}

// 分岐した系統の見た目。親のものを受け継ぎ、少しだけ変える。
// parent は親の系統、s は分岐した系統（複雑さ、生息域、光合成はすでに決まっている）。
// 親の look とは別の物を返す（同じ物を返すと、途中経過の保存で止まる）。
export function inheritLook(parent, s, seed) {
  const r = rng('look', seed, s.born, s.id);
  const L = { ...(parent.look ?? parent) };

  // 多細胞になった分岐で、体の型を持ち始める（それまでは不定形のまま）。
  // ここで型を決めないと、多細胞になったあとの系統がいつまでも不定形で、動く部分も持たない。
  if ((parent.cx ?? s.cx) < C.lookCxForm && s.cx >= C.lookCxForm) {
    L.form = pick(r, FORMS);
    L.cover = r() < C.lookCoverAtMulti ? pick(r, COVERS) : 'bare';
    Object.assign(L, limbForForm(r, L.form, s.hab));
  }
  // 陸に上がった系統は、住む深さを持たない
  if (s.hab === 'land') L.depth = '';
  else if (!L.depth) L.depth = 'shallow';

  // 体の型: 多細胞になってから分かれる。型が変わると、動く部分も新しい型のものになる
  if (s.cx >= C.lookCxForm && r() < C.lookFormChance) {
    L.form = pick(r, FORMS);
    Object.assign(L, limbForForm(r, L.form, s.hab));
  }

  // 目: 多細胞になってから持ちうる。種類が決まったあとは数と大きさが揺れる
  if (s.cx >= C.lookCxEye) {
    if (L.eyeKind === 'none' && r() < C.lookEyeGain) {
      L.eyeKind = r() < C.lookCompoundShare ? 'compound' : 'lens';
      L.eyeN = 2; L.eyeSize = C.lookEyeSize0;
    } else if (L.eyeKind !== 'none') {
      if (r() < C.lookEyeLose) { L.eyeKind = 'none'; L.eyeN = 0; L.eyeSize = 0; } // 暗い場所で目を失う
      else {
        if (r() < C.lookEyeNChance) L.eyeN = clamp(L.eyeN + (r() < 0.5 ? -1 : 1), C.lookEyeNRange[0], C.lookEyeNRange[1]);
        if (r() < C.lookEyeSizeChance) L.eyeSize = Math.round(clamp(L.eyeSize + (mid(r) - 0.5) * C.lookEyeSizeStep, C.lookEyeSizeRange[0], C.lookEyeSizeRange[1]) * 100) / 100;
      }
    }
  }

  // 体の覆いと動く部分: 多細胞になってから
  if (s.cx >= C.lookCxLimb) {
    if (r() < C.lookCoverChance) L.cover = pick(r, COVERS);
    if (r() < C.lookLimbChance) Object.assign(L, limbForForm(r, L.form, s.hab));
    // 陸に上がった系統は、ひれを脚に持ち替える
    if (s.hab === 'land' && L.limb === 'fin') Object.assign(L, limbForForm(r, L.form, 'land'));
  }

  // 模様は単細胞のうちから変わる（微生物のマットの色）。系統由来のずれは、体の型ができてから
  if (r() < C.lookPatternChance) L.pattern = pick(r, PATTERNS);
  if (s.cx >= C.lookCxForm) {
    if (r() < C.lookQuirkChance) L.asym = L.asym ? 0 : 1;
    if (r() < C.lookQuirkChance) L.joint = clamp(L.joint + (r() < 0.5 ? -1 : 1), C.lookJointRange[0], C.lookJointRange[1]);
  }
  if (r() < C.lookDriftChance) L.drift = clamp(L.drift + (r() < 0.5 ? -1 : 1), -C.lookDriftSpan, C.lookDriftSpan);
  return L;
}

/* ---------- 見るときに計算するもの（状態には持たない） ---------- */

// 体の大きさ。複雑さと、陸の系統なら酸素の濃さで決まる（docs/creatures.md「体の大きさ」）。
// 単位は m（長さの目安）。重力が強いほど小さく、大気が濃いほど（陸で）大きくなれる。
export function bodySize(s, W) {
  const base = C.sizeByCx[s.cx] ?? C.sizeByCx[0];
  let m = base;
  if (s.hab === 'land') m *= 1 + C.sizeO2Gain * clamp(W.O2 / C.o2Max, 0, 1);
  m *= C.sizeGravity[0] + C.sizeGravity[1] / Math.sqrt(Math.max(W.gravity ?? 1, C.sizeGravityMin));
  return Math.round(m * 1e9) / 1e9; // 単細胞は数マイクロメートルなので、1000分の1で丸めると0になる
}

export const SIZE_LABELS = [
  { upTo: 0.001, ja: '目に見えない' }, { upTo: 0.02, ja: 'とても小さい' }, { upTo: 0.3, ja: '小さい' },
  { upTo: 2, ja: '中くらい' }, { upTo: 10, ja: '大きい' }, { upTo: Infinity, ja: 'とても大きい' },
];
export const sizeLabel = m => SIZE_LABELS.find(x => m < x.upTo).ja;

// 色味。恒星の色で全体が決まり（docs/art-bible.md）、体の色（アルベド）が明るさ、drift が系統ごとのずれ。
export function bodyColor(s, W) {
  const base = C.hueByStar[W.star] ?? C.hueByStar.yellow;
  const look = s.look ?? {};
  return {
    hue: ((base + (look.drift ?? 0)) % 360 + 360) % 360,
    light: Math.round(clamp(C.lightBase + C.lightFromAlb * s.alb, 0, 1) * 100) / 100,
  };
}

/* ---------- 日本語の名前（図鑑と出来事の文章に使う） ---------- */

const JA = {
  form: { blob: '不定形', seg: '体節型', bell: '傘型', radial: '放射腕', spore: '胞子型' },
  eyeKind: { none: '目なし', lens: 'レンズの目', compound: '複眼' },
  cover: { bare: 'むき出し', shell: '殻', scale: 'うろこ', fur: '毛' },
  limb: { none: '動く部分なし', fin: 'ひれ', leg: '脚', wing: '翼', tentacle: '触手' },
  depth: { shallow: '浅い', mid: '中ほど', deep: '深い', '': '' },
  pattern: { plain: '無地', spots: '斑点', stripes: 'しま', bands: '帯', glow: '光る' },
};
export const describeTrait = (field, value) => JA[field]?.[value] ?? String(value);

// 複雑さの呼び名（engine/constants.mjs の maxCx の説明と同じ段階）
export const CX_JA = ['', '原核の生き物', '真核の生き物', '多細胞の生き物', '大型の生き物', '考える生き物'];

// 住んでいる場所。
function placeJa(s) {
  if (s.hab === 'land') return '陸';
  const d = s.look?.depth;
  return d ? `海の${describeTrait('depth', d)}ところ` : '海';
}

// 図鑑の1行ぶんの姿（名前は段階1では付かない。docs/creatures.md 確定事項10 は記事キーワードが要る）。
// 体を持たない系統（単細胞）には、体の覆いや左右の非対称を書かない。
export function describeLook(s, W) {
  const L = s.look ?? {};
  const parts = [];
  if (s.cx < C.lookCxForm) {
    parts.push(CX_JA[s.cx] || '生き物');
    if (L.pattern && L.pattern !== 'plain') parts.push(describeTrait('pattern', L.pattern));
  } else {
    parts.push(describeTrait('form', L.form));
    if (L.cover !== 'bare') parts.push(describeTrait('cover', L.cover));
    if (L.eyeKind && L.eyeKind !== 'none') parts.push(`${describeTrait('eyeKind', L.eyeKind)}が${L.eyeN}つ`);
    else parts.push('目なし');
    if (L.limb && L.limb !== 'none') parts.push(`${describeTrait('limb', L.limb)}が${L.limbN}本`);
    if (L.pattern && L.pattern !== 'plain') parts.push(describeTrait('pattern', L.pattern));
    if (L.asym) parts.push('左右が非対称');
  }
  parts.push(placeJa(s));
  parts.push(sizeLabel(bodySize(s, W)));
  return parts.join('、');
}

// いま生きている系統の図鑑（姿だけ。名前と「似ている一言」は段階1より後）。
export function bestiary(W) {
  return [...W.species]
    .sort((a, b) => b.pop - a.pop || a.id - b.id)
    .map(s => ({
      id: s.id, parent: s.parent, born: s.born, cx: s.cx, hab: s.hab,
      look: { ...(s.look ?? {}) }, size: bodySize(s, W), sizeLabel: sizeLabel(bodySize(s, W)),
      color: bodyColor(s, W), text: describeLook(s, W),
    }));
}
