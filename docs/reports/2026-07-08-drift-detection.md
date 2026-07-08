実装完了しました。`src/drift.js` を追加し、`canonicalize` 候補、`--side` 決定、deprecated 警告、`assets.json` の `deprecatedClasses`、review board の対決カード表示まで通しています。`RESULT.md` に作業報告も書きました。

検証: `npm test` は 25 件すべて通過しました。

コミットは試みましたが、sandbox 権限で失敗しました。`git add` 時に worktree 外の git metadata へ `index.lock` を作れず、エラーは以下です。

```text
Unable to create '/Users/tk/Documents/New project/.git/worktrees/drift-detection/index.lock': Operation not permitted
```

そのため未コミットのままです。`TASK.md` は初期状態から未追跡だったため触っていません。