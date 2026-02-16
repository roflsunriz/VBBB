# Slevo 書き込み処理 完全解析ドキュメント

> **目的:** Slevo (5ch/BBS専用ブラウザ・Android) の書き込み処理をソースコードレベルで解析し、
> 別プロジェクト (VBBB) での書き込み処理実装・デバッグに必要な知識を網羅的に提供する。
>
> **対象読者:** 5ch互換BBSの書き込み処理を実装するエンジニア
>
> **前提:** このドキュメントを読めばSlevoのソースコードを直接参照する必要はない。
>
> **対応サイト:** 5ch.net / bbspink.com / 2ch.sc（いずれも同一の bbs.cgi プロトコル）

---

## 目次

1. [全体アーキテクチャ](#1-全体アーキテクチャ)
2. [書き込みの2フェーズフロー](#2-書き込みの2フェーズフロー)
3. [HTTPリクエスト仕様（最重要）](#3-httpリクエスト仕様最重要)
4. [文字エンコーディング（Shift_JIS + NCR）](#4-文字エンコーディングshift_jis--ncr)
5. [Cookie管理](#5-cookie管理)
6. [レスポンス解析](#6-レスポンス解析)
7. [MonaTicketリトライ機構](#7-monaticketリトライ機構)
8. [エラーハンドリング](#8-エラーハンドリング)
9. [UIフロー](#9-uiフロー)
10. [データモデル一覧](#10-データモデル一覧)
11. [ファイル構成マップ](#11-ファイル構成マップ)
12. [VBBBで書き込みが失敗する場合のチェックリスト](#12-vbbbで書き込みが失敗する場合のチェックリスト)
13. [過去に遭遇した問題と対処（文字化け修正の記録）](#13-過去に遭遇した問題と対処文字化け修正の記録)
14. [他言語への移植ガイド](#14-他言語への移植ガイド)
15. [付録C: よくある失敗パターンと解決策](#付録c-よくある失敗パターンと解決策)

---

## 1. 全体アーキテクチャ

Slevoの書き込み処理は以下のレイヤで構成される：

```
┌────────────────────────────────────────────────────────────┐
│  UI Layer                                                  │
│  PostDialog → PostDialogController → PostDialogExecutor    │
│               (状態管理)              (差し替え可能)       │
├────────────────────────────────────────────────────────────┤
│  Domain Layer (Executor実装)                               │
│  ThreadReplyPostDialogExecutor / ThreadCreatePostDialog... │
├────────────────────────────────────────────────────────────┤
│  Repository Layer                                          │
│  PostRepository / ThreadCreateRepository                   │
│  (レスポンス解析・MonaTicketリトライ)                      │
├────────────────────────────────────────────────────────────┤
│  DataSource Layer                                          │
│  PostRemoteDataSourceImpl / ThreadCreateRemoteDataSourceImpl│
│  (HTTP リクエスト構築・実行)                               │
├────────────────────────────────────────────────────────────┤
│  Network Layer                                             │
│  OkHttpClient + PersistentCookieJar                        │
│  (Cookie永続化・ログ出力)                                  │
├────────────────────────────────────────────────────────────┤
│  Utility Layer                                             │
│  PostReplacer (NCR変換) / PostParser (HTML解析)            │
└────────────────────────────────────────────────────────────┘
```

**重要な設計方針:**
- 返信投稿とスレ立て投稿は `PostDialogExecutor` インターフェースで抽象化
- HTTP通信にはRetrofitではなく **OkHttp を直接使用**
- フォームボディは `FormBody.Builder(Charset.forName("Shift_JIS"))` で構築
- Cookie管理は OkHttp の `CookieJar` インターフェースで統一

---

## 2. 書き込みの2フェーズフロー

5ch系BBSの書き込みは **2フェーズ** で行われる。

### フェーズ1: 初回投稿（確認画面の取得）

```
ユーザーが「書き込む」をタップ
    ↓
PostDialogController.postFirstPhase()
    ↓
PostDialogExecutor.postFirstPhase()
    ↓
PostRepository.postTo5chFirstPhase() / ThreadCreateRepository.createThreadFirstPhase()
    ↓
PostRemoteDataSourceImpl.postFirstPhase() → HTTP POST 送信
    ↓
サーバーレスポンス受信
    ↓
PostParser.parseWriteResponse() でHTML解析
    ↓
結果判定:
  ├→ Success   → 完了（直接成功の場合）
  ├→ Confirm   → フェーズ2へ（確認画面が返ってきた場合）
  └→ Error     → エラー表示
```

### フェーズ2: 確認送信（書き込み実行）

```
確認画面で「上記全てを承諾して書き込む」をタップ
    ↓
PostDialogController.postSecondPhase()
    ↓
確認ページのhiddenパラメータ + submit を送信
    ↓
PostParser.parseWriteResponse() でHTML解析
    ↓
結果判定:
  ├→ Success → 完了
  └→ Error   → エラー表示
```

**要点:**
- フェーズ1で直接成功する場合もある（確認画面をスキップ）
- フェーズ2では、フェーズ1で取得した **hidden input のname/value を全てそのまま再送信** する
- フェーズ2の submit ボタンの値は `"上記全てを承諾して書き込む"` 固定

---

## 3. HTTPリクエスト仕様（最重要）

### 3.1 返信投稿 (Thread Reply) - フェーズ1

```http
POST https://{host}/test/bbs.cgi?guid=ON HTTP/1.1
Host: {host}
User-Agent: Monazilla/1.00 (Slevo/{versionName})
Referer: https://{host}/test/read.cgi/{board}/{threadKey}
Content-Type: application/x-www-form-urlencoded
Cookie: (OkHttp CookieJarが自動付与)

bbs={board}&key={threadKey}&time={unixTimestamp}&FROM={name}&mail={mail}&MESSAGE={message}&submit=%8F%91%82%AB%8D%9E%82%DE
```

| フィールド | 値                                         | 備考                              |
| ---------- | ------------------------------------------ | --------------------------------- |
| `bbs`      | 板キー (例: `operate`)                     | URLの最初のパスセグメント         |
| `key`      | スレッドキー (例: `1234567890`)             | datファイル名（拡張子なし）       |
| `time`     | Unixタイムスタンプ（秒）                   | `System.currentTimeMillis()/1000` |
| `FROM`     | 名前                                       | 空文字可                          |
| `mail`     | メール欄                                   | `sage` 等                         |
| `MESSAGE`  | 本文                                       | 改行は `\n`                       |
| `submit`   | `書き込む`                                 | Shift_JISエンコード済み           |

### 3.2 スレ立て (Thread Create) - フェーズ1

```http
POST https://{host}/test/bbs.cgi?guid=ON HTTP/1.1
Host: {host}
User-Agent: Monazilla/1.00 (Slevo/{versionName})
Referer: https://{host}/test/read.cgi/{board}/
Content-Type: application/x-www-form-urlencoded
Cookie: (OkHttp CookieJarが自動付与)

bbs={board}&time={unixTimestamp}&subject={title}&FROM={name}&mail={mail}&MESSAGE={message}&submit=%90V%8BK%83X%83%8C%83b%83h%8D%EC%90%AC
```

| フィールド | 値                                        | 備考                            |
| ---------- | ----------------------------------------- | ------------------------------- |
| `bbs`      | 板キー                                    | 返信と同じ                      |
| `time`     | Unixタイムスタンプ（秒）                  | 返信と同じ                      |
| `subject`  | スレッドタイトル                          | **返信にはない**                |
| `FROM`     | 名前                                      |                                 |
| `mail`     | メール欄                                  |                                 |
| `MESSAGE`  | 本文                                      |                                 |
| `submit`   | `新規スレッド作成`                         | Shift_JISエンコード済み         |

**返信との差分:** `key` がない、`subject` が追加、`submit` の値が異なる、`Referer` のパスが `/{board}/` で終わる。

### 3.3 フェーズ2（返信・スレ立て共通）

```http
POST https://{host}/test/bbs.cgi?guid=ON HTTP/1.1
Host: {host}
User-Agent: Monazilla/1.00 (Slevo/{versionName})
Referer: https://{host}/test/read.cgi/{board}/{threadKey}  ← 返信の場合
         https://{host}/test/read.cgi/{board}/              ← スレ立ての場合
Content-Type: application/x-www-form-urlencoded
Cookie: (OkHttp CookieJarが自動付与)

{hiddenParam1}={value1}&{hiddenParam2}={value2}&...&submit=%8F%E3%8BL%91S%82%C4%82%F0%8F%B3%91%F8%82%B5%82%C4%8F%91%82%AB%8D%9E%82%DE
```

- `submit` の値: `上記全てを承諾して書き込む`
- hidden パラメータは確認HTMLから **全て** 抽出して送信
- hidden パラメータの値にも NCR変換を適用

### 3.4 重要なHTTPヘッダ

| ヘッダ         | 値                                       | 必須性 |
| -------------- | ---------------------------------------- | ------ |
| `User-Agent`   | `Monazilla/1.00 ({AppName}/{Version})`   | **必須** — これがないと弾かれる可能性が高い |
| `Referer`      | 投稿先スレッド/板のURL                   | **必須** — サーバーが検証している |
| `Cookie`       | サーバーから受け取ったCookieを自動送信   | **必須** — MonaTicket等が必要 |
| `Content-Type` | `application/x-www-form-urlencoded`      | **必須** — フォームPOSTのデフォルト。**charsetパラメータは付けない** |

**Content-Type の注意:** OkHttp の `FormBody` は Content-Type を `application/x-www-form-urlencoded` として自動付与する。`charset=Shift_JIS` のようなパラメータは **付けない**。他のHTTPクライアントで実装する場合も、Content-Type にcharsetを含めないほうが安全。

### 3.5 URL構築のルール

- **エンドポイント:** 常に `https://{host}/test/bbs.cgi?guid=ON`
- **host:** 板URLのドメイン部分（例: `agree.5ch.net`）
- **board:** 板URLの最初のパスセグメント（例: `operate`）
- **threadKey:** datファイル名の拡張子なし部分（例: `1234567890`）

**`guid=ON` の意味:** 元は携帯端末の個体識別番号送信を許可するクエリパラメータ。現在は実質的に「専用ブラウザからの投稿である」ことを示す識別子として機能しており、**省略すると投稿が拒否される場合がある**。常に付与すること。

板URLの解析ロジック:
```
入力: https://agree.5ch.net/operate/
  → host = "agree.5ch.net"
  → board = "operate"

入力: https://mercury.bbspink.com/erobbs/
  → host = "mercury.bbspink.com"
  → board = "erobbs"
```

### 3.6 対応サイトとホスト名パターン

Slevoが対応しているホストのサフィックス一覧：

| サフィックス     | サイト     | 備考                          |
| ---------------- | ---------- | ----------------------------- |
| `5ch.net`        | 5ちゃんねる | メインの対応先               |
| `bbspink.com`    | BBSPINK    | 5chと同一プロトコル          |
| `2ch.sc`         | 2ch.sc     | 5chと同一プロトコル          |

全サイトで同一の `/test/bbs.cgi?guid=ON` エンドポイントと同一のフォームパラメータを使用する。

### 3.7 リダイレクトとタイムアウト

Slevoは OkHttp のデフォルト設定を使用：

| 設定                 | 値                     |
| -------------------- | ---------------------- |
| Connect timeout      | 10秒（OkHttpデフォルト） |
| Read timeout         | 10秒（OkHttpデフォルト） |
| Write timeout        | 10秒（OkHttpデフォルト） |
| Follow redirects     | true（OkHttpデフォルト）|
| Follow SSL redirects | true（OkHttpデフォルト）|

**注意:** 書き込みサーバーは通常リダイレクトを返さないが、メンテナンス時等にリダイレクトが発生する可能性がある。リダイレクト先でCookieが失われないよう注意。

---

## 4. 文字エンコーディング（Shift_JIS + NCR）

### 4.1 基本方針

5chの書き込みAPIは **Shift_JIS** でのフォームエンコーディングを要求する。
ただし、絵文字などShift_JISで表現できない文字が含まれる場合がある。

**Slevoの戦略:**
1. Shift_JISで表現可能な文字 → **そのまま保持**
2. Shift_JISで表現不可能な文字 → **数値文字参照 (NCR) に変換**

### 4.2 【最重要】Shift_JIS と Windows-31J (CP932) の違い

> **これは他言語への移植時の最大の落とし穴である。**

Java/Kotlin で `Charset.forName("Shift_JIS")` を呼ぶと、返されるのは **JIS X 0208 の Shift_JIS ではなく、Microsoft拡張の Windows-31J (CP932)** である。CP932 は Shift_JIS のスーパーセットで、以下が追加されている：

- NEC特殊文字（Row 13）: ①②③㈱㈲ 等
- NEC選定IBM拡張（Rows 89-92）
- IBM拡張（Rows 115-119）
- 丸数字、ローマ数字、全角チルダ `～` 等

**つまり Slevo が実際に使っているのは CP932 (Windows-31J) である。**

| 言語/環境        | 正しい指定                           |
| ---------------- | ------------------------------------ |
| Java / Kotlin    | `Charset.forName("Shift_JIS")` — 内部的にCP932にマップされるのでOK |
| Node.js          | `iconv-lite` の `"cp932"` または `"windows-31j"` |
| Python           | `"cp932"` — **`"shift_jis"` だとNEC特殊文字がエンコードできずエラーになる** |
| C# / .NET        | `Encoding.GetEncoding(932)` または `"shift_jis"` |
| Go               | `japanese.ShiftJIS` (golang.org/x/text) — 実質CP932 |
| Rust             | `encoding_rs::SHIFT_JIS` — 実質Windows-31J |

**テスト方法:** `①` (丸数字) や `～` (全角チルダ) をエンコードできればCP932。純粋なShift_JISだとこれらは失敗する。

### 4.3 NCR変換の実装詳細（PostReplacer）

```kotlin
// 概念的な疑似コード
fun replaceEmojisWithNCR(input: String): String {
    val encoder = Charset.forName("Shift_JIS").newEncoder()
    val result = StringBuilder()

    // Unicodeの拡張書記素クラスタ単位(\X)で走査
    for (graphemeCluster in input.graphemeClusters()) {
        if (encoder.canEncode(graphemeCluster)) {
            // Shift_JISで表現可能 → そのまま
            result.append(graphemeCluster)
        } else {
            // Shift_JISで表現不可能 → コードポイントごとにNCRへ
            for (codePoint in graphemeCluster.codePoints()) {
                result.append("&#$codePoint;")
            }
        }
    }
    return result.toString()
}
```

**重要なポイント:**
- `\X` (拡張書記素クラスタ) 単位で処理する。`Char` 単位ではない。
  - 理由: 肌色修飾付き絵文字（👍🏻）等は複数コードポイントで1文字を構成する
  - `Char` 単位だとサロゲートペアや結合シーケンスが分断される
- NCR形式は `&#<10進数コードポイント>;` (例: `&#128077;`)
- この変換は `bbs`, `key`, `time`, `FROM`, `mail`, `MESSAGE`, `subject` および確認画面の hidden パラメータの **全フィールド** に適用

### 4.4 NCR変換のテストケース（実際のユニットテストから抽出）

| 入力                | 出力                      | 説明                         |
| ------------------- | ------------------------- | ---------------------------- |
| `テストabc123`      | `テストabc123`            | Shift_JIS互換 → 変換なし    |
| `hello😀`           | `hello&#128512;`          | 単一コードポイント絵文字 → NCR |
| `x👋🏾y`             | `x&#128075;&#127998;y`    | 複数コードポイント（肌色修飾）→ 各コードポイントごとにNCR |

**複数コードポイント絵文字の例:**
- `👋🏾` = U+1F44B (👋) + U+1F3FE (🏾 肌色修飾子)
- → `&#128075;&#127998;` (128075 = 0x1F44B, 127998 = 0x1F3FE)

### 4.5 バイトレベルのURLエンコーディングフロー

フォームボディがワイヤ上でどうなるかを具体的に示す。**このフローの理解は実装の成否に直結する。**

```
1. NCR変換（アプリ内処理）
   入力: "テスト😀"
   出力: "テスト&#128512;"   ← 😀がNCRに変換される

2. CP932 (Windows-31J) バイト変換
   "テスト&#128512;"
   → [83 65] [83 58] [83 67] [26 23 31 32 38 35 31 32 3B]
      テ       ス       ト      &  #  1  2  8  5  1  2  ;

3. パーセントエンコーディング（application/x-www-form-urlencoded 規則）
   - ASCII英数字とアンリザーブド文字 (-, ., _, ~) → そのまま
   - スペース → + （%20 ではない ★重要）
   - それ以外の各バイト → %XX
   
   結果: "%83e%83X%83g%26%23128512%3B"
         テスト                &#128512;
```

**注意点:**
- `%83e` の `e` は小文字。OkHttpは小文字で出力するが、大文字 `%83E` でも動作する
- `&` → `%26`、`#` → `%23`、`;` → `%3B`（NCRの `&#128512;` 自体もエンコードされる）
- **スペースは `+` にエンコード**される（`%20` ではない）。これは `application/x-www-form-urlencoded` の標準規約

### 4.6 改行コードの扱い

MESSAGE 内の改行は以下のように処理される：

- ユーザー入力は通常 `\n` (LF, 0x0A)
- Shift_JIS エンコード後: `0A` → `%0A`
- **`\r\n` (CRLF) の場合:** `0D 0A` → `%0D%0A`

5ch サーバーは `\n` (LF) を受け付ける。Slevo は入力テキストをそのまま（LF のまま）送信しており、サーバー側で問題は発生していない。`\r\n` を送信しても動作するが、`\r` が改行として二重カウントされるリスクがある。**LF (`\n`) のみを使用することを推奨。**

### 4.7 フォームボディの構築

```kotlin
// OkHttp の FormBody.Builder に Shift_JIS を指定
val formBody = FormBody.Builder(Charset.forName("Shift_JIS"))
    .add("bbs", replaceEmojisWithNCR(board))
    .add("key", replaceEmojisWithNCR(threadKey))
    .add("time", replaceEmojisWithNCR(time))
    .add("FROM", replaceEmojisWithNCR(name))
    .add("mail", replaceEmojisWithNCR(mail))
    .add("MESSAGE", replaceEmojisWithNCR(message))
    .add("submit", "書き込む")  // submitはNCR不要
    .build()
```

**重要:** `add()` を使い、`addEncoded()` は使わない。
- `add()`: OkHttp が Shift_JIS でURLエンコーディングを行う
- `addEncoded()`: 既にエンコード済みの値を渡す（二重エンコードの原因になる）

**フォームパラメータの順序:** Slevoでは上記の順序で送信している。サーバーが順序に依存するかは不明だが、安全のため **Slevoと同じ順序を維持** することを推奨。

**Content-Type ヘッダの注意:** OkHttp の `FormBody` は Content-Type を `application/x-www-form-urlencoded` として自動付与する。`charset=Shift_JIS` のようなパラメータは **付けない**。他のHTTPクライアントで実装する場合も、Content-Type にcharsetを含めないほうが安全。

### 4.8 レスポンスボディのデコード

サーバーからのレスポンスも **Shift_JIS (CP932)** でエンコードされている。

```
レスポンスヘッダ例:
Content-Type: text/html; charset=Shift_JIS
```

**Slevoの処理:**
- OkHttp の `response.body?.string()` を使用
- OkHttp は Content-Type ヘッダの `charset` を読み取り、そのcharsetでデコードする
- サーバーが `charset=Shift_JIS` を返すので、自動的にShift_JIS (= CP932) でデコードされる

**他言語で実装する場合の注意:**
- レスポンスボディを **CP932 でデコード** する必要がある
- UTF-8 でデコードすると文字化けし、HTMLの `<title>` 判定（`書きこみました` 等）が失敗する
- Content-Type ヘッダに charset が含まれない場合のフォールバックとして CP932 を使用すべき

### 4.9 過去の文字化けバグと修正

Slevoでは以前、以下の問題があった：
- `URLEncoder.encode(..., "Shift_JIS")` で事前エンコード → `addEncoded()` に渡す
- この方法だと、Shift_JIS非対応文字が文字化けまたは代替文字に変換された

**修正内容:**
1. `URLEncoder + addEncoded` → `add()` に統一（エンコードはOkHttpに委譲）
2. NCR変換ヘルパー（PostReplacer）を導入
3. 4つの送信経路（返信1次/2次、スレ立て1次/2次）全てに同じ変換を適用

---

## 5. Cookie管理

### 5.1 PersistentCookieJar

OkHttpの `CookieJar` インターフェースを実装したCookie永続化機構。

```
┌──────────────────────────────────────────┐
│  PersistentCookieJar                     │
│                                          │
│  cache: ConcurrentHashMap<domain, List>  │ ← メモリ上のキャッシュ
│         ↕ 同期                           │
│  CookieLocalDataSource (DataStore)       │ ← 永続ストレージ
└──────────────────────────────────────────┘
```

**動作:**
- `saveFromResponse()`: サーバーからのSet-Cookieを受け取り、ドメインごとにキャッシュ＋永続化
- `loadForRequest()`: リクエスト送信前に、URLにマッチするCookieを返す
- 期限切れCookieは `loadForRequest()` 時に自動削除

### 5.2 Cookieマッチングロジック

```kotlin
// ドメインサフィックスマッチ
cache.keys.filter { url.host.endsWith(it) }

// URL パスマッチ
cookie.matches(url)
```

- ドメインは **サフィックスマッチ** （`agree.5ch.net` は `.5ch.net` にマッチ）
- パスは OkHttp の `Cookie.matches()` に委譲

### 5.3 Cookie永続化フォーマット

Moshi + カスタムアダプタでシリアライズ：

```
{name}|{value}|{expiresAt}|{domain}|{path}|{secure}|{httpOnly}
```

例:
```
MonaTicket=abc123|abc123|1740000000000|.5ch.net|/|true|true
```

### 5.4 重要なCookie: MonaTicket

5chの書き込みでは `MonaTicket` Cookieが重要。
- サーバーがセッション管理に使用
- Broken MonaTicket エラーが発生した場合はクリアして再取得が必要（後述）

### 5.5 Cookieの初回取得タイミング

**「Cookieがないまま投稿すると失敗するのか？」— これはよくある疑問。**

Cookieの取得タイミング：
1. **スレッド/板のHTMLを取得した時点** — サーバーが `Set-Cookie` でCookieを返す
2. **フェーズ1の投稿リクエスト** — サーバーが `Set-Cookie` で新しいCookieを返す
3. **フェーズ2の投稿リクエスト** — サーバーが `Set-Cookie` でCookieを更新する場合がある

Slevoの場合：
- ユーザーがスレッドを表示した時点で、DAT取得やHTML取得のHTTPリクエストが発生
- この時点でサーバーから `Set-Cookie` が返され、`PersistentCookieJar` が保存
- フェーズ1投稿時には既にCookieが保持されている状態

**VBBB等で初回投稿が失敗する場合:**
- 投稿前に一度もそのホストにHTTPリクエストを送っていない可能性がある
- 最低でもスレッドの読み込み（dat取得等）を先に行い、Cookieを取得してから投稿すること

### 5.6 フェーズ間のCookie遷移

```
スレッド表示 → サーバーからCookie A を取得、保存
    ↓
フェーズ1投稿 → Cookie A を送信 → サーバーから Cookie A' (更新) を取得、保存
    ↓
フェーズ2投稿 → Cookie A' を送信 → 成功
```

**重要:** フェーズ1のレスポンスでCookieが更新される場合がある。フェーズ2ではフェーズ1後の最新Cookieを送信する必要がある。OkHttpの `CookieJar` は自動でこれを処理するが、手動でCookieを管理している場合は **フェーズ1のレスポンスの `Set-Cookie` を必ず反映してからフェーズ2を送信** すること。

---

## 6. レスポンス解析

### 6.1 レスポンス分類ロジック（PostParser）

サーバーから返されるHTMLの `<title>` タグを基に結果を分類する：

```
HTMLのtitle           → 結果
─────────────────────────────────────────
"書きこみました"     → Success（成功）
"書き込み確認"       → Confirm（確認画面→フェーズ2が必要）
"お茶でも"           → Error（サーバー過負荷）
"ＥＲＲＯＲ"         → Error（書き込みエラー）
上記以外              → Error（不明なレスポンス）
```

### 6.2 確認画面からのhiddenパラメータ抽出

```kotlin
// Jsoup でHTMLをパースし、form内のhidden inputを全て取得
doc.select("form input[type=hidden]")
    .associate { it.attr("name") to it.attr("value") }
    .filterKeys { it.isNotEmpty() }
```

返される Map の例:
```
{
  "bbs": "operate",
  "key": "1234567890",
  "time": "1700000000",
  "FROM": "名無し",
  "mail": "sage",
  "MESSAGE": "テスト書き込み",
  "hana": "mogera_XXXXX"   ← CSRFトークン的なもの
}
```

### 6.3 成功時のレスポンスヘッダ

```
x-resnum: 123    ← 新しいレス番号（返信成功時のみ）
```

`PostRepository` はこのヘッダからレス番号を取得し、UI更新に使用する。

### 6.4 補足: xTag について

PostParser内に `xTag` というロジックがあるが、現行の実装では以下の通り：

```kotlin
val xTag = doc.select("html").outerHtml()
    .substringAfter("", "")  // 空文字列を区切りにしている
    .trim()
```

`substringAfter("", "")` は空文字列をdelimiterにしているため、実質的にHTML全体がそのまま返る。
よって `xTag == "true"` 等の条件はほぼマッチしない。**実際の判定はtitleベースで行われている。**

---

## 7. MonaTicketリトライ機構

### 7.1 Broken MonaTicket の検出

**返信投稿のフェーズ1でのみ** 実装されている（スレ立てにはない）。

```kotlin
// 検出条件（いずれか一方でtrue）
val headerHit = headers("x-chx-error")
    .any { Regex("Broken\\s*MonaTicket", IGNORE_CASE).containsMatchIn(it) }

val cookieHit = headers("set-cookie")
    .any { sc ->
        sc.startsWith("MonaTicket=", ignoreCase = true) &&
        sc.contains("Expires=", ignoreCase = true)  // 過去期限で失効させている
    }
```

### 7.2 リトライフロー

```
フェーズ1送信
    ↓
レスポンス受信
    ↓
isBrokenMonaTicket() == true ?
  ├→ はい:
  │    response.close()
  │    cookieJar.clear(host)        ← 該当ホストのCookie全削除
  │    フェーズ1を再送信（リトライ1回）
  │    handlePostResponse(retryResponse)
  │
  └→ いいえ:
       handlePostResponse(response)
```

**注意:** リトライは **1回だけ**。2回目も失敗した場合はそのまま結果を返す。

---

## 8. エラーハンドリング

### 8.1 エラー分類

| 状態                  | PostResult                              | メッセージ                     |
| --------------------- | --------------------------------------- | ------------------------------ |
| HTTP通信失敗          | `Error("", "ネットワークエラー...")`     | レスポンスなし                 |
| レスポンスボディなし  | `Error("", "空のレスポンスです。")`      |                                |
| HTTPステータス異常    | `Error(html, "サーバーエラー: {code}")` | HTML付き                       |
| タイトル"ＥＲＲＯＲ" | `Error(html, "書き込みエラー...")`       | HTML付き（WebView表示）        |
| タイトル"お茶でも"    | `Error(html, "サーバーが混み合って...")` | HTML付き                       |
| 不明なレスポンス      | `Error(html, "不明なレスポンスです。")` | HTML付き                       |
| 例外発生              | `Error("", e.message)`                  |                                |

### 8.2 5chサーバーが返す代表的なエラーメッセージ

レスポンスHTMLの `<body>` 内に含まれる代表的なエラー文言（VBBB開発時のデバッグに有用）：

| エラー文言                              | 原因                                       | 対処                                     |
| --------------------------------------- | ------------------------------------------ | ---------------------------------------- |
| `ERROR: このスレッドには書き込めません。` | スレッドが落ちている（DAT落ち）             | 書き込み不可を通知                       |
| `ERROR: Referer情報が変です。`            | Refererヘッダが不正/欠落                    | Refererを正しく設定                      |
| `ERROR: 連続投稿ですか？？`              | 短時間での連投規制 (Samba)                  | 一定時間待ってリトライ                   |
| `ERROR: 多重投稿ですか？？`              | 同一内容の重複投稿                          | 投稿内容を変更                           |
| `ERROR: バーボン中です。`                | IPアドレスベースの投稿規制                  | 時間をおく（数分〜数時間）               |
| `ERROR: クッキー確認！`                  | Cookie未送信またはCookie不正                | Cookie管理の実装を確認                   |
| `ERROR: 本文がありません。`               | MESSAGEが空                                | 入力バリデーション                       |
| `ERROR: 名前が長すぎます。`               | FROMフィールドが長すぎる                    | 文字数制限                               |
| `ERROR: 本文が長すぎます。`               | MESSAGEフィールドが長すぎる                 | 文字数制限                               |
| `お茶でも飲みましょう。`                  | サーバー過負荷                              | リトライ                                 |

**注意:** エラー文言は全角文字 `ＥＲＲＯＲ` がtitleに含まれる場合と、半角 `ERROR` が本文に含まれる場合がある。Slevoではtitleの全角 `ＥＲＲＯＲ` で判定している。

### 8.3 エラーHTMLの表示

エラー時のHTML（`PostResult.Error.html`）は WebView で表示される：

```kotlin
// ResponseWebViewDialog 内
webView.settings.defaultTextEncodingName = "Shift_JIS"
webView.loadDataWithBaseURL(null, htmlContent, "text/html", "Shift_JIS", null)
```

---

## 9. UIフロー

### 9.1 投稿ダイアログの表示

```
FAB タップ or ジェスチャー
    ↓
PostDialogController.showDialog()
    ↓
PostDialogState.isDialogVisible = true
    ↓
PostDialog Composable 表示
    ↓
フォーム入力（名前/メール/本文/タイトル）
```

### 9.2 投稿実行からの状態遷移

```
「書き込む」タップ
    ↓
PostDialogController.postFirstPhase()
    ↓ isPosting = true, isDialogVisible = false
PostingDialog 表示（投稿中...）
    ↓
結果受信
    ↓ isPosting = false
┌── Success ──→ postResultMessage = "書き込みに成功しました。"
│                formState.title = "", formState.message = ""（フォームクリア）
│                recordIdentity（名前/メール履歴保存）
│                onPostSuccess コールバック
│
├── Confirm ──→ isConfirmationScreen = true
│                postConfirmation = ConfirmationData
│                ResponseWebViewDialog で確認HTML表示
│                「書き込む」タップ → postSecondPhase()
│
└── Error ────→ showErrorWebView = true
                 errorHtmlContent = result.html
                 ResponseWebViewDialog でエラーHTML表示
```

### 9.3 返信番号の挿入

```kotlin
// レス番号をタップしたとき
fun showReplyDialog(resNum: Int) {
    val message = current.formState.message
    val separator = if (message.isNotEmpty() && !message.endsWith("\n")) "\n" else ""
    formState.message = message + separator + ">>${resNum}\n"
    isDialogVisible = true
}
```

---

## 10. データモデル一覧

### 10.1 投稿フォーム状態

```kotlin
data class PostFormState(
    val name: String = "",
    val mail: String = "",
    val title: String = "",
    val message: String = "",
)
```

### 10.2 投稿リクエスト（フェーズ1）

```kotlin
data class PostDialogFirstPhaseRequest(
    val host: String,        // "agree.5ch.net"
    val board: String,       // "operate"
    val threadKey: String?,  // "1234567890" (返信時) / null (スレ立て時)
    val title: String?,      // スレタイトル (スレ立て時のみ)
    val formState: PostFormState,
)
```

### 10.3 投稿リクエスト（フェーズ2）

```kotlin
data class PostDialogSecondPhaseRequest(
    val host: String,
    val board: String,
    val threadKey: String?,
    val confirmationData: ConfirmationData,
)
```

### 10.4 確認データ

```kotlin
data class ConfirmationData(
    val html: String,                     // 確認画面のHTML全文
    val hiddenParams: Map<String, String> // hidden input のname→value
)
```

### 10.5 投稿結果

```kotlin
sealed class PostResult {
    data class Success(val resNum: Int? = null) : PostResult()
    data class Confirm(val confirmationData: ConfirmationData) : PostResult()
    data class Error(val html: String, val message: String) : PostResult()
}
```

---

## 11. ファイル構成マップ

```
app/src/main/java/com/websarva/wings/android/slevo/
├── data/
│   ├── datasource/
│   │   ├── local/
│   │   │   ├── CookieLocalDataSource.kt          # Cookie永続化インターフェース
│   │   │   └── entity/history/
│   │   │       └── PostHistoryEntity.kt           # 投稿履歴DBエンティティ
│   │   └── remote/
│   │       ├── PostRemoteDataSource.kt            # 返信投稿DataSourceインターフェース
│   │       ├── ThreadCreateRemoteDataSource.kt    # スレ立てDataSourceインターフェース
│   │       └── impl/
│   │           ├── PostRemoteDataSourceImpl.kt    # ★ 返信投稿HTTP実装
│   │           └── ThreadCreateRemoteDataSourceImpl.kt  # ★ スレ立てHTTP実装
│   ├── repository/
│   │   ├── PostRepository.kt                      # ★ 返信投稿オーケストレーション
│   │   ├── ThreadCreateRepository.kt              # ★ スレ立てオーケストレーション
│   │   ├── PostHistoryRepository.kt               # 投稿履歴管理
│   │   └── CookieRepository.kt                    # Cookie管理
│   └── util/
│       ├── PostParser.kt                          # ★ レスポンスHTML解析
│       └── PostReplacer.kt                        # ★ Shift_JIS NCR変換
├── di/
│   ├── NetworkModule.kt                           # OkHttpClient/UserAgent提供
│   └── PersistentCookieJar.kt                     # ★ Cookie永続化実装
├── ui/
│   ├── common/
│   │   ├── PostDialog.kt                          # 投稿フォームUI
│   │   ├── PostingDialog.kt                       # 投稿中ダイアログ
│   │   └── postdialog/
│   │       ├── PostDialogController.kt            # ★ 投稿状態管理コントローラ
│   │       ├── PostDialogExecutor.kt              # 投稿実行インターフェース
│   │       ├── PostDialogState.kt                 # ダイアログ状態
│   │       ├── PostDialogSuccess.kt               # 成功コールバックデータ
│   │       ├── ThreadReplyPostDialogExecutor.kt   # 返信実行実装
│   │       └── ThreadCreatePostDialogExecutor.kt  # スレ立て実行実装
│   ├── thread/
│   │   ├── screen/ThreadScaffold.kt               # スレッド画面（投稿トリガー）
│   │   └── dialog/ResponseWebViewDialog.kt        # 確認/エラーHTML表示
│   ├── board/
│   │   └── screen/BoardScaffold.kt                # 板画面（スレ立てトリガー）
│   └── util/
│       └── UrlUtils.kt                            # URL解析ユーティリティ
```

---

## 12. VBBBで書き込みが失敗する場合のチェックリスト

以下の項目を順番に確認すること。5ch系BBSの書き込みは細かい仕様に厳格であり、1つでも違うと失敗する。

### チェック1: User-Agent

- [ ] `Monazilla/1.00` で始まるか？
- [ ] 形式は `Monazilla/1.00 ({AppName}/{Version})` か？
- [ ] 空文字や一般的なブラウザUAを使っていないか？

**失敗パターン:** User-Agentが不正だとサーバーが即座に拒否する。

### チェック2: Content-Type と文字エンコーディング

- [ ] `Content-Type: application/x-www-form-urlencoded` か？（charsetパラメータは付けない）
- [ ] フォームボディは **CP932 (Windows-31J)** でエンコードされているか？（セクション4.2参照）
- [ ] UTF-8でエンコードしていないか？（最も多い失敗原因）
- [ ] 二重エンコードしていないか？（手動URLエンコード + ライブラリのエンコードの重複）
- [ ] スペースを `+` にエンコードしているか？（`%20` ではない）
- [ ] レスポンスのデコードもCP932で行っているか？（title判定に影響）

**失敗パターン:** UTF-8でエンコードすると文字化け→サーバーがエラーを返す。Python で `"shift_jis"` を指定すると丸数字等でエラーになる（`"cp932"` を使う）。

### チェック3: Referer ヘッダ

- [ ] `Referer` ヘッダを送信しているか？
- [ ] 形式は正しいか？
  - 返信: `https://{host}/test/read.cgi/{board}/{threadKey}`
  - スレ立て: `https://{host}/test/read.cgi/{board}/`
- [ ] ホスト名・板名がURL先と一致しているか？

**失敗パターン:** Refererがないか不正だとサーバーがCSRF対策で拒否する。

### チェック4: フォームパラメータ

- [ ] `bbs` パラメータは板キー（URLの最初のパスセグメント）か？
- [ ] `key` パラメータはスレッドキーか？（返信時のみ）
- [ ] `time` はUnixタイムスタンプ（秒単位）か？（ミリ秒ではない）
- [ ] `submit` の値は正確に `書き込む`（返信）/ `新規スレッド作成`（スレ立て）か？
- [ ] パラメータ名の大文字小文字は正確か？（`FROM` と `MESSAGE` は大文字）

**失敗パターン:** `time` がミリ秒だったり、`submit` の文字列が違うと失敗する。

### チェック5: Cookie

- [ ] サーバーからの `Set-Cookie` を永続化しているか？
- [ ] 次のリクエストで保存したCookieを送信しているか？
- [ ] `MonaTicket` Cookie が正しく送信されているか？
- [ ] Cookie のドメインマッチングは正しいか？（`.5ch.net` は全サブドメインにマッチ）
- [ ] **投稿前に、一度でもそのホストに対してHTTPリクエストを送信しているか？**（Cookieの初回取得）
- [ ] **フェーズ1のレスポンスの `Set-Cookie` をフェーズ2送信前に反映しているか？**

**失敗パターン:** Cookieを保存・送信していないとフェーズ2で失敗する。初回投稿時にCookieが空のまま送信すると `ERROR: クッキー確認！` が返される。

### チェック6: 2フェーズフロー

- [ ] フェーズ1のレスポンスHTMLを正しくパースしているか？
- [ ] `<title>` タグの内容で結果を判定しているか？
- [ ] 確認画面（`書き込み確認`）が返ってきた場合、hidden パラメータを全て再送信しているか？
- [ ] フェーズ2の `submit` 値は `上記全てを承諾して書き込む` か？
- [ ] フェーズ1で直接成功する場合も処理しているか？

**失敗パターン:** 確認画面のhiddenパラメータを送り返さないと書き込みが完了しない。

### チェック7: NCR変換（絵文字対応）

- [ ] Shift_JISで表現できない文字をNCR（`&#コードポイント;`）に変換しているか？
- [ ] グラフェムクラスタ単位で処理しているか？（Char単位だと絵文字が壊れる）
- [ ] 変換は全フィールド（FROM, mail, MESSAGE, subject, hidden params）に適用しているか？

### チェック8: MonaTicketリトライ

- [ ] `x-chx-error` ヘッダに `Broken MonaTicket` が含まれる場合を検出しているか？
- [ ] `Set-Cookie` で MonaTicket が過去期限で失効指示されている場合を検出しているか？
- [ ] 検出時にCookieをクリアして1回リトライしているか？

### チェック9: エンドポイントURL

- [ ] `?guid=ON` クエリパラメータが付いているか？
- [ ] `https://` を使用しているか？（`http://` ではない）
- [ ] パスは `/test/bbs.cgi` か？

### チェック10: ネットワーク設定

- [ ] TLS/SSL接続が正しく行えているか？
- [ ] タイムアウト設定は適切か？
- [ ] リダイレクトを正しくフォローしているか？

---

## 13. 過去に遭遇した問題と対処（文字化け修正の記録）

### 問題: Shift_JIS非対応文字の文字化け

**症状:** 絵文字を含む書き込みが文字化けする

**原因:** `URLEncoder.encode(value, "Shift_JIS")` で事前エンコードし、`FormBody.Builder().addEncoded()` に渡していた。この2段構えのエンコードで、Shift_JIS非対応文字が意図しない代替文字に変換されていた。

**修正:**
1. エンコード経路を一元化: `FormBody.Builder(Charset.forName("Shift_JIS")).add()` に統一
2. NCR変換ヘルパー `PostReplacer.replaceEmojisWithNCR()` を導入
3. `\X`（Unicodeグラフェムクラスタ）単位で走査し、エンコード不能な文字のみNCRに変換
4. 返信投稿/スレ立て投稿の全4送信経路に同一の変換を適用

**教訓:**
- フォームエンコーディングは **1つのレイヤだけ** で行う（手動エンコード + ライブラリの自動エンコード = 二重エンコード）
- 文字走査は `Char` 単位ではなく **グラフェムクラスタ** 単位で行う
- NCR変換は `MESSAGE` だけでなく **全フィールド** に適用する

---

## 付録A: 擬似コードによる完全な書き込みフロー

```
function postReply(host, board, threadKey, name, mail, message):
    // --- Phase 1: 初回送信 ---
    url = "https://{host}/test/bbs.cgi?guid=ON"
    referer = "https://{host}/test/read.cgi/{board}/{threadKey}"
    userAgent = "Monazilla/1.00 (VBBB/1.0)"
    time = floor(currentTimeMillis / 1000)

    formBody = FormBody(charset="Shift_JIS")
    formBody.add("bbs", ncrEncode(board))
    formBody.add("key", ncrEncode(threadKey))
    formBody.add("time", ncrEncode(time))
    formBody.add("FROM", ncrEncode(name))
    formBody.add("mail", ncrEncode(mail))
    formBody.add("MESSAGE", ncrEncode(message))
    formBody.add("submit", "書き込む")

    response = HTTP.POST(url, formBody,
        headers={"Referer": referer, "User-Agent": userAgent},
        cookies=cookieJar.load(url))

    cookieJar.save(url, response.cookies)

    // --- MonaTicket retry ---
    if isBrokenMonaTicket(response):
        cookieJar.clear(host)
        response = HTTP.POST(url, formBody, ...) // 再送信
        cookieJar.save(url, response.cookies)

    // --- Response parsing ---
    html = response.body.string()
    title = parseHtmlTitle(html)

    if title.contains("書きこみました"):
        resNum = response.header("x-resnum")
        return Success(resNum)

    if title.contains("書き込み確認"):
        hiddenParams = parseHiddenInputs(html)
        confirmationData = {html, hiddenParams}

        // --- Phase 2: 確認送信 ---
        formBody2 = FormBody(charset="Shift_JIS")
        for (key, value) in hiddenParams:
            formBody2.add(key, ncrEncode(value))
        formBody2.add("submit", "上記全てを承諾して書き込む")

        response2 = HTTP.POST(url, formBody2,
            headers={"Referer": referer, "User-Agent": userAgent},
            cookies=cookieJar.load(url))
        cookieJar.save(url, response2.cookies)

        html2 = response2.body.string()
        title2 = parseHtmlTitle(html2)
        if title2.contains("書きこみました"):
            return Success()
        else:
            return Error(html2)

    if title.contains("お茶でも"):
        return Error("サーバーが混み合っています。")

    if title.contains("ＥＲＲＯＲ"):
        return Error("書き込みエラー")

    return Error("不明なレスポンス")


function ncrEncode(input):
    encoder = ShiftJIS.newEncoder()
    result = ""
    for cluster in input.graphemeClusters():
        if encoder.canEncode(cluster):
            result += cluster
        else:
            for codePoint in cluster.codePoints():
                result += "&#" + codePoint + ";"
    return result


function isBrokenMonaTicket(response):
    headerHit = response.headers["x-chx-error"]
        .any(h => /Broken\s*MonaTicket/i.test(h))
    cookieHit = response.headers["set-cookie"]
        .any(h => h.startsWith("MonaTicket=") && h.contains("Expires="))
    return headerHit || cookieHit


function parseHiddenInputs(html):
    doc = Jsoup.parse(html)
    return doc.select("form input[type=hidden]")
        .map(el => {el.attr("name"): el.attr("value")})
        .filter(name != "")
```

---

## 付録B: HTTPリクエスト/レスポンスのサンプル

### 返信投稿 フェーズ1 リクエスト

```http
POST /test/bbs.cgi?guid=ON HTTP/1.1
Host: agree.5ch.net
User-Agent: Monazilla/1.00 (VBBB/1.0)
Referer: https://agree.5ch.net/test/read.cgi/operate/1234567890
Content-Type: application/x-www-form-urlencoded
Cookie: MonaTicket=xxxxxxxxxxxx

bbs=operate&key=1234567890&time=1708200000&FROM=&mail=sage&MESSAGE=%83e%83X%83g&submit=%8F%91%82%AB%8D%9E%82%DE
```

（注: 上記の `%83e%83X%83g` は「テスト」のShift_JISエンコード値）

### 成功レスポンス

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=Shift_JIS
x-resnum: 456

<html><head><title>書きこみました</title></head>
<body>書きこみが終わりました。</body></html>
```

### 確認画面レスポンス

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=Shift_JIS

<html><head><title>書き込み確認</title></head>
<body>
<form method="POST" action="/test/bbs.cgi?guid=ON">
<input type="hidden" name="bbs" value="operate">
<input type="hidden" name="key" value="1234567890">
<input type="hidden" name="time" value="1708200000">
<input type="hidden" name="FROM" value="">
<input type="hidden" name="mail" value="sage">
<input type="hidden" name="MESSAGE" value="テスト">
<input type="hidden" name="hana" value="mogera_XXXXXXXXX">
<input type="submit" name="submit" value="上記全てを承諾して書き込む">
</form>
</body></html>
```

### エラーレスポンス

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=Shift_JIS

<html><head><title>ＥＲＲＯＲ</title></head>
<body>ERROR: このスレッドには書き込めません。</body></html>
```

---

---

## 14. 他言語への移植ガイド

### 14.1 Slevoで使用しているライブラリとバージョン

| ライブラリ                  | バージョン | 用途                          |
| --------------------------- | ---------- | ----------------------------- |
| OkHttp                      | 4.12.0     | HTTP通信、Cookie管理          |
| OkHttp Logging Interceptor  | (同上)     | リクエスト/レスポンスログ     |
| Jsoup                       | 1.17.2     | HTML解析（レスポンスパース）  |
| Moshi                       | -          | Cookie のJSON永続化           |

### 14.2 言語別の実装ポイント

#### TypeScript / Node.js の場合

```typescript
// 1. CP932 エンコーディング: iconv-lite を使用
import * as iconv from 'iconv-lite';

function encodeFormBody(params: Record<string, string>): Buffer {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
        const encodedKey = percentEncodeCP932(key);
        const encodedValue = percentEncodeCP932(value);
        parts.push(`${encodedKey}=${encodedValue}`);
    }
    // 結果は ASCII 文字列なので UTF-8 Buffer で OK
    return Buffer.from(parts.join('&'), 'ascii');
}

function percentEncodeCP932(input: string): string {
    const bytes = iconv.encode(input, 'cp932');
    let result = '';
    for (const byte of bytes) {
        const c = String.fromCharCode(byte);
        // RFC 3986 unreserved + 数字 + 英字はそのまま
        if (/[A-Za-z0-9\-._~]/.test(c)) {
            result += c;
        } else if (byte === 0x20) {
            result += '+';  // スペースは + にエンコード ★重要
        } else {
            result += '%' + byte.toString(16).toUpperCase().padStart(2, '0');
        }
    }
    return result;
}

// 2. NCR変換
function replaceWithNCR(input: string): string {
    // Node.js では grapheme-splitter や Intl.Segmenter を使用
    const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });
    let result = '';
    for (const { segment } of segmenter.segment(input)) {
        if (iconv.encode(segment, 'cp932').toString('binary') ===
            iconv.decode(iconv.encode(segment, 'cp932'), 'cp932')) {
            // より正確: encode してから decode して一致するか確認
            try {
                iconv.encode(segment, 'cp932');
                result += segment;
            } catch {
                // エンコード失敗 → NCR
                for (const codePoint of [...segment]) {
                    const cp = codePoint.codePointAt(0)!;
                    result += `&#${cp};`;
                }
            }
        }
    }
    return result;
}

// 3. レスポンスデコード
const responseBuffer = await fetch(url, options).then(r => r.arrayBuffer());
const html = iconv.decode(Buffer.from(responseBuffer), 'cp932');
```

#### Python の場合

```python
import requests
from urllib.parse import quote

def encode_cp932_form(params: dict) -> bytes:
    """CP932 でフォームボディをエンコードする"""
    parts = []
    for key, value in params.items():
        encoded_key = percent_encode_cp932(key)
        encoded_value = percent_encode_cp932(value)
        parts.append(f"{encoded_key}={encoded_value}")
    return "&".join(parts).encode("ascii")

def percent_encode_cp932(s: str) -> str:
    """文字列を CP932 バイトに変換し、パーセントエンコーディングする"""
    cp932_bytes = s.encode("cp932")  # ★ "shift_jis" ではなく "cp932"
    result = []
    for byte in cp932_bytes:
        c = chr(byte)
        if c.isalnum() or c in "-._~":
            result.append(c)
        elif byte == 0x20:
            result.append("+")  # スペースは +
        else:
            result.append(f"%{byte:02X}")
    return "".join(result)

# レスポンスデコード
response = requests.post(url, data=body, headers=headers)
response.encoding = "cp932"  # ★ 明示的に指定
html = response.text
```

### 14.3 移植時の共通注意事項

1. **`Charset.forName("Shift_JIS")` = CP932 であることを忘れない**（セクション4.2参照）
2. **スペースは `+` にエンコード** — `%20` ではない
3. **Content-Type に charset を含めない** — `application/x-www-form-urlencoded` のみ
4. **グラフェムクラスタ分割** — JS は `Intl.Segmenter`、Python は `grapheme` ライブラリ等を使用
5. **Cookie は自動管理が理想** — requests の `Session`、fetch の `credentials: 'include'` 等
6. **レスポンスは CP932 でデコード** — UTF-8デコードだとtitle判定が壊れる
7. **テスト** — 最低でも「ASCII文字のみ」「日本語のみ」「絵文字混じり」「丸数字①」の4パターン

### 14.4 curlでの動作確認コマンド（デバッグ用）

フレームワークの問題かプロトコルの問題かを切り分けるために、curlで直接投稿を試す：

```bash
# フェーズ1: 返信投稿
curl -v \
  -X POST "https://agree.5ch.net/test/bbs.cgi?guid=ON" \
  -H "User-Agent: Monazilla/1.00 (VBBB/1.0)" \
  -H "Referer: https://agree.5ch.net/test/read.cgi/operate/1234567890" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -b cookies.txt -c cookies.txt \
  --data-binary "bbs=operate&key=1234567890&time=$(date +%s)&FROM=&mail=sage&MESSAGE=%83e%83X%83g&submit=%8F%91%82%AB%8D%9E%82%DE" \
  --output response.html

# レスポンスをCP932としてデコードして確認
iconv -f CP932 -t UTF-8 response.html
```

**注意:** `--data-binary` の値は事前に CP932 + パーセントエンコードした文字列。curl 自身はエンコーディングを行わないため、エンコード済みの値を渡す必要がある。

---

## 付録C: よくある失敗パターンと解決策

### パターン1: 「ERROR: クッキー確認！」

**原因:** Cookie を送信していない、または Cookie が期限切れ。
**解決:** Cookie の保存/送信を確認。投稿前に一度スレッドを表示してCookieを取得。

### パターン2: 文字化けして「不明なレスポンス」と判定される

**原因:** レスポンスボディを UTF-8 でデコードしている。
**解決:** CP932 でデコードする。`<title>` が `æ\x9B¸ãã"ã¿ã¾ã—ã` のような文字化けになっていたらデコードが間違っている。

### パターン3: フェーズ1で成功したのに書き込みが反映されない

**原因:** 実際はフェーズ1で「確認画面」が返されており、フェーズ2を送信していない。
**解決:** レスポンスHTMLの `<title>` を確認。`書き込み確認` なら hidden パラメータを再送信する。

### パターン4: 二重エンコードで全角文字が壊れる

**原因:** 手動で `URLEncoder.encode()` した後にフレームワークが再度エンコード。
**解決:** エンコードは1箇所だけで行う。フレームワークのエンコード機能を使うか、手動エンコードのみ。

### パターン5: 絵文字が `?` や `〓` に化ける

**原因:** NCR変換をせずに Shift_JIS エンコードを試みている。
**解決:** NCR変換を実装（セクション4.3〜4.4参照）。

### パターン6: `Broken MonaTicket` エラーが発生し続ける

**原因:** Cookieクリア後のリトライをしていない、またはクリア範囲が不足。
**解決:** 該当ホストのCookieを全クリアして再送信（セクション7参照）。

### パターン7: `Referer情報が変です。`

**原因:** Referer ヘッダの形式が間違っている。
**解決:** 返信の場合は `https://{host}/test/read.cgi/{board}/{threadKey}`（末尾にスラッシュなし）、スレ立ての場合は `https://{host}/test/read.cgi/{board}/`（末尾にスラッシュあり）。

---

> **このドキュメントの更新日:** 2026-02-17
> **ソース:** Slevo Android Project (Kotlin/OkHttp/Jetpack Compose)
> **使用ライブラリ:** OkHttp 4.12.0 / Jsoup 1.17.2
