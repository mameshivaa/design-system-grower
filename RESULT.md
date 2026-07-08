実装完了し、コミットしました。

コミット: `705963e Implement dsg mcp server`

実施内容:
- `dsg mcp --design-system <artifacts-dir>` を追加
- stdio 改行区切り JSON-RPC 2.0 の MCP サーバーを自前実装
- `list_assets` / `lookup_pattern` / `check_classes` を実装
- tool call ごとに artifacts を再読込
- `src/check.js` の照合ロジックを MCP から再利用できるよう最小限 export
- `docs/mcp.md` と MCP 統合テストを追加
- `RESULT.md` に作業報告を記録

検証:
- `npm test` 成功
- 30 tests / 30 pass
- `git diff --check` 成功

補足: `TASK.md` は作業開始時点から未追跡の入力ファイルだったため、コミット対象から除外しています。