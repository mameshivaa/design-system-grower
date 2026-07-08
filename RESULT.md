実装完了し、コミットしました。

Commit: `cc8d127 Add design-system drift check`

主な内容:
- `dsg check <repo-path> --design-system <artifacts-dir>` を追加
- near-miss / deprecatedClasses 検出、`--files`、`--strict`、`--report` 対応
- `docs/check.md` に使い方と CI 例を追加
- `RESULT.md` に作業報告を記録
- 指定された担当外ファイルと `scripts/` は未変更

検証:
- `npm test` 通過
- `28 tests / 28 pass`
- `git diff --check` 通過

作業後の未追跡は、元からある指示ファイル `TASK.md` のみです。