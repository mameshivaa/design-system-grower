# design-system-grower Review Report

## 目的

`design-system-grower` は、既存の React / TypeScript / Tailwind 系コードから UI の実態を読み取り、チーム固有の UI 資産を人間と AI agent が再利用できる形に整理する repo-first CLI です。

今回の実装目的は、`docs/mvp-spec.md` を正として、shadcn/ui 前提ではない MVP を完成させることです。初期価値は registry 生成や自動 codemod ではなく、任意の React/Tailwind repo で「この repo の UI はこの数パターンに収束している」と分かり、ユーザーが reuse / variant / wrapper / block / rule の判断をできることです。

## 現在の結論

MVP として必要な主要導線は実装済みです。

```txt
scan -> local browser review -> decide -> assets -> agent rules -> install instructions
```

具体的には、既存コードを書き換えずに UI inventory と候補を生成し、ユーザーが CLI で判断を承認すると、承認済み UI asset と agent instruction に反映されます。

## 実装範囲

### CLI

現在の主導線:

```bash
dsg scan ./path/to/repo --out design-system/catalog.json
dsg review design-system
dsg decide design-system candidate-001 promote-variant --name PrimaryAction
dsg instruct design-system
dsg install-instructions design-system --agents-out AGENTS.md --claude-out CLAUDE.md
```

開発中は以下でも実行できます。

```bash
node src/cli.mjs scan ./path/to/repo --out design-system/catalog.json
```

### 生成 artifact

`scan` は以下を生成します。

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

それぞれの役割:

- `catalog.json`: scan 結果全体。inventory / situations / candidates / clusters を含む。
- `inventory.json`: import signal、`className`、`cn()`、`cva()`、styling signal の集計。
- `situations.json`: repo の UI 状態診断。
- `candidates.json`: ユーザー判断が必要な候補。`actionType`、`safetyLevel`、`assetNameSuggestion` を含む。
- `decisions.json`: 候補ごとの判断状態。
- `assets.json`: 承認済み decision を agent が参照しやすい UI asset として構造化したもの。
- `assets.md`: 承認済み UI asset の人間向け一覧。
- `decisions.md`: review 用 checklist。承認コマンドも出す。
- `agent-rules.md`: AI agent 向けの再利用ルール。
- `review.html`: `dsg review` でブラウザ表示する promotion board。

## 実装ファイル

主要ファイル:

- `src/cli.js`: CLI command、argument parsing、decision approval、instruction installation。
- `src/cli.mjs`: CLI entrypoint。
- `src/scanner.js`: 対象ファイル探索。
- `src/extractor.js`: `className` / `cn()` / `cva()` / import signal 抽出。
- `src/inventory.js`: scan 結果の inventory 化。
- `src/cluster.js`: 類似 class pattern の clustering。
- `src/situations.js`: UI 状況診断。
- `src/candidates.js`: candidate 生成、action type / safety level / asset name suggestion 付与。
- `src/assets.js`: 承認済み decision から `assets.json` / `assets.md` を生成。
- `src/decisions.js`: decisions markdown、agent rules、review HTML 生成。
- `src/catalog.js`: catalog と artifact 一式の生成。
- `src/index.js`: public exports。

仕様・説明:

- `docs/mvp-spec.md`: MVP 仕様。
- `docs/product-brief.md`: product brief。
- `docs/vision.md`: 長期 vision。
- `README.md`: 利用方法。
- `test/design-system-grower.test.js`: acceptance-oriented test suite。

## 対応済み機能

### Scanner / Extractor

対応済み:

- `.js`, `.jsx`, `.ts`, `.tsx` を scan。
- `node_modules`, `.git`, build output などは除外。
- `className="..."` を抽出。
- `className={'...'}` を抽出。
- `className={cn(...)}` 内の静的 class を抽出。
- `cn("...", condition && "...")` の静的 class 部分を抽出。
- `cva(...)` の base classes と variant key を抽出。
- import を signal として読み取る。
- shadcn/ui、Radix、MUI、Chakra、Mantine、Ant Design、CSS Modules、styled-components を検出対象にする。

