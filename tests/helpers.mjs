// テストの共通部品
import { readFileSync } from 'node:fs';
import { rng } from '../engine/random.mjs';

export const ROOT = new URL('..', import.meta.url).pathname;
export const readJSON = p => JSON.parse(readFileSync(ROOT + p, 'utf8'));
export const LEDGER = readJSON('data/ledger.json').issues;
export const MAIN_SEED = 'times-garden-v1';

// 合成の号（試作04 run.mjs の synthLedger と同じ作り方）
export function synthLedger(seed, n) {
  const r = rng('synth', seed); const out = [];
  for (let i = 1; i <= n; i++) out.push({ issueNo: i, date: '', edition: i % 2 ? 'morning' : 'midday', gems: r() < 0.25 ? 1 : r() < 0.05 ? 2 : 0, meanTemp: 45 + r() * 45, newKeywords: Math.floor(r() * 16), digest: String(i) });
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
