# Times Garden

YZRS Times の号が出るたびに進む、架空の宇宙と惑星と生き物の歴史を観測するゲーム。設計の基準は `docs/pillars.md` と `docs/art-bible.md`、作業ルールは `CLAUDE.md`。

## 構成

- `engine/`: 計算。Node とブラウザで同じコードが動く（`node:` のモジュールを使わない）。
  - `constants.mjs`: 計算のきまり。すべての数値に、意味、単位、出典、状態（合意、論争、思弁）を付ける。
  - `world.mjs`: 惑星の状態と、1号ぶんの計算（`climate.mjs` 気候、`life.mjs` 生命）。
  - `era.mjs`: 時代（誕生、単純な生命、形の時代、文明）と、時代ごとの1号の時間。
  - `planet.mjs`: 惑星の一生。誕生の時代の出来事、観測の終わり方、巻（年表の1行）、次の星の種。
  - `traits.mjs`: 見た目の層。惑星の重力と大気、系統の見た目の性質と受け継ぎ、体の大きさと色味、図鑑。気候と個体数の計算には使わない（`docs/creatures.md` 確定事項5）。
  - `checkpoint.mjs`: 途中経過の保存と復元。
  - `observations.mjs`: 観測データのまとまりと、公開データからの全史の組み立て（ブラウザが使う）。
  - `events.mjs`: 出来事の説明の文章。
  - `random.mjs`、`math.mjs`: 決定論の乱数、ハッシュ、数学。
- `pipeline/`: Node だけ。GitHub Actions で動かす予定。
  - `convert.mjs`: graph.json から1号ぶんの入力を作る。graph.json の形式を知っているのはこのファイルだけ。
  - `ingest.mjs`: 入力台帳に新しい号を追記する。取り込んだ号は凍結し、疑わしい号から先は追記しない。
  - `advance.mjs`: 台帳から途中経過、観測データ、manifest を作って `data/` に書く。毎回創刊号から計算し直し、保存済みのファイルと照らし合わせる。
  - `config.mjs`: 運用の設定（途中経過の間隔、主役の惑星の種）。
  - `daily.sh`: 毎日の更新（graph.json の取得、追記、`data/` の更新、テスト、main へ push）。
  - `report.mjs`: 新しく取り込んだ号で起きた出来事と、いまの惑星の様子を書き出す。毎日の更新のコミットメッセージと実行結果の概要に使う（見る画面ができるまでの記録を兼ねる）。
- `viewer/`: 見る画面（ブラウザだけ。`index.html` から読む）。
  - `palette.mjs`: 恒星ごとの色の体系（役割ごとに割り当てる。生の乱数で色を作らない）。
  - `draw.mjs`: 生き物の姿を SVG で描く。形は環境と系統の理由だけで決める。
  - `bestiary.mjs`: 図鑑のページ。公開データから世界を組み立て、いま生きている系統を並べる。
- `index.html`: 図鑑のページ（GitHub Pages のルート）。
- `.github/workflows/`: GitHub Actions。`update.yml` は毎日の更新、`verify.yml` は push のたびの確認。
- `data/`: 公開データ。
  - `ledger.json`: 入力台帳。
  - `checkpoints/NNNNN.json`: NNNNN号目まで計算した状態（途中経過）。50号ごと。
  - `observations/NNNNN.json`: NNNNN号目までの50号ぶんの記録（観測データ）。
  - `manifest.json`: 台帳の号数、途中経過の一覧、全史と最後の状態のハッシュ。
- `tests/`: テスト。
- `prototypes/`: 試作。本番からは参照しない。

## 動かし方

```text
npm test                                  # 決定論、途中経過、取り込み、data/ の照合（約16秒）
node pipeline/ingest.mjs <graph.json>     # 新しい号を台帳に追記する（--dry-run で書かずに確かめる）
node pipeline/advance.mjs                 # data/ を台帳に合わせる（--check で照合だけ）
node tests/browser.mjs                    # Chromium で data/ から全史を組み立て、Node と比べる（Playwright が必要）
node tests/soak.mjs [本数] [号数]         # 長期運転テストの報告（既定は40本 x 1600号。--old で時間の配分なし）
python3 -m http.server 8000               # 図鑑のページを見る（http://localhost:8000/）
```

graph.json は `yzrswork-site` の公開データ（`https://raw.githubusercontent.com/yzrswork/yzrswork-site/main/public/data/graph.json`）。Times 側には何も書き込まない。

## 毎日の更新（GitHub Actions）

- `update.yml` が毎日 8:43 と 14:43（日本時間。朝刊と昼刊が出たあと）に `pipeline/daily.sh` を動かす。graph.json を取得し、台帳に新しい号を追記し、`data/` を更新し、`npm test` と `advance.mjs --check` を通してから main へ直接 push する。Actions の画面から手で動かすこともできる（workflow_dispatch）。
- どこかで失敗したら何も push しない（Fail Closed）。世界はその号の手前で止まり、壊れない。失敗は GitHub から通知が届く。原因を直せば、次の実行でまとめて取り込む。
- 手元で試すときは `PUSH=0 bash pipeline/daily.sh [graph.json のパス]`（コミットまでして push しない）。
- `verify.yml` は push のたびに `npm test` と `advance.mjs --check` を回し、Chromium でも `data/` から全史を組み立てて Node と一致するかを確かめる（`tests/browser.mjs`）。Actions 自身の push では動かない（GitHub の仕様）。

