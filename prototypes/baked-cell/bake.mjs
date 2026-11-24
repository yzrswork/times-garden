// 試作08: 高密度な細胞の SVG を WebP に焼く。GitHub Actions でも動く形にしてある。
// 依存は playwright だけ（verify.yml がすでに入れている）。Chromium の canvas で
// そのまま WebP に符号化するので、ImageMagick や sharp は要らない。
//
// 使い方:
//   node prototypes/baked-cell/bake.mjs [出力先] [--size 360] [--quality 0.9] [--limit N]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { runAll } from '../../engine/world.mjs';
import { bestiary } from '../../engine/traits.mjs';
import { cellSVG } from './cell-svg.mjs';
import { MAIN_SEED, MAIN_TIMING_FROM, PATHS } from '../../pipeline/config.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2]
  : new URL('./out/', import.meta.url).pathname);
const SIZE = Number(arg('size', 360));       // カード表示の2倍（Retina 想定）
const QUALITY = Number(arg('quality', 0.9));
const LIMIT = Number(arg('limit', 0));
const ONLY = arg('id', '');            // 1系統だけ焼く（確認用）

const ledger = JSON.parse(readFileSync(PATHS.ledger, 'utf8')).issues;
const { W } = runAll(MAIN_SEED, ledger, { timingFrom: MAIN_TIMING_FROM });
// この試作の対象は単細胞（真核）の系統
let cells = bestiary(W).filter(e => e.cx === 2);
if (ONLY) cells = cells.filter(e => String(e.id) === ONLY);
if (LIMIT > 0) cells = cells.slice(0, LIMIT);
mkdirSync(OUT, { recursive: true });

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
await page.setContent('<!doctype html><meta charset="utf-8"><body style="margin:0">');

// SVG を <img> で読み、canvas に描いて WebP にする
const encode = async (svg, size, q) => page.evaluate(async ({ svg, size, q }) => {
  const img = new Image();
  img.decoding = 'sync';
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('SVG を画像にできない')); img.src = url; });
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  cv.getContext('2d').drawImage(img, 0, 0, size, size);
  const d = cv.toDataURL('image/webp', q);
  if (!d.startsWith('data:image/webp')) throw new Error('WebP に符号化できない（' + d.slice(0, 24) + '）');
  return d.slice(d.indexOf(',') + 1);
}, { svg, size, q });

const times = [], sizes = [];
const t0 = Date.now();
for (const e of cells) {
  const t = Date.now();
  const svg = cellSVG(e, W, { size: SIZE });
  const b64 = await encode(svg, SIZE, QUALITY);
  const file = `${OUT}cell-${e.id}.webp`;
  writeFileSync(file, Buffer.from(b64, 'base64'));
  times.push(Date.now() - t);
  sizes.push(statSync(file).size);
}
await browser.close();

const sum = a => a.reduce((x, y) => x + y, 0);
const med = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const kb = b => (b / 1024).toFixed(1);
console.log(`焼いた枚数 ${cells.length}（${SIZE}x${SIZE}、品質 ${QUALITY}）→ ${OUT}`);
console.log(`  1枚あたり: ${med(times)}ms（中央値）/ ${kb(med(sizes))}KB（中央値、最小 ${kb(Math.min(...sizes))} 最大 ${kb(Math.max(...sizes))}）`);
console.log(`  合計: ${((Date.now() - t0) / 1000).toFixed(1)}秒 / ${kb(sum(sizes))}KB`);
// 焼きは決定論的なので、変わっていない系統は焼き直されない。下は全枚を焼き直した場合の上限。
const per = med(times), perKB = med(sizes) / 1024;
console.log(`  全系統（48）まで増えた場合の上限: ${(per * 48 / 1000).toFixed(1)}秒 / ${(perKB * 48).toFixed(0)}KB`);
