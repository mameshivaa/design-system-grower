# 作業報告

## 実装内容

- `dsg check --base <git-ref>` を追加し、git 管理下では `<ref>...HEAD` と未コミット変更の JSX/TSX/JS/TS ファイルだけを検査対象にしました。
- `catalog.json` の未承認 `candidates` も照合し、承認済み asset と完全一致せず、既存 candidate と Jaccard 0.5〜0.95 の範囲にある使用を `new-variant` として報告するようにしました。
- `role` がある candidate は role を使い、ない場合は candidate の要素タグへ fallback する前方互換の実装にしました。
- `near-miss` / `deprecated` が同じ箇所に該当する場合は既存違反を優先し、`new-variant` は報告しないようにしました。
- markdown report に違反タイプ別の集計を追加し、`--strict` は `new-variant` でも失敗終了します。

## テスト

- `npm test`
- 36 tests passed

## 変更ファイル

- `src/check.js`
- `src/cli.js`
- `test/design-system-grower.test.js`
- `RESULT.md`