意図的な制限:

- TypeScript compiler / Babel parser は導入していない。
- dependency-free 方針を維持している。
- 動的 class construction は完全解釈しない。
- runtime rendering / screenshot / DOM inspection はしない。

### Situation / Candidate

対応済み situation:

- repeated Tailwind / `className` UI patterns
- shadcn/ui project detected
- scattered component `className` overrides
- `cva()` variant definitions
- Radix / Headless UI imports
- MUI / Chakra / Mantine / Ant Design
- domain-specific repeated UI
- CSS Modules / styled-components

候補は以下を持ちます。

- `id`
- `title`
- `assetNameSuggestion`
- `actionType`
- `safetyLevel`
- `status`
- `recommendedAction`
- `rationale`
- `source`
- `commonClasses`
- `variantClasses`
- `categories`
- `score`

対応済み action:

- `reuse`
- `promote-variant`
- `wrap`
- `extract-block`
- `document-rule`
- `ignore`
- `unsupported`

MVP では、これらは判断材料であり、既存コードの自動変更は行いません。

### Review Experience

`review.html` は promotion board として生成し、`dsg review` で localhost から配信してブラウザ表示できます。

表示内容:

- scan summary
- situations
- Needs Your Decision
- candidate id
- candidate title
- recommended action
- suggested asset name
- approval command
- decision options
- safety level
- source locations
- common classes
- variant classes

例:

```bash
dsg decide design-system candidate-001 reuse --name FieldPattern
```

ブラウザ上の保存 UI は MVP 対象外です。判断の保存は `dsg decide` で行います。

### Agent-Ready Output

承認後、以下が更新されます。

- `decisions.json`: `status: "approved"` と `userDecision`、必要なら `assetName`。
- `assets.json`: agent が読みやすい構造化 UI asset。
- `assets.md`: 人間向け asset catalog。
- `agent-rules.md`: agent 向け reuse instruction。

さらに `install-instructions` で以下に書き出せます。

- `AGENTS.md`
- `CLAUDE.md`

既存ファイルは `--force` なしでは上書きしません。

## Safety Model

MVP は observe before mutate です。

安全境界:

- 既存 source code は書き換えない。
- codemod は実装しない。
- LLM に直接 file rewrite をさせない。
- external UI library を勝手に internalize しない。
- unsupported / observe-only signal は候補として表示しても migration 対象にしない。
- `AGENTS.md` / `CLAUDE.md` は明示 command のみで生成し、既存ファイルは保護する。

## shadcn/ui との関係

shadcn/ui は前提ではありません。

現在の扱い:

- shadcn/ui がある場合は signal として検出する。
- `components/ui/*`、`cva()`、`cn()`、`className` override は追加情報として使う。
- shadcn/ui 専用 registry 生成は MVP では行わない。
- shadcn/ui がない fixture でも repeated `className` から candidate を出せる。

この方針は、「全員が shadcn/ui を使っている」前提を避け、任意の React/Tailwind repo で価値を出すためです。

## Verification

### Test command

実行済み:

```bash
npm test
```

結果:

```txt
tests 13
pass 13
fail 0
```

### Test coverage summary

テストで確認している主な項目:

- JSX literal `className` 抽出。
- `className={'...'}` 抽出。
- `cn("...", condition && "...")` の静的 class 抽出。
- `cva(...)` の classes / variants 抽出。
- shadcn/ui、cva、library customization、legacy styling situation 検出。
- shadcn/ui がなくても reusable UI candidate を生成。
- repeated component override を `wrap` candidate に分類。
- `scan --out` で artifact 一式を生成。
- `review.html` に candidate id、推奨 decision、asset 名候補、承認コマンドを表示。
- `dsg review` の localhost 配信で review board と artifact JSON を取得できる。
- manual `decisions.json` 編集後に `instruct` で `agent-rules.md` / `assets.*` を再生成。
- `decide --name` で `decisions.json` / `assets.json` / `assets.md` / `agent-rules.md` を更新。
- `install-instructions` が `AGENTS.md` / `CLAUDE.md` を生成し、既存ファイルを保護。
- CLI argument parsing と help entrypoint。

