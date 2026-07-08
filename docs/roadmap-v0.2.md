# Roadmap: v0.1 の実証結果から導く次の投資(2026-07-08)

前提となる実証データ(v0.1.0):

- 候補精度: 実repo precision@10 ≈ 8/10(北極星達成)
- A/B実験: rules なしでも agent は近隣ファイル参照で 46% 到達。rules ありで 64%。
  最大の質的差は「**repo 内に競合するパターン系統があるとき、どちらが正か**」の伝達
  (green系 vs emerald系のドリフト防止)
- ここから導かれる中心命題: このツールの本質価値は「繰り返しの発見」ではなく
  「**正準(canonical)の宣言と執行**」である。

## P1 — 価値の核を強化する(次の3週間)

### 1. 競合パターン検出(drift detection)を第一級機能にする

現在は「似たものをまとめる」だけ。次は「**同じ役割なのに系統が割れているもの**」を
検出して対決させる。

- 同カテゴリ構成・同要素で、クラスシグネチャが部分的に重なる(Jaccard 0.3〜0.8)
  クラスタ同士を「competing family」としてペアリング
- board に「Status box: 2 systems競合 — emerald系 12箇所 / green系 3箇所。
  どちらを正準にしますか?」という対決カードを出す
- 決定は `canonical` / `deprecated` として記録し、agent rules に
  「green系は deprecated。emerald系を使え」と明示する
- **これが最強の aha**: 「重複がある」より「割れてる。どっちにする?」の方が
  行動を直接誘発する

### 2. `dsg check` — CI で使えるドリフトゲート

助言(rules)から執行(gate)へ。

- `dsg check <dir> [--base <ref>]`: 変更されたファイルの新規 className を catalog と
  照合し、(a) deprecated 系統の使用、(b) 承認済みパターンと高類似だが不一致、を報告
- exit code で CI を落とせる / `--report` で PR コメント用 markdown を出力
- agent が rules を無視しても CI が捕まえる。人間のレビュー負荷も下がる
- A/B の残り 36%(rules があっても逸脱した分)を刈り取る手段

### 3. npm publish v0.1.x(ユーザー操作)

`npm publish` は 2FA が必要なためユーザー実行。`npx design-system-grower` が
動いて初めて README の Quick Start が真になる。

## P2 — 導入摩擦と計測(その後の1ヶ月)

### 4. ベンチマークハーネス(北極星の回帰テスト)

- `scripts/bench.mjs`: 固定コミットの taxonomy / dub を clone → scan →
  golden 期待値(上位候補のシグネチャ)と比較して precision を算出
- CI の別ジョブ(ネットワーク許可)で実行し、精度のリグレッションを検知
- 「Measured, not promised」を継続的に担保する仕組み

### 5. MCP サーバー(`dsg mcp`)

agent-rules.md は静的ダンプ。agent が実装中に「この見た目の UI、既存パターンある?」
と**問い合わせられる**方が強い。

- tools: `lookup_pattern(description|classes)` → 該当 asset、`list_assets()`、
  `check_classes(classes)` → canonical/deprecated 判定
- Claude Code / Cursor / Codex いずれも MCP 対応済み。設置は
  `dsg mcp install` で各エージェント設定に登録
- 静的 rules(コンテキスト常駐・小)と MCP(オンデマンド・詳細)の二層構成

### 6. `dsg init` — 5分体験の一本化

scan → board 起動 → ガイド付き最初の承認 → AGENTS.md 生成提案までを
1コマンドで。README の GIF デモもこの導線で撮る。

## P3 — 拡張(需要を見て)

7. **cva 生成**: promote-variant 承認時に、variantClasses から `cva()` 定義の
   ドラフトコードを出力(コード生成だが「提案ファイル」として。既存コードは不変)
8. **視覚プレビュー**: review board でパターンをレンダリング表示
   (Tailwind ランタイムを opt-in フラグで。既定は no-network を維持)
9. **Cursor rules / copilot-instructions 出力**: install-instructions の出力先追加
10. **AST パーサー tier**: ヒューリスティックで落ちる実例が fixture に3件溜まったら
    opt-in の `--parser` フラグとして導入判断(dependency-free 既定は維持)
11. **adherence 監査**: `dsg audit` で「シグネチャ遵守率」を期間・ディレクトリ別に
    レポートし、design system の浸透度を数値化

## やらないこと(引き続き)

- URL / screenshot import を中心に据えない
- LLM による直接コード書き換え
- 既存ライブラリの強制置換
- 閾値なしの全パターン共通化

## 成功指標の更新

- 北極星(維持): 実repo precision@10 ≥ 7、board 初期表示 ≤ 20
- 追加: `dsg check` 導入 repo で「新規 UI のシグネチャ遵守率」が計測可能になること。
  A/B の 64% を、check ゲート併用で 85%+ に引き上げるのが v0.2 の定量目標
