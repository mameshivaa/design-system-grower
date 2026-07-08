# Vision

## 一言でいうと

誰もが、自分のプロダクトから自分専用の UI registry / design system を育てられる世界を作る。

`design-system-grower` は、外部 UI ライブラリをもう一つ増やすためのツールではない。既存コード、既存 UI ライブラリの使われ方、チーム固有のアレンジを読み取り、それらを再利用可能な component、catalog、registry、agent instruction に昇格させるためのツールである。

## 思想

shadcn/ui が示した大きな転換は、「UI ライブラリを npm dependency としてブラックボックス利用する」ことから、「UI コンポーネントを自分の repo に持ち、自分で所有し、編集する」ことへの移行だった。

このプロジェクトが目指す次の転換は、その思想の一般化である。

> 既存の UI ライブラリを選ぶ時代から、自分のプロダクトから自分の UI ライブラリを育てる時代へ。

AI が UI を無限に生成できる時代には、生成能力そのものよりも、生成された UI がチーム固有の文脈、既存コンポーネント、命名、variant、アクセシビリティ、運用ルールに沿って再利用されることが重要になる。

そのため、このツールの中心は「コード生成」ではない。中心は「再利用」「正規化」「所有」「継承」である。

## 誰に使ってほしいか

主なユーザーは、React / TypeScript を中心にプロダクト UI を作っており、Tailwind、shadcn/ui、Radix、MUI などの有無にかかわらず、UI の繰り返しやアレンジがコード上に溜まり始めている開発者とチームである。

- Tailwind / component props / wrapper の運用が散らかり始めているチーム
- shadcn/ui を導入したが、`className` override や variant が散らかり始めているチーム
- 自社プロダクト固有の UI パターンが増え、そろそろ design system 化したいチーム
- 外部 UI ライブラリをそのまま使うのではなく、自分たちのコードとして所有したい開発者
- AI coding agent に毎回似て非なる UI を作らせたくないチーム
- 複数プロダクト間で、自社固有の UI registry を再利用したいチーム
- OSS として自分の UI スタイルや blocks を配布したい個人開発者

初期ターゲットは、React / TypeScript のコード上に UI の繰り返しが溜まっているチームである。shadcn/ui は相性のよい signal / adapter だが、利用前提にはしない。

ゴールは、特定ライブラリの利用者だけでなく、誰でも自分のプロダクトから自分の UI system を育てられるようにすることにある。

## 何に有益か

### 1. 暗黙の UI 判断を明示化する

実際のプロダクトでは、design system は最初から綺麗に存在しているわけではない。ボタン、カード、フォーム、バッジ、空状態、管理画面のリストなどが、実装の中で少しずつ似た形に収束していく。

このツールは、repo 内に散らばった UI の繰り返しを見つけることで、「このプロダクトでは何が実質的な UI パターンになっているのか」を可視化する。

### 2. 既存ライブラリの使われ方を自社仕様に変える

多くのチームは、すでに shadcn/ui、Radix、MUI、Chakra、Mantine、Ant Design などを導入し、その上に独自の className、theme、sx、variant、wrapper を積んでいる。

価値があるのは、元ライブラリを単純に置き換えることではない。価値があるのは、そのプロジェクトで繰り返されているアレンジを抽出し、「このチームでは Button はこう使う」「この Card はこの業務文脈で使う」と明示することにある。

### 3. AI agent に既存資産を使わせる

AI coding agent は、放っておくと既存の UI 資産を無視して新しい JSX を作りがちである。必要なのは、コンポーネントそのものだけではなく、agent が参照できる catalog と instructions である。

このツールは、最終的に以下を生成する方向を目指す。

- component catalog
- shadcn-compatible registry
- Storybook stories / manifest
- `AGENTS.md`
- `CLAUDE.md`
- Cursor rules
- 使用すべき component と避けるべき pattern のルール

### 4. UI 資産をプロジェクト外にも持ち出せる

最終的な制作物は、単なる npm ライブラリではなく、プロジェクト固有の design system layer である。

```txt
my-ui/
  registry.json
  components/
    button.tsx
    dialog.tsx
    data-table.tsx
    patient-card.tsx
  blocks/
    onboarding-flow.tsx
    billing-settings.tsx
  styles/
    tokens.css
  docs/
    button.mdx
    usage-rules.md
  agents/
    AGENTS.md
    cursor-rules.md
```

これはライブラリ的な component を含むが、ライブラリだけではない。usage contract、由来、意思決定、移行ルール、agent instruction まで含む UI 運用資産である。

## 体験の方向性

CLI は入口であり、エンジンである。しかし、体験の本体は CLI だけでは足りない。

理想の初回体験は、shadcn/ui create のように開発ブラウザが起動し、ローカル repo の UI inventory を見ながら design system を育てられることである。

```bash
dsg scan .
dsg review
```

または、

```bash
npx design-system-grower review
```

ブラウザには、単なる重複リストではなく、以下のような promotion board を出す。

- Button candidates
- Card candidates
- Form field candidates
- Status badge candidates
- Page header candidates
- Empty state candidates

各候補では、実際の使用箇所、見た目プレビュー、共通 class、差分 class、推奨コンポーネント名、props 案、リスク、昇格アクションを並べる。

最初の価値は自動置換ではない。最初の価値は、「うちの UI は実はこの数パターンに収束していた」と一目で分かることである。

