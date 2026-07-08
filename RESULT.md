実装完了し、`RESULT.md` に作業報告を書いてコミットしました。

コミット: `d3a97da Add dsg init onboarding flow`

実施内容:
- `dsg init` を追加
- `src/init.js` に scan → artifacts 生成 → summary 表示 → review server 起動 → 終了時 next steps 表示を実装
- 既存 `decisions.json` の approved decision を init 再生成時に保全
- `src/cli.js` はコマンド登録・parse/help・dispatch の最小変更
- README / `src/mcp-server.js` / `docs/mcp.md` は未変更

検証:
- `npm test`
- 31 tests passed

補足: 開始時点から未追跡だった `TASK.md` はコミットに含めていません。