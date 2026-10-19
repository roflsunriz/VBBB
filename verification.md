# 検証手順

## 2026-10-19: CI高速化

- 変更したGitHub Actionsをactionlint 1.7.12で検査し、エラー0件を確認した。
- GitHub上の未解決Dependabot更新PRと依存脆弱性アラートがともに0件であることを確認した。

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

## 2026-10-16: findings.mdへの知見分離

- AGENTS・READMEなどから移した本文を移行前のGit内容と照合し、条件・確認日・コマンド・未検証事項を保持する。移動先の参照とMarkdownの見出し・コードブロックを確認する。
- 変更範囲は文書の配置と参照。アプリのビルド・実機動作を今回再検証したとは扱わない。

- 実行結果: 移行前本文と移動後の文書を行単位で照合し、本文の欠落0件。変更文書の相対リンク・見出し参照の新規エラー0件、git diff --check成功。共通指針の記録先変更は意味の整合を別途確認した。
- GitHub上の既存Dependabot open alertsは0件。更新PRは0件で、今回の文書移行とは別の状態として確認した。新規の外部監査送信は自動承認レビューの制限により実行せず、GitHub上の既存警告確認で補完した。これはローカル依存監査・最新版照会の成功を意味しない。

## 2026-10-20: Dependabot 月末一括処理

- `.github/dependabot.yml` は毎月28日00:00、`.github/workflows/dependabot-automation.yml` は同日18:00（いずれも `Asia/Tokyo`）に設定した。呼び出し先は検証済み共通 workflow の固定 SHA とし、現在の head SHA、Dependabot の資格状態、全 PR チェック成功を merge 前に再確認する。
- YAML 構文、変更差分、空白エラーをローカルで検査した。実際の月末 schedule と Dependabot PR の merge 経路は、次回の毎月28日実行で確認する。
