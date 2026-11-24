// 生命: Daisyworld 型の成長と死、分岐、複雑化、陸上進出、絶滅。
import { C } from './constants.mjs';
import { clamp } from './math.mjs';
import { gauss } from './random.mjs';
import { iceFraction } from './climate.mjs';
import { firstLook, inheritLook } from './traits.mjs';
import { planned } from './era.mjs';

const CX_FLAG = ['', '', 'euk', 'multi', 'complex', 'mind']; // 複雑さが上がったときの出来事の種類

const habitatT = (W, hab) => (hab === 'ocean' ? W.T * C.oceanTGain + C.oceanTOffset : W.T);
function beta(s, T) { const d = (T - s.topt) * (C.tolRef / s.tol); return 1 - C.daisyK * d * d; }

function capacity(W, hab) {
  if (W.snowball) return hab === 'ocean' ? C.snowballRefuge : 0;
  const ice = iceFraction(W.T);
  if (hab === 'ocean') return W.ocean * (1 - ice) * (W.T > C.oceanLifeT[0] && W.T < C.oceanLifeT[1] ? 1 : 0);
  return W.O2 >= C.landO2 ? W.land / C.landRef * (1 - ice) * (W.T > C.landLifeT[0] && W.T < C.landLifeT[1] ? 1 : 0) : 0;
}

// 海で生まれる最初の生命。単細胞なので、見た目は目も動く部分もない不定形。
export function firstLife(W) {
  const id = W.nextId++;
  return {
    id, parent: 0, born: W.issueNo, cx: 1, hab: 'ocean', topt: habitatT(W, 'ocean'), tol: C.firstTol,
    alb: 0, photo: false, aerobe: false, pop: C.firstPop, look: firstLook(W.seed, W.issueNo, id),
  };
}

// 100万年ぶんの生き物の営み。ev に出来事を足す。
export function lifeStep(W, r, innov, ev) {
  const sum = { ocean: 0, land: 0 }; for (const s of W.species) sum[s.hab] += s.pop;
  const K = { ocean: capacity(W, 'ocean'), land: capacity(W, 'land') };
  const born = [];
  for (const s of W.species) {
    let b = beta(s, habitatT(W, s.hab)) * C.growthScale * (s.photo || s.hab === 'land' ? C.photoBonus : 1);
    if (!s.aerobe && W.O2 > C.anaerobeO2) b -= C.anaerobePenalty * W.O2;
    const need = C.needO2[s.cx]; if (need > 0 && W.O2 < need) b *= W.O2 / need;
    const k = K[s.hab] > 0 ? 1 - sum[s.hab] / K[s.hab] : -1;
    s.pop = clamp(s.pop + s.pop * ((b > 0 ? b * k : b) - C.deathRate), 0, 1);
    if (!(s.pop > C.speciationMinPop && r() < C.speciation * s.pop * innov * C.speciationScale)) continue;
    // 分岐
    const d = {
      ...s, id: W.nextId++, parent: s.id, born: W.issueNo, pop: s.pop * C.daughterShare,
      topt: s.topt + gauss(r) * C.mutTopt,
      tol: clamp(s.tol + gauss(r) * C.mutTol, C.tolRange[0], C.tolRange[1]),
      alb: clamp(s.alb + gauss(r) * C.mutAlb, C.albRange[0], C.albRange[1]),
    };
    s.pop *= 1 - C.daughterShare;
    if (!d.photo && d.hab === 'ocean' && r() < C.photoChance) {
      d.photo = true;
      if (!W.flags.photo) { W.flags.photo = W.issueNo; ev.push({ k: 'photo' }); }
    }
    // 1段上がる確率は、時間の配分を入れた号から cxChancePlan を使う（engine/constants.mjs）。
    // 乱数は同じ回数だけ引くので、それより前の号の歴史は変わらない。
    const up = (planned(W, W.issueNo) ? C.cxChancePlan : C.cxChance)[d.cx];
    if (d.cx < C.maxCx && r() < up && W.O2 >= C.needO2[d.cx + 1] * C.cxO2Margin) {
      d.cx++; d.aerobe = d.cx >= C.aerobeCx || d.aerobe;
      const k2 = CX_FLAG[d.cx];
      if (!W.flags[k2]) { W.flags[k2] = W.issueNo; ev.push({ k: k2 }); }
    }
    if (d.hab === 'ocean' && d.cx >= C.landCx && W.O2 >= C.landO2 && r() < C.landChance) {
      d.hab = 'land'; d.topt = W.T;
      if (!W.flags.land) { W.flags.land = W.issueNo; ev.push({ k: 'land' }); }
    }
    // 見た目の層: 複雑さと生息域が決まったあとで、親から受け継いで少しだけ変える。
    // 専用の乱数の流れ（種、生まれた号、id）から作るので、計算に使う r には触らない＝歴史は変わらない。
    d.look = inheritLook(s, d, W.seed);
    born.push(d);
  }
  W.species.push(...born);
  const before = W.species.length;
  W.species = W.species.filter(s => s.pop > C.popMin);
  W.extinct += before - W.species.length;
  // 系統の数を上限で切るのは計算量のため。考える生き物は、生まれたときの個体数が親の15%しかなく、
  // 系統が上限いっぱいの惑星では現れた号に切り捨てられていた（eco-3 までの見落とし）。
  // そうなると世界は文明の時代に入ったまま、担う系統がいないので何も起きなくなる（柱3）。
  // いちばん意味のある系統なので、個体数が小さくても切らない（docs/creatures.md 段階4）。
  if (W.species.length > C.maxSpecies) {
    W.species.sort((a, b) => (b.cx >= C.maxCx) - (a.cx >= C.maxCx) || b.pop - a.pop);
    W.species.length = C.maxSpecies;
  }
  if (W.species.length === 0 && W.life) { W.life = false; ev.push({ k: 'sterile' }); }
}

// 隕石などの打撃。lo〜hi の幅で系統ごとに個体数を減らし、消えた系統の割合を返す。
export function massKill(W, r, lo, hi) {
  const n0 = W.species.length; if (!n0) return 0;
  for (const s of W.species) {
    const k = lo + (hi - lo) * r() * (C.killCx[0] + C.killCx[1] * s.cx);
    s.pop *= clamp(1 - k, 0, 1);
    if (r() < k * C.killWipe) s.pop = 0;
  }
  W.species = W.species.filter(s => s.pop > C.popMin); W.extinct += n0 - W.species.length;
  return (n0 - W.species.length) / n0;
}
