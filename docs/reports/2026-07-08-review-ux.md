実装してコミットしました。

Commit: `9ed7fce Improve review board UX`

実施内容:
- Review board 初期表示を score 上位 20 件に制限
- `Show all` で全候補展開
- `actionType / category` グルーピングと件数バッジ
- source snippet API: `GET /api/snippet`
- browser decide API: `POST /api/decide`
- CLI decide ロジックを `src/decision-actions.js` に分離して再利用
- 承認フォーム、asset 名入力、コピーボタン追加
- localhost 限定バインドを明示チェック
- `RESULT.md` に作業報告を記録

確認:
- `npm test` 全通過: 17/17
- `git diff --check` OK
- 禁止ファイル `src/cluster.js` / `src/candidates.js` / `src/inventory.js` は未変更

`TASK.md` は入力指示ファイルとして未追跡のまま残しています。