## 既存ライブラリへの対応方針

既存ライブラリを導入している場合、最初から分解して捨てるべきではない。基本方針は、段階的に扱うことである。

### 1. Observe

まず、既存ライブラリの使われ方を観察する。

- どの component が多く使われているか
- どの props が繰り返されているか
- どの `className` override が散らばっているか
- どの wrapper が実質的な design system になっているか

### 2. Normalize

次に、繰り返しを variant、size、theme、wrapper、usage rule に正規化する。

- 既存 variant で表現できるものは寄せる
- 繰り返し override は新 variant に昇格する
- 複数 component の定型構成は block / wrapper にする
- 一回限りの例外は例外として残す

### 3. Internalize

十分に安定し、チーム固有の資産になったものだけを、自前 component または registry item として内製化する。

この段階では、由来、ライセンス、差分、移行パスを記録する必要がある。

```txt
components/ui/
  button.tsx        # shadcn由来 + 自社variant
  dialog.tsx        # Radix依存を残す
  pricing-card.tsx  # 自社利用実態から抽出

design-system/
  provenance.json
  decisions.md
  migrations/
    mui-button-to-app-button.ts
```

目的は、元ライブラリを消すことではない。目的は、自分たちが実際に使っている UI 判断を、明示的な資産にすることである。

## shadcn を signal として扱う理由

shadcn/ui は利用前提にはしない。ただし、検出できた場合は重要な signal として扱う。

- `components/ui/*` が repo 内に存在する
- Tailwind class と `cn()` の解析がしやすい
- `class-variance-authority` の variant 定義を読める
- registry という配布形式がある
- AI agent 向け instruction と接続しやすい
- 「自分で所有する UI」という思想がすでに共有されている

プロダクトは、shadcn/ui が存在する場合に以下を検出・提案できるようにする。

- shadcn/ui project の検出
- `components/ui/*` の inventory
- `buttonVariants` などの `cva` 定義
- `cn()` と `className` override の収集
- 既存 variant に寄せられる使用箇所
- 新 variant に昇格すべき繰り返し override
- wrapper / block にすべき複合 UI
- shadcn-compatible registry item の出力
- agent instruction の出力

## 最終制作物

最終制作物は、狭い意味の UI ライブラリではない。

最終制作物は、プロジェクト固有の design system layer である。その中に component library、registry、docs、agent instructions、migration plan が含まれる。

具体的には、以下のような成果物を目指す。

- `components/ui/*`
- `registry.json`
- `design-system/catalog.json`
- `design-system/decisions.md`
- `design-system/provenance.json`
- `design-system/migrations/*`
- Storybook stories / manifest
- `AGENTS.md`
- `CLAUDE.md`
- Cursor rules

この制作物によって、人間も AI agent も、次回以降の開発で既存 UI 資産を使い続けられる。

## やるべきこと

### Phase 1: repo-first inventory

- React / TypeScript / Tailwind repo を走査する
- static `className` を抽出する
- `cn()` の静的・部分静的 class を抽出する
- `cva()` の class と variant key を抽出する
- shadcn/ui、MUI/Chakra/Mantine/Ant Design、CSS Modules、styled-components を状況診断の signal として扱う
- 類似 UI cluster を作る
- score、source location、common classes、variant classes を出す
- `catalog.json`、`inventory.json`、`situations.json`、`candidates.json`、`decisions.json`、`assets.json`、`assets.md`、`decisions.md`、`agent-rules.md`、`review.html` を生成する

### Phase 2: library adapters

- shadcn/ui project を signal として検出する
- `components/ui/*` を inventory 化する
- `cva` variant 定義を解析する
- `cn()` と `className` override を収集する
- 既存 variant への寄せ方、新 variant 候補、wrapper 候補を出す
- MUI / Chakra / Mantine / Ant Design などは observe-only adapter から始める

### Phase 3: local review UI

- `dsg review` で生成済み promotion board をローカルブラウザで起動する
- candidate を type 別に表示する
- 実使用箇所と preview を並べる
- component 名、props 案、リスク、昇格理由を表示する
- `Promote` / `Ignore` / `Needs manual review` をブラウザ上で記録する

### Phase 4: registry and instructions

- promoted candidate から shadcn-compatible registry item を生成する
- Storybook stories / manifest を生成する
- `AGENTS.md` / `CLAUDE.md` / Cursor rules を生成する
- AI agent が既存 component を優先するように instruction を出す

### Phase 5: migration and codemod

- dry-run patch を生成する
- AST ベースの codemod を使う
- build / test gate を通す
- PR / diff review に接続する
- provenance と decisions を記録する

## 避けるべきこと

- 最初から URL / screenshot clone を中心にしない
- LLM に直接コードを書き換えさせない
- 既存ライブラリを無理に捨てさせない
- 重複を見つけたからといって全部共通化しない
- UI component だけを出して agent instruction を忘れない
- shadcn 専用ツールにしない

## 成功条件

初期の成功条件は、ユーザーが最初の 5 分でこう思えることである。

> あ、うちの UI って実はこの数パターンに収束してたんだ。

次の成功条件は、promote した component や registry item を、人間と AI agent がその後の開発で実際に再利用することである。

最終的な成功条件は、各チームが外部 UI ライブラリをそのまま選ぶだけではなく、自分たちの product UI から自分専用の UI system を育て、配布し、継承できるようになることである。
