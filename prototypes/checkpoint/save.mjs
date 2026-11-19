// 試作04の台帳を創刊号から計算し、途中経過を checkpointEvery 号ごとに checkpoints/ へ保存する。
// 使い方: node save.mjs [ledger.json]
// 保存済みの途中経過は凍結する。同じ形式ときまり（版と定数）なのに中身が違えば、何も書かずに止まる（Fail Closed）。
// 形式かきまりが変わった途中経過は、作り直して置き換える。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { runWithCheckpoints, checkpointText, checkpointName, hash } from './checkpoint.mjs';
import { K, MAIN_SEED } from './constants.mjs';

const here = f => new URL('./' + f, import.meta.url).pathname;
const ledgerPath = process.argv[2] || here('../ecosystem-core/ledger.json');
const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8')).issues;
const { result, checkpoints } = runWithCheckpoints(MAIN_SEED, ledger, K.checkpointEvery);

mkdirSync(here('checkpoints'), { recursive: true });
const plan = [];
for (const cp of checkpoints) {
  const path = here('checkpoints/' + checkpointName(cp.count)), text = checkpointText(cp);
  if (!existsSync(path)) { plan.push({ path, text, what: '新規' }); continue; }
  const old = readFileSync(path, 'utf8');
  if (old === text) { plan.push({ path, what: '変更なし' }); continue; }
  const o = JSON.parse(old);
  if (o.format === cp.format && o.simVersion === cp.simVersion && o.rulesHash === cp.rulesHash) {
    console.error(`FAIL CLOSED: ${checkpointName(cp.count)} は同じ形式ときまりで保存済みなのに中身が違う。sim.mjs の計算を変えたなら SIM_VERSION を、途中経過の形式を変えたなら FORMAT を上げる（何も書いていない）`);
    process.exit(1);
  }
  plan.push({ path, text, what: `作り直し（${o.format} ${o.simVersion} → ${cp.format} ${cp.simVersion}）` });
}
for (const p of plan) if (p.text) writeFileSync(p.path, p.text);
for (const p of plan) console.log(`${p.path.split('/').pop()} ${p.what}`);
console.log(`台帳 ${ledger.length}号、全史のハッシュ ${hash(JSON.stringify(result))}`);
