// 途中経過（チェックポイント）の運用の定数。形式は試作04の constants.mjs と同じ（意味、単位、出典、状態）。
export const CONSTANTS = {
  checkpointEvery: { v: 50, unit: '号', note: '途中経過を保存する間隔。ブラウザが計算するのは最新の途中経過から先の最大49号ぶん（約25日ぶん）', src: '運用設計（試作04のブラウザ計算は238号で約150ms、1号あたり約0.6ms）', status: '思弁' },
};
export const K = Object.fromEntries(Object.entries(CONSTANTS).map(([k, o]) => [k, o.v]));

// 主役の惑星の種。試作04の run.mjs と build.mjs と同じ値。
export const MAIN_SEED = 'times-garden-v1';
