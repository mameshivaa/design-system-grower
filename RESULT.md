# review-ux 作業報告

## 実装内容

- Review board の初期表示を score 上位 20 件に制限し、Show all で `candidates.json` から全件展開できるようにした。
- 候補を `actionType / category` でグルーピングし、グループごとの件数バッジを表示するようにした。
- 候補カードに承認コマンドの Copy ボタン、asset 名入力、承認フォームを追加した。
- Review server に `GET /api/snippet` を追加し、catalog の `target` 配下の source location から前後行を返すようにした。ディレクトリトラバーサルは拒否する。
- Review server に `POST /api/decide` を追加し、`decisions.json` 更新後に `assets.json` / `assets.md` / `agent-rules.md` を再生成するようにした。
- 既存 CLI の decide 処理を `src/decision-actions.js` に切り出し、CLI と review server で同じ保存ロジックを再利用した。
- Review server の localhost 限定バインドを明示的に検証するようにした。

## 変更範囲

- `src/decisions.js`
- `src/review-server.js`
- `src/cli.js`
- `src/decision-actions.js`
- `test/design-system-grower.test.js`

指定された禁止ファイル `src/cluster.js` / `src/candidates.js` / `src/inventory.js` は変更していない。

## テスト

- `npm test`
- 結果: 17 tests pass
