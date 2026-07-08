実装完了してコミットしました。

変更内容:
- `src/roles.js` を追加し、`classifyRole` と role summary 集計を実装
- `candidates.json` 各 candidate に `role` を追加
- `catalog.summary.roles` を追加
- `dsg scan` / `dsg init` の出力に `Button: 4 variants (2 competing families)` 形式の role 行を追加
- review board に role バッジと role-first grouping を追加
- `RESULT.md` に作業報告を記録

検証:
- `npm test` 実行済み
- 34/34 passing
- `git diff --check` 問題なし

コミット:
- `8861773 Implement role taxonomy summaries`

補足: `TASK.md` は作業開始前から未追跡だった入力ファイルなので、コミット対象には含めていません。