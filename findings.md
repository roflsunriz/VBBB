# プロジェクト固有の知見

共通指針と [AGENTS.md](AGENTS.md) を読んだ後、作業前にこの文書を全文読む。元の条件・確認日・未検証事項を保ったまま、固有の実現手段と再利用する知見を集約する。

## 共通指針の具体化と適用範囲

- 対象: 共通指針の「設計と実装方針」「検証」「更新手順」「ドキュメント」と、各節に明記した共通ルール。
- 理由・範囲: Bunを使うElectronアプリで、Windows配布と他OSの自前ビルドは検証済み範囲が異なる。共通の検証義務は下記の品質コマンドと既存の配布・E2E手順で具体化する。利用者向け自前ビルド手順と未検証の注意はREADMEに残す。
- 代替手段・検証: 以下の実効コマンド・根拠を用い、[検証記録](verification.md) で成功・未検証を区別する。共通方針の完了条件やユーザーの明示指示は弱めない。

## AGENTS.mdから移した知見

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

## READMEなどから移した開発・運用情報

## 技術スタック

- Electron + Node.js
- TypeScript (strict)
- Vite (electron-vite)
- React + TailwindCSS
- Zod (ランタイムバリデーション)
- Vitest + Playwright (テスト)

## 環境構築

### 前提条件

- Node.js >= 24
- Bun >= 1.4（Bun形式のロックファイルを使用）

### セットアップ

```bash
# 依存パッケージのインストール
bun install

# 環境変数ファイルの準備
cp .env.example .env
```

## 開発

```bash
# 開発サーバー起動 (ホットリロード対応)
bun run dev

# ビルド (トランスパイルのみ)
bun run build

# 配布用ビルド (Windows インストーラー生成)
bun run build:dist
```

## コード品質

```bash
# リンター
bun run lint
bun run lint:fix

# 型チェック
bun run type-check

# フォーマット
bun run format
bun run format:check
```

## テスト

```bash
# ユニットテスト
bun run test
bun run test:watch

# E2E テスト
bun run test:e2e
```

## ディレクトリ構成

```
src/
  main/           # Electron メインプロセス
  preload/        # プリロードスクリプト (contextBridge)
  renderer/       # React フロントエンド
  types/          # TypeScript 型定義 (一元管理)
docs/             # 仕様ドキュメント
tests/
  unit/           # ユニットテスト (Vitest)
  e2e/            # E2E テスト (Playwright)
```

## 依存更新の自動処理

Dependabot は対象の依存関係を毎週確認します。patch／minor 更新は PR のチェック（CI）が成功した後に自動で squash merge されます。CI の失敗ジョブは 1 回だけ再実行します。再失敗時は読み取り権限のジョブで `bun.lock` を再生成し、限定した修正コミットで CI を再実行します。修復できない PR は残します。major 更新は手動で確認します。

React・React DOMと両方の型定義、およびTypeScript ESLintの関連パッケージは、それぞれ同じPRで更新します。ReactとReact DOMは実際にインストールされるバージョンを揃えて検証します。

## 文書の役割

- [README.md](README.md): 利用開始と操作、利用者が知る必要のある制限。
- この文書: 固有の配置・ツール・実行手段・例外・再利用する調査知見。
- [verification.md](verification.md): 検証手順、実測結果、証拠、未検証事項。
- [how-to-update.md](how-to-update.md): 更新と復旧の手順。
