実装完了し、コミットしました。

コミット: `7d28d35 Fix precision candidate bugs`

対応内容:
- `cn()` 内テンプレートリテラルの条件識別子 `error` / `isOpen` などが `commonClasses` に混入しないよう修正
- Jaccard マージを共通クラス集合ベースに寄せ、actionType 判定前に高類似クラスタを統合
- 再現テスト2件を追加
- `RESULT.md` に作業報告を作成

検証:
- `npm test` 通過
- `23件 pass / 0件 fail`

`README.md` は変更していません。`TASK.md` は入力指示ファイルとして未追跡のまま残しています。