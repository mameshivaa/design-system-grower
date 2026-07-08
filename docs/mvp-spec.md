# MVP Spec

## 結論

MVP は「自分版 shadcn を作る」でも「shadcn/ui 前提の補助ツール」でもなく、**React / TypeScript / Tailwind 系 repo 内の UI の散らばりを可視化し、reuse / variant / wrapper / block 候補を出す**ことに絞る。

最初の価値は registry 生成ではない。最初の価値は、ユーザーが 5 分でこう思えることである。

> あ、うちの UI って実はこの数パターンに収束してたんだ。

## 対象ユーザー

初期ユーザーは、React / TypeScript で UI を作っており、Tailwind の `className` や component props を通じて UI が散らばり始めているプロジェクトの開発者。

特に以下の状態を想定する。

- `button`, `Card`, `Badge`, `Input` などの似た UI が複数画面にある
- `className` override が各画面に散らばっている
- `cn()` や `cva()` を使っている場合もある
- shadcn/ui を使っている場合もあるが、必須ではない
- AI agent や人間が似て非なる UI を追加し始めている

## MVP の約束

MVP は、既存コードを書き換えない。

MVP がやることは以下だけ。

1. React / TypeScript / Tailwind 系 repo を走査する
2. `className`、`cn()`、`cva()`、import signal を読む
3. 散らばった override / 類似 UI を cluster として出す
4. cluster ごとに `reuse` / `promote-variant` / `wrap` / `extract-block` / `document-rule` を提案する
5. ユーザーが判断するための inventory / promotion board を出す

shadcn/ui は、検出できた場合に追加情報として扱う。ユーザーが shadcn/ui を使っていることを前提にしない。

## MVP でやらないこと

- 自動置換しない
- codemod しない
- Storybook を生成しない
- registry を生成しない
- shadcn/ui 専用の registry 生成をしない
- MUI / Chakra / Mantine / Ant Design を本格対応しない
- CSS Modules / styled-components を移行しない
- URL / screenshot から UI を作らない
- LLM に直接コードを書き換えさせない

shadcn/ui、MUI、Chakra、Mantine、Ant Design、CSS Modules、styled-components は、検出してもまず **observe-only または signal** として扱う。MVP では「存在するが触らない」または「候補判断の補助情報に使う」と明示するだけでよい。

## 入力

```bash
dsg scan .
dsg review design-system
dsg decide design-system candidate-001 promote-variant --name PrimaryAction
dsg instruct design-system
dsg install-instructions design-system --agents-out AGENTS.md --claude-out CLAUDE.md
```

または開発中は:

```bash
node src/cli.mjs scan . --out design-system/catalog.json
```

## 出力

```txt
design-system/
  catalog.json
  inventory.json
  situations.json
  candidates.json
  decisions.json
  assets.json
  assets.md
  decisions.md
  agent-rules.md
  review.html
```

各ファイルの役割:

- `inventory.json`: repo 内の UI 構造、library signal、`cva()`、`cn()`、styling signal
- `situations.json`: repo の状態診断
- `candidates.json`: ユーザー判断が必要な候補
- `decisions.json`: 候補ごとの未決定状態
- `assets.json`: 承認済み decision を agent が参照しやすい UI asset として構造化したもの
- `assets.md`: 承認済み UI asset の人間向け一覧
- `decisions.md`: 人間がレビューするための decision checklist
- `agent-rules.md`: AI agent に「まだ自動置換しない」「既存候補を優先する」と伝える初期ルール
- `review.html`: ローカルで開ける静的 promotion board

`dsg review design-system` を実行すると、`review.html` と生成 artifact を localhost で配信し、ブラウザで promotion board を開く。

`decisions.json` で `status: "approved"` と `userDecision` を設定した後、`dsg instruct design-system` を実行すると、承認済み判断を反映した `agent-rules.md` と `assets.*` を再生成する。

CLI から直接判断する場合は、`dsg decide design-system <candidate-id> <action> --name <AssetName>` を使う。これは `decisions.json` を承認済みに更新し、`agent-rules.md` と `assets.*` も同時に再生成する。`--name` は任意だが、チームが再利用したい概念名を明示できる。

承認済みルールを実際にエージェントが読みやすいファイルへ出す場合は、`dsg install-instructions design-system --agents-out AGENTS.md --claude-out CLAUDE.md` を使う。既存ファイルは `--force` なしでは上書きしない。

## Situation

MVP で出す状況診断は絞る。

| Situation | MVP 対応 |
|---|---|
| repeated Tailwind / `className` UI patterns | 対応する |
| shadcn/ui project detected | signal として扱う |
| scattered component `className` overrides | 対応する |
| `cva()` variant definitions | 対応する |
| Radix / Headless UI imports | observe-only |
| MUI / Chakra / Mantine / Ant Design | observe-only |
| domain-specific repeated UI | 候補として出す |
| AI-generated UI drift | 明示的検出は後回し |
| CSS Modules / styled-components | observe-only |

## Candidate Action

すべての候補は、必ず次のいずれかに分類する。

- `reuse`: 既存 component / variant に寄せられそう
- `promote-variant`: `Button` などに variant / size を追加するとよさそう
- `wrap`: wrapper component にするとよさそう
- `extract-block`: domain block / product block として切り出すとよさそう
- `document-rule`: コード変更せず、usage rule として記録するのがよさそう
- `unsupported`: 検出したが MVP では触らない

MVP では `review-required` 以上の操作も、実際のコード変更は行わない。

## Review UI

`review.html` は、MVP では静的 HTML でよい。

表示するもの:

- scan summary
- detected situations
- Needs Your Decision
- candidate title
- candidate id
- recommended action
- suggested asset name
- copyable approval command
- decision action options
- safety level
- source locations
- common classes
- variant classes
- situation evidence

MVP の UI は「操作画面」ではなく「レビュー用 board」とする。`dsg review` でローカルブラウザ体験を起動するが、承認は `dsg decide ...` のコマンドで行い、ブラウザ上での保存 UI や書き換えは後続フェーズ。

## 成功条件

MVP の成功条件:

- shadcn/ui がなくても repeated `className` UI を cluster として見せられる
- shadcn/ui がある場合は signal として検出できる
- `cva()` variant 定義の存在を検出できる
- `cn()` に含まれる静的 class を抽出できる
- MUI / Chakra / CSS Modules などは observe-only として安全に見せられる
- 候補が action type と safety level を持つ
- review.html で「何を判断すべきか」と「どのコマンドで承認するか」が分かる
- `dsg review` で promotion board を localhost からブラウザ表示できる
- 承認済み `decisions.json` から agent が参照できる `agent-rules.md` を再生成できる
- `dsg decide` で候補を承認し、named UI asset と agent rules に即時反映できる
- `dsg install-instructions` で承認済み UI rules を `AGENTS.md` / `CLAUDE.md` へ安全に書き出せる

MVP 後にやること:

- decisions の保存 UI
- optional shadcn-compatible registry generation
- Storybook generation
- dry-run codemod
