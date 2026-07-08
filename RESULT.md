実装完了し、コミットしました。

コミット: `cc66d3b Implement Claude hook installer`

対応内容:
- `src/hooks.js` 追加: `hook-check` / `install-hooks`
- `src/cli.js` にコマンド登録
- `docs/hooks.md` 追加
- hook-check / install-hooks の要求テスト追加
- `RESULT.md` に作業報告を記録

確認:
- `npm test` 実行済み
- 38 tests / 38 pass

作業ツリーは `TASK.md` だけ未追跡のままです。これは開始時点からの入力ファイルなのでコミット対象から外しました。