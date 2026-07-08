実装は完了し、`RESULT.md` も作成しました。`npm test` は全通過です。

変更内容:
- `src/class-analysis.js` を追加し、Tailwind カテゴリ分析と識別力ゲートを実装
- `src/cluster.js` に IDF 的スコア減衰、品質ゲート、アイコンサイズ専用フィルタを追加
- `src/catalog.js` / `src/inventory.js` で `components/ui/` と `cva()` 定義ファイルを候補ソースから除外し、inventory に記録
- `src/candidates.js` に最終候補ゲートを追加
- regression fixture を追加し、指定ノイズが候補化されず、本物のボタンパターンが top に来ることをテスト化
- `RESULT.md` に変更概要・スコアリング設計・テスト結果を記録

検証:
- `npm test` → 15 tests passed / 0 failed
- `git diff --check` → 問題なし

ただし、コミットだけは sandbox 権限で失敗しました。`.git` 実体が `/Users/tk/Documents/New project/.git/worktrees/cluster-quality` にあり、現在の権限ではそこに `index.lock` を作れません。

失敗内容:
```text
fatal: Unable to create '/Users/tk/Documents/New project/.git/worktrees/cluster-quality/index.lock': Operation not permitted
```

現在の未コミット変更は実装ファイル、テスト、`RESULT.md` です。`TASK.md` は開始時点から未追跡だったため、コミット対象には含めていません。