## 仕組み

- 主役は創刊号から続く1つの宇宙（種 `times-garden-v1`）。1つの惑星をおよそ1年（730号）観測し、終わったら次の星へ移る。観測した星は「巻」として年表に残る。
- 1号の時間は時代で変わる（`engine/era.mjs`）。誕生300万年、単純な生命900万年、形の時代200万年、文明5,000年。文明の時代は1号の中の計算をせず、時間だけ進める（数千年では進化も気候も動かないため）。
- 主役の惑星は #265 から新しい時間の配分で進む（`pipeline/config.mjs` の `MAIN_TIMING_FROM`）。それより前の号は1号2,000万年のままで、#1 から #264 の記録は eco-1 とビット単位で同じ（`tests/era.test.mjs` が固定）。
- 状態の `seed` はいま観測している惑星の種で、星ごとに変わる。`universeSeed` は宇宙そのものの種で変わらない。途中経過と観測データの身元は `universeSeed` で照合する。
- ブラウザは `manifest.json` を読み、観測データのまとまりと、いちばん新しい途中経過と、台帳の残りから全史を組み立てる（`engine/observations.mjs` の `restore`）。計算するのは最新の途中経過から先の最大49号ぶん。
- 途中経過と観測データは、計算の版（`SIM_VERSION`）、定数（`RULES_HASH`）、種、台帳、記録、状態のハッシュを見出しに持つ。1つでも合わなければ使わず、1つ前の途中経過か、創刊号からの計算に戻る（Fail Closed）。
- 保存済みの途中経過と観測データは凍結する。同じ版と定数のまま中身が変わったら、`advance.mjs` は何も書かずに止まる（計算を変えたのに版を上げ忘れた、を見つける）。
- 計算を変えたら `engine/world.mjs` の `SIM_VERSION` を上げる。状態 W の形を変えたときも上げる（古い途中経過から続きを計算できないため）。定数を変えると `RULES_HASH` が自動で変わる。どちらの場合も `node pipeline/advance.mjs` で `data/` を作り直し、`tests/engine.test.mjs` の主役の惑星の全史のハッシュを新しい値に書き換える。
- 見た目の層（`engine/traits.mjs`）は、計算の乱数とは別の乱数の流れを使う。だから見た目を足しても1号ごとの記録は変わらない。それを固定しているのが `tests/traits.test.mjs` の最初のテスト（`chainHash`）で、見た目の乱数を計算の乱数から取ってしまうとここが落ちる。

## 計算の版

- `eco-1`（2026-11-19）: 試作04（`eco-0.1`）の計算を書き直したもの。結果は試作04とビット単位で同じ。違いは、計算の中にあった数値をすべて `constants.mjs` に移したことと、出来事を種類と数で記録し、文章は `events.mjs` で作るようにしたこと。
- `eco-2`（2026-11-19）: 見た目の層（`engine/traits.mjs`）を状態に足した。惑星に重力と大気、系統に見た目の性質が付く。計算そのものは変えていないので、1号ごとの記録は `eco-1` とビット単位で同じ（主役の惑星264号、合成の号3本で確認）。状態の形が変わったので版を上げ、`data/` を作り直した。
- `eco-3`（2026-11-19）: 惑星の1年（`docs/creatures.md` 段階3）。1号の時間を時代ごとに変え、誕生の時代を足し、観測の終わりと次の星への切り替えを入れた。計算を変える変更だが、主役の惑星は #265 から切り替わるので、#1 から #264 の記録は `eco-1` とビット単位で同じ。複雑さが1段上がる確率は、配分を入れた号から `cxChancePlan` を使う（形の時代は1号が数百万年で分岐の回数が1桁減るため。乱数は同じ回数だけ引くので前の号の歴史は変わらない）。

## 更新ログ

- 2026-11-19 (4) 惑星の1年（`eco-3`）。時代ごとの時間の配分、誕生の時代、観測の終わりと次の星への切り替え、宇宙の年表を入れた。長期運転テストで時代の号数を目安に合わせた（誕生11%、単純な生命20%、形の時代39%、文明20%。目安は10/20/45/25%）。
- 2026-11-19 (3) 見る画面を図鑑から始めた（`index.html`、`viewer/`）。いま生きている系統の姿を SVG で描き、惑星の様子と最近の出来事を添える。パソコンとスマホの幅で確認した。
- 2026-11-19 (2) 見た目の層（`engine/traits.mjs`、`eco-2`）を追加。`docs/creatures.md` の実装の段階1のうち、系統の見た目の性質と受け継ぎ、惑星の重力と大気、いま生きている系統の図鑑（姿）まで。歴史は変えていない。

- 2026-11-19 本番のコードを作成。試作04の計算と試作05の途中経過を書き直した。試作04と、実データ238号と合成の号60本 x 2,000号（3種類の恒星を含む、計12万号）で、毎号の記録、出来事、最後の状態がビット単位で一致することを確かめた。graph.json の変換も、試作04の `ledger.mjs` と全263号で一致。
