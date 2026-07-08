# RESULT

## 実装内容

- `src/check.js` を追加し、`dsg check <repo-path> --design-system <artifacts-dir>` を実装。
- 既存 extractor/scanner を使って `className` と `cn()` の静的クラスをスキャンし、承認済み `assets.json` の `commonClasses` と Jaccard 類似度で照合。
- near-miss は完全一致を除外し、類似度 0.6 以上を警告として報告。
- `deprecatedClasses` がある asset は前方互換で検出対象にし、無い場合はスキップ。
- `--files`、`--strict`、`--report` に対応。
- `docs/check.md` に使い方と GitHub Actions 組み込み例を追加。

## テスト

- `npm test` 実行済み。
- 結果: 28 tests / 28 pass。

## 備考

- `src/cluster.js`、`src/candidates.js`、`src/decisions.js`、`src/assets.js`、`scripts/` は変更していません。
- `cli.js` は `check` コマンド登録と引数追加のみに限定しました。
