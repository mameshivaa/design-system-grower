# RESULT

## 実装内容

- `src/hooks.js` を追加し、Claude Code `PostToolUse` 用の `hook-check` と `.claude/settings.json` へ追記する `install-hooks` を実装。
- `src/cli.js` に `hook-check` / `install-hooks` のコマンド登録と最小限の引数パースを追加。
- `docs/hooks.md` を追加し、仕組み、インストール、アンインストール手順を記載。
- `package.json` の npm 同梱ファイルに `docs/hooks.md` を追加。
- `test/design-system-grower.test.js` に hook-check / install-hooks の要求ケースを追加。

## 確認

- `npm test`
- 38 tests / 38 pass

## 備考

- `src/check.js` の判定挙動は変更していない。
- `src/roles.js` / `src/catalog.js` / `src/candidates.js` / `src/init.js` / `README.md` は変更していない。
