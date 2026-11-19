// 試作06の設定。形式は engine/constants.mjs と同じ（意味、単位、出典、状態）。
export const CONSTANTS = {
  schedules: {
    v: {
      'eco-1': { note: 'いまの本番。いつも2000万年', early: 20, life: 20, multi: 20, complex: 20 },
      A: { note: '大型の生き物が現れたら100万年', early: 20, life: 20, multi: 20, complex: 1 },
      B: { note: '段階ごとに細かく', early: 20, life: 10, multi: 4, complex: 1 },
      D1: { note: '#264 から100万年（#263 までは本番と同じ）', early: 20, life: 20, multi: 20, complex: 20, from: 264, after: 1 },
      D2: { note: '#264 から200万年（#263 までは本番と同じ）', early: 20, life: 20, multi: 20, complex: 20, from: 264, after: 2 },
      D5: { note: '#264 から500万年（#263 までは本番と同じ）', early: 20, life: 20, multi: 20, complex: 20, from: 264, after: 5 },
    },
    unit: '百万年/号',
    note: '時代ごとの1号の時間。時代はその号の始めに到達している段階（early 生命の前、life 生命、multi 多細胞、complex 大型の生き物）。from があれば、その号から after に切り替える',
    src: 'ゲーム設計（試作06の比べる案）', status: '思弁',
  },
  horizon: { v: 3650, unit: '号', note: '先まで回す号数（1日2号で5年）', src: '試作06', status: '思弁' },
  futures: { v: 20, unit: '本', note: '主役の惑星の未来を何通り試すか（実際の号の特徴を並べ替えた架空の号）', src: '試作06', status: '思弁' },
  soakRuns: { v: 40, unit: '本', note: '合成の号で創刊号から回す世界の数', src: '試作06', status: '思弁' },
};
export const K = Object.fromEntries(Object.entries(CONSTANTS).map(([k, o]) => [k, o.v]));
