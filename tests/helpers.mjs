// テストの共通部品
import { readFileSync } from 'node:fs';
import { rng } from '../engine/random.mjs';

export const ROOT = new URL('..', import.meta.url).pathname;
export const readJSON = p => JSON.parse(readFileSync(ROOT + p, 'utf8'));
export const LEDGER = readJSON('data/ledger.json').issues;
import { MAIN_SEED as SEED, MAIN_TIMING_FROM } from '../pipeline/config.mjs';
export { MAIN_TIMING_FROM };
export const MAIN_SEED = SEED;
// 主役の惑星の設定（pipeline/config.mjs の値をそのまま使う）
export const MAIN = { timingFrom: MAIN_TIMING_FROM };
// 時間の配分をまったく使わない設定。1号はいつも2,000万年で、eco-1 と同じ計算になる。
// 見た目の層のように「歴史を変えない」ことを確かめるときに使う。
export const NO_PLAN = { timingFrom: Number.MAX_SAFE_INTEGER };

// 合成の号（試作04 run.mjs の synthLedger と同じ作り方）。
// 記事の分類（categories）は別の乱数の流れから作る。同じ流れに足すと、気候と生命に渡す値
// （gems、meanTemp、newKeywords）の並びがずれて、固定値のテストが落ちるため。
// 紙面の性格（技術の記事の割合）は種ごとに決める。YZRS Times は技術の記事が多い紙面だが、
// 合成の号では別の星のばらつき（柱3）を見たいので、技術の少ない紙面も出るようにする。
export function synthLedger(seed, n) {
  const r = rng('synth', seed), rc = rng('synth-cat', seed), out = [];
  const techShare = 0.15 + rc() * 0.75;
  for (let i = 1; i <= n; i++) {
    const nArticles = 8 + Math.floor(rc() * 6);
    const nTech = Math.max(0, Math.min(nArticles, Math.round(nArticles * techShare + (rc() - 0.5) * 4)));
    out.push({
      issueNo: i, date: '', edition: i % 2 ? 'morning' : 'midday',
      gems: r() < 0.25 ? 1 : r() < 0.05 ? 2 : 0, meanTemp: 45 + r() * 45, newKeywords: Math.floor(r() * 16),
      nArticles, categories: { tech: nTech, news: nArticles - nTech }, digest: String(i),
    });
  }
  return out;
}

// 小さな graph.json を作る。issues: [{ no, id?, edition?, arts: [{ kw: [...], temp?, gem?, cat? }] }]
export function makeGraph(issues, extra = {}) {
  const g = { schemaVersion: 2, generatedAt: '2026-11-19T00:00:00.000Z', counts: {}, issues: [], articles: [] };
  for (const i of issues) {
    const id = i.id || `i:no-${i.no}`;
    g.issues.push({ id, date: '2026-11-19', edition: i.edition || 'morning', issueNo: i.no });
    (i.arts || []).forEach((a, k) => g.articles.push({ id: `a:${id}/${k}`, title: 't', url: 'u', category: a.cat || 'tech', date: '2026-11-19', source: 's', temperature: a.temp ?? 60, summaryJa: '', gem: a.gem ?? false, keywords: a.kw || [], issues: [id] }));
  }
  return { ...g, ...extra };
}
