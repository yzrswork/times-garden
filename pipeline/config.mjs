// 運用の設定（Node だけ）。計算のきまりではないので RULES_HASH には入らない。
export const OPERATIONS = {
  checkpointEvery: { v: 50, unit: '号', note: '途中経過と観測データのまとまりを作る間隔。ブラウザが計算するのは最新の途中経過から先の最大49号ぶん（約25日ぶん）', src: '運用設計（ブラウザの計算は1号あたり0.3ms前後。試作05で確認）', status: '思弁' },
};
export const OPS = Object.fromEntries(Object.entries(OPERATIONS).map(([k, o]) => [k, o.v]));

// 主役の惑星の種。試作04と同じ値なので、同じ惑星の歴史が続く。
export const MAIN_SEED = 'times-garden-v1';

// 主役の惑星に、時代ごとの時間の配分を入れる号（docs/creatures.md「いまの主役の惑星」）。
// この号から先だけを新しい配分で進める。#264 までは1号2,000万年のままで、歴史は変わらない。
// #265 は eco-3 を入れた日の次の号。変えると #265 から先の歴史が変わるので、SIM_VERSION も上げること。
export const MAIN_TIMING_FROM = 265;

const root = new URL('..', import.meta.url).pathname;
export const PATHS = {
  root,
  ledger: root + 'data/ledger.json',
  checkpoints: root + 'data/checkpoints/',
  observations: root + 'data/observations/',
  manifest: root + 'data/manifest.json',
};
