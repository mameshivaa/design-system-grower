実装は完了しています。追加した主な成果物は `scripts/bench.mjs`, `bench/repos.json`, `bench/golden/taxonomy.json`, `bench/README.md`, `.github/workflows/bench.yml`, `RESULT.md` です。`src/`, `test/`, `package.json` は変更していません。

検証結果:
- `node scripts/bench.mjs` PASS  
  この環境では `github.com` の DNS 解決ができないため、ローカルのみ offline fixture に fallback。CI では `CI=true` の場合 fallback せず clone 失敗を検知します。
- `node scripts/bench.mjs --offline` PASS
- `npm test` PASS: 24/24

コミットは試みましたが失敗しました。理由は git worktree の実体メタデータが writable sandbox 外にあり、`index.lock` を作れなかったためです。詳細は `RESULT.md` に記録済みです。

参照: https://github.com/shadcn-ui/taxonomy