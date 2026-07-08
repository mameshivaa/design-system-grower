# Roadmap v0.6 — 梱包と配布(2026-07-08)

## 方針の再定義(オーナーのビジョン)

このツールの主役は「間違い防止」ではない。**手で丁寧に実装された自作 UI を、
名前を与え、ディテール調整可能な形に整え、shadcn のように配布可能な資産へ梱包すること**。

- 発掘(scan)→ 裁定(board/decide)は梱包対象の選定装置
- check / hooks / blame は「作品集の内部一貫性」を守る校閲部
- **梱包(extract)→ 配布(registry)が本丸**であり、v0.6 で実装する

## 設計原則: lift, don't synthesize

クラス文字列からコンポーネントを再合成しない。**実装者のコードをソースからそのまま
持ち上げる。** ツールの仕事は切り出し・命名・差分の props 化・由来の記録であり、
中身の作り直しではない。作品の価値は実装そのものにある。

## v0.6 スコープ

### 1. `dsg extract`(梱包)

- `dsg extract <design-system-dir> <asset-id> --out components/ui/`
- 承認済み asset の代表使用箇所の JSX をソースから lift してコンポーネントファイルを生成
- 使用箇所間で異なるクラス(variantClasses)は variant prop に昇格、テキスト/children は props 化
- `design-system/provenance.json` に由来(元ファイル・行・抽出日・元コミット)を記録
- 生成物は「レビュー待ちの下書き」であり、既存コードは書き換えない(observe-before-mutate 維持)

### 2. `dsg registry`(配布)

- extract 済みコンポーネントから shadcn 互換 registry(registry.json + r/[name].json)を生成
- 静的ホスティング(GitHub Pages / raw URL)手順を docs に明記
- 消費側: `npx shadcn add <URL>` で他人の repo にインストールできることを実測で確認する

### 3. ディテール調整層(v0.6 後半〜v0.7)

- 色・角丸・spacing を CSS 変数 / tokens として括り出すオプション
- 導入側が「揃えて変更」できる形(shadcn の theming と同じ土俵)

## 品質ゲート

- extract の成果物が「元実装と視覚的に同一」であること(クラス列の同値性をテストで保証)
- provenance のない配布物を作らない
- 実 repo(taxonomy / 実プロダクト)で extract → registry → shadcn add の全経路を検証してからリリース
