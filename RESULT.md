# 作業報告

## 実装内容

- `src/extractor.js` を修正し、テンプレートリテラル内の `${...}` 式を構文として分離して、静的な文字列リテラル部分だけから class token を抽出するようにしました。
- `normalizeClasses` に最低限の token ガードを追加し、`"${...}"` 由来の引用符付き断片、`${`、単独の `:` / `?` などを除外するようにしました。`hover:`、`focus:`、`data-[...]` などの Tailwind variant は維持しています。
- `src/cluster.js` に候補生成前の近接重複クラスタ統合を追加しました。クラス集合の Jaccard 類似度が `0.8` 以上のクラスタをマージし、source examples は統合後クラスタに集約します。
- `test/design-system-grower.test.js` に再現 fixture を追加しました。
  - テンプレートリテラル + 三項演算子由来の非クラストークンが `commonClasses` に出ないこと。
  - label / input の近接重複クラスタがそれぞれ 1 候補に統合されること。

## 検証

- `npm test` 実行済み。
- 結果: 21 tests / 21 pass。

## 注意

- 外部 runtime 依存は追加していません。
- `candidates.json` のフィールド名は変更していません。
- `TASK.md` は作業開始時点から未追跡だったため、コミット対象からは外しています。
