// 図鑑のページ。公開データ（data/）から世界を組み立て、いま生きている系統の姿を並べる。
// 重い計算はしない（最新の途中経過から先の最大49号ぶんだけ）。docs/art-bible.md 8 の性能予算。
import { restore } from '../engine/observations.mjs';
import { fileName } from '../engine/observations.mjs';
import { bestiary, CX_JA } from '../engine/traits.mjs';
import { describe as describeEvent } from '../engine/events.mjs';
import { creatureSVG } from './draw.mjs';
import { palette } from './palette.mjs';

const BASE = new URL('../', import.meta.url);
const get = async p => (await fetch(new URL(p, BASE))).json();
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const STAR_JA = { red: '赤色矮星', yellow: '黄色い恒星', blue: '青白い恒星' };

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
  const head = el('header');
  head.append(el('h1', null, '観測記録'));
  const facts = [
    ['号', `#${last.issueNo}（${last.date} ${last.edition === 'morning' ? '朝刊' : '昼刊'}）`],
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

  // 図鑑
  const list = bestiary(W);
  const sec = el('section', 'bestiary');
  sec.append(el('h2', null, `いま生きている系統 ${list.length}`));
  const grid = el('div', 'grid');
  for (const e of list) {
    const card = el('article', 'card');
    const art = el('div', 'art');
    art.innerHTML = creatureSVG(e, W, { size: 120 });
    card.append(art);
    card.append(el('p', 'cx', `${CX_JA[e.cx] || '生き物'}・${e.sizeLabel}`));
    if (e.traits.length) card.append(el('p', 'look', e.traits.join('、')));
    card.append(el('p', 'meta', `${e.place}・#${e.born} に分かれた`));
    grid.append(card);
  }
  sec.append(grid);
  root.append(sec);

  const foot = el('footer');
  foot.append(el('p', 'dim', `公開データから組み立て: ${ms}ms。名前はまだ付いていない（記事キーワードが要る）。`));
  if (problems?.length) { const ul = el('ul', 'problems'); for (const t of problems) ul.append(el('li', null, t)); foot.append(ul); }
  root.append(foot);
}
