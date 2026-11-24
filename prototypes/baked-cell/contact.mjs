// 試作08 v3: 生きている単細胞を全部並べたコンタクトシートを1枚にする。
// 焼きカードの面と、いまの図鑑カード（SVG）の面を、同じ升目で作るので並べて比べられる。
//
// 使い方: node prototypes/baked-cell/contact.mjs [焼いた画像の置き場] [出力先]
//   既定: prototypes/baked-cell/out/ → prototypes/baked-cell/sample/
import { createRequire } from 'node:module';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { runAll } from '../../engine/world.mjs';
import { bestiary } from '../../engine/traits.mjs';
import { creatureSVG } from '../../viewer/draw.mjs';
import { cellPlan } from '../../viewer/plan.mjs';
import { MAIN_SEED, MAIN_TIMING_FROM, PATHS } from '../../pipeline/config.mjs';

const IN = (process.argv[2] || new URL('./out/', import.meta.url).pathname).replace(/\/?$/, '/');
const OUT = (process.argv[3] || new URL('./sample/', import.meta.url).pathname).replace(/\/?$/, '/');
mkdirSync(OUT, { recursive: true });

const ledger = JSON.parse(readFileSync(PATHS.ledger, 'utf8')).issues;
const { W } = runAll(MAIN_SEED, ledger, { timingFrom: MAIN_TIMING_FROM });
const cells = bestiary(W).filter(e => e.cx === 2);
const PAT = { stripes: 'しま', spots: '斑点', bands: '帯', glow: '光る', plain: '無地' };

// 升目のページを作る。kind は 'baked'（焼き画像）か 'svg'（いまの図鑑カード）
const page = (kind) => {
  const cardW = 190, cols = 8;
  const cells2 = cells.map(e => {
    const art = kind === 'baked'
      ? `<img src="data:image/webp;base64,${readFileSync(IN + 'cell-' + e.id + '.webp').toString('base64')}" width="360" height="360" alt="">`
      : creatureSVG(e, W, { size: 360 });
    const p = cellPlan(e, W);
    return `<figure><div class="art">${art}</div>`
      + `<figcaption>id${e.id}<br>${PAT[e.look.pattern] ?? e.look.pattern}・${e.hab === 'land' ? '陸' : '海'}`
      + `<br>drift ${e.look.drift}・器官 ${p.organelles.length}</figcaption></figure>`;
  }).join('');
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><body><style>
    body { margin:0; padding:18px; background:#0a0f16; color:#e3edf5;
      font-family:"Hiragino Sans","Noto Sans JP",system-ui,sans-serif; }
    h1 { font-size:15px; letter-spacing:.1em; margin:0 0 4px; }
    .sub { margin:0 0 14px; font-size:11px; color:#86979f;
      font-family:ui-monospace,Menlo,monospace; }
    .grid { display:grid; grid-template-columns:repeat(${cols}, ${cardW}px); gap:10px; }
    figure { margin:0; background:#121a24; border:1px solid rgba(255,255,255,.07); border-radius:10px; overflow:hidden; }
    .art { line-height:0; } .art svg, .art img { width:100%; height:auto; display:block; }
    figcaption { padding:5px 7px 7px; font-size:9.5px; line-height:1.5; color:#86979f;
      font-variant-numeric:tabular-nums; }
  </style>
  <h1>試作08 v3 コンタクトシート — ${kind === 'baked' ? '焼きカード（WebP 360x360）' : 'いまの図鑑カード（SVG）'}</h1>
  <p class="sub">#${W.issueNo} ・ 生きている単細胞（真核）${cells.length}系統 ・ 青白い恒星 / 重力1.48倍</p>
  <div class="grid">${cells2}</div></body></html>`;
};

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
for (const kind of ['baked', 'svg']) {
  if (kind === 'baked' && !existsSync(IN + 'cell-' + cells[0].id + '.webp')) {
    console.error(`焼いた画像が ${IN} に無い。先に bake.mjs を動かす`); process.exit(1);
  }
  const p = await browser.newPage({ viewport: { width: 1660, height: 1200 }, deviceScaleFactor: 1.5 });
  await p.setContent(page(kind), { waitUntil: 'networkidle' });
  await p.screenshot({ path: OUT + 'contact-' + kind + '.png', fullPage: true });
  console.log('書き出し:', OUT + 'contact-' + kind + '.png');
  await p.close();
}
await browser.close();
