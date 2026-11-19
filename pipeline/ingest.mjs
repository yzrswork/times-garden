// 入力台帳に新しい号を追記する。取り込んだ号は凍結し、書き換えない。
// 使い方: node pipeline/ingest.mjs <graph.json> [--dry-run]
// 疑わしいところがあれば、その号から先は追記しない（Fail Closed）。世界はその号の手前で止まり、壊れない。
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { convertGraph, GraphFormatError } from './convert.mjs';
import { PATHS } from './config.mjs';

export class IngestError extends Error {}
const LEDGER_VERSION = 1;
const SOURCE = 'yzrswork-site public/data/graph.json';

// prev: いまの台帳、converted: convertGraph の結果。新しい台帳と、追記した号、注意を返す。
export function appendIssues(prev, converted) {
  if (!prev || prev.version !== LEDGER_VERSION || !Array.isArray(prev.issues)) throw new IngestError('台帳の形式が違う');
  const frozen = prev.issues, byNo = new Map(converted.entries.map(e => [e.issueNo, e]));
  frozen.forEach((e, i) => { if (e.issueNo !== i + 1) throw new IngestError(`台帳の ${i + 1} 件目の号番号が ${e.issueNo}（1から連番のはず）`); });
  const notes = [];
  // 凍結済みの号: graph.json の同じ号番号が別の号になっていたら、号番号が付け替えられている
  for (const e of frozen) {
    const g = byNo.get(e.issueNo);
    if (!g) notes.push(`#${e.issueNo}（${e.id}）が graph.json から消えている。台帳はそのまま`);
    else if (g.id !== e.id) throw new IngestError(`#${e.issueNo} の号が付け替えられている（台帳 ${e.id}、graph.json ${g.id}）`);
  }
  const known = new Set(frozen.map(e => e.id));
  const added = [];
  for (let no = frozen.length + 1; ; no++) {
    const e = byNo.get(no);
    if (!e) {
      if (converted.entries.some(x => x.issueNo > no)) notes.push(`#${no} が graph.json にないので、それより後の号は取り込まない`);
      break;
    }
    if (known.has(e.id)) throw new IngestError(`#${no}（${e.id}）は別の号番号で取り込み済み`);
    if (e.nArticles === 0) { notes.push(`#${no}（${e.id}）は記事が0本なので、公開途中とみて取り込まない（この号から先は次回）`); break; }
    added.push(e);
  }
  const ledger = { version: LEDGER_VERSION, source: SOURCE, generatedAt: converted.generatedAt, issues: frozen.concat(added) };
  return { ledger, added, notes };
}

export const ledgerText = ledger => JSON.stringify(ledger) + '\n';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [src] = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const dry = process.argv.includes('--dry-run');
  if (!src) { console.error('usage: node pipeline/ingest.mjs <graph.json> [--dry-run]'); process.exit(2); }
  try {
    const prev = JSON.parse(readFileSync(PATHS.ledger, 'utf8'));
    const { ledger, added, notes } = appendIssues(prev, convertGraph(JSON.parse(readFileSync(src, 'utf8'))));
    for (const n of notes) console.log('注意: ' + n);
    if (added.length && !dry) writeFileSync(PATHS.ledger, ledgerText(ledger));
    console.log(`台帳: ${ledger.issues.length}号（追記 ${added.length}号${added.length ? `: #${added[0].issueNo}〜#${added.at(-1).issueNo}` : ''}${dry ? '、dry-run なので書いていない' : ''}）`);
  } catch (e) {
    if (!(e instanceof GraphFormatError || e instanceof IngestError || e instanceof SyntaxError)) throw e;
    console.error('FAIL CLOSED: ' + e.message + '（台帳は変更していない）');
    process.exit(1);
  }
}
