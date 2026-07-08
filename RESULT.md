# RESULT: variant-attribution

## 実装内容

- `src/attribution.js` を追加し、ファイルパスと行番号から `git blame --porcelain` を非同期 `execFile` で取得する `attributeLine` を実装した。
- blame 結果は repo + file 単位でキャッシュし、同一ファイルの複数行に対して blame を行ごとに起動しないようにした。
- author / committer の名前・メール、およびコミットメッセージの `Co-Authored-By:` 行から `claude` / `cursor` / `codex` / `bot` / `human` を分類するようにした。
- git がない、未追跡、blame / show 失敗時は `null` または追加情報なしとして扱うようにした。
- `dsg check` に `--blame` を追加し、テキスト出力へ `introduced by: <inventor> (<relative time>)` を表示するようにした。
- `--blame --report` の Markdown レポートに `Introduced By` 列を追加した。
- `new-variant` / `near-miss` / `deprecated` を含む全 violation に対して同じ attribution 付与処理を通すようにした。

## テスト

- `npm test`
- 結果: 48件すべて通過。

追加した検証:

- 一時 git repo で Claude author のコミットを作り、`--blame` 出力に `introduced by: claude` が出ること。
- human author のコミットで `introduced by: human` が出ること。
- 未追跡ファイルでは `--blame` ありでも注記が出ないこと。
- `--blame` なしでは偽 `git` を PATH に置いても `check` が通り、blame 系 git 呼び出しが起きないこと。
- `--blame --report` で Markdown に `Introduced By` 列が出ること。
