# VBBB - 汎用掲示板ブラウザ

2ch/5ch 系掲示板を閲覧・投稿するためのデスクトップアプリケーション。

## ダウンロード

最新リリースは [Releases](../../releases) からダウンロードできます。

- **Windows 10/11 (x64)** — `VBBB Setup x.x.x.exe`

> Linux / macOS 向けバイナリは公式には提供していません。
> 自前ビルドについては下記「[自前ビルド](#自前ビルド)」を参照してください。

## 技術スタック

- Electron + Node.js
- TypeScript (strict)
- Vite (electron-vite)
- React + TailwindCSS
- Zod (ランタイムバリデーション)
- Vitest + Playwright (テスト)

## 環境構築

### 前提条件

- Node.js >= 22
- bun >= 1.0

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

## 自前ビルド

### Windows (推奨・動作確認済み)

```bash
bun install
bun run build:win
# → release/ に NSIS インストーラー (.exe) が生成されます
```

### Linux ⚠️ 自己責任

> **警告**: Linux 向けビルドは動作確認を行っていません。ビルド・実行は自己責任でお願いします。
> 不具合報告は歓迎しますが、サポートは保証できません。

```bash
bun install
bun run build:linux
# → release/ に AppImage が生成されます
```

### macOS ⚠️ 自己責任

> **警告**: macOS 向けビルドは動作確認を行っていません。ビルド・実行は自己責任でお願いします。
> コード署名なしのビルドのため、Gatekeeper の警告が表示される場合があります。
> 不具合報告は歓迎しますが、サポートは保証できません。

```bash
bun install
bun run build:mac
# → release/ に .dmg が生成されます
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

## ライセンス

[MIT](LICENSE)
