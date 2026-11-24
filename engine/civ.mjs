// 文明（docs/creatures.md「文明」、実装の段階4）。
//
// 考える生き物（複雑さ5）の系統は、文明を持つことがある。文明は5つの段階を、時間と記事で進む。
// どの段階でも滅びることがあり、滅びた文明は遺跡として残る。未来都市まで進んだ文明は、まれに星を出る。
//
// 文明の時代は1号が5,000年しかなく、進化と気候の計算は止まっている（engine/era.mjs）。
// 文明が動く尺度は数千年なので、ここの確率は「百万年あたり」ではなく「1号あたり」で考える。
// 乱数は文明だけの流れ（rng('civ', ...)）から作り、気候と生命の乱数には触らない。
// そのため、文明を足しても文明の時代より前の歴史は1ビットも変わらない（tests/civ.test.mjs が固定）。
import { C } from './constants.mjs';
import { rng } from './random.mjs';

// 段階（docs/creatures.md「段階」の表）。並びは進む順。
export const CIV_STAGES = ['trace', 'village', 'town', 'city', 'future'];
export const CIV_JA = { trace: '痕跡', village: '集落', town: '町', city: '都市', future: '未来都市' };
// 住まいの種類（集落の段階で決まり、その先も受け継ぐ）
export const DWELLINGS = ['earth', 'cliff', 'under', 'water', 'tree', 'tower'];
export const DWELL_JA = {
  earth: '土の家', cliff: '崖の住まい', under: '地下の町',
  water: '水中の町', tree: '木や植物の町', tower: '高い塔の町',
};
// 滅びる理由（戦争は描かない。docs/creatures.md）
export const FALL_WHYS = ['impact', 'climate', 'unknown', 'extinct'];
export const FALL_JA = {
  impact: '大きな隕石', climate: '気候の急変', unknown: '理由はわからない', extinct: '担っていた系統が絶えた',
};

export const stageIndex = stage => CIV_STAGES.indexOf(stage);
const next = stage => CIV_STAGES[stageIndex(stage) + 1];

// その号の技術の記事の数（0〜1に直したもの）。台帳の categories から数える。
// 「技術やプログラミングの記事が多い号を経た文明ほど、速く進む」（docs/creatures.md）。
// categories を持たない台帳（合成の号など）では0になる。
export function techOf(issue) {
  const cats = issue?.categories;
  if (!cats) return 0;
  let n = 0;
  for (const k of C.civTechCats) n += cats[k] || 0;
  return Math.min(n, C.civTechCap) / C.civTechCap;
}

// 住まいの種類。集落の段階で、そのときの惑星と系統の条件から決まる（docs/creatures.md の表）。
// 条件が重なるときは、理由の強い順（暮らす場所 → 重力 → 気候 → 体 → 星の植生 → 外敵）に決める。
export function dwellingFor(W, s) {
  if (s.hab === 'ocean') return 'water';                 // 水中で暮らす型
  if (W.gravity <= C.civTowerGravity) return 'tower';    // 重力が弱い
  // 暑すぎるか寒すぎる: 気温が、その系統の好む温度から離れている（海の系統は海の中の温度で見る）
  const T = s.hab === 'ocean' ? W.T * C.oceanTGain + C.oceanTOffset : W.T;
  if (Math.abs(T - s.topt) >= s.tol * C.civUnderTol) return 'under';
  if (s.look?.limb === 'wing') return 'cliff';           // 翼のある型
  const n = W.species.length;
  // 植物のような生き物が多い星（光合成をして、陸にいて、動く部分がない系統）
  const plant = W.species.filter(x => x.photo && x.hab === 'land' && x.look?.limb === 'none').length;
  if (n && plant / n >= C.civTreeShare) return 'tree';
  // 外敵が多い: 陸の大型の生き物が多い
  if (W.species.filter(x => x.hab === 'land' && x.cx >= 4).length >= C.civCliffBig) return 'cliff';
  return 'earth';                                        // 乾いた平地
}

// 文明を担える系統（考える生き物で、いま文明を持っていないもの）。
// 文明が滅びた系統も、しばらく（civRecover 号）たてばまた立ち上がる。遺跡はそのまま残る。
// 文明の時代は分岐が止まっているので、これがないと最初の文明が滅びた惑星は、
// 残りの観測（ときに数百号）で何も起きなくなる（柱3）。
const candidates = (W) => {
  const live = new Set(W.civs.map(c => c.id));
  const resting = new Map();
  for (const r of W.ruins) resting.set(r.id, Math.max(resting.get(r.id) ?? 0, r.to));
  return W.species.filter(s => s.cx >= C.maxCx && !live.has(s.id)
    && W.issueNo - (resting.get(s.id) ?? -Infinity) >= C.civRecover);
};

