# 汎用掲示板ブラウザ プロトコルリファレンス

> gikoNaviG2 ソースコード解析に基づく 2ch/5ch 系掲示板ブラウザの実装ガイド

> 実装時の規範仕様（MUST/SHOULD）、受け入れ基準、テストベクタは `docs/bbs-browser-implementation-contract.md` を併読してください。

## 目次

1. [データモデル](#1-データモデル)
2. [板一覧（BBS メニュー）の取得](#2-板一覧bbs-メニューの取得)
3. [スレッド一覧の取得](#3-スレッド一覧の取得)
4. [スレッド本文（DAT）の取得](#4-スレッド本文datの取得)
5. [レス書き込み（投稿）](#5-レス書き込み投稿)
6. [外部板プラグイン（したらば・まちBBS）](#6-外部板プラグインしたらばまちbbs)
7. [認証・セッション](#7-認証セッション)
8. [User-Agent](#8-user-agent)
9. [エンコーディング](#9-エンコーディング)
10. [ローカルファイル構造](#10-ローカルファイル構造)
11. [Cookie の永続化](#11-cookie-の永続化)
12. [補足：どんぐりシステム](#12-補足どんぐりシステム)

---

## 1. データモデル

### 階層構造

```
BBS (板一覧ファイル)
 └── Category (カテゴリ)
      └── Board (板)
           └── ThreadItem (スレッド)
                └── Res (レス/レスポンス) ← DATファイルの各行
```

### 主要レコード型

#### TSubjectRec — subject.txt 1行分

| フィールド  | 型      | 説明                        |
|-------------|---------|---------------------------|
| FFileName   | string  | DATファイル名（例: `1234567890.dat`） |
| FTitle      | string  | スレッドタイトル              |
| FCount      | Integer | レス数                       |

#### TResRec — DAT 1行分（1レス）

| フィールド  | 型      | 説明                             |
|-------------|---------|--------------------------------|
| FName       | string  | 投稿者名（HTML含む）              |
| FMailTo     | string  | メール欄（`sage` 等）             |
| FDateTime   | string  | 日時 + ID 文字列                  |
| FBody       | string  | 本文（HTML含む）                  |
| FTitle      | string  | スレッドタイトル（1レス目のみ）     |

#### TIndexRec — ローカルインデックス (Folder.idx) 1行分

| フィールド     | 型         | 説明                    |
|----------------|------------|------------------------|
| FNo            | Integer    | 表示順序番号             |
| FFileName      | string     | DATファイル名            |
| FTitle         | string     | スレッドタイトル          |
| FCount         | Integer    | 取得済みレス数            |
| FSize          | Integer    | DATファイルサイズ(bytes)  |
| FRoundDate     | TDateTime  | 巡回日時                 |
| FLastModified  | TDateTime  | サーバーの Last-Modified  |
| FKokomade      | Integer    | 「ここまで読んだ」位置    |
| FNewReceive    | Integer    | 新着受信開始レス番号      |
| FUnRead        | Boolean    | 未読フラグ               |
| FScrollTop     | Integer    | スクロール位置            |
| FAllResCount   | Integer    | サーバー上の総レス数      |
| FNewResCount   | Integer    | 新着レス数               |
| FAgeSage       | Enum       | Age/Sage/New/Archive 状態 |

---

## 2. 板一覧（BBS メニュー）の取得

### 2.1 板一覧の配信元

板一覧は HTML 形式で配信される。ギコナビでは以下の URL から取得可能：

```
https://menu.5ch.net/bbsmenu.html
https://menu.2ch.sc/bbsmenu.html
```

### 2.2 HTML のパース

板一覧 HTML の構造：

```html
<b>カテゴリ名</b>
<a href=https://server.5ch.net/board/>板タイトル</a>
<a href=https://server.5ch.net/board2/>板タイトル2</a>
<b>次のカテゴリ名</b>
...
```

**パースアルゴリズム:**

1. 前処理: `<B>` `<BR>` `</B>` `<A HREF` `</A` を小文字に正規化
2. ループで `<b>` と `<a` の出現位置を比較:
   - `<b>` が先 → カテゴリ名として `<b>...</b>` 内のテキストを取得
   - `<a` が先 → 板リンクとして `<a href=URL>タイトル</a>` を取得
3. カテゴリ名が無視リストに含まれる場合はスキップ
4. 板 URL の補正: `.2ch.net/` → `.5ch.net/`、`/saku/` → `/saku2ch/`
5. 結果を INI 形式で保存

**デフォルトの無視カテゴリ例:** `おすすめ`, `あらかると`, `その他`, `その他のサイト` など

### 2.3 ローカル保存形式（INI形式）

パース後は INI 形式でローカルに保存される：

```ini
[ニュース]
ニュース速報+=https://news.5ch.net/newsplus/
芸スポ速報+=https://news.5ch.net/mnewsplus/

[生活]
料理=https://cooking.5ch.net/cook/
```

- **セクション** = カテゴリ名
- **キー** = 板タイトル
- **値** = 板 URL（末尾 `/` あり）

### 2.4 Board URL から導出される情報

```
https://agree.5ch.net/operate/
         ^^^^^^^^       ^^^^^^^
         ホスト名       BBSID
```

- **BBSID**: URL の最後のパスセグメント（末尾 `/` を除去後の最終 `/` 以降）
- **UrlToServer**: URL から最後のパスセグメントを除去した部分  
  例: `https://agree.5ch.net/operate/` → `https://agree.5ch.net/`

### 2.5 スレッド URL（read.cgi）の構築

スレッド URL は板の種類によって形式が異なる：

**5ch/2ch 板 (PATH_INFO 形式):**

```
{UrlToServer(Board.URL)}test/read.cgi/{BBSID}/{ThreadID}/l50
例: https://agree.5ch.net/test/read.cgi/operate/1689062903/l50
```

**外部板 (QUERY_STRING 形式):**

```
{UrlToServer(Board.URL)}test/read.cgi?bbs={BBSID}&key={ThreadID}&ls=50
例: https://xxx.example.com/test/read.cgi?bbs=operate&key=1689062903&ls=50
```

- `ThreadID` = DAT ファイル名から `.dat` を除去した数字列
- `l50` / `ls=50` = 末尾50レス表示（デフォルトビュー）

### 2.6 DAT ファイル名とスレッド ID の関係

5ch/2ch において **DAT ファイル名の数字部分 = スレッド ID = スレッド作成時の Unix タイムスタンプ（秒）** という関係がある。

```
1689062903.dat
^^^^^^^^^^
Unix タイムスタンプ (2023-07-11 12:08:23 UTC)
```

- この数字からスレッド作成日時を算出できる（`UnixToDateTime(timestamp) + UTC offset`）
- 旧形式では `1032678843_1.dat` のようにアンダースコア＋連番が付く場合がある
- JBBS/したらば系でも数字部分は Unix タイムスタンプ

### 2.7 URL の正規化 (Regulate2chURL)

- `http://` → `https://`
- `.2ch.net/` → `.5ch.net/`
- itest URL (`https://itest.5ch.net/xxx/test/read.cgi/board/key/`) → PC URL に変換

---

## 3. スレッド一覧の取得

### 3.1 リクエスト

```
GET {Board.URL}subject.txt
```

**例:**

```
GET https://agree.5ch.net/operate/subject.txt
```

**HTTPヘッダ:**

| ヘッダ            | 値                                           |
|-------------------|----------------------------------------------|
| User-Agent        | `Monazilla/1.00 gikoNavi/beta75/1.75.0.887`  |
| Cache-Control     | `no-cache`                                   |
| Pragma            | `no-cache`                                   |
| Accept-Encoding   | `gzip`（差分取得でない場合）                   |
| If-Modified-Since | 前回取得時の Last-Modified（条件付きGET）       |

### 3.2 subject.txt のフォーマット

1行1スレッド。区切り文字は `<>`。

```
1234567890.dat<>スレッドタイトル (123)
1234567891.dat<>別のスレッド (456)
```

**パース手順:**

1. `<>` が含まれない場合は `,` をデリミタとして使用（旧形式）
2. 1番目のトークン → `FileName`（DATファイル名）
3. 2番目のトークン → タイトル＋レス数
4. タイトル末尾の `(数字)` / `（数字）` / `<数字>` → レス数を抽出
5. レス数部分を除去した残り → スレッドタイトル

### 3.3 レスポンス処理

- **200**: subject.txt の全文を受信。ローカルのスレッドリストと比較して Age/Sage/New/Archive を判定。
- **304 Not Modified**: 変更なし。ローカルキャッシュを使用。

### 3.4 Age/Sage/New/Archive の判定アルゴリズム

新しい subject.txt を受信したとき、ローカルに保持している既存スレッドリストと比較して各スレッドの状態を決定する：

```
新 subject.txt の各行について:
  既存リストからファイル名で検索 → index

  if index == -1 (未知のスレッド):
    AgeSage = New（新規スレッド）

  else (既知のスレッド):
    if 既存の表示順序番号 > 現在の処理カウンタ:
      AgeSage = Age（スレッドが上がった = 新規書き込みで浮上）

    else if 既存のレス数 < 新しいレス数:
      AgeSage = Sage（レス増だが順位は下がった = sage 書き込み）

    else:
      AgeSage = None（変化なし）

旧 subject.txt にあったが新にないスレッド:
  → DAT落ち（Archive）として扱う
```

**判定の核心:** 「スレッドの順位が上がった」= Age、「レスは増えたが順位は上がらない」= Sage。これは 2ch 系掲示板の「sage メール欄でスレッドが浮上しない」仕様に対応する。

---

## 4. スレッド本文（DAT）の取得

### 4.1 DAT URL

```
{Board.URL}dat/{ThreadID}.dat
```

**例:**

```
https://agree.5ch.net/operate/dat/1689062903.dat
```

### 4.2 差分取得（Range リクエスト）

既にローカルにDATファイルが存在する場合、差分のみ取得する。

**重要:** 差分取得では、サーバーサイドあぼーん（サーバー側でレスが削除/変更された場合）を検出するため、**末尾16バイトの重複チェック**を行う。

```
ADJUST_MARGIN = 16

Range: bytes={既存ファイルサイズ - ADJUST_MARGIN}-
```

つまり、既存ファイルの末尾16バイトを重複させてリクエストする。

**HTTPヘッダ（差分取得時）:**

| ヘッダ            | 値                                                    |
|-------------------|-------------------------------------------------------|
| User-Agent        | Monazilla 文字列                                       |
| Cache-Control     | `no-cache`                                            |
| Pragma            | `no-cache`                                            |
| If-Modified-Since | 前回の Last-Modified                                   |
| Range             | `bytes={size - 16}-`（16バイト重複させる）               |

**注意:** Range 使用時は `Accept-Encoding: gzip` を送らない。

### 4.3 レスポンス処理

| ステータス | 処理                                                          |
|-----------|--------------------------------------------------------------|
| 200       | 全文取得。ローカルファイルを上書き                              |
| 206       | 差分取得。重複チェック後に追記（後述）                          |
| 302       | DAT落ち。過去ログURL (kako) にフォールバック                   |
| 304       | 変更なし                                                     |
| 416       | Range不正。全文再取得                                         |

### 4.4 差分取得（206）の重複チェックとマージ

**サーバーサイドあぼーん検出:**

```
1. レスポンスの先頭16バイトと、ローカルファイルの末尾16バイトを比較
2. 一致 → 正常な差分
   - レスポンスから先頭16バイト（重複部分）を除去
   - 残りをローカルファイルに追記
3. 不一致 → サーバーサイドあぼーん検出
   - ローカルファイルの整合性が崩れているため、全文を再取得
   - Range なしで再度 GET リクエスト
```

**補足:** ローカルファイルの末尾16バイトを読む際、CR (`\r`) は除去してから比較する。

### 4.5 過去ログ URL (kako)

スレッドIDの桁数によって URL パターンが異なる：

**9桁以下:**
```
{Board.URL}kako/{先頭3文字}/{ThreadID}.dat.gz
例: https://agree.5ch.net/operate/kako/168/168906290.dat.gz
```

**10桁以上:**
```
{Board.URL}kako/{先頭4文字}/{先頭5文字}/{ThreadID}.dat.gz
例: https://agree.5ch.net/operate/kako/1689/16890/1689062903.dat.gz
```

旧サーバー（`piza.`, `www.bbspink.`, `tako.`）は `.dat` のみ（gzip なし）。

### 4.6 Oyster / UPLIFT 経由

有料会員の場合、過去ログを取得可能：

```
{Board.URL の base}/oyster/{先頭4文字}/{ThreadID}.dat?sid={SessionID}
例: https://agree.5ch.net/operate/oyster/1689/1689062903.dat?sid=xxxxx
```

### 4.7 DAT フォーマット（1行 = 1レス）

```
名前<>メール<>日時 ID<>本文<>スレッドタイトル
```

**パース手順（DivideStrLine）:**

1. `<>` デリミタの存在を確認
2. `<>` がない場合は旧形式（`,` 区切り）にフォールバック:
   - `<>` → `&lt;&gt;` にエスケープ
   - `,` → `<>` に変換
   - 全角カンマ → `,` に戻す
3. `RemoveToken` で順に抽出:
   - 1番目: `FName`（名前）
   - 2番目: `FMailTo`（メール）
   - 3番目: `FDateTime`（日時・ID）
   - 4番目: `FBody`（本文）
   - 5番目: `FTitle`（スレタイ、通常1レス目のみ）
4. 本文の先頭空白を除去
5. 本文が空の場合は `&nbsp;` を設定

**DAT 1行の具体例:**

```
名無しさん<>sage<>2024/01/15(月) 12:34:56.78 ID:AbCdEfGh0<>本文テキスト <br> 改行はbrタグ<>
```

- 1レス目のみ5番目のフィールドにスレッドタイトルが入る
- 本文中の改行は `<br>` タグ
- アンカーリンク: `&gt;&gt;123` 形式

---

## 5. レス書き込み（投稿）

### 5.1 送信先 URL

**5ch/2ch 板（レス投稿・新規スレッド作成共通）:**
```
{UrlToServer(Board.URL)}test/bbs.cgi
例: https://agree.5ch.net/test/bbs.cgi
```

**外部板（subbbs.cgi を使用）:**
```
{UrlToServer(Board.URL)}test/subbbs.cgi
```

### 5.2 HTTPヘッダ

| ヘッダ           | 値                                                        |
|------------------|-----------------------------------------------------------|
| Content-Type     | `application/x-www-form-urlencoded` または `application/x-www-form-urlencoded; charset=UTF-8` |
| Referer          | 新規スレ: `{server}/test/bbs.cgi` / レス: スレッドURL      |
| Pragma           | `no-cache`                                                |
| Accept-Language  | `ja`                                                      |
| User-Agent       | Monazilla 文字列                                           |
| Cookie           | 後述のCookie群                                              |

### 5.3 POST パラメータ

**レス投稿:**

```
sid={SessionID}&FROM={名前}&mail={メール}&MESSAGE={本文}&bbs={BBSID}&time={タイムスタンプ}&key={スレッドID}&submit={書き込む}
```

**新規スレッド作成:**

```
sid={SessionID}&FROM={名前}&mail={メール}&MESSAGE={本文}&bbs={BBSID}&time={タイムスタンプ}&subject={スレッドタイトル}&submit={全責任を負うことを了承して書き込む}
```

| パラメータ | 説明                                                                |
|-----------|-------------------------------------------------------------------|
| `sid`     | UPLIFT セッションID（ログイン時のみ、省略可）                        |
| `FROM`    | 投稿者名                                                          |
| `mail`    | メール欄（`sage` 等）                                              |
| `MESSAGE` | 本文                                                              |
| `bbs`     | BBSID（板URL末尾のパスセグメント）                                   |
| `time`    | Unixタイムスタンプ（マシン時刻 or 板の最終取得時刻）                  |
| `key`     | スレッドID（DATファイル名から `.dat` を除去した数字列）               |
| `subject` | スレッドタイトル（新規スレ作成時のみ）                                |
| `submit`  | 送信ボタンテキスト（`書き込む` or `全責任を負うことを了承して書き込む`）  |
| `oekaki`  | お絵かきデータ（Base64 PNG、任意）                                   |

### 5.4 time パラメータの算出

`time` パラメータは Unix タイムスタンプ（秒）で、以下のいずれかの方法で算出：

**方法1: マシン時刻を使用する場合（推奨）:**

```
time = DateTimeToUnix(Now) - (9 * 60 * 60) + Adjust
```

- `-9時間`: Delphi の `Now` はローカル時刻（JST = UTC+9）のため、UTC に変換
- `Adjust`: 時刻補正値（秒）。オプション
- **注意:** 現代の実装では `DateTimeToUnix(NowUTC)` 等で直接 UTC Unix タイムスタンプを取得すればよい

**方法2: 板の最終取得時刻を使用する場合:**

```
time = DateTimeToUnix(Board.LastGetTime)
```

- 板の subject.txt や DAT を最後に取得した時刻をそのまま使用

### 5.5 エンコーディングと HttpEncode

**HttpEncode のルール（パーセントエンコーディング）:**

| 文字                                    | 処理           |
|----------------------------------------|----------------|
| `0-9`, `a-z`, `A-Z`, `*`, `-`, `.`, `@`, `_` | そのまま（エンコードしない） |
| それ以外の全バイト                        | `%XX`（大文字16進数） |

**Shift_JIS モード:**
1. 各パラメータ値を Shift_JIS バイト列に変換
2. 各バイトに対して HttpEncode を適用

**UTF-8 モード（5ch + Unicode 設定時）:**
1. 各パラメータ値を UTF-8 バイト列に変換
2. 各バイトに対して HttpEncode を適用
3. Content-Type に `charset=UTF-8` を付与

### 5.6 レスポンス判定 (GetResultType)

サーバーからの HTML レスポンスを文字列マッチングで判定：

| 判定結果       | 判定文字列（主なもの）                                    | 処理                   |
|---------------|--------------------------------------------------------|----------------------|
| `grtOK`       | `書きこみが終わりました`                                  | 投稿成功              |
| `grtCookie`   | `クッキーがないか期限切れです` / `クッキー確認！`          | Cookie 再設定後リトライ |
| `grtCheck`    | `書き込み確認します` / `内容確認` / `書き込みチェック！`    | 確認画面。同意後リトライ |
| `grtDonguri`  | `どんぐりを埋めました`                                    | どんぐり消費。再投稿不可 |
| `grtDngBroken`| `broken_acorn` / `[1044]` / `[1045]`                    | どんぐりCookie破損      |
| `grtNinpou`   | `忍法の認法を新規作成します`                              | 忍法帖作成（引き直し）  |
| `grtSuiton`   | `Lv=0` / `殺されました`                                  | 水遁（忍法帖リセット）  |
| `grtError`    | 上記いずれにも該当しない                                   | エラー               |

### 5.7 確認画面 (grtCookie / grtCheck) の処理フロー

1. レスポンスHTML中の `<input type=hidden>` タグをすべて抽出
2. `name` / `value` ペアを取得（`subject`, `from`, `mail`, `message`, `bbs`, `time`, `key` は除外）
3. 取得した hidden パラメータを Cookie として `Board.Cookie` に保存
4. `Send(Board.Cookie, Board.SPID, Board.PON, False)` で再送信

### 5.8 Cookie 構成

投稿時に送信される主な Cookie：

| Cookie名     | 説明                                     |
|-------------|------------------------------------------|
| `acorn`     | どんぐりCookie                             |
| `sid`       | UPLIFT セッションID                        |
| `DMDM`      | Be ログインCookie 1                        |
| `MDMD`      | Be ログインCookie 2                        |
| `SPID`      | 確認画面から取得                            |
| `PON`       | 確認画面から取得                            |
| (その他)    | `FixedCookie` 設定値、`Bouken`（冒険の書）   |

---

## 6. 外部板プラグイン（したらば・まちBBS）

### 6.1 したらば (Shitaraba)

#### URL パターン

| 操作           | URL                                            |
|---------------|------------------------------------------------|
| subject.txt   | `{host}/bbs/{bbs}/subject.txt`                 |
| スレッド読込   | `{host}/bbs/read.cgi?key={key}&bbs={bbs}`      |
| DAT取得        | `{host}/bbs/{bbs}/dat/{key}.dat`               |
| 書き込み       | `http://cgi.shitaraba.com/cgi-bin/bbs.cgi`     |

#### 書き込みパラメータ

| パラメータ | 説明                    | エンコーディング |
|-----------|------------------------|----------------|
| `FROM`    | 投稿者名                | EUC-JP         |
| `mail`    | メール欄                | EUC-JP         |
| `MESSAGE` | 本文                    | EUC-JP         |
| `BBS`     | 板ID（URLの `?bbs=` から） | EUC-JP      |
| `KEY`     | スレッドID              | EUC-JP         |
| `submit`  | `書き込む`              | EUC-JP         |

新規スレッド作成時は `subject` パラメータを追加、`submit` = `新規スレッド作成`。

### 6.2 したらば JBBS (まちBBS)

#### ホスト名

| 定数              | 値                         | 備考         |
|------------------|---------------------------|-------------|
| BBS_HOST（現行）   | `jbbs.shitaraba.net`      | 現在のホスト  |
| BBS_HOST_OLD      | `jbbs.shitaraba.com`      | 旧ホスト     |
| BBS_HOST_OLD2     | `jbbs.livedoor.com`       | 旧ホスト     |
| BBS_HOST_OLD3     | `jbbs.livedoor.jp`        | 旧ホスト     |

旧ホストの URL は現行ホスト (`jbbs.shitaraba.net`) に読み替えて処理する。

#### URL パターン

| 操作           | URL                                                       |
|---------------|-----------------------------------------------------------|
| subject.txt   | `https://{host}/{dir}/{bbs}/subject.txt`                  |
| スレッド読込   | `https://{host}/bbs/read.cgi/{dir}/{bbs}/{key}/l100`      |
| RAW DAT取得    | `https://{host}/bbs/rawmode.cgi/{dir}/{bbs}/{key}/`       |
| 差分取得       | `https://{host}/bbs/rawmode.cgi/{dir}/{bbs}/{key}/{既存レス数+1}-` |
| 過去ログ        | `https://{host}/bbs/read_archive.cgi/{dir}/{bbs}/{key}/` |
| 書き込み       | `https://{host}/bbs/write.cgi/{dir}/{bbs}/{key}/`         |
| 新規スレッド    | `https://{host}/bbs/write.cgi/{dir}/{bbs}/new/`          |

#### JBBS の DAT フォーマット

**重要:** JBBS の `rawmode.cgi` が返すのは 2ch 形式の DAT ではなく HTML 形式。クライアント側で DAT 形式に変換する必要がある。

変換後の DAT 1行フォーマット（2ch とは異なる。7フィールド）:

```
レス番号<>名前<>メール<>日時<>本文<>スレッドタイトル<>ID
```

- 2ch の DAT が5フィールドなのに対し、JBBS は先頭に「レス番号」、末尾に「ID」が追加された7フィールド
- レスが歯抜け（あぼーんによる欠番）になる場合がある

#### 書き込みパラメータ

| パラメータ | 説明                    | エンコーディング |
|-----------|------------------------|----------------|
| `NAME`    | 投稿者名                | EUC-JP         |
| `MAIL`    | メール欄                | EUC-JP         |
| `MESSAGE` | 本文                    | EUC-JP         |
| `BBS`     | 板ID                   | —              |
| `KEY`     | スレッドID              | —              |
| `DIR`     | ディレクトリ             | —              |
| `TIME`    | Unixタイムスタンプ       | —              |
| `submit`  | `書き込む` / `新規書き込み` | EUC-JP       |

---

## 7. 認証・セッション

### 7.1 UPLIFT (5ch 有料会員)

**ログイン:**

```
POST https://uplift.5ch.net/log
Content-Type: application/x-www-form-urlencoded
Referer: https://uplift.5ch.net/login

usr={UserID}&pwd={Password}&log=
```

- レスポンスから `sid` Cookie を取得
- セッションIDは `{UserAgent}:{SessionValue}` 形式で保持
- UPLIFT有効時、過去ログ取得に `?sid={SessionID}` を付与

### 7.2 Be ログイン

- Cookie: `DMDM`, `MDMD`
- 投稿時にヘッダに付与

### 7.3 冒険の書 (Bouken)

- 板のドメインごとに管理される Cookie
- 水遁 (`grtSuiton`) 時にクリアされる

---

## 8. User-Agent

**フォーマット:**

```
Monazilla/1.00 gikoNavi/beta{バージョン番号}/{ファイルバージョン}
```

**例:**

```
Monazilla/1.00 gikoNavi/beta75/1.75.1.911
```

- `Monazilla/1.00` は 2ch 系ブラウザの共通識別子
- 2ch/5ch サーバーは `Monazilla` を User-Agent に含まないリクエストを拒否する場合がある

---

## 9. エンコーディング

### 掲示板システム別エンコーディング

| 掲示板        | 読み込み    | 書き込み              |
|--------------|-----------|----------------------|
| 5ch/2ch      | Shift_JIS | Shift_JIS or UTF-8   |
| したらば       | Shift_JIS | EUC-JP              |
| まちBBS (JBBS)| EUC-JP   | EUC-JP               |

### 変換関数

| 変換                 | 実装方法                                         |
|---------------------|------------------------------------------------|
| EUC-JP ↔ Shift_JIS | `Mlang.DLL` の `ConvertINetString`（51932 ↔ 932）|
| UTF-8 → Shift_JIS   | `MultiByteToWideChar` + `WideCharToMultiByte`    |
| URL エンコード        | `HttpEncode()`（パーセントエンコーディング）        |

### Sanitize / UnSanitize（Folder.idx のタイトル保存用）

Folder.idx にスレッドタイトルを保存する際の HTML エンティティ変換：

| 関数        | 変換                                       |
|------------|-------------------------------------------|
| Sanitize   | `&` → `&amp;`、`"` → `&quot;`            |
| UnSanitize | `&quot;` → `"`、`&amp;` → `&`（この順序） |

**UnSanitize の順序が重要:** `&quot;` を先に変換してから `&amp;` を変換する。逆にすると `&amp;quot;` が誤って `"` に変換されてしまう。

---

## 10. ローカルファイル構造

### ディレクトリ構成

```
{LogFolder}/
├── 2ch/                          ← 5ch/2ch 板
│   └── {BBSID}/                  ← 板ごとのフォルダ
│       ├── subject.txt           ← サーバーから取得した subject.txt
│       ├── Folder.idx            ← ローカルインデックス
│       ├── Folder.ini            ← 板設定
│       ├── 1234567890.dat        ← スレッド DAT ファイル
│       └── 1234567890.dat.tmp    ← スレッドメタデータ (INI形式)
└── exboard/                      ← 外部板
    └── {host}/
        └── {BBSID}/
            ├── subject.txt
            ├── Folder.idx
            └── *.dat
```

### Folder.idx フォーマット

1行目: バージョン（`1.01`）  
2行目以降: 0x01 バイト（制御文字 SOH）区切り。数値フィールドは16進数文字列。

```
1.01
{No}<SOH>{FileName}<SOH>{Title}<SOH>{Count}<SOH>{Size}<SOH>{RoundDate}<SOH>{LastModified}<SOH>{Kokomade}<SOH>{NewReceive}<SOH>{未使用}<SOH>{UnRead}<SOH>{ScrollTop}<SOH>{AllResCount}<SOH>{NewResCount}<SOH>{AgeSage}
```

（`<SOH>` = 0x01 バイト、上記の `#1` は便宜上の表記）

**フィールドの型:**

| フィールド     | 型           | 16進数 | 備考                                    |
|--------------|-------------|--------|----------------------------------------|
| No           | Integer     | ✓     | 表示順序                                 |
| FileName     | string      | ×     | `1234567890.dat` 形式                    |
| Title        | string      | ×     | Sanitize 済み（`&` → `&amp;`, `"` → `&quot;`） |
| Count        | Integer     | ✓     | 取得済みレス数                            |
| Size         | Integer     | ✓     | ファイルサイズ (bytes)                     |
| RoundDate    | DateTime→Int| ✓     | 巡回日時の整数表現                        |
| LastModified | DateTime→Int| ✓     | Last-Modified の整数表現                  |
| Kokomade     | Integer     | ✓     | ここまで読んだ位置。未設定時は `-1` (= `ffffffff`) |
| NewReceive   | Integer     | ✓     | 新着開始レス番号                          |
| 未使用        | string      | ×     | 常に `0`                                |
| UnRead       | Integer     | ✓     | 未読: `1` / 既読: `0`                   |
| ScrollTop    | Integer     | ✓     | スクロール位置                            |
| AllResCount  | Integer     | ✓     | サーバー上の総レス数                      |
| NewResCount  | Integer     | ✓     | 新着レス数                               |
| AgeSage      | Integer     | ✓     | 0:None / 1:Age / 2:Sage / 3:New / 4:Archive |

**実際の例（0x01 を `^A` で表記）:**

```
1.01
1^A1689062903.dat^Aテストスレッド^A64^Aa00^A25569^A25569^Affffffff^A0^A0^A0^A0^A64^A0^A0
```

- `1` = No（16進で1）
- `64` = Count 100（16進で64 = 10進100）
- `a00` = Size 2560（16進で0xa00 = 10進2560）
- `25569` = RoundDate（ZERO_DATE = 25569 はデフォルト値）
- `ffffffff` = Kokomade -1（未設定）

### 板一覧ファイル

| ファイル        | 説明                     |
|---------------|--------------------------|
| `board.2ch`   | デフォルト板一覧（INI形式） |
| `custom.2ch`  | カスタム板一覧             |

### 巡回データ

| ファイル            | 説明               |
|--------------------|--------------------|
| `RoundBoard.2ch`   | 巡回板リスト         |
| `RoundItem.2ch`    | 巡回スレッドリスト    |

フォーマット（`#1` = 0x01 区切り）:

```
2.00
{URL}#1{BoardTitle}#1{RoundName}
```

```
2.00
{URL}#1{BoardTitle}#1{FileName}#1{ThreadTitle}#1{RoundName}
```

---

## 11. Cookie の永続化

### 11.1 保存ファイル

**パス:** `{ConfigDir}/GikoNavi.cookies`

### 11.2 フォーマット

1行1Cookie。Netscape/HTTP Cookie 形式：

```
CookieName=CookieValue; Domain=.5ch.net; Path=/; Expires=...
```

### 11.3 保存ルール

- 有効期限切れの Cookie は保存しない
- UPLIFT セッション Cookie (`sid`) は永続化しない（セッション限り）
- 読み込み時は `Domain` と `Path` から URI を再構築して Cookie ストアに追加

---

## 12. 補足：どんぐりシステム

5ch のスパム対策システム。投稿にはどんぐり（acorn）Cookie が必要。

### 関連 URL

| 操作       | URL                                |
|-----------|------------------------------------|
| トップ     | `https://donguri.5ch.net/`        |
| 認証       | `https://donguri.5ch.net/auth`    |
| ログイン   | `https://donguri.5ch.net/login`   |
| 登録       | `https://donguri.5ch.net/register`|

### Cookie

- Cookie名: `acorn`
- 投稿時に自動的にヘッダに付与される
- 投稿者名に「どんぐり」を含む場合にどんぐりモードが有効化される

### エラーパターン

- `どんぐりを埋めました` → どんぐり消費（実が出るまで待つ必要あり）
- `broken_acorn` / `[1044]` / `[1045]` / `[0088]` → Cookie 破損、再取得が必要

---

## 付録：全体フロー図

```
┌────────────────────────────────────────────────────────┐
│                   板一覧取得                             │
│  GET bbsmenu.html → HTML パース → INI 保存              │
│  [Category] → Board.Title = Board.URL                   │
└──────────────────────┬─────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────┐
│               スレッド一覧取得                           │
│  GET {Board.URL}subject.txt                             │
│  ヘッダ: User-Agent, If-Modified-Since, Accept-Encoding │
│  パース: FileName<>Title (Count)                        │
│  保存: subject.txt + Folder.idx 更新                    │
└──────────────────────┬─────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────┐
│                スレッド本文取得                          │
│  GET {Board.URL}dat/{ThreadID}.dat                      │
│  差分: Range: bytes={size-16}- (16バイト重複チェック)     │
│  フォールバック: kako → oyster                           │
│  DAT: 名前<>メール<>日時ID<>本文<>スレタイ               │
│  保存: {BBSID}/{ThreadID}.dat                           │
└──────────────────────┬─────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────┐
│                  レス書き込み                            │
│  POST {server}/test/bbs.cgi                             │
│  Content-Type: application/x-www-form-urlencoded        │
│  Body: FROM=&mail=&MESSAGE=&bbs=&time=&key=&submit=     │
│  Cookie: acorn, sid, DMDM, MDMD, ...                   │
│                                                         │
│  レスポンス判定:                                         │
│  ├─ 書きこみが終わりました → 成功                       │
│  ├─ クッキー確認 → hidden取得 → リトライ                │
│  ├─ 書き込み確認 → 同意 → リトライ                      │
│  ├─ どんぐり → 待機                                     │
│  └─ ERROR → エラー表示                                  │
└────────────────────────────────────────────────────────┘
```

---

## 参考：ソースファイル対応表

| 機能               | ソースファイル         | 主要関数/クラス                           |
|-------------------|---------------------|-----------------------------------------|
| データモデル        | `BoardGroup.pas`    | `TBBS`, `TCategory`, `TBoard`, `TThreadItem` |
| 板一覧読込         | `GikoSystem.pas`    | `ReadBoardFile`                          |
| 板一覧ダウンロード   | `NewBoard.pas`     | `BoardDownload`, `UpdateURL`             |
| スレッド一覧読込    | `GikoSystem.pas`    | `ReadSubjectFile`, `DivideSubject`       |
| DAT パース         | `HTMLCreate.pas`    | `DivideStrLine`                          |
| ダウンロード制御    | `ThreadControl.pas` | `TThreadControl`, `TDownloadThread`      |
| HTTP 通信          | `ItemDownload.pas`  | `DatDownload`, `SaveListFile`, `SaveItemFile` |
| 書き込み           | `Editor.pas`        | `Send`, `GetSendData`, `GetResultType`   |
| HTTP クライアント   | `IndyModule.pas`    | `TIndyMdl`, `InitHTTP`                  |
| 外部板プラグイン    | `res/ExternalBoardPlugIn/` | `ShitarabaPlugIn`, `ShitarabaJBBSPlugIn` |
| 5ch セッション     | `DmSession5ch.pas`  | UPLIFT ログイン                          |
| どんぐり           | `DonguriSystem.pas` | `TDonguriSys`                           |
| URL ユーティリティ  | `GikoSystem.pas`    | `UrlToServer`, `UrlToID`, `Regulate2chURL`, `GetActualURL` |
| 文字列ユーティリティ | `MojuUtils.pas`    | `RemoveToken`, `Sanitize`, `UnSanitize`  |
| 文字コード変換      | `Y_TextConverter.pas` | `EUCtoSJIS`, `SJIStoEUC`              |
| 設定               | `Setting.pas`       | `TSetting`                              |
| ローカルインデックス | `GikoSystem.pas`   | `ParseIndexLine`, `WriteThreadDat`       |
