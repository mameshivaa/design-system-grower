# 実 agent での hook 執行デモ(2026-07-08)

`dsg install-hooks` の PostToolUse hook を、**実物の Claude Code agent(ヘッドレス実行)**に対して検証した。

## セットアップ

- fixture repo に AlertNotice を canonicalize 済みの design-system artifacts を配置
  (canonical: `bg-rose-50 border border-rose-200 px-4 py-3 rounded-xl text-rose-700 text-sm`、
  deprecated: red 系ファミリー)
- `.claude/settings.json` に Write|Edit → `dsg hook-check` の PostToolUse hook を設定
- `claude -p --permission-mode acceptEdits` で2つのタスクを実行

## ケース1: ユーザーが deprecated クラスを明示指定

タスク:「className はちょうど `bg-red-50 border border-red-200 ... rounded-lg text-red-700` を使うこと」

結果: agent がファイルを書いた瞬間に hook が deprecated を検知して exit 2 で差し戻し。
agent は勝手に書き換えず、**「正規クラス(rose)に変更するか、指定クラスのまま例外として
記録するか」をユーザーに確認**して停止した。

評価: 理想的。ユーザーの明示指示と design system が矛盾する場合、hook は矛盾を顕在化させ、
決定権を人間に返す。

## ケース2: スタイル指定なし(自然なケース)

タスク:「このアプリの既存のデザインに合わせたエラーバナーを作って」

結果(agent の納品物):

```tsx
export function ErrorBanner({ message }: { message: string }) {
  return <div className="bg-rose-50 border border-rose-200 px-4 py-3 rounded-xl text-rose-700 text-sm">{message}</div>;
}
```

**canonical シグネチャと完全一致(9/9 クラス)。**

## 結論

- hook → agent の執行ループは実 agent で機能する。逸脱は現行犯で捕まり、
  自然なタスクでは agent が正準に収束する。
- v0.2 の A/B(rules のみ、64% 遵守)に対し、hooks 併用の自然ケースは完全一致を達成。
  roadmap-v0.2.md の定量目標(check/hooks 併用で 85%+)を上回る示唆。サンプルは少数のため、
  今後 bench 化する価値がある。
- デモ GIF はこの2ケースをそのまま再演すれば撮れる(演出不要)。