function fall(W, c, why, ev) {
  W.ruins.push({ id: c.id, stage: c.stage, dwelling: c.dwelling, from: c.from, to: W.issueNo, why });
  if (W.ruins.length > C.maxRuins) W.ruins.splice(0, W.ruins.length - C.maxRuins);
  ev.push({ k: 'civFall', stage: c.stage, why });
}

// 1号ぶんの文明の歩み。文明の時代の号で、隕石の打撃のあとに呼ぶ（engine/world.mjs）。
// ev にはこの号の出来事が入っている（隕石と洪水玄武岩を、滅びる理由として読む）。
export function civStep(W, issue, ev) {
  const r = rng('civ', W.seed, issue.issueNo, issue.digest);
  const tech = techOf(issue);
  const hit = ev.some(e => e.k === 'impact' && (e.size === 'large' || e.size === 'giant'));
  const lip = ev.some(e => e.k === 'lip');
  const alive = new Set(W.species.map(s => s.id));

  // 滅び。どの段階でも起きる（大きな隕石、気候の急変、理由のわからない消滅）。
  // 担っていた系統が絶えた文明も、そこで終わる。
  // 生き物の計算の隕石と洪水玄武岩は、1号5,000年では確率がほぼ0なので、文明を終わらせる
  // 小さめの出来事（1km級の天体、数万年に1回の気候の急変）を号あたりの確率で別に持つ（engine/constants.mjs）。
  const kept = [];
  for (const c of W.civs) {
    if (!alive.has(c.id)) { fall(W, c, 'extinct', ev); continue; }
    const why = hit && r() < C.civFallImpact ? 'impact'
      : lip && r() < C.civFallLip ? 'climate'
      : r() < C.civImpactChance ? 'impact'
      : r() < C.civClimateChance ? 'climate'
      : r() < C.civFallBase ? 'unknown'
      : '';
    if (why) { fall(W, c, why, ev); continue; }
    kept.push(c);
  }
  W.civs = kept;

  // 段階が進む。時間（同じ段階に civStageMin 号とどまる）と記事（技術の記事で速くなる）で決まる。
  // 都市から未来都市へは、積み上がった技術も要る（「長い時間と、技術の記事が多い号」）。
  for (const c of W.civs) {
    c.tech = Math.round((c.tech + tech) * 1000) / 1000;
    const to = next(c.stage);
    if (!to || W.issueNo - c.stageFrom < C.civStageMin) continue;
    if (to === 'future' && c.tech < C.civFutureTech) continue;
    const p = C.civAdvance[c.stage] * (1 + C.civTechGain * tech);
    if (r() >= p) continue;
    c.stage = to; c.stageFrom = W.issueNo;
    if (to === 'village') c.dwelling = dwellingFor(W, W.species.find(s => s.id === c.id));
    ev.push({ k: 'civ', stage: to, dwell: c.dwelling });
  }

  // 文明の始まり（痕跡）。考える生き物が現れてしばらくたってから。
  if (W.civs.length < C.maxCivs && W.flags.mind && W.issueNo - W.flags.mind >= C.civTraceAfter) {
    for (const s of candidates(W)) {
      if (W.civs.length >= C.maxCivs) break;
      if (r() >= C.civStart) continue;
      W.civs.push({ id: s.id, from: W.issueNo, stage: 'trace', stageFrom: W.issueNo, dwelling: '', tech: 0 });
      ev.push({ k: 'civ', stage: 'trace', dwell: '' });
    }
  }

  // 星を出る（伝説級）。未来都市まで進んだ文明だけ。観測はこの号で終わる（engine/planet.mjs）。
  for (const c of W.civs) {
    if (c.stage === 'future' && r() < C.civExodus) { W.exodus = W.issueNo; ev.push({ k: 'exodus' }); break; }
  }
}

// いま届いている段階（遺跡も含めた、その惑星でいちばん進んだ段階）。年表と図鑑に使う。
export function civReach(W) {
  let best = -1;
  for (const c of [...W.civs, ...W.ruins]) best = Math.max(best, stageIndex(c.stage));
  return best < 0 ? '' : CIV_STAGES[best];
}
