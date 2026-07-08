実装完了しました。`dsg registry` を追加し、provenance 付きコンポーネントだけを shadcn 互換の `registry.json` / `r/<name>.json` に出力します。個別 item には `files[].content` と `meta.provenance` を含めています。

変更:
- [src/registry.js](/Users/tk/Documents/New%20project/.ai-worktrees/dsg-registry/src/registry.js)
- [src/cli.js](/Users/tk/Documents/New%20project/.ai-worktrees/dsg-registry/src/cli.js)
- [src/index.js](/Users/tk/Documents/New%20project/.ai-worktrees/dsg-registry/src/index.js)
- [docs/registry.md](/Users/tk/Documents/New%20project/.ai-worktrees/dsg-registry/docs/registry.md)
- [test/design-system-grower.test.js](/Users/tk/Documents/New%20project/.ai-worktrees/dsg-registry/test/design-system-grower.test.js)
- [package.json](/Users/tk/Documents/New%20project/.ai-worktrees/dsg-registry/package.json)
- [RESULT.md](/Users/tk/Documents/New%20project/.ai-worktrees/dsg-registry/RESULT.md)

検証:
- `npm test`
- 53 tests / 53 pass

コミットは試みましたが、`git add` が `/Users/tk/Documents/New project/.git/worktrees/dsg-registry/index.lock` の作成権限エラーで失敗したため未コミットです。`TASK.md` は未追跡のままコミット対象外にしています。

参照した shadcn 公式 docs:
- https://ui.shadcn.com/docs/registry/registry-json
- https://ui.shadcn.com/docs/registry/registry-item-json