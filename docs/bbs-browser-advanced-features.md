# 汎用掲示板ブラウザ 追加機能リファレンス

> gikoNaviG2 ソースコード解析に基づく、ブラウザ運用上クリティカルな追加機能

> 実装時の規範仕様（MUST/SHOULD）、受け入れ基準、テストベクタは `docs/bbs-browser-implementation-contract.md` を併読してください。

## 目次

1. [あぼーん（NG フィルタリング）](#1-あぼーんng-フィルタリング)
2. [スキン／テンプレートシステム](#2-スキンテンプレートシステム)
3. [レスアンカーとポップアップ](#3-レスアンカーとポップアップ)
4. [お気に入り](#4-お気に入り)
5. [Samba タイマー（連投規制）](#5-samba-タイマー連投規制)
6. [コテハン（固定ハンドル）](#6-コテハン固定ハンドル)
7. [プロキシ設定](#7-プロキシ設定)
8. [DAT 置換システム](#8-dat-置換システム)
9. [スレッド検索](#9-スレッド検索)
10. [URL パース](#10-url-パース)
11. [板 URL 移転対応](#11-板-url-移転対応)
12. [Be ログイン](#12-be-ログイン)
13. [外部プレビュー／画像プレビュー](#13-外部プレビュー画像プレビュー)
14. [板設定 (SETTING.TXT)](#14-板設定-settingtxt)

---

## 1. あぼーん（NG フィルタリング）

投稿を非表示・置換するフィルタリングシステム。掲示板ブラウザの必須機能。

### 1.1 NG ルールファイル

**ディレクトリ:** `{ConfigDir}/NGwords/`

| ファイル          | 説明                         |
|------------------|------------------------------|
| `NGwords.list`   | NG ファイルの一覧（複数切替可） |
| `NGword.txt`     | デフォルト NG ルールファイル    |

**NGwords.list 形式:**

```
表示名=ファイル名
```

```
一般=NGword.txt
ニュース板=NGword_news.txt
```

### 1.2 NGword.txt 行フォーマット

タブ区切り。各行が1つの NG ルール。

```
[TAB][{{REGEXP}}TAB|{{REGEX2}}TAB][{{THREAD:boardID/threadID}}TAB|{{BOARD:boardID}}TAB]トークン1[TABトークン2]...
```

| 要素              | 意味                                                  |
|-------------------|------------------------------------------------------|
| 先頭の `TAB`       | あり → 透明あぼーん、なし → 通常あぼーん               |
| `{{REGEXP}}`      | bmRegExp（AWK 互換正規表現）を使用                     |
| `{{REGEX2}}`      | SkRegExp（Perl 5.14 互換正規表現）を使用               |
| `{{THREAD:board/thread}}` | 特定スレッドのみに適用                        |
| `{{BOARD:boardID}}`       | 特定板のみに適用                              |
| トークン群         | 検索文字列。複数トークンは AND 条件                    |

**例:**

```
荒らし	スパム
	{{REGEXP}}	[Ss]pam.*bot
{{BOARD:newsplus}}	政治
	{{THREAD:newsplus/1234567890}}	特定ワード
```

- 1行目: 「荒らし」AND「スパム」を含む → 通常あぼーん
- 2行目: 正規表現マッチ → 透明あぼーん（先頭TAB）
- 3行目: newsplus 板のみ → 通常あぼーん
- 4行目: 特定スレッドのみ → 透明あぼーん

### 1.3 あぼーんの種類

| 種類           | 条件          | 動作                                      |
|---------------|--------------|------------------------------------------|
| 通常あぼーん    | 先頭TABなし   | レスを定型文字列に置換（名前・本文等すべて） |
| 透明あぼーん    | 先頭TABあり   | レスを空文字列に置換（表示上完全に消える）   |

**通常あぼーんの置換文字列（デフォルト）:**

```
&nbsp;<>&nbsp;<>&nbsp;<>&nbsp;&nbsp;<><>
```

これは DAT 行フォーマット（`名前<>メール<>日時<>本文<>タイトル`）に対応し、全フィールドが空白になる。

### 1.4 マッチングロジック

1. NG ルールは **DAT 行全体**（名前・メール・ID・本文すべて含む）に対してマッチする
2. 複数トークンは **AND 条件**（すべてのトークンが含まれるとき NG）
3. `IgnoreKana` オプション有効時: 全角カナ ↔ 半角カナを同一視
4. 正規表現サポート:
   - `{{REGEXP}}`: bmRegExp（AWK 互換）— `TAWKStr.Match()`
   - `{{REGEX2}}`: SkRegExp（Perl 互換、Unicode 対応）— `TSkRegExp.Exec()`

### 1.5 個別あぼーん

レス番号指定で個別にあぼーんを設定。

**ファイル:** `{ThreadDATファイル}.NG`

**形式:**

```
Learned=N
{レス番号}-{オプション}
```

| オプション | 意味         |
|-----------|-------------|
| 0         | 透明あぼーん  |
| 1         | 通常あぼーん  |

### 1.6 適用順序

```
1. IndividualAbon（個別あぼーん）
2. FAbon.Execute（NGワードあぼーん）
3. FSelectResFilter.Execute（レスフィルタ）
```

---

## 2. スキン／テンプレートシステム

スレッド表示の HTML をカスタマイズするテンプレートシステム。

### 2.1 スキンファイル構成

```
{SkinDir}/
├── Header.html      ← ページヘッダ（HTML head, CSS, JS）
├── Footer.html      ← ページフッタ
├── Res.html         ← 既読レステンプレート
├── NewRes.html      ← 新着レステンプレート
├── Bookmark.html    ← 「ここまで読んだ」マーカー
└── Newmark.html     ← 新着開始マーカー
```

### 2.2 テンプレート変数

**Header / Footer で使用可能:**

| プレースホルダ      | 展開内容                   |
|--------------------|---------------------------|
| `<BBSNAME/>`      | BBS 名                    |
| `<BOARDNAME/>`    | 板名                      |
| `<BOARDURL/>`     | 板 URL                    |
| `<THREADNAME/>`   | スレッドタイトル            |
| `<THREADURL/>`    | スレッド URL               |
| `<SKINPATH/>`     | スキンディレクトリパス       |
| `<GETRESCOUNT/>`  | 取得済みレス数              |
| `<NEWRESCOUNT/>`  | 新着レス数                  |
| `<ALLRESCOUNT/>`  | サーバー上の総レス数         |
| `<NEWDATE/>`      | 最終取得日時                |
| `<SIZEKB/>`       | DAT サイズ (KB)            |
| `<SIZE/>`         | DAT サイズ (bytes)         |

**Res.html / NewRes.html で使用可能:**

| プレースホルダ      | 展開内容                        |
|--------------------|---------------------------------|
| `<NUMBER/>`       | レス番号（`menu:N` リンク付き）   |
| `<PLAINNUMBER/>`  | レス番号（プレーンテキスト）      |
| `<NAME/>`         | 投稿者名                        |
| `<MAIL/>`         | メール欄                        |
| `<MAILNAME/>`     | 名前を mailto リンクで囲んだもの  |
| `<DATE/>`         | 日時・ID 文字列                  |
| `<MESSAGE/>`      | 本文                            |

### 2.3 レンダリングフロー

```
1. Header.html を読み込み、テンプレート変数を展開
2. 各レスについて:
   a. DivideStrLine で DAT 行をパース → TResRec
   b. AddAnchorTag でアンカーリンク（>>N）を <a> タグに変換
   c. ConvRes でレス内容を変換
   d. SkinedRes で Res.html / NewRes.html テンプレートに埋め込み
3. Bookmark.html / Newmark.html を適切な位置に挿入
4. Footer.html を追加
```

---

## 3. レスアンカーとポップアップ

`>>123` 形式のレス参照をリンク化し、ホバーでポップアップ表示する機能。

### 3.1 認識されるアンカー形式

| 形式                | 例                |
|--------------------|-------------------|
| `>>N`              | `>>123`           |
| `>>N-M`            | `>>100-105`       |
| `>>N,M,O`          | `>>1,3,5`         |
| `>N`（半角1つ）      | `>123`            |
| `＞＞N`（全角）      | `＞＞123`         |

全角数字も半角に正規化して処理。

### 3.2 HTML 変換

アンカーは以下の HTML に変換される：

**スキン使用時（ページ内リンク）:**

```html
<a href="#123">&gt;&gt;123</a>
```

**非スキン時（read.cgi リンク）:**

```html
<a href="../test/read.cgi?bbs={BBSID}&key={Key}&st=100&to=105&nofirst=true" target="_blank">&gt;&gt;100-105</a>
```

### 3.3 ポップアップ処理フロー

1. マウスホバーで URL をインターセプト
2. URL からレス番号範囲を抽出（`Parse2chURL2` → `TPathRec.FSt` / `FTo`）
3. `SetResPopupText` で該当レスの HTML を生成:
   - ローカル DAT ファイルから該当行を読み込み
   - `DivideStrLine` でパース → `GetResString` で HTML 化
   - 最大表示数: `MAX_POPUP_RES = 10` レス
4. `TResPopupBrowser` にポップアップ HTML を表示

### 3.4 スキン内 JavaScript ポップアップ

スキンの JS（`chie_popup.js`）による代替実装:

- `checkAnchor(href)`: リンク種別判定（ポップアップ対象か）
- `makePopContent(e)`: `>>N` から DOM 要素を取得してポップアップ生成
- `getDTfromAnc(num)`: `document.anchors` からレス要素を特定
- 範囲制限: `end - start > 100` の場合 `end = start + 100`

---

## 4. お気に入り

スレッド・板をブックマークするツリー構造の管理機能。

### 4.1 ファイル形式

**パス:** `{ConfigDir}/Favorite.xml`  
**エンコーディング:** Shift_JIS

```xml
<?xml version="1.0" encoding="Shift_JIS" standalone="yes"?>
<favorite>
  <folder title="フォルダ名" expanded="true">
    <favitem type="2ch" favtype="board" url="https://..." title="板名"/>
    <favitem type="2ch" favtype="thread" url="https://..." title="スレタイ"/>
    <folder title="サブフォルダ" expanded="false">
      <favitem type="2ch" favtype="thread" url="https://..." title="..."/>
    </folder>
  </folder>
</favorite>
```

### 4.2 アイテム種別

| favtype    | 説明         | XML属性                          |
|-----------|-------------|----------------------------------|
| `board`   | 板           | `type`, `favtype`, `url`, `title` |
| `thread`  | スレッド      | `type`, `favtype`, `url`, `title` |
| (folder)  | フォルダ      | `title`, `expanded`              |

### 4.3 特殊フォルダ

- ルート: `お気に入り`
- リンクフォルダ: `リンク`（存在しない場合は自動作成）

### 4.4 板移転時の URL 更新

板 URL が変更された際、`FavoritesURLReplace(oldURLs, newURLs)` で全お気に入りアイテムの URL を一括更新。

---

## 5. Samba タイマー（連投規制）

板ごとの書き込み間隔制限を管理するタイマー。

### 5.1 設定ファイル

**パス:** `{AppDir}/Samba.ini`（デフォルト: `Samba.default`）

```ini
[Setting]
academy6=40
atlanta=5
@bgame=60
@newsplus=60
live23=20

[Send]
; 最終投稿日時（板ごと）
```

### 5.2 キーの解決順序

1. `@{BBSID}`（例: `@bgame`）で検索
2. 見つからない場合、ホスト名の先頭部分（例: `atlanta`）で検索

### 5.3 動作フロー

```
1. エディタ起動時: SetBoard(Board) で板の Samba 間隔を読込
2. 投稿前: CheckSambaTime(Now) で最終投稿からの経過秒数を確認
3. 経過秒数 < Samba 間隔 → 警告表示（キャンセル可能）
4. 投稿成功時: WriteSambaTime(Now) で最終投稿時刻を記録
```

### 5.4 判定ロジック

```
投稿可能 = (現在時刻 - 最終投稿時刻) の秒数 > SambaInterval
```

---

## 6. コテハン（固定ハンドル）

板ごとにデフォルトの名前・メール欄を設定する機能。

### 6.1 保存先

板ごとの INI ファイル: `{LogFolder}/{BBSID}/Folder.ini`

```ini
[Kotehan]
Name=デフォルト名前
Mail=sage
```

### 6.2 動作

- エディタ起動時に板の `KotehanName` / `KotehanMail` を名前・メール欄に自動入力
- `KotehanCheckBox` 有効時、投稿のたびに入力値を板設定に保存

---

## 7. プロキシ設定

読み込み用と書き込み用で別々のプロキシを設定可能。

### 7.1 設定ファイル形式

```ini
[ReadProxy]
Proxy=true
Address=proxy.example.com
Port=8080
UserID=user
Password=pass

[WriteProxy]
Proxy=true
Address=proxy2.example.com
Port=8080
UserID=user
Password=pass
```

### 7.2 適用ルール

| 操作             | 使用プロキシ    |
|-----------------|---------------|
| 板一覧取得        | ReadProxy     |
| subject.txt 取得  | ReadProxy     |
| DAT 取得          | ReadProxy     |
| レス書き込み       | WriteProxy    |
| 新規スレ作成       | WriteProxy    |

`InitHTTP(Indy, WriteMethod)` の `WriteMethod` パラメータで切替。

---

## 8. DAT 置換システム

ダウンロードした DAT コンテンツに対して文字列置換を適用するシステム。主に悪意あるスクリプトの無害化に使用。

### 8.1 設定ファイル

**パス:** `{ConfigDir}/replace.ini`（デフォルト: `replace.default`）

**形式（タブ区切り）:**

```
検索文字列[TAB]置換文字列
```

- 置換文字列が空の場合、検索文字列と同じ長さの空白に置換
- 検索文字列ではエスケープが使用可能: `\.`, `\(`, `\)`, `\{`, `\}`, `\/`, `\"`, `\\`
- `<>` を含む行はスキップされる（DAT デリミタとの衝突防止）

### 8.2 適用タイミング

```
DAT ダウンロード → gzip 展開 → 置換適用（ReplaceDat） → ローカル保存
```

`Setting.ReplaceDat = true` の場合にのみ適用。

### 8.3 デフォルトルール例

```
\.vbs	(空白)
\.hta	(空白)
CodeModule\.Lines	(空白)
ms-its:mhtml:	(空白)
```

主に VBS/HTA などの悪意あるスクリプト参照を無害化する。

---

## 9. スレッド検索

### 9.1 ローカル検索（キャッシュ済み DAT）

選択した板のローカル DAT ファイルを横断検索。

**検索対象フィールド（選択式）:**

- 名前 (Name)
- メール (Mail)
- ID
- 本文 (Body)

**正規表現:** bmRegExp（`TGrep`）による正規表現検索をサポート。

**処理フロー:**

```
1. 検索対象の板を選択（カテゴリ/板チェックボックス）
2. 各板の ReadSubjectFile で スレッドリストを読込
3. 各スレッドのローカル DAT ファイルに対して GrepByRegExp を実行
4. マッチ結果をリストに表示
```

### 9.2 リモート検索（dig.2ch.net）

**検索 URL:**

```
http://dig.2ch.net/?keywords={キーワード}&AndOr={0|1}&maxResult={N}&atLeast={N}&Sort={0..N}&Link=1&Bbs={板指定}&924={0|1}&json=1
```

| パラメータ   | 説明                                |
|-------------|-------------------------------------|
| `keywords`  | 検索キーワード（URL エンコード）       |
| `AndOr`     | 0: AND 検索 / 1: OR 検索            |
| `maxResult` | 最大結果件数                         |
| `atLeast`   | 最小レス数                           |
| `Sort`      | ソート順                             |
| `Bbs`       | 板指定（`all`, 板ID, プリセットグループ） |
| `json`      | 1: JSON 形式で返却                   |

**レスポンス（JSON）:**

```json
[
  {
    "subject": "スレッドタイトル",
    "ita": "板名",
    "resno": "レス数",
    "url": "スレッドURL"
  }
]
```

---

## 10. URL パース

2ch/5ch 系 URL を解析して板ID・スレッドID・レス番号を抽出する機能。

### 10.1 TPathRec（解析結果）

| フィールド   | 型      | 説明                    |
|-------------|---------|------------------------|
| FBBS        | string  | BBSID                  |
| FKey        | string  | スレッドID              |
| FSt         | Int64   | 開始レス番号             |
| FTo         | Int64   | 終了レス番号             |
| FFirst      | Boolean | `>>1` の表示フラグ       |
| FStBegin    | Boolean | 先頭から表示              |
| FToEnd      | Boolean | 末尾まで表示              |
| FDone       | Boolean | パース成功フラグ          |
| FNoParam    | Boolean | レス番号パラメータなし    |

### 10.2 認識される URL パターン

**PATH_INFO 形式（現行）:**

```
https://{host}.5ch.net/test/read.cgi/{BBSID}/{ThreadID}/
https://{host}.5ch.net/test/read.cgi/{BBSID}/{ThreadID}/l50
https://{host}.5ch.net/test/read.cgi/{BBSID}/{ThreadID}/100
https://{host}.5ch.net/test/read.cgi/{BBSID}/{ThreadID}/100-200
https://{host}.5ch.net/test/read.cgi/{BBSID}/{ThreadID}/100-200n
https://{host}.5ch.net/test/read.cgi/{BBSID}/{ThreadID}/-100
https://{host}.5ch.net/test/read.cgi/{BBSID}/{ThreadID}/100-
```

**QUERY_STRING 形式（旧）:**

```
https://{host}/test/read.cgi?bbs={BBSID}&key={ThreadID}&st=100&to=200&nofirst=true
```

**過去ログ形式:**

```
https://{host}/{BBSID}/kako/{N}/{N}/{ThreadID}.html
https://{host}/{BBSID}/kako/{N}/{ThreadID}.html
```

**log/log2 形式:**

```
https://{host}/log/{BBSID}/kako/{N}/{ThreadID}.html
https://{host}/log2/{BBSID}/kako/{N}/{ThreadID}.html
```

### 10.3 ホスト判定

以下のドメインを 2ch 系として認識:

```
*.2ch.net
*.5ch.net
*.bbspink.com
```

正規表現: `(http|https)://.+\.(2ch\.net|5ch\.net|bbspink\.com)/`

---

## 11. 板 URL 移転対応

サーバー移転時にローカルデータの URL を一括更新する機能。

### 11.1 検出

板一覧の更新時（`NewBoard.pas` の `UpdateURL`）に、既存の板 URL と新しい板一覧の URL を比較。差分があれば移転として検出。

### 11.2 更新対象

| 対象               | 処理                                     |
|-------------------|------------------------------------------|
| 板一覧 INI         | URL 値を新 URL に書き換え                  |
| お気に入り XML      | `FavoritesURLReplace` でホスト部分を置換    |
| 巡回リスト          | `RoundListURLReplace` で URL を置換       |
| 開いているタブ       | `TabFileURLReplace` で URL を置換         |

### 11.3 置換ロジック

- URL を「ホスト」と「板パス」に分解
- 板パスが一致する場合にホスト部分のみを新ホストに置換
- 例: `https://old-server.5ch.net/board/` → `https://new-server.5ch.net/board/`

---

## 12. Be ログイン

5ch の Be アカウント認証。投稿者の識別や Be プロフィールリンクに使用。

### 12.1 ログイン

```
POST https://be.5ch.net/log
Content-Type: application/x-www-form-urlencoded

mail={メールアドレス}&pass={パスワード}
```

### 12.2 Cookie

| Cookie名 | 説明            | ドメイン   |
|---------|-----------------|-----------|
| `DMDM`  | Be セッション 1  | `5ch.net` |
| `MDMD`  | Be セッション 2  | `5ch.net` |

### 12.3 Be プロフィールリンク

DAT 内の日時フィールドに `BE:34600695-4` 形式で Be ID が埋め込まれている場合、プロフィールリンクに変換:

```
BE:34600695 → https://be.5ch.net/test/p.php?i=34600695/{レス番号}
```

### 12.4 投稿時

Be ログイン済みの場合、`DMDM` / `MDMD` Cookie が投稿ヘッダに自動付与される。

---

## 13. 外部プレビュー／画像プレビュー

リンクホバー時の外部アプリ起動やインライン画像プレビュー。

### 13.1 外部プレビュー設定ファイル

**パス:** `{ConfigDir}/extpreview.ini`

**形式（タブ区切り）:**

```
正規表現URL[TAB]実行コマンド[TAB]確認ダイアログ[TAB]内蔵プレビュー続行
```

| フィールド         | 値                                    |
|-------------------|---------------------------------------|
| 正規表現 URL       | AWK 互換正規表現（マッチ対象 URL）       |
| 実行コマンド        | 外部アプリのパス（`nop` で実行スキップ）  |
| 確認ダイアログ      | `true`: 確認表示 / その他: 即実行       |
| 内蔵プレビュー続行   | `true`: 外部実行後も内蔵表示 / `false`: 外部のみ |

**例:**

```
http://www\.youtube\.com/watch\?.*	"C:\Program Files\Firefox\firefox.exe"	false	false
http://www\.nicovideo\.jp/watch/sm[0-9]+$	"C:\Program Files\Firefox\firefox.exe"	true	false
```

### 13.2 内蔵画像プレビュー

外部プレビューにマッチしない場合、以下の拡張子/パターンで内蔵プレビューを表示:

| 対象パターン                           |
|---------------------------------------|
| `.jpg`, `.jpeg`, `.gif`, `.png`       |
| `.jpg:large`, `.jpg:orig`（Twitter）   |
| `?format=jpg`, `?format=png`          |

### 13.3 処理フロー

```
1. リンクホバー検出
2. ExtPreview の正規表現リストとマッチング
3. マッチあり → 外部アプリ起動（タイマーで遅延実行）
4. マッチなし or 続行フラグ → 内蔵画像プレビューを試行
```

---

## 14. 板設定 (SETTING.TXT)

板ごとのサーバー設定ファイル。投稿ルールや板の情報を含む。

### 14.1 取得

```
GET {Board.URL}SETTING.TXT
```

例: `https://agree.5ch.net/operate/SETTING.TXT`

条件付き GET（`If-Modified-Since`）でキャッシュ。

### 14.2 SETTING.TXT の主要フィールド

SETTING.TXT は `KEY=VALUE` 形式の設定ファイル。ブラウザ実装で使われる主要フィールド：

| キー                 | 説明                          | 使用箇所        |
|---------------------|-------------------------------|----------------|
| `BBS_NONAME_NAME`   | デフォルトの名無し名（例: `名無しさん`） | 名前欄の初期値  |
| `BBS_TITLE_PICTURE` | 板トップの画像 URL              | UI 表示        |
| `BBS_FIGUREHEAD`    | 板トップの代替画像 URL           | UI 表示        |

**補足:** `BBS_SUBJECT_COUNT`（スレタイ最大文字数）、`BBS_NAME_COUNT`（名前最大文字数）、`BBS_LINE_NUMBER`（最大行数）などのフィールドも SETTING.TXT に含まれるが、gikoNaviG2 ではパースされていない。新規実装ではこれらも考慮するとよい。

### 14.3 ローカル保存

**パス:** `{LogFolder}/{BBSID}/SETTING.TXT`

### 14.3 板ごとのローカル設定

**パス:** `{LogFolder}/{BBSID}/Folder.ini`

```ini
[Status]
RoundDate=...
LastModified=...
LastGetTime=...
UnRead=...

[BoardInformation]
SETTINGTXTTime=...
IsSETTINGTXT=...
TitlePictureURL=...

[Cookie]
SPID=...
PON=...
Cookie=...
Expires=...

[Kotehan]
Name=...
Mail=...
```

---

## 参考：追加機能ソースファイル対応表

| 機能                | ソースファイル                     | 主要クラス/関数                    |
|--------------------|---------------------------------|----------------------------------|
| あぼーん             | `AbonUnit.pas`, `AbonInfo.pas`  | `TAbon`, `FindNGwords`, `Execute` |
| NG エディタ          | `NgEditor.pas`                  | `TNgEdit`                        |
| スキン               | `HTMLCreate.pas`                | `CreateUseSKINHTML`, `SkinedRes`  |
| アンカー/ポップアップ  | `HTMLCreate.pas`, `ResPopupBrowser.pas` | `ConvRes`, `SetResPopupText` |
| お気に入り            | `Favorite.pas`                  | `TFavoriteDM`, `ReadFavorite`    |
| Samba タイマー       | `SambaTimer.pas`                | `TSambaTimer`, `CheckSambaTime`  |
| コテハン             | `Kotehan.pas`, `BoardGroup.pas` | `TKotehanDialog`, `KotehanName`  |
| プロキシ             | `Setting.pas`, `IndyModule.pas` | `InitHTTP`                       |
| DAT 置換            | `ReplaceDataModule.pas`         | `TReplace`, `Replace`            |
| ローカル検索          | `Search.pas`                    | `TSearchDialog`, `TGrep`        |
| リモート検索          | `ThreadSearch.pas`              | `TThreadSrch`, `ParsJson`       |
| URL パース           | `GikoSystem.pas`                | `Parse2chURL2`, `TPathRec`       |
| 板移転対応           | `NewBoard.pas`                  | `UpdateURL`, `URLReplace`        |
| Be ログイン          | `Belib.pas`                     | `TBelib`, `DMDM`, `MDMD`        |
| 外部プレビュー        | `ExtPreviewDatamodule.pas`      | `PreviewURL`, `ExecuteTimer`     |
| 板設定              | `BoardGroup.pas`, `Editor.pas`  | `LoadSettings`, `SETTING.TXT`    |
