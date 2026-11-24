// 図鑑の焼きカード: 単細胞（真核）の系統を、顕微鏡で覗いた高密度な画像にして data/cards/ に置く。
// 多細胞の系統はブラウザが SVG で描くので、ここでは焼かない。
//
// 使い方: node pipeline/cards.mjs [--check] [--size 360] [--quality 0.9]
//   --check は何も書かず、書き換えが要るなら終了コード1で知らせる。
//
// 焼きは決定論的（同じ形質と同じ設計図からは、同じバイトの画像になる）。
// すでに同じ中身の画像があれば書かないので、変わっていない系統は git の差分に出ない。
// いなくなった系統の画像は消す（図鑑に出るのは生きている系統だけ）。
//
// 依存は playwright（Chromium の canvas でそのまま WebP に符号化する）。
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { runAll } from '../engine/world.mjs';
import { bestiary } from '../engine/traits.mjs';
import { cellSVG } from '../viewer/cell.mjs';
import { MAIN_SEED, MAIN_TIMING_FROM, PATHS } from './config.mjs';

export const CARDS = PATHS.root + 'data/cards/';
export const cardName = id => `cell-${id}.webp`;
// 焼く対象: 単細胞（真核）の系統だけ。多細胞はブラウザが SVG で描く
export const bakeable = e => e.cx === 2;

// Chromium を1つ開いて、SVG を canvas 経由で WebP にする。
async function encoder({ size, quality }) {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent('<!doctype html><meta charset="utf-8"><body style="margin:0">');
  return {
    async webp(svg) {
      const b64 = await page.evaluate(async ({ svg, size, quality }) => {
        const img = new Image();
        const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('SVG を画像にできない')); img.src = url; });
        const cv = document.createElement('canvas');
        cv.width = size; cv.height = size;
        cv.getContext('2d').drawImage(img, 0, 0, size, size);
        const d = cv.toDataURL('image/webp', quality);
        if (!d.startsWith('data:image/webp')) throw new Error('WebP に符号化できない');
        return d.slice(d.indexOf(',') + 1);
      }, { svg, size, quality });
      return Buffer.from(b64, 'base64');
    },
    close: () => browser.close(),
  };
}

// 焼いて data/cards/ を台帳に合わせる。check なら書かずに計画だけ返す。
export async function syncCards(ledger, { seed = MAIN_SEED, timingFrom = MAIN_TIMING_FROM, size = 360, quality = 0.9, check = false } = {}) {
  const { W } = runAll(seed, ledger, { timingFrom });
  const targets = bestiary(W).filter(bakeable);
  const want = new Set(targets.map(e => cardName(e.id)));
  mkdirSync(CARDS, { recursive: true });
  const have = new Set(readdirSync(CARDS).filter(f => f.endsWith('.webp')));

  const enc = await encoder({ size, quality });
  const plan = { added: [], changed: [], same: 0, removed: [...have].filter(f => !want.has(f)), bytes: 0 };
  try {
    for (const e of targets) {
      const buf = await enc.webp(cellSVG(e, W, { size }));
      plan.bytes += buf.length;
      const file = CARDS + cardName(e.id);
      if (!existsSync(file)) { plan.added.push(cardName(e.id)); if (!check) writeFileSync(file, buf); continue; }
      if (readFileSync(file).equals(buf)) { plan.same++; continue; }   // 中身が同じなら書かない
      plan.changed.push(cardName(e.id));
      if (!check) writeFileSync(file, buf);
    }
  } finally { await enc.close(); }
  if (!check) for (const f of plan.removed) unlinkSync(CARDS + f);
  return plan;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? Number(process.argv[i + 1]) : d; };
  const check = process.argv.includes('--check');
  const ledger = JSON.parse(readFileSync(PATHS.ledger, 'utf8')).issues;
  const t0 = Date.now();
  const p = await syncCards(ledger, { size: arg('size', 360), quality: arg('quality', 0.9), check });
  const n = p.added.length + p.changed.length + p.same;
  console.log(`図鑑の焼きカード ${n}枚（単細胞）: 新規 ${p.added.length} / 書き換え ${p.changed.length} / 変化なし ${p.same} / 削除 ${p.removed.length}`
    + ` — ${((Date.now() - t0) / 1000).toFixed(1)}秒、合計 ${(p.bytes / 1024).toFixed(1)}KB`);
  if (check) {
    const diff = p.added.length + p.changed.length + p.removed.length;
    if (diff) { console.error(`data/cards/ が台帳と合っていない（${diff}件）`); process.exit(1); }
    console.log('data/cards/ は台帳と合っている');
  }
}
