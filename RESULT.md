# 作業報告

## 実装内容
- `src/extract.js` で、root が自己終端またはテキスト子のみの単純 JSX の場合、式属性を削除して末尾に `{...props}` を追加する props 化を実装しました。
- `className` と文字列リテラル属性は保持し、テキスト子は既存方針どおり `children` prop 化します。
- root 配下に入れ子 JSX がある場合は verbatim lift を維持し、JSX 式コンテナ内の未解決識別子を `// TODO: unresolved identifiers: ...` として末尾に出力します。
- lift した JSX の深い元ソースインデントを、生成コンポーネント内の自然なインデントに正規化しました。
- 既存の className 同値性検証は維持しています。

## テスト
- `test/design-system-grower.test.js` に以下の fixture 検証を追加しました。
  - 自己終端要素の式属性が `{...props}` 化され、文字列属性と `className` が保持されること。
  - テキスト子を持つ要素が `children` 化されること。
  - 入れ子 JSX は verbatim のまま、TODO コメントに未解決識別子が出ること。
  - 深い元ソースインデントが正規化されること。
- `npm test` を実行し、62 件すべて通過しました。

## 制約確認
- 外部 runtime 依存は追加していません。
- `src/registry.js` は変更していません。
- `README.md` は変更していません。
- `git push` は実行していません。
