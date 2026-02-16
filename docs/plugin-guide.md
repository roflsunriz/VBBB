# BBS プラグイン追加手順

VBBB は `BoardPlugin` インターフェースにより、異なるBBSシステムへの対応をプラグインとして追加できます。
現在、JBBS（したらばBBS）がプラグインとして実装されています。

---

## 1. 概要

プラグインは以下の3つの操作を実装します:

| 操作 | メソッド | 説明 |
|------|----------|------|
| スレ一覧取得 | `fetchSubject(board, dataDir)` | subject.txt の取得とパース |
| DAT取得 | `fetchDat(board, threadId, dataDir)` | スレッド本文の取得 |
| 投稿 | `postResponse(params, board)` | レスの書き込み |

---

## 2. プラグイン作成手順

### 2.1 BoardType の追加

`src/types/domain.ts` の `BoardType` に新しいタイプを追加します:

```typescript
export const BoardType = {
  Type2ch: '2ch',
  Shitaraba: 'shitaraba',
  JBBS: 'jbbs',
  MachiBBS: 'machi',  // 追加
} as const;
```

### 2.2 プラグインモジュールの作成

`src/main/services/plugins/` 配下にファイルを作成します。
JBBSプラグインを参考にしてください:

```
src/main/services/plugins/
├── board-plugin.ts        # プラグインインターフェースとレジストリ
├── jbbs-plugin.ts         # JBBSプラグイン（参考実装）
├── jbbs-dat.ts            # JBBS DAT取得
├── jbbs-post.ts           # JBBS 投稿
├── jbbs-subject.ts        # JBBS subject取得
└── machi-plugin.ts        # (新規) まちBBSプラグイン
```

### 2.3 BoardPlugin インターフェースの実装

```typescript
import type { BoardPlugin } from './board-plugin';
import type { Board, DatFetchResult, PostParams, PostResult, SubjectFetchResult } from '@shared/domain';

export function createMachiPlugin(): BoardPlugin {
  return {
    async fetchSubject(board: Board, dataDir: string): Promise<SubjectFetchResult> {
      // まちBBS の subject.txt を取得・パースする実装
    },
    async fetchDat(board: Board, threadId: string, dataDir: string): Promise<DatFetchResult> {
      // まちBBS の DAT を取得する実装
    },
    async postResponse(params: PostParams, board: Board): Promise<PostResult> {
      // まちBBS への投稿実装
    },
  };
}
```

### 2.4 プラグインの登録

`src/main/services/plugins/board-plugin.ts` の `initializeBoardPlugins()` に登録を追加します:

```typescript
export function initializeBoardPlugins(): void {
  void import('./jbbs-plugin').then(({ createJBBSPlugin }) => {
    const jbbsPlugin = createJBBSPlugin();
    registerBoardPlugin(BoardType.JBBS, jbbsPlugin);
    registerBoardPlugin(BoardType.Shitaraba, jbbsPlugin);
  });

  // まちBBS プラグインを追加
  void import('./machi-plugin').then(({ createMachiPlugin }) => {
    registerBoardPlugin(BoardType.MachiBBS, createMachiPlugin());
  });
}
```

### 2.5 板種別の検出

`src/main/ipc/handlers.ts` の `lookupBoard()` で URL パターンから板種別を判定します:

```typescript
// まちBBS の検出例
const isMachi = hostname.includes('machi.to');
if (isMachi) {
  return {
    title: bbsId,
    url: boardUrl,
    bbsId,
    serverUrl: `${url.protocol}//${url.host}/`,
    boardType: 'machi',
  };
}
```

### 2.6 メニューのフィルタ除外

`src/types/file-format.ts` の `IGNORED_CATEGORIES` から該当カテゴリを削除します:

```typescript
export const IGNORED_CATEGORIES: readonly string[] = [
  'おすすめ',
  'あらかると',
  'その他',
  // 'まちBBS', ← 削除してメニューに表示する
  'チャット',
  'ツール類',
] as const;
```

---

## 3. テスト

### ユニットテスト

`tests/unit/` にプラグインのパーステストを追加します:

- subject.txt のパーステスト
- DAT のパーステスト
- 投稿パラメータの構築テスト

### E2E テスト

1. BBSメニューで該当板カテゴリが表示されること
2. 板選択でスレッド一覧が取得できること
3. スレッド表示でDAT内容が表示されること

---

## 4. 注意事項

- エンコーディングは板タイプにより異なります（Shift_JIS, EUC-JP, UTF-8）。`iconv-lite` を使用して変換してください。
- HTTP クライアントは `src/main/services/http-client.ts` を使用し、User-Agent, タイムアウト, プロキシ設定が自動適用されるようにします。
- DAT のローカルキャッシュは `getBoardDir()` で取得するディレクトリに保存します。
- 投稿結果の判定は `grtOK` / `grtCookie` / `grtError` 等の標準レスポンスタイプに合わせます。
