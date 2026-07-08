完了しました。`dsg check --blame` に git blame attribution を追加し、`RESULT.md` も作成してコミット済みです。

コミット: `f480aea Add blame attribution for design-system checks`

実施内容:
- `src/attribution.js` 追加
- `--blame` フラグ追加
- text / markdown report に `introduced by` / `Introduced By` を追加
- Claude / human / untracked / blameなしのテスト追加
- `RESULT.md` に作業報告を記録

検証:
- `npm test` 通過: 48件 pass
- `git diff --check` 問題なし

補足: `TASK.md` は作業開始時点から未追跡だった入力ファイルなので、コミットには含めていません。