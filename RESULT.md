実装は完了していますが、コミットだけ sandbox 権限で失敗しました。

変更済み:
- [package.json](/Users/tk/Documents/New%20project/.ai-worktrees/oss-packaging/package.json): npm 公開用 metadata、MIT、repository、engines、`files`、bin 整備
- [README.md](/Users/tk/Documents/New%20project/.ai-worktrees/oss-packaging/README.md): CI/license badges と Quick Start 追加
- [LICENSE](/Users/tk/Documents/New%20project/.ai-worktrees/oss-packaging/LICENSE): MIT 追加
- [CONTRIBUTING.md](/Users/tk/Documents/New%20project/.ai-worktrees/oss-packaging/CONTRIBUTING.md): setup/test/dependency-free/safety model 追加
- [.github/workflows/ci.yml](/Users/tk/Documents/New%20project/.ai-worktrees/oss-packaging/.github/workflows/ci.yml): Node 20 / 22 matrix CI 追加
- [RESULT.md](/Users/tk/Documents/New%20project/.ai-worktrees/oss-packaging/RESULT.md): 作業報告と pack 結果を記録

検証:
- `npm test`: pass、14 tests
- `npm exec --package . -- design-system-grower --help`: pass
- `npm exec --package . -- dsg --help`: pass
- `npm pack --dry-run`: pass、19 files、package size `26.7 kB`
- `src/` と `test/` の差分なし

コミット失敗理由:
`git add` が `/Users/tk/Documents/New project/.git/worktrees/oss-packaging/index.lock` へ書き込もうとして、現在の sandbox がその `.git` worktree metadata を read-only 扱いにしているため失敗しました。

エラー:
```text
fatal: Unable to create '/Users/tk/Documents/New project/.git/worktrees/oss-packaging/index.lock': Operation not permitted
```

未追跡の `TASK.md` は作業開始時から存在していた指示ファイルなので、成果物には含めていません。