# Direction v2 — 検証結果に基づく方針(2026-07-08)

このドキュメントは、実 OSS repo での候補品質検証(precision 評価)の結果に基づき、
vision.md / product-brief.md の長期方針を維持したまま、**直近の開発優先順位を確定する**ものである。

指揮系統: Claude Code(指揮官・方針・レビュー・リリース) / Codex(実装・テスト)。

## 検証結果(2026-07-08 実施)

対象: `shadcn-ui/taxonomy`(shadcn あり・127ファイル)、`dubinc/dub`(大規模・4048ファイル)。

| repo | 候補数 | precision@10(上位10件のうち有益な候補) |
|---|---|---|
| taxonomy | 87 | **0/10** |
| dub | 2,648 | **0/10** |

上位候補の実例:

- taxonomy #1: `h-4 mr-2 w-4`(アイコンサイズ) — ノイズ
- taxonomy #2: shadcn の `components/ui/*` 内部実装同士のクラス一致 — 既存 design system を「候補」として再発見している
- dub #1: `flex gap-2 items-center`(汎用レイアウト、score 3733) — ノイズ
- dub #8: `mt-8`(単一マージンクラス) — ノイズ
- dub 全体: `commonClasses` が空の候補が **91件**

**結論: 「うちの UI はこの数パターンに収束していた」という aha 体験は、現状の抽出品質では成立しない。**
成功条件(vision.md)への最大の障害は機能の不足ではなく候補の S/N 比である。

## 北極星指標

> 実 repo(taxonomy / dub / 自分のプロジェクト)で **precision@10 ≥ 7/10**、
> かつ review board の初期表示が **20件以下** に収まること。

すべての機能追加・変更は「候補精度」「判断スループット」「agent 遵守率」のどれかを
改善するかで判定する。改善しないものは凍結(vision の Phase 2〜5 は北極星達成まで凍結継続)。

## 診断: 品質問題の根本原因

1. **汎用ユーティリティの共起がスコアを支配する** — `flex` `items-center` `gap-2` `h-4 w-4` `size-4` `mt-8` などの頻出クラスは、どの repo でも偶然一致する。頻度ベースのスコアは最も汎用的なパターンを最上位に押し上げる。
2. **クラス集合の「識別力」を評価していない** — 色・タイポグラフィ・ボーダー・状態(hover/focus/data-*)を含む「意味的に濃い」組み合わせこそ component 候補であり、レイアウトユーティリティのみの一致は候補ではない。
3. **既存 design system の内部を候補として再発見する** — `components/ui/*` や `cva()` 定義ファイルは「既にあるもの」であり、inventory に載せるべきで、candidate にすべきではない。価値があるのは「その外側での逸脱・重複」検出。
4. **アイコンコンポーネント群のサイズクラス一致** — `<Icons.x className="h-4 w-4">` 系は candidate から除外(または独立した低優先カテゴリに隔離)すべき。
5. **空 commonClasses 候補が生成される** — バグ。候補の最低品質ゲートがない。

## マイルストーン

### M1: 候補品質(最優先・北極星に直結)

- クラス重み付け(repo 内 IDF: 遍在クラスの寄与を減衰)
- クラスカテゴリ分析(layout / spacing / color / typography / border / state / effect)と
  「複数カテゴリ + 識別的クラスを含む」ことを候補の必須条件にする
- 既存 component(`components/ui/*`、`cva` 定義)は candidate ソースから除外し
  existing-inventory として扱う
- アイコン専用パターンのフィルタ
- 空 commonClasses 候補の排除、候補の品質ゲート(最低スコア・最低識別力)
- taxonomy / dub の実ノイズを再現する regression fixture とテスト

### M2: review board UX(判断スループット)

- 初期表示は高信頼候補 top-N(既定 20)に制限、"show all" で全件
- カテゴリ別グルーピング、score/severity ソート
- ソースコードスニペット表示
- ブラウザ上で decide(review server への POST で decisions.json 保存)
- 承認コマンドのコピーボタン

### M3: OSS 体裁と v0.1.0 公開準備

- LICENSE(MIT)、CONTRIBUTING.md、package.json metadata(repository / keywords / engines)
- GitHub Actions CI(node LTS matrix で npm test)
- `npx design-system-grower` で動く配布形態の確認(npm pack dry-run)
- README を「30秒で価値が分かる」構成に(実 repo でのビフォー/アフター例)

### M4: agent instruction の効果検証(差別化の核)

- agent-rules.md / AGENTS.md の有無で coding agent の UI 再利用率が変わるかを実測
- 効果があれば「AI agent に一貫した UI を作らせるツール」として README / 訴求を再構成

## 実行順序と分担

| タスク | 担当 | 依存 |
|---|---|---|
| M1 候補品質 | Codex worker `cluster-quality` | なし |
| M2 review UX | Codex worker `review-ux` | なし(candidates schema 不変) |
| M3 OSS 体裁 | Codex worker `oss-packaging` | なし |
| 既存 component 照合(M1後半) | Codex worker(M1 マージ後) | M1 |
| M4 効果検証 | Claude Code(指揮官) | M1 |
| マージレビュー・リリース | Claude Code(指揮官) | 各 worker |

## 品質ゲート(マージ条件)

- `npm test` 全通過(既存 + 新規テスト)
- 外部 runtime 依存の追加禁止(dependency-free 方針の維持)
- taxonomy / dub 相当の fixture で: 汎用ユーティリティのみの候補が top10 に入らないこと
- 既存 source code を書き換えない safety model の維持
