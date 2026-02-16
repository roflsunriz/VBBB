# ポストモーテム: 5ch投稿失敗 (grtError / 9991 Banned)

> **作成日:** 2026-02-17
> **ステータス:** 解決済み
> **影響範囲:** 5ch.net への全投稿（返信・スレ立て）
> **修正PR:** (該当PRリンク)

---

## 目次

1. [概要](#1-概要)
2. [タイムライン](#2-タイムライン)
3. [根本原因分析](#3-根本原因分析)
4. [修正内容](#4-修正内容)
5. [Slevo準拠チェックリスト（再発防止）](#5-slevo準拠チェックリスト再発防止)
6. [投稿コード変更時のレビュー観点](#6-投稿コード変更時のレビュー観点)
7. [デバッグ手順書](#7-デバッグ手順書)
8. [教訓](#8-教訓)

---

## 1. 概要

VBBB から 5ch.net への投稿が全て失敗していた。bbspink.com への投稿は Phase 1 で直接成功していたため問題が表面化しにくかった。

5ch.net では Phase 1（確認画面取得）は成功するが、Phase 2（確認送信）が `x-chx-error: 9991 Banned` で拒否されるという症状だった。

原因は **Slevo（リファレンス実装）との HTTP リクエスト仕様の乖離** が複数箇所あり、5ch サーバーのアンチボット検出に引っかかっていたことだった。

---

## 2. タイムライン

| フェーズ | 内容 |
|----------|------|
| 初期調査 | 診断ログ (diag-log/) を分析。bbspink.com は Phase 1 で直接成功、5ch.net は Phase 2 で `9991 Banned` を確認 |
| 第1回修正 | 分析ドキュメント (`posting-mechanism-analysis.md`) に基づき4点修正。Phase 2 の Referer、`?guid=ON`、スペースエンコード (`+`)、NCR 変換を実装 |
| テスト1回目 | **依然として grtError で失敗**。ドキュメントだけでは不十分と判断 |
| 第2回修正 | **Slevo のソースコード (`Slevo/`) を直接比較** し、さらに6点の差分を発見・修正。Origin ヘッダ削除、Referer 末尾スラッシュ、User-Agent 形式、余分なヘッダ削除、パラメータ順序を修正 |
| テスト2回目 | **投稿成功** |

---

## 3. 根本原因分析

### 3.1 発見された全バグ一覧

合計 **10件** のバグが発見された。各バグの影響度は以下の通り:

| # | バグ | 影響度 | 修正回 |
|---|------|--------|--------|
| 1 | **Origin ヘッダを送信していた** | **致命的** | 第2回 |
| 2 | Phase 2 の Referer が `bbs.cgi` URL だった | 致命的 | 第1回 |
| 3 | Phase 1 URL に `?guid=ON` がなかった | 高 | 第1回 |
| 4 | Referer に末尾スラッシュがあった | 中 | 第2回 |
| 5 | User-Agent に括弧がなかった | 中 | 第2回 |
| 6 | `Cache-Control: no-cache` / `Pragma: no-cache` を POST で送信 | 中 | 第2回 |
| 7 | `Accept-Language: ja` を送信していた | 低 | 第2回 |
| 8 | スペースが `%20` にエンコードされていた (`+` が正しい) | 中 | 第1回 |
| 9 | NCR 変換が未実装だった | 低〜中 | 第1回 |
| 10 | フォームパラメータ順序が Slevo と異なっていた | 低 | 第2回 |

### 3.2 最も致命的だったバグ: Origin ヘッダ

**Slevo (OkHttp ネイティブ Android アプリ) は `Origin` ヘッダを一切送信しない。**

`Origin` ヘッダはブラウザの CORS/fetch API に固有のヘッダであり、専用ブラウザアプリが送信するのは不自然。5ch サーバーのアンチボット機構がこのヘッダの存在を検出し、「ブラウザの JavaScript からの不正リクエスト」と判断して `9991 Banned` を返していたと推定される。

bbspink.com で問題が発生しなかったのは、Phase 1 で直接成功したため Phase 2 を経由しなかったこと、および bbspink.com のアンチボット検証が 5ch.net より緩い可能性があるため。

### 3.3 なぜ第1回修正だけでは不足だったか

第1回修正は **プロトコル仕様ドキュメント** に基づいて修正を行った。ドキュメントは「何を送信すべきか」を記載していたが、**「何を送信してはいけないか」** が明示的に記載されていなかった。

具体的には:
- ドキュメントは `Referer` と `User-Agent` が **必須** と記載 → 正しく修正済み
- しかし `Origin` / `Accept-Language` / `Cache-Control` / `Pragma` が **禁止** とは記載されていなかった
- Referer の末尾スラッシュの有無も明記されていなかった
- User-Agent の括弧形式も暗黙的だった

**結論: ドキュメントだけでなく、リファレンス実装のソースコードとの完全一致が必要だった。**

---

## 4. 修正内容

### 4.1 変更ファイル一覧

| ファイル | 変更概要 |
|----------|----------|
| `src/main/services/post.ts` | Origin 削除、Accept-Language 削除、Referer 末尾スラッシュ削除、Phase 2 Referer 修正、パラメータ順序変更 |
| `src/main/services/http-client.ts` | POST 時に Cache-Control/Pragma を送信しない |
| `src/main/services/encoding.ts` | スペース `%20` → `+`、`replaceWithNCR()` 追加 |
| `src/types/file-format.ts` | User-Agent 括弧追加 `Monazilla/1.00 (VBBB/0.1.0)` |
| `tests/unit/encoding.test.ts` | スペースエンコードテスト修正、NCR テスト追加 |

### 4.2 VBBB vs Slevo 送信ヘッダ比較（修正後）

```
=== Slevo (OkHttp) が送信するヘッダ ===
User-Agent: Monazilla/1.00 (Slevo/1.0)
Content-Type: application/x-www-form-urlencoded
Content-Length: {n}
Host: {host}
Connection: Keep-Alive
Accept-Encoding: gzip
Cookie: {cookies}
Referer: https://{host}/test/read.cgi/{board}/{threadKey}

=== VBBB (修正後) が送信するヘッダ ===
User-Agent: Monazilla/1.00 (VBBB/0.1.0)
Content-Type: application/x-www-form-urlencoded
Content-Length: {n}
Accept-Encoding: gzip
Cookie: {cookies}
Referer: https://{host}/test/read.cgi/{board}/{threadKey}
```

**修正前に余分に送信していたヘッダ（全て削除済み）:**
- ~~`Origin: https://{host}`~~ ← **最大の原因**
- ~~`Accept-Language: ja`~~
- ~~`Cache-Control: no-cache`~~
- ~~`Pragma: no-cache`~~

### 4.3 VBBB vs Slevo フォームパラメータ順序比較（修正後）

```
=== Slevo ===                    === VBBB (修正後) ===
bbs={board}                      [sid={sid}]  ← UPLIFT利用時のみ
key={threadKey}                  bbs={board}
time={unix}                      key={threadKey}
FROM={name}                      time={unix}
mail={mail}                      FROM={name}
MESSAGE={message}                mail={mail}
submit=書き込む                  MESSAGE={message}
                                 submit=書き込む
```

---

## 5. Slevo準拠チェックリスト（再発防止）

投稿関連コードを変更する際は、以下を **全て** 満たすことを確認する。

### ヘッダ

- [ ] `User-Agent` は `Monazilla/1.00 (VBBB/{version})` 形式（括弧必須）
- [ ] `Content-Type` は `application/x-www-form-urlencoded`（charset パラメータなし）
- [ ] `Referer` は返信時 `https://{host}/test/read.cgi/{board}/{threadKey}`（**末尾スラッシュなし**）
- [ ] `Referer` はスレ立て時 `https://{host}/test/read.cgi/{board}/`（末尾スラッシュあり）
- [ ] `Cookie` は cookie-store から自動構築
- [ ] **`Origin` ヘッダは送信しない**
- [ ] **`Accept-Language` ヘッダは送信しない**
- [ ] **`Cache-Control` / `Pragma` は POST 時に送信しない**
- [ ] Phase 1 と Phase 2 で **同一の Referer** を使用する

### URL

- [ ] `?guid=ON` が POST URL に含まれる
- [ ] `https://` を使用（`http://` でない）
- [ ] パスは `/test/bbs.cgi`

### フォームボディ

- [ ] パラメータ順序: `bbs → key → time → FROM → mail → MESSAGE → submit`
- [ ] エンコーディングは CP932 (iconv-lite の `'Shift_JIS'` = 実質 CP932)
- [ ] スペースは `+` にエンコード（`%20` でない）
- [ ] NCR 変換を全ユーザー入力フィールドに適用
- [ ] Phase 2 は確認ページの hidden fields + submit `上記全てを承諾して書き込む`

### Cookie

- [ ] Phase 1 レスポンスの `Set-Cookie` を Phase 2 送信前に反映
- [ ] `<pre>Cookie:NAME = VALUE</pre>` からの Cookie 抽出と設定
- [ ] hidden field の値と Cookie の値は**異なるもの**（混同しない）

---

## 6. 投稿コード変更時のレビュー観点

### 6.1 MUST（必須確認事項）

1. **Slevo のソースコードとの一致確認**
   - `Slevo/app/src/main/java/.../impl/PostRemoteDataSourceImpl.kt` と送信内容を比較
   - `Slevo/app/src/main/java/.../repository/PostRepository.kt` とフロー制御を比較
   - `Slevo/app/src/main/java/.../util/PostReplacer.kt` と NCR 変換を比較

2. **余分なヘッダの混入チェック**
   - `http-client.ts` のデフォルトヘッダが POST に混入していないか
   - 新しいヘッダを追加する変更は、Slevo が同じヘッダを送信しているか確認

3. **文字列の完全一致チェック**
   - Referer の末尾スラッシュ有無
   - User-Agent の括弧形式
   - submit ボタンの日本語文字列

### 6.2 SHOULD（推奨確認事項）

1. 実際の 5ch.net スレッドへのテスト投稿で成功を確認
2. bbspink.com と 5ch.net の両方でテスト（bbspink.com は寛容な場合がある）
3. 診断ログ (`[DIAG]`) でリクエスト/レスポンスの全容を確認

### 6.3 投稿テスト用チェック手順

```
1. アプリをビルド: npm run build
2. 5ch.net の適当なスレッドを開く（テスト用スレ推奨）
3. 投稿を実行
4. ログで以下を確認:
   a. Phase 1 リクエストヘッダに Origin/Accept-Language がないこと
   b. Phase 1 URL に ?guid=ON が含まれること
   c. Phase 1 Referer に末尾スラッシュがないこと（返信時）
   d. Phase 2 の Referer が Phase 1 と同一であること
   e. フォームパラメータ順序が bbs, key, time, FROM, mail, MESSAGE, submit であること
5. 投稿結果が grtOK であること
```

---

## 7. デバッグ手順書

### 7.1 投稿が失敗したときの初動

1. **ログを確認**: `[DIAG]` プレフィックスの行を探す
2. **レスポンスステータスとヘッダを確認**: `x-chx-error` ヘッダの有無
3. **レスポンス HTML を確認**: `[DIAG] grtError response body:` の内容

### 7.2 よくあるエラーと原因

| エラー | 最も疑わしい原因 |
|--------|-----------------|
| `9991 Banned` | 余分なヘッダ (Origin 等)、Referer 不正、User-Agent 形式不正 |
| `grtError` + `書き込めません` | スレッドが落ちている（DAT 落ち） |
| `grtError` + `Referer情報が変です` | Referer の形式/ドメイン不一致 |
| `grtCookie` が永久ループ | Cookie 保存/送信の実装バグ |
| `grtError` + 文字化けした HTML | レスポンスのデコードが UTF-8 になっている（CP932 で行うべき） |

### 7.3 Slevo ソースコードとの比較手順

```
1. Slevo/ ディレクトリが存在することを確認
2. 以下のファイルを開いて VBBB と比較:

   Slevo 側:
   - Slevo/app/src/main/java/.../impl/PostRemoteDataSourceImpl.kt  (HTTP リクエスト構築)
   - Slevo/app/src/main/java/.../repository/PostRepository.kt      (フロー制御)
   - Slevo/app/src/main/java/.../util/PostReplacer.kt              (NCR 変換)
   - Slevo/app/src/main/java/.../util/PostParser.kt                (レスポンス解析)
   - Slevo/app/src/main/java/.../di/NetworkModule.kt               (User-Agent)

   VBBB 側:
   - src/main/services/post.ts       (投稿全体)
   - src/main/services/encoding.ts   (エンコーディング/NCR)
   - src/main/services/http-client.ts (HTTP クライアント/デフォルトヘッダ)
   - src/types/file-format.ts        (User-Agent 定義)

3. 差分チェック項目:
   a. 送信ヘッダの種類と値
   b. フォームパラメータの名前/順序/値
   c. URL の構造（クエリパラメータ含む）
   d. Referer の正確な文字列
   e. エンコーディング方式
```

---

## 8. 教訓

### 教訓 1: ドキュメントよりソースコードを信頼せよ

プロトコル仕様ドキュメントは「何を送信すべきか」を記載していたが、「何を送信してはいけないか」は暗黙的だった。**リファレンス実装のソースコードとの完全一致** が最も信頼性の高い検証手段。

### 教訓 2: 「余分なヘッダ」は「足りないヘッダ」と同じくらい危険

HTTP クライアントライブラリがデフォルトで追加するヘッダ（`Origin`, `Cache-Control`, `Pragma`, `Accept-Language`）は、リファレンス実装が送信しないなら**明示的に除去**しなければならない。

### 教訓 3: 成功するサイトがあっても油断しない

bbspink.com での成功は、5ch.net との挙動の違いを見逃す原因となった。サーバーごとにアンチボット検証の厳格さが異なるため、**最も厳格なサーバーで検証**する必要がある。

### 教訓 4: 文字列の微細な差異が致命的

Referer の末尾スラッシュ1文字、User-Agent の括弧の有無など、人間の目には些細な差異がサーバーの検証ロジックでは致命的な違いになる。**文字列は1文字レベルで完全一致**を確認すべき。

### 教訓 5: 段階的な検証より一括比較

第1回修正ではドキュメントの各セクションを読みながら個別に修正したが、**Slevo のソースコードを1行ずつ比較する方が遥かに効率的だった**。最初から `PostRemoteDataSourceImpl.kt` を直接読むべきだった。

---

## 付録: 修正前後の差分表（完全版）

| 項目 | 修正前 (VBBB) | 修正後 (VBBB) | Slevo |
|------|---------------|---------------|-------|
| POST URL | `{server}/test/bbs.cgi` | `{server}/test/bbs.cgi?guid=ON` | `https://{host}/test/bbs.cgi?guid=ON` |
| User-Agent | `Monazilla/1.00 VBBB/0.1.0` | `Monazilla/1.00 (VBBB/0.1.0)` | `Monazilla/1.00 (Slevo/{ver})` |
| Origin | `https://{host}` | **送信しない** | **送信しない** |
| Accept-Language | `ja` | **送信しない** | **送信しない** |
| Cache-Control (POST) | `no-cache` | **送信しない** | **送信しない** |
| Pragma (POST) | `no-cache` | **送信しない** | **送信しない** |
| Referer (返信) | `…/{board}/{thread}/` | `…/{board}/{thread}` | `…/{board}/{thread}` |
| Referer (Phase 2) | `…/test/bbs.cgi` URL | 元の Referer と同一 | 元の Referer と同一 |
| スペースエンコード | `%20` | `+` | `+` |
| NCR 変換 | なし | `replaceWithNCR()` | `replaceEmojisWithNCR()` |
| パラメータ順 | FROM,mail,MESSAGE,bbs,time,key | bbs,key,time,FROM,mail,MESSAGE | bbs,key,time,FROM,mail,MESSAGE |

---

> このドキュメントは将来の投稿関連バグ発生時の参照資料として保持する。
> Slevo ソースコード (`Slevo/`) は本リポジトリ内に保存し、比較用リファレンスとして維持すること。