### Manual CLI verification

実 CLI でも以下の流れを確認済みです。

```bash
node src/cli.mjs scan /private/tmp/dsg-review-fixture --out /private/tmp/dsg-review-fixture/design-system/catalog.json
node src/cli.mjs decide /private/tmp/dsg-review-fixture/design-system candidate-001 reuse --name FieldPattern
```

`dsg review` は localhost server を起動して常駐するため、別 terminal で確認し、確認後に Ctrl+C で停止します。

```bash
node src/cli.mjs review /private/tmp/dsg-review-fixture/design-system --no-open
```

生成 artifact:

```txt
agent-rules.md
assets.json
assets.md
candidates.json
catalog.json
decisions.json
decisions.md
inventory.json
review.html
situations.json
```

承認後の `assets.md` 例:

```md
## FieldPattern

- Asset ID: asset-001
- Candidate: candidate-001
- Action: reuse
- Safety: safe
- Guidance: Reuse FieldPattern before adding similar JSX.
- Common classes: `block border px-3 py-2 rounded text-sm w-full`
```

承認後の `agent-rules.md` 例:

```md
- Reuse FieldPattern before creating similar JSX. Reference locations: src/Form.tsx:4, src/Form.tsx:5.
```

## Review Points

レビューでは特に以下を見てほしいです。

1. MVP の範囲は適切か
   - 自動 codemod / Storybook / registry を後回しにした判断が妥当か。

2. shadcn/ui を optional signal にした設計は適切か
   - shadcn/ui を使っていない repo でも価値があるか。
   - shadcn/ui 使用 repo では十分な追加 signal になっているか。

3. dependency-free extractor の精度は MVP として許容できるか
   - parser 導入前にどこまで heuristic で進めるべきか。

4. candidate action の分類はレビュー可能か
   - `reuse`, `promote-variant`, `wrap`, `extract-block`, `document-rule`, `unsupported` の粒度が妥当か。

5. `dsg review` / `review.html` の判断導線は十分か
   - candidate id、asset name suggestion、approval command でユーザーが迷わないか。

6. agent-ready output は実用的か
   - `assets.json`, `assets.md`, `agent-rules.md`, `AGENTS.md`, `CLAUDE.md` の分割が妥当か。

7. Safety model は十分か
   - 既存コードを書き換えない MVP として安全境界が明確か。

## Known Limitations

現時点の制限:

- 本格的な AST parser は使っていない。
- TypeScript type / props extraction は未対応。
- dynamic class construction は限定対応。
- runtime preview はない。
- Storybook / registry generation はない。
- codemod / dry-run patch はない。
- `review.html` から直接 decisions 保存はできない。
- external UI library の internalize はしない。

これらは意図的に MVP 後へ回しています。理由は、最初の価値を UI inventory / promotion board / agent instruction に絞るためです。

## Recommended Next Steps

レビュー後に進めるなら、優先順位は以下です。

1. 実 repo で scan して候補品質を見る
   - shadcn/ui なしの React/Tailwind repo
   - shadcn/ui ありの repo
   - MUI / Chakra など混在 repo

2. review board の UX 改善
   - candidate grouping
   - severity / score sort
   - source snippet 表示
   - decision copy button
   - browser 上での decision 保存

3. parser 導入判断
   - heuristic extractor で足りないケースを fixture 化してから判断する。

4. props / component contract 抽出
   - 承認済み asset に props 候補を追加する。

5. dry-run codemod
   - 自動変更ではなく、reviewable patch として始める。

## Current Repository State

現在の repo は初回 commit 前です。

```txt
No commits yet on main
```

全実装ファイルは untracked です。`.DS_Store` も untracked ですが、今回の実装対象ではないため触っていません。
