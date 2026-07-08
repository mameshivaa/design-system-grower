実装完了しました。`src/diagnosis.js` を追加し、`scan` / `init` の人間向け診断書表示、`design-system/diagnosis.md` 生成、`dsg diagnose [design-system-dir]` による既存 artifact からの再生成を入れています。`src/check.js` / `attribution.js` / `README.md` は触っていません。

検証済みです。

```text
npm test
47 tests, 47 pass
```

`RESULT.md` に作業報告も書きました。

コミットは試みましたが、この sandbox では Git が `/Users/tk/Documents/New project/.git/worktrees/diagnosis-card/index.lock` を作れず、`git add` が `Operation not permitted` で失敗したため未コミットです。現在の未コミット対象は実装ファイル群、`RESULT.md`、支給された未追跡の `TASK.md` です。