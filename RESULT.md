# RESULT

## 実装内容

- `dsg mcp --design-system <artifacts-dir>` を追加し、stdio の改行区切り JSON-RPC 2.0 で MCP サーバーを起動できるようにした。
- `initialize`、`notifications/initialized`、`tools/list`、`tools/call` に対応し、未知メソッドは JSON-RPC `-32601` を返す。
- MCP tools として `list_assets`、`lookup_pattern`、`check_classes` を実装した。
- 各 tool call で `assets.json`、`decisions.json`、`catalog.json` を読み直すようにした。
- `src/check.js` の既存照合ロジックを再利用できるよう、承認済み asset 読み込みとクラス列照合関数を export した。既存 `dsg check` の挙動は変更していない。
- `docs/mcp.md` に Claude Code と Codex の登録例、各 tool の説明を追加した。
- child_process で MCP サーバーを起動する統合テストを追加した。

## 検証

```bash
npm test
```

結果: 30 tests / 30 pass

## 備考

- 外部 runtime 依存は追加していない。
- README は変更していない。
- `TASK.md` は作業開始時点から未追跡の入力ファイルだったため、コミット対象から除外した。
