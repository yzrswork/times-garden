// 図鑑のページ。公開データ（data/）から世界を組み立て、いま生きている系統の姿を並べる。
// 重い計算はしない（最新の途中経過から先の最大49号ぶんだけ）。docs/art-bible.md 8 の性能予算。
import { restore } from '../engine/observations.mjs';
import { fileName } from '../engine/observations.mjs';
import { bestiary, CX_JA } from '../engine/traits.mjs';
import { describe as describeEvent, END_TEXT } from '../engine/events.mjs';
import { eraOf, ERA_JA, myrOf } from '../engine/era.mjs';
import { planetAge } from '../engine/planet.mjs';
import { CIV_JA, DWELL_JA, FALL_JA } from '../engine/civ.mjs';
import { C } from '../engine/constants.mjs';
import { creatureSVG } from './draw.mjs';
import { townSVG } from './town.mjs';
import { palette } from './palette.mjs';

const BASE = new URL('../', import.meta.url);
const get = async p => (await fetch(new URL(p, BASE))).json();
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const STAR_JA = { red: '赤色矮星', yellow: '黄色い恒星', blue: '青白い恒星' };
// 焼きカードがある系統（単細胞）。pipeline/cards.mjs の bakeable と同じ条件。
const bakedCard = e => e.cx === 2;

// この号の1号あたりの時間を、読みやすい単位で。配分を入れる前の号は1号2,000万年。
function myrFmt(W, issueNo) {
  const myr = issueNo >= (W.timingFrom ?? 1) ? myrOf(eraOf(W)) : C.myrPerIssue;
  return myr >= 1 ? `${myr * 100}万年` : `${Math.round(myr * 1e6).toLocaleString('ja-JP')}年`;
}

export async function load() {
  const manifest = await get('data/manifest.json');
  const ledger = (await get('data/ledger.json')).issues;
  const [chunks, checkpoints] = await Promise.all([
    Promise.all(manifest.checkpoints.map(n => get('data/observations/' + fileName(n)))),
    Promise.all(manifest.checkpoints.map(n => get('data/checkpoints/' + fileName(n)))),
  ]);
  const t0 = performance.now();
  const r = restore({ manifest, ledger, chunks, checkpoints });
  return { ...r, manifest, ms: Math.round((performance.now() - t0) * 10) / 10 };
}

