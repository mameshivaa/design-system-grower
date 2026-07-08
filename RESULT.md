実装完了しました。`dsg extract` を追加し、`src/extract.js` で JSX の lift、variant 推定、クラス同値性検証、provenance 更新、上書き拒否を実装しました。CLI 登録と `src/index.js` export、fixture テスト、`RESULT.md` も追加済みです。

検証: `npm test` で 56/56 pass。

コミットは試行しましたが、sandbox が `.git/worktrees/dsg-extract/index.lock` 作成を拒否し、`Operation not permitted` で失敗しました。変更は未コミットのまま残っています。`TASK.md` は最初から未追跡だった作業指示ファイルなのでコミット対象に含めていません。