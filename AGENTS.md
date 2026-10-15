# AGENTS.md

## 作業開始前の必須手順（最優先・例外なし）

1. エージェントは、調査、計画、コマンド実行、スキル利用、ファイル編集、コミット、プッシュを始める前に、必ずリポジトリ直下の `.\COMMON-AGENTS.md` を開き、先頭から末尾まで全文を読む。
2. `COMMON-AGENTS.md` はGit管理外のシンボリックリンクである。`git`や既定のignore設定が有効な`rg --files`の検索結果だけで、ファイルが存在しないと判断してはならない。PowerShellでは最初に次を実行する。

```powershell
Get-Content -Raw -LiteralPath .\COMMON-AGENTS.md
```

3. 読み取りに失敗した場合、出力が省略された場合、または末尾まで読めたことを確認できない場合は、一切の作業を開始せず、パスとシンボリックリンク先を確認して全文を再取得する。必要なら分割して末尾まで読む。
4. 全文を読了するまで、ローカル `AGENTS.md` だけを根拠に作業を続けてはならない。読了後は `COMMON-AGENTS.md` を最優先の指針とし、読了直後の最初の進捗報告で全文を読了したことを明示する。
   このファイルでは `VBBB` 固有の補足だけを記載する。

## パッケージ管理

- パッケージマネージャは Bun を使用する。npm ではない。

## 品質確認

- このリポジトリでは `bun lint`、`bun type-check`、`bun test`、`bun format`、`bun run build` を使用する。

## 環境

- `chmate-apks`にアンドロイドアプリの`chmate`がある。apkとxapk。
- 必要に応じてSlevoとgikoNavi G2のソースコードもGithubからクローンして利用するする（/Slevo, /gikoNaviG2）
- 実装のお手本として解析して利用する。

## 依存監査で確定した事項（2026-09-23）

- `bun audit fix` だけでは fast-uri の脆弱版が上流の厳密な依存範囲で残る。`package.json` の既存 `overrides` と `bun.lock` を同時に更新し、`bun audit` と関連テスト・ビルドで確認する。上流が安全版を取り込んだ場合は override の必要性を再評価する。

## Dependabot の限定修復（2026-09-23）

- CI 再失敗後の自動修復は `bun.lock` だけをパッチとして適用する。修復後は `workflow_dispatch` で `.github/workflows/ci.yml` を再実行するため、この CI の `contents: read` と checkout の `persist-credentials: false` を維持し、PR コードを実行するジョブへ書き込み権限や秘密情報を渡さない。根拠は `.github/workflows/dependabot-automation.yml` と共通ワークフローの権限分離。
- 2026-10-15のPR #19・#23では、自動マージ後のmainにpush起因CIが作成されなかった。統合後の確認時は対象SHAのrunを調べ、必要なら `gh workflow run ci.yml --ref main` で実行する。詳細は `verification.md` を参照する。

## 関連依存の更新（2026-10-15）

- React と React DOM は解決後の完全なバージョンを揃える。PR #19 は React DOM だけが更新され、`image-thumbnail.test.ts` の読み込み時点で失敗した。`.github/dependabot.yml` では両本体と両型定義を同じグループにし、更新時は既存の描画テストとE2Eを実行する。
- TypeScript 6 は既定で `@types` を自動取り込みしない。共有HTTP型がNode型を使うため、`@types/node` を直接依存として宣言し、両tsconfigの `types: ["node"]` を維持する。`@typescript-eslint/parser` 8.71.2の対応範囲は `<6.1.0` のため、TypeScript 7へ上げる前に上流の対応を確認する。
- `global-agent` 4.1.3のoverrideは、旧 `@electron/get` が引く未修正の `sprintf-js` を依存経路から除くために必要。公開APIの `bootstrap()` を使うプロキシ経路も更新時に確認し、上流が安全版へ移行したらoverrideを再評価する。
