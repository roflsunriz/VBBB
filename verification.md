# 検証手順

## 2026-10-15: PR #19の依存更新修復

- CIの `image-thumbnail.test.ts` はReact 19.2.8とReact DOM 19.3.0の不一致で読み込みに失敗していた。両方を19.3.1へ揃え、型定義と関連ツールを更新した。
- Bun 1.4.0 / Node.js 26.4.0 / Windowsで、固定インストール、lint（警告なし）、型チェック、フォーマット、ビルド、単体テスト725件、ヘッドレスE2E32件が成功。初回の単体テストはサンドボックス内の一時ファイルrename権限で失敗したため、通常権限で全件を再実行した。
- E2Eはビルド済みrendererとモックIPCを使用する既存の操作テスト。別プロジェクトが4173番を使用していたため、一時設定で4179番へ分離して実行した。実掲示板への通信・投稿やインストーラーの操作はこの検証に含まない。
- `bun audit` の20件を解消し、537パッケージの監査で既知脆弱性0件。`global-agent` 4のoverrideは、旧 `@electron/get` の `initializeProxy()` から実際に初期化し、ローカルHTTPプロキシ経由と `NO_PROXY` の直接接続が動作することを確認した。
- TypeScriptはparserの対応範囲内の6.0.3を使用する。Node型定義は当初24系を選んだが、続いて作成されたPR #23で26.6.5への更新が全CIに成功し、自動マージされた。更新後の固定インストールと監査も成功し、`bun outdated` で残るのは非対応のTypeScript 7のみ。
- DependabotではReact本体・React DOM・両型定義、およびTypeScript ESLintのparser・pluginをそれぞれグループ化する。更新時は解決されたバージョンも確認し、既存の描画テストとE2Eを実行する。
- PR #19の統合後mainでも、手動実行した[CI](https://github.com/roflsunriz/VBBB/actions/runs/38674616271)の全ジョブが成功した。GitHub Actionsによる自動マージ後はpush起因のCIが起動していない場合があるため、統合コミットのCIが必要なら `gh workflow run ci.yml --ref main` で実行する。

## Dependabot 自動処理（2026-09-23）

`.github/workflows/dependabot-automation.yml` を actionlint で検査し、PR 用 workflow 名（CI）と一致することを確認する。Dependabot の patch／minor かつ全 PR チェック成功の場合だけ取り込み、major・古い SHA・限定修復後も失敗した PR は残す。

実際の Dependabot PR がまだない場合、動作経路は未検証として扱う。実 PR 発生後に自動化ジョブ、CI の再試行、マージ結果を確認する。

## 依存脆弱性の確認（2026-09-23）

監査では fast-uri を含む推移依存の旧版が検出された。Bun 1.4.0 で lockfile の固定インストールと再監査を行い、既知脆弱性 0 件を確認した。書式・lint・型・725件のテスト・ビルド成功。

大量の Dependabot PR により CI 完了より分類が遅れる場合でも、分類後の `workflow_dispatch` が現在の PR 番号と head SHA を照合して再評価する。別の作成者、古い SHA、未完了の CI はマージしない。

## 2026-10-05: GitHub受付・READMEの整備（公開前）

- 比較元: `fc382b4067c7d4c77a17cbbcb535ab54c7093615`（`main`）。
- 受付フォーム 2 件のYAML構造、重複キー・ID、入力型、選択肢、予約ファイル名を一括検査し、エラー0件。
- 既存の固有質問・入力例・必須条件を原文と照合。READMEのリンク・画像・コマンド・条件を確認し、裏付けがある誤記だけを訂正した。
- 既存のCI、Dependabot、labeler、ライセンスのファイル内容は比較元から変更していない。
- 製品のビルド・インストール・実機操作、GitHub上のフォーム表示、公開後CIは今回の静的検証に含めない。公開後に実際の受付表示と必要ラベルの適用を確認する。
