# Roadmap v0.4 — コピーを仕様書として読む(2026-07-08)

v0.4 の設計原理: 訴求コピー
**「あなたの AI は今日も、4種類目のボタンを発明した」**
の各単語を、プロダクトの実挙動として真にする。

| コピーの単語 | 現状 | 必要な機能 | 状態 |
|---|---|---|---|
| 「4種類目の**ボタン**」 | パターン単位の候補のみ。役割の概念がない | **役割タクソノミー**: クラスタを Button / FormField / Card / Badge / Alert / Heading 等に分類し、役割ごとの変種数・競合ファミリー数を集計。init の第一声を「Button: 4 variants (2 competing families)」にする | v0.4 |
| 「**今日も**」 | check は承認済み asset としか照合せず、承認ゼロの repo では沈黙 | **新変種検出**: `dsg check --base <ref>` の PR 差分モードで、未承認クラスタも含めた既存パターンとの照合。「この PR は Button の5つ目の変種を発明している」 | v0.4 |
| 「**現行犯**」 | CI での事後検出のみ | **agent ループ割り込み**: `dsg install-hooks` で Claude Code の PostToolUse hook を設定し、agent がファイルを書いた瞬間に check を実行、違反は agent に差し戻して自己修正させる | v0.4 |
| 「**あなたの AI は**」 | 出所の概念がない | git blame による変種の発明者注記(human / claude / cursor / codex) | v0.5 |
| 「5分で答え合わせ」の共有 | summary はテキストのみ | 診断書化(混沌度スコア、シェア可能な出力) | v0.5 |

## 品質ゲート(従来どおり)

- 実 repo(taxonomy / dub / 実プロダクト)での検証を経てからマージ
- 誇大コピーに比例して「Measured, not promised」の実測値を手厚く維持
- dependency-free / observe-before-mutate / localhost-only は不変
- `.claude/settings.json` への hook 書き込みは明示コマンドのみ・既存設定は破壊しない

## ワーカー分担(v0.4)

| worker | 担当ファイル境界 |
|---|---|
| role-taxonomy | src/roles.js(新規)、catalog.js / candidates.js / init.js への統合 |
| new-variant-check | src/check.js、cli.js(フラグ追加のみ) |
| install-hooks | src/hooks.js(新規)、cli.js(コマンド登録のみ)、docs/hooks.md |

インターフェース契約: role-taxonomy は candidate に `role` フィールド(文字列)を追加する。
new-variant-check は `role` があれば使い、なければ要素タグに fallback する(前方互換)。
