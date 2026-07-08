# M4 実験: agent rules の有無による UI 再利用の差(2026-07-08)

## 設計

実プロダクト(Next.js + Tailwind、903ファイル)を scan し、上位5候補を承認して
agent rules を生成。プロダクトのコピーを2つ用意し、同一モデル・同一プロンプトの
coding agent に同じタスク(入力+テキストエリア+保存ボタン+ステータス表示を含む
設定カードの新規作成)を与えた。

- **変種A(対照)**: 元の AGENTS.md のみ
- **変種B**: 元の AGENTS.md + dsg 生成の UI Agent Rules(FormInput / FormTextarea /
  PrimaryButton / GradientCta / StatusNotice の5ルール)

## 結果

| 指標 | A(rules なし) | B(rules あり) |
|---|---|---|
| 承認済みシグネチャ一致率(全59クラス) | 27/59 (**46%**) | 38/59 (**64%**) |
| FormTextarea 一致 | 5/17 | **17/17(完全一致)** |
| FormInput 一致 | 5/13 | 9/13 |
| StatusNotice 一致 | 10/16 | 8/16 |
| PrimaryButton 一致 | 7/13 | 4/13(※後述) |

質的な差:

1. **ドリフト防止の実例**: A はステータス表示に `bg-green-50 border-green-200`(repo 内の
   古い競合パターン)を踏襲した。カタログが正とした `bg-emerald-50 border-emerald-200`
   とは別系統で、まさに「似て非なる UI」の再生産。B は emerald 系を使用した。
2. B は報告で「AGENTS.md の承認済みパターン FormInput / FormTextarea / StatusNotice に
   完全一致させた」と明示的にルールを引用した。
3. B の PrimaryButton 一致率が低いのは、クラスをコピーせず既存の共通コンポーネント
   `components/ui/button.tsx` を import して再利用したため。これはクラス一致より
   望ましい行動であり、指標の限界を示す。

## 結論

- n=1/条件の小規模実験だが、rules 追加でシグネチャ遵守 +18pt、テキストエリアは完全一致、
  競合パターンへのドリフトを防止。**「catalog + instructions で agent に既存 UI を
  使わせる」というプロダクトの中核仮説は成立する。**
- ベースライン(A)も近隣ファイル参照で 46% は達成する。つまり価値の中心は
  「ゼロから 100 へ」ではなく「**repo 内に競合パターンが複数あるとき、どれが正か**を
  agent に伝えること」。README / 訴求はこの線で書くべき。

## 実験中に見つかったツール側の課題(要修正)

1. 非クラストークン `error` が commonClasses に混入する経路が残っている
   (cn() 内の識別子由来と推定)。
2. ほぼ同一クラス集合の候補ペアが Jaccard マージをすり抜ける
   (actionType が異なる場合に別候補として残る)。
