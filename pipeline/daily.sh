#!/usr/bin/env bash
# 毎日の更新: graph.json を取得し、台帳に新しい号を追記し、data/ を更新し、テストを通して main へ push する。
# どこかで失敗したら、そこで止まって何も push しない（Fail Closed。世界はその号の手前で止まり、壊れない）。
# GitHub Actions（.github/workflows/update.yml）から動かす。手元でも同じように動く。
# 使い方: bash pipeline/daily.sh [graph.json のパスか URL]
#   PUSH=0 を付けると、コミットまでして push しない。
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="${1:-https://raw.githubusercontent.com/yzrswork/yzrswork-site/main/public/data/graph.json}"
TMP="$(mktemp -d)"
# 出力を GitHub Actions の実行結果の概要にも残す（手元では画面に出すだけ）
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then echo '```text' >> "$GITHUB_STEP_SUMMARY"; fi
finish() { rm -rf "$TMP"; if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then echo '```' >> "$GITHUB_STEP_SUMMARY"; fi; }
trap finish EXIT

report() { if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then "$@" | tee -a "$GITHUB_STEP_SUMMARY"; else "$@"; fi; }
note() { echo "$*"; if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then echo "$*" >> "$GITHUB_STEP_SUMMARY"; fi; }
count() { node -p "JSON.parse(require('fs').readFileSync('data/ledger.json', 'utf8')).issues.length"; }

if [[ "$SRC" =~ ^https?:// ]]; then curl -fsSL --retry 3 --retry-delay 10 -o "$TMP/graph.json" "$SRC"; else cp "$SRC" "$TMP/graph.json"; fi

before=$(count)
report node pipeline/ingest.mjs "$TMP/graph.json"
after=$(count)
report node pipeline/advance.mjs
npm test --silent
node pipeline/advance.mjs --check

if [ -z "$(git status --porcelain -- data)" ]; then note "data/ に変更なし。push しない"; exit 0; fi
if [ "$after" -eq $((before + 1)) ]; then msg="台帳に #$after を取り込み、data/ を更新"
elif [ "$after" -gt "$before" ]; then msg="台帳に #$((before + 1))〜#$after を取り込み、data/ を更新"
else msg="data/ を作り直し（計算のきまりの変更）"; fi
git add data
git commit -q -m "$msg"
note "コミット: $msg"
if [ "${PUSH:-1}" = 1 ]; then git push -q origin HEAD:main; note "main へ push した"; fi
