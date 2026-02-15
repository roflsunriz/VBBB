# VBBB - 汎用掲示板ブラウザ

2ch/5ch 系掲示板を閲覧・投稿するためのデスクトップアプリケーション。

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

# ビルド
bun run build

# 配布用ビルド
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

## ライセンス

UNLICENSED