export function render(root, { W, snapshots, problems, ms }) {
  const p = palette(W.star);
  document.documentElement.style.setProperty('--bg', p.bg);
  document.documentElement.style.setProperty('--panel', p.panel);
  document.documentElement.style.setProperty('--text', p.text);
  document.documentElement.style.setProperty('--dim', p.dim);
  document.documentElement.style.setProperty('--accent', p.accent);
  root.textContent = '';

  const last = snapshots.at(-1);
  const era = eraOf(W), age = planetAge(W);
  const head = el('header');
  head.append(el('h1', null, `観測記録 ${W.planetNo}つ目の星`));
  const facts = [
    ['号', `#${last.issueNo}（${last.date} ${last.edition === 'morning' ? '朝刊' : '昼刊'}）`],
    ['時代', `${ERA_JA[era]}（1号 ${myrFmt(W, last.issueNo)}）`],
    ['観測', `${age} / ${C.yearIssues}号`],
    ['恒星', STAR_JA[W.star] ?? W.star],
    ['年代', `約${(last.gyr * 10).toFixed(1)}億年目`], // gyr は10億年が1。pipeline/report.mjs と同じ言い方
    ['気温', `${last.T.toFixed(1)}℃`],
    ['酸素', `地球の${last.O2.toFixed(2)}倍`],
    ['CO2', `${last.CO2}ppm`],
    ['重力', `${W.gravity.toFixed(2)}倍`],
    ['大気', `${W.air.toFixed(2)}倍`],
    ['系統', `${last.nSpecies}（絶滅 ${last.extinctTotal}）`],
  ];
  const dl = el('dl', 'facts');
  for (const [k, v] of facts) { dl.append(el('dt', null, k), el('dd', null, v)); }
  head.append(dl);
  root.append(head);

  // 直近の出来事（柱3: 久しぶりに開いた人が、進んだ号ぶんの変化を一目でつかめるか）
  const recent = snapshots.slice(-60).flatMap(s => s.events
    .filter(e => e.k !== 'super' && !(e.k === 'impact' && e.size === 'small'))
    .map(e => `#${s.issueNo} ${describeEvent(e)}`));
  const log = el('section', 'log');
  log.append(el('h2', null, '最近の出来事'));
  if (recent.length) { const ul = el('ul'); for (const t of recent.slice(-8)) ul.append(el('li', null, t)); log.append(ul); }
  else log.append(el('p', 'dim', '直近60号では大きな出来事はなかった。'));
  root.append(log);

  const list = bestiary(W);

  // 文明（docs/creatures.md 段階4）。いまある文明と、滅びた文明の遺跡。
  if (W.civs?.length || W.ruins?.length) {
    const sec = el('section', 'civ');
    sec.append(el('h2', null, '文明'));
    const grid = el('div', 'towns');
    for (const c of W.civs ?? []) {
      const card = el('article', 'card town');
      const art = el('div', 'art');
      art.innerHTML = townSVG(c, W);
      card.append(art);
      card.append(el('p', 'cx', `${CIV_JA[c.stage] ?? c.stage}${c.dwelling ? '・' + (DWELL_JA[c.dwelling] ?? c.dwelling) : ''}`));
      const owner = list.find(e => e.id === c.id);
      if (owner) card.append(el('p', 'look', `${owner.traits.join('、')}の系統`));
      card.append(el('p', 'meta', `#${c.from} から・${last.issueNo - c.from}号`));
      grid.append(card);
    }
    for (const r of [...(W.ruins ?? [])].reverse()) {
      const card = el('article', 'card town');
      const art = el('div', 'art');
      art.innerHTML = townSVG(r, W, { ruin: true });
      card.append(art);
      card.append(el('p', 'cx', `${CIV_JA[r.stage] ?? r.stage}の遺跡`));
      card.append(el('p', 'look', FALL_JA[r.why] ?? r.why));
      card.append(el('p', 'meta', `#${r.from}〜#${r.to}${r.dwelling ? '・' + (DWELL_JA[r.dwelling] ?? r.dwelling) : ''}`));
      grid.append(card);
    }
    sec.append(grid);
    root.append(sec);
  }

  // 図鑑
  const sec = el('section', 'bestiary');
  sec.append(el('h2', null, `いま生きている系統 ${list.length}`));
  if (era === 'civ') sec.append(el('p', 'dim', '文明の時代。1号が数千年しか進まないので、進化と気候はほとんど動かない。'));
  if (!list.length) sec.append(el('p', 'dim', 'いま生き物はいない。'));
  const grid = el('div', 'grid');
  for (const e of list) {
    const card = el('article', 'card');
    const art = el('div', 'art');
    // 単細胞は GitHub Actions が焼いた画像を使う（スマホでは描けない密度にするため）。
    // 画像が無い系統は、その場で SVG に戻す。
    if (bakedCard(e)) {
      const img = new Image(360, 360);
      img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
      img.src = new URL(`data/cards/cell-${e.id}.webp`, BASE).href;
      img.onerror = () => { art.textContent = ''; art.innerHTML = creatureSVG(e, W, { size: 120 }); };
      art.append(img);
    } else {
      art.innerHTML = creatureSVG(e, W, { size: 120 });
    }
    card.append(art);
    const civ = (W.civs ?? []).find(c => c.id === e.id);
    card.append(el('p', 'cx', `${CX_JA[e.cx] || '生き物'}・${e.sizeLabel}${civ ? `・${CIV_JA[civ.stage] ?? ''}` : ''}`));
    if (e.traits.length) card.append(el('p', 'look', e.traits.join('、')));
    card.append(el('p', 'meta', `${e.place}・#${e.born} に分かれた`));
    grid.append(card);
  }
  sec.append(grid);
  root.append(sec);

  // 宇宙の年表（観測を終えた星と、いま見ている星）
  const chron = el('section', 'chron');
  chron.append(el('h2', null, '宇宙の年表'));
  const ol = el('ol', 'years');
  for (const v of W.volumes) {
    const li = el('li');
    li.append(el('span', 'num', `${v.planetNo}`));
    const civ = v.civ ? `・文明は${CIV_JA[v.civ] ?? v.civ}まで` : '';
    li.append(el('span', null, `${STAR_JA[v.star] ?? v.star}・#${v.from}〜#${v.to}・約${(v.gyr * 10).toFixed(1)}億年・最大の複雑さ ${CX_JA[v.maxCx] || 'なし'}${civ}`));
    li.append(el('span', 'end', END_TEXT[v.endKind] ?? v.endKind));
    ol.append(li);
  }
  const now = el('li', 'now');
  now.append(el('span', 'num', `${W.planetNo}`));
  now.append(el('span', null, `${STAR_JA[W.star] ?? W.star}・#${(W.planetFrom ?? 0) + 1}〜・約${(last.gyr * 10).toFixed(1)}億年・${ERA_JA[era]}`));
  now.append(el('span', 'end', '観測中'));
  ol.append(now);
  chron.append(ol);
  root.append(chron);

  const foot = el('footer');
  foot.append(el('p', 'dim', `公開データから組み立て: ${ms}ms。名前はまだ付いていない（記事キーワードが要る）。`));
  if (problems?.length) { const ul = el('ul', 'problems'); for (const t of problems) ul.append(el('li', null, t)); foot.append(ul); }
  root.append(foot);
}
