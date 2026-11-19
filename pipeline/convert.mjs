// YZRS Times の公開データ graph.json から、1号あたりの「宇宙への入力」を作る。
// graph.json の形式を知っているのはこのファイルだけ。形式が変わったときの追従はここだけで行う。
// 想定と違う形式なら GraphFormatError を投げる（呼び出し側は台帳に何も書かない）。
import { cyrb128 } from '../engine/random.mjs';

export class GraphFormatError extends Error {}
const fail = msg => { throw new GraphFormatError(msg); };

export function convertGraph(g) {
  if (!g || typeof g !== 'object') fail('graph.json がオブジェクトではない');
  if (g.schemaVersion !== 2) fail('schemaVersion が 2 ではない: ' + g.schemaVersion);
  if (!Array.isArray(g.issues) || !Array.isArray(g.articles)) fail('issues か articles が配列ではない');
  for (const i of g.issues) {
    if (typeof i?.id !== 'string' || !Number.isInteger(i.issueNo) || typeof i.date !== 'string') fail('issue の形式が違う: ' + JSON.stringify(i).slice(0, 120));
    if (i.edition !== undefined && typeof i.edition !== 'string') fail('issue の edition が文字列ではない: ' + i.id);
  }
  for (const a of g.articles) {
    if (typeof a?.id !== 'string' || !Array.isArray(a.issues) || !Array.isArray(a.keywords)) fail('article の形式が違う: ' + String(a?.id));
    if (!a.keywords.every(k => typeof k === 'string')) fail('article の keywords に文字列でないものがある: ' + a.id);
    if (a.temperature !== undefined && typeof a.temperature !== 'number') fail('article の temperature が数ではない: ' + a.id);
    if (a.gem !== undefined && typeof a.gem !== 'boolean') fail('article の gem が真偽値ではない: ' + a.id);
    if (typeof a.category !== 'string') fail('article の category が文字列ではない: ' + a.id);
  }
  const ids = new Set(g.issues.map(i => i.id)), nos = new Set(g.issues.map(i => i.issueNo));
  if (ids.size !== g.issues.length || nos.size !== g.issues.length) fail('issue の id か issueNo が重複している');

  const byIssue = new Map(g.issues.map(i => [i.id, []]));
  for (const a of g.articles) for (const iid of a.issues) if (byIssue.has(iid)) byIssue.get(iid).push(a);
  const seen = new Set();
  const entries = [];
  for (const i of [...g.issues].sort((a, b) => a.issueNo - b.issueNo)) {
    const arts = byIssue.get(i.id);
    const kws = [...new Set(arts.flatMap(a => a.keywords))];
    const newKw = kws.filter(k => !seen.has(k)); kws.forEach(k => seen.add(k));
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
  return { generatedAt: typeof g.generatedAt === 'string' ? g.generatedAt : '', entries };
}
