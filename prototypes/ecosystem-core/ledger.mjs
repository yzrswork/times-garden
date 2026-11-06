// 入力台帳を作る: YZRS Times の公開データ graph.json から、1号あたりの「宇宙への入力」だけを抜き出す。
// 使い方: node ledger.mjs <graph.json> <ledger.json>
// 既存の ledger.json があれば、その号は書き換えずに凍結し、新しい号だけを追記する。
// 形式が想定と違うときは何も書かずに終了する（Fail Closed）。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { cyrb128 } from './sim.mjs';

const [, , src, out] = process.argv;
if (!src || !out) { console.error('usage: node ledger.mjs <graph.json> <ledger.json>'); process.exit(2); }
const g = JSON.parse(readFileSync(src, 'utf8'));

function fail(msg) { console.error('FAIL CLOSED: ' + msg + '（台帳は変更していない）'); process.exit(1); }
if (g.schemaVersion !== 2) fail('schemaVersion が 2 ではない: ' + g.schemaVersion);
if (!Array.isArray(g.issues) || !Array.isArray(g.articles)) fail('issues か articles が配列ではない');
for (const i of g.issues) if (typeof i.id !== 'string' || typeof i.issueNo !== 'number' || typeof i.date !== 'string') fail('issue の形式が違う: ' + JSON.stringify(i).slice(0, 120));
for (const a of g.articles) if (typeof a.id !== 'string' || !Array.isArray(a.issues) || !Array.isArray(a.keywords)) fail('article の形式が違う: ' + String(a.id));

const byIssue = new Map(g.issues.map(i => [i.id, []]));
for (const a of g.articles) for (const iid of a.issues) if (byIssue.has(iid)) byIssue.get(iid).push(a);
const issues = [...g.issues].sort((a, b) => a.issueNo - b.issueNo);

const prev = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : { version: 1, issues: [] };
const frozen = new Map(prev.issues.map(e => [e.issueNo, e]));
const seen = new Set();
const entries = [];
for (const i of issues) {
  const arts = byIssue.get(i.id);
  const kws = [...new Set(arts.flatMap(a => a.keywords))];
  const newKw = kws.filter(k => !seen.has(k)); kws.forEach(k => seen.add(k));
  if (frozen.has(i.issueNo)) { entries.push(frozen.get(i.issueNo)); continue; }
  const temps = arts.map(a => a.temperature).filter(t => typeof t === 'number');
  const cats = {}; for (const a of arts) cats[a.category] = (cats[a.category] || 0) + 1;
  entries.push({
    issueNo: i.issueNo, id: i.id, date: i.date, edition: i.edition || '',
    nArticles: arts.length, gems: arts.filter(a => a.gem).length,
    meanTemp: temps.length ? Math.round(temps.reduce((s, t) => s + t, 0) / temps.length * 10) / 10 : 50,
    newKeywords: newKw.length, categories: cats,
    digest: cyrb128(arts.map(a => a.id).sort().join('\n'))[0].toString(16),
  });
}
writeFileSync(out, JSON.stringify({ version: 1, source: 'yzrswork-site public/data/graph.json', generatedAt: g.generatedAt, issues: entries }, null, 0) + '\n');
console.log(`ledger: ${entries.length} issues (${frozen.size} frozen, ${entries.length - frozen.size} new)`);
