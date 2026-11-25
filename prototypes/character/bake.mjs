// 試作09: キャラ層の絵を WebP に焼く。重い処理は焼き側、スマホ側は画像表示だけ、という
// 既存の方針（試作08 → pipeline/cards.mjs）をそのまま使う。本番の data/cards/ には書かない。
//
// 使い方:
//   node prototypes/character/bake.mjs [出力先] [--size 360] [--quality 0.9] [--twice]
//   --twice は2回焼いてバイト一致を確かめる（決定論の確認）。
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { charSVG } from './char.mjs';
import { cliffTownSVG, SW, SH } from './scene.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : new URL('./out/', import.meta.url).pathname);
const SIZE = Number(arg('size', 360));        // カード表示の2倍（Retina 想定。試作08と同じ）
const QUALITY = Number(arg('quality', 0.9));
const TWICE = process.argv.includes('--twice');

const S = JSON.parse(readFileSync(new URL('./subjects.json', import.meta.url).pathname, 'utf8'));
mkdirSync(OUT, { recursive: true });

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
await page.setContent('<!doctype html><meta charset="utf-8"><body style="margin:0">');

const encode = (svg, w, h, q) => page.evaluate(async ({ svg, w, h, q }) => {
  const img = new Image();
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('SVG を画像にできない')); img.src = url; });
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(img, 0, 0, w, h);
  const d = cv.toDataURL('image/webp', q);
  if (!d.startsWith('data:image/webp')) throw new Error('WebP に符号化できない');
  return d.slice(d.indexOf(',') + 1);
}, { svg, w, h, q });

// 焼くもの: 3系統のキャラカードと、文明シーンのサンプル1枚
const jobs = [];
for (const s of S.subjects) {
  jobs.push({ name: `char-${s.key}-${s.entry.id}`, w: SIZE, h: SIZE, svg: () => charSVG(s.entry, s.world, { render: s.render, size: SIZE }) });
  jobs.push({ name: `sil-${s.key}-${s.entry.id}`, w: SIZE, h: SIZE, svg: () => charSVG(s.entry, s.world, { render: s.render, size: SIZE, mode: 'silhouette' }) });
}
const seg = S.subjects.find(s => s.key === 'seg');
jobs.push({ name: 'scene-cliff-town', w: SIZE * 2, h: Math.round(SIZE * 2 * SH / SW), svg: () => cliffTownSVG(seg.entry, seg.world, { stage: 'town', size: SIZE * 2 }) });

const sha = b => createHash('sha256').update(b).digest('hex').slice(0, 12);
async function bakeAll(label) {
  const rows = [];
  for (const j of jobs) {
    const t = Date.now();
    const svg = j.svg();
    const b64 = await encode(svg, j.w, j.h, QUALITY);
    const buf = Buffer.from(b64, 'base64');
    const file = `${OUT}${j.name}.webp`;
    writeFileSync(file, buf);
    rows.push({ name: j.name, ms: Date.now() - t, bytes: buf.length, svg: svg.length, hash: sha(buf) });
  }
  if (label) console.log(label);
  return rows;
}

const first = await bakeAll();
let same = null;
if (TWICE) {
  const second = await bakeAll();
  same = first.every((r, i) => r.hash === second[i].hash);
}
await browser.close();

const kb = b => (b / 1024).toFixed(1);
const med = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log(`焼いた枚数 ${first.length}（${SIZE}x${SIZE}、品質 ${QUALITY}）→ ${OUT}`);
for (const r of first) console.log(`  ${r.name.padEnd(22)} ${String(r.ms).padStart(4)}ms / ${kb(r.bytes).padStart(6)}KB / SVG ${String(r.svg).padStart(6)}バイト / ${r.hash}`);
const cards = first.filter(r => r.name.startsWith('char-'));
console.log(`  カード1枚あたり: ${med(cards.map(r => r.ms))}ms（中央値）/ ${kb(med(cards.map(r => r.bytes)))}KB（中央値）`);
console.log(`  48系統ぶんに換算: ${(med(cards.map(r => r.ms)) * 48 / 1000).toFixed(1)}秒 / ${(med(cards.map(r => r.bytes)) / 1024 * 48).toFixed(0)}KB`);
if (TWICE) console.log(`  決定論: 2回焼いてバイト${same ? '一致' : '不一致（★決定論が崩れている）'}`);
