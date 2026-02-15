# 汎用掲示板ブラウザ 完全仕様（ソース補完版）

> 目的: `bbs-browser-protocol-reference.md` と `bbs-browser-advanced-features.md`、および `bbs-browser-implementation-contract.md` を統合し、さらにソースコード解析で判明した未記載機能を補完した完全仕様を提供する。

---

## 0. 前提・適用範囲

- 本仕様は、`docs/` 配下の仕様ドキュメントを基礎として、ソースコード解析で判明した差分を統合したものである。
- 開発時にソース非参照で進める場合は、本仕様に含まれる「ソース由来補完仕様」を正として扱う。
- 対象機能は、板一覧取得、スレ一覧取得、DAT取得、投稿、ローカル永続化、追加機能（NG/スキン/お気に入り等）を含む。
- 本仕様は実装仕様であり、UI デザインや見た目の差異までは拘束しない。

### 0.1 規範語

- MUST: 必須要件
- SHOULD: 強く推奨
- MAY: 任意

### 0.2 優先順位（矛盾時）

1. `bbs-browser-implementation-contract.md`
2. 本仕様（`bbs-browser-complete-spec.md`）
3. `bbs-browser-protocol-reference.md`
4. `bbs-browser-advanced-features.md`

---

## 1. 実装到達点（Definition of Done）

### 1.1 MVP 必須（MUST）

- 板一覧（BBSメニュー）を取得・解析し、カテゴリ/板をローカル保存できる。
- `subject.txt` の 200/304 を正しく処理し、Age/Sage/New/Archive 判定ができる。
- DAT 取得で 200/206/304/416 を正しく処理できる。
- DAT 差分取得で 16バイト重複チェックを行い、不一致時は全文再取得へフォールバックできる。
- 投稿で `grtOK`/`grtCookie`/`grtCheck`/`grtError` を判定し、上限付き再送ができる。
- `Folder.idx`、Cookie、`Favorite.xml` の永続化が相互整合する。
- 5ch/2ch 系（Shift_JIS 中心）と JBBS 系（EUC-JP）の読み書きに対応する。

### 1.2 推奨（SHOULD）

- DAT落ち時の kako/oyster フォールバック。
- Samba タイマー、NG あぼーん、スキンレンダリング。
- 外部板（したらば/JBBS）URL差異の吸収。

---

## 2. データモデルとローカル保存

### 2.1 階層モデル

```
BBS
 └─ Category
    └─ Board
       └─ ThreadItem
          └─ Res
```

### 2.2 主要レコード

- `TSubjectRec` 相当: `FileName`, `Title`, `Count`
- `TResRec` 相当: `Name`, `Mail`, `DateTime`, `Body`, `Title`
- `TIndexRec` 相当: `FileName`, `Count`, `Size`, `LastModified`, `Kokomade`, `NewResCount`, `AgeSage` など

### 2.3 ローカルファイル

- 板配下:
  - `subject.txt`
  - `Folder.idx`
  - `Folder.ini`
  - `{threadId}.dat`
- 設定配下:
  - `GikoNavi.cookies`
  - `Favorite.xml`
  - `Samba.ini`
  - `replace.ini`
  - `NGwords/NGword.txt`, `NGwords.list`
  - `extpreview.ini`

### 2.4 I/O 契約（MUST）

- 書き込みはテンポラリ経由で原子的に置換する。
- 同一ファイルの同時書き込みを禁止する（ロック制御）。
- 破損検知時は既存データ保護を優先し、復旧可能性を残す（`.bak` 等）。

---

## 3. 通信共通仕様

- MUST: すべてのリクエストに `User-Agent` を付与する。
- MUST: 接続/読込タイムアウトを設定する。
- MUST: 一時障害（429/503 等）で指数バックオフ（例: 1s, 2s, 4s... 最大30s）。
- SHOULD: `If-Modified-Since` による条件付き GET を活用。
- MUST: Range 利用時は `Accept-Encoding: gzip` を送らない。
- MUST: URL 正規化（`http -> https`、`.2ch.net -> .5ch.net`、`itest -> PC 形式`）を行う。

---

## 4. 取得・更新プロトコル

### 4.1 板一覧（BBSメニュー）

- 代表 URL: `https://menu.5ch.net/bbsmenu.html`
- HTML からカテゴリ（`<b>`）と板リンク（`<a href=...>`）を抽出。
- 板 URL は末尾 `/` を統一し、必要なホスト補正を行う。
- 結果は INI 形式で保存する。

### 4.2 スレ一覧（subject.txt）

- `GET {Board.URL}subject.txt`
- レスポンス:
  - 200: 全文取得しローカル更新
  - 304: ローカルキャッシュ利用
- フォーマット:
  - 基本: `1234567890.dat<>タイトル (123)`
  - 旧形式: `,` 区切りにフォールバック
- 状態判定:
  - 未知スレ: New
  - 順位上昇: Age
  - レス増加かつ順位非上昇: Sage
  - 旧にあり新にない: Archive

### 4.3 DAT 取得

- `GET {Board.URL}dat/{ThreadID}.dat`
- 差分取得:
  - `Range: bytes={size-16}-`
  - 206 受信時、レスポンス先頭16バイトとローカル末尾16バイトを比較
  - 一致: 先頭16バイトを除去して追記
  - 不一致: Rangeなし全文再取得（1回）
- ステータス:
  - 200: 全文更新
  - 206: 差分マージ
  - 302: kako/oyster フォールバック
  - 304: 変更なし
  - 416: Range 無しで再取得

### 4.4 投稿

- 送信先:
  - 5ch/2ch: `{server}/test/bbs.cgi`
  - 外部板: `{server}/test/subbbs.cgi` 等
- `application/x-www-form-urlencoded` で送信。
- 主パラメータ: `FROM`, `mail`, `MESSAGE`, `bbs`, `time`, `key`（新規スレ時 `subject`）
- 判定:
  - `grtOK`: 成功
  - `grtCookie`/`grtCheck`: hidden 抽出後に再送
  - `grtDonguri`/`grtError`: 通知して停止
- MUST: 再送は上限付き（推奨2回）で無限ループを禁止。

---

## 5. エンコーディング・改行仕様

| 対象 | 既定 | 改行 | 備考 |
|---|---|---|---|
| 5ch/2ch `subject.txt`, `*.dat` | Shift_JIS | LF | サーバー返却を尊重 |
| JBBS DAT | EUC-JP（必要時変換） | LF | 内部表現は Unicode 可 |
| `Folder.idx` | Shift_JIS 相当 | LF | 0x01 区切り |
| `Favorite.xml` | Shift_JIS | LF | XML ヘッダと実体を一致 |
| Markdown 文書 | UTF-8 (BOMなし) | LF | 仕様文書用途 |

- MUST: 内部処理は Unicode で統一し、境界でのみ encode/decode。

---

## 6. 追加機能（統合）

### 6.1 NG あぼーん

- `NGwords/NGword.txt` を読み込み、DAT 行全体に対してフィルタ。
- 先頭TABあり: 透明あぼーん、なし: 通常あぼーん。
- 複数トークンは AND 条件。
- `{{REGEXP}}` / `{{REGEX2}}`、`{{BOARD:...}}` / `{{THREAD:...}}` をサポート。
- 個別あぼーん（`.NG`）を先に適用し、その後 NG ルールを適用する。

### 6.2 スキン/テンプレート

- `Header.html`, `Res.html`, `NewRes.html`, `Bookmark.html`, `Newmark.html`, `Footer.html` を使用。
- レンダリング時にテンプレート変数（板名、URL、レス番号、新着数等）を展開。
- `>>N` アンカーをリンク化し、必要に応じてポップアップ表示を提供。

### 6.3 お気に入り

- `Favorite.xml`（Shift_JIS）でツリー管理。
- `board` / `thread` / `folder` を保持。
- 板移転時は URL 一括置換で整合を維持。

### 6.4 Samba タイマー

- `Samba.ini` で板ごとの最短投稿間隔を管理。
- 投稿前に前回投稿時刻との差分を検証し、規制未満なら警告。

### 6.5 コテハン

- `Folder.ini` の板単位設定として名前/メールを保存。
- 投稿エディタ起動時に初期値として反映。

### 6.6 プロキシ

- 読み込み（板一覧/subject/DAT）と書き込み（投稿）で別設定を許可。

### 6.7 DAT 置換

- `replace.ini` の置換ルールを DAT 保存前に適用可能。
- `<>` を含む置換行はデリミタ衝突回避のため無効とする。

### 6.8 検索

- ローカル検索: 保存済み DAT 横断（名前/メール/ID/本文）。
- リモート検索: API の可用性に依存するため、失敗時は劣化動作を許容。

### 6.9 URL パース/移転対応

- PATH_INFO/QUERY_STRING/kako 形式を解析。
- 板移転時は板一覧、お気に入り、巡回情報、タブ情報の URL を更新。

### 6.10 認証

- UPLIFT: `sid` を取得し必要リクエストへ付与。
- Be: `DMDM`/`MDMD` を投稿時 Cookie に付与。
- どんぐり: `acorn` Cookie を管理し破損時の再取得導線を提供。

### 6.11 外部プレビュー/画像プレビュー

- `extpreview.ini` の正規表現に一致する URL を外部アプリで処理。
- 一致しない場合は内蔵画像プレビュー（拡張子/パターン判定）へフォールバック。

### 6.12 板設定（SETTING.TXT）

- `GET {Board.URL}SETTING.TXT` で取得しローカル保存。
- 最低限 `BBS_NONAME_NAME`, `BBS_TITLE_PICTURE`, `BBS_FIGUREHEAD` を扱う。
- 将来拡張として投稿制限値（文字数/行数等）の反映を考慮する。

---

## 7. セキュリティ・安全性要件

- MUST: DAT/subject 表示前に HTML 無害化を行う。
- MUST: `javascript:` 等の危険 URL スキームを拒否する。
- MUST: 外部コマンド実行時は固定テンプレートと安全な引数受け渡しを使う。
- MUST: Cookie/認証情報をログ出力しない。
- SHOULD: CSP を有効化し、危険な HTML 注入経路を最小化する。

---

## 8. エラー処理マトリクス（最小）

| 対象 | 条件 | 必須動作 |
|---|---|---|
| `subject.txt` | 304 | キャッシュ採用 |
| `subject.txt` | 404/5xx | 失敗通知 + キャッシュ維持 |
| DAT | 206 + 16B不一致 | 全文再取得 |
| DAT | 416 | Rangeなし再取得 |
| DAT | 302 | kako/oyster を順次試行 |
| 投稿 | `grtCookie`/`grtCheck` | hidden 取得 + 上限付き再送 |
| 投稿 | `grtDonguri` | 再投稿不可として通知 |
| 投稿 | `grtError` | 応答保存 + 診断可能化 |

---

## 9. 受け入れテスト基準

### 9.1 パーステスト

- `subject.txt`:
  - `<>` / `,` 両形式
  - レス数表現 `(123)` `（123）` `<123>`
- DAT:
  - 5フィールド正常系
  - 欠落フィールド
  - CRLF/LF 混在
- URL:
  - PATH_INFO / QUERY_STRING / kako / itest

### 9.2 通信テスト（モック）

- DAT: 200/206/302/304/416 を網羅。
- 投稿: `grtOK`/`grtCookie`/`grtCheck`/`grtDonguri`/`grtError` を網羅。
- Cookie 永続化: 再起動後復元を確認。

### 9.3 E2E

- 板一覧更新 -> 板選択 -> スレ一覧 -> DAT表示 -> 投稿 -> 再取得。
- NG あぼーん、Samba、お気に入り、スキンが相互干渉しない。

---

## 10. 既知の変動リスク

- どんぐり/投稿判定文字列は運用で変化し得る。
- 外部検索 API は将来停止し得る。
- 板ごとの規制値は運用変更され得る。

実装では feature flag、フォールバック導線、運用時の更新容易性を持たせる。

---

## 11. 実装チェックリスト（短縮版）

- [ ] User-Agent / timeout / retry / backoff 実装
- [ ] subject / DAT / 投稿の全分岐実装
- [ ] 文字コード境界と URL エンコード実装
- [ ] ローカルファイル原子更新・排他
- [ ] NG / スキン / お気に入り / Samba の実装
- [ ] セキュリティ（サニタイズ、危険スキーム拒否、秘密情報非出力）
- [ ] 受け入れテスト（パース/通信/E2E）を自動化

---

## 12. ソース解析で追加された未記載機能

本章は、`bbs-browser-implementation-contract.md`、`bbs-browser-protocol-reference.md`、`bbs-browser-advanced-features.md` で不足していた機能を、ソースコード根拠に基づいて補完する。

### 12.1 投稿誤爆チェック

- 投稿時、表示中タブの文脈と投稿先が不整合な場合に確認ダイアログを表示する。
- `UseGobakuCheck` で有効/無効を切り替える。
- 目的は誤投稿防止であり、投稿フローの安全装置として扱う。

### 12.2 投稿履歴の保存とローテーション

- 投稿履歴は `{AppDir}/sent.ini` に保存する。
- `SentIniFileSize`（MB）を超過した場合、`sent.ini.{番号}` へリネームしてローテーションする。
- 投稿失敗時の調査可能性を確保するため、履歴保存は既定で有効とする。

### 12.3 固定 Cookie（FixedCookie）

- 板固有 Cookie に加え、設定された固定 Cookie 文字列を投稿ヘッダへ付与できる。
- 設定値は `[Cookie]` セクションの `fixedString` として保持する。
- 機密情報の混入防止のため、ログ出力時はマスクする。

### 12.4 旧系 TAKO Cookie の確認保存

- 旧サーバー由来の TAKO Cookie を初回受信した場合、保存可否をユーザー確認する。
- 拒否時は永続化しない。
- レガシー互換と安全性の両立のため、暗黙保存は行わない。

### 12.5 スレッドメタデータ `.tmp` と復元

- 各スレッドの取得メタデータ（Count, Size, LastModified, NewResCount 等）を `{ThreadID}.tmp` に保持する。
- 板読込時に `*.tmp` を走査し、異常終了で未反映の状態を復元して `Folder.idx` へ再反映する。
- 復元完了後の `.tmp` は削除する。

### 12.6 DAT 保存時のロック競合リトライ

- DAT 書き込み時にファイルオープン競合（`EFOpenError`）が発生した場合、短時間待機で複数回リトライする。
- 競合吸収は暫定ではなく、同時アクセスを前提にした実運用対策として扱う。

### 12.7 レス表示範囲モード

- 表示範囲として `全件`、`ここまで読んだ以降`、`新着のみ`、`末尾 N 件` を選択できる。
- 範囲決定後に HTML レンダリングへ渡す。
- 範囲指定の状態保持（スレ単位保持）を設定可能とする。

### 12.8 レス選択フィルタ（Reverse 対応）

- NG あぼーんとは別に、表示対象レスを絞り込む選択フィルタを提供する。
- トークンは AND 条件で評価し、`Reverse=true` で逆選択（非一致表示）を有効化できる。
- 適用順は「個別あぼーん -> NG あぼーん -> レス選択フィルタ」とする。

### 12.9 タブ永続化

- 開いているタブ URL を `tab.sav` に保存し、再起動時に復元する。
- 板移転の URL 置換は `tab.sav` に対しても適用する。
- 復元失敗 URL があっても処理全体を中断しない。

### 12.10 アドレス履歴

- アドレス入力履歴を `{ConfigDir}/AddressHistory.xml` に保存する。
- 保持件数は設定値で上限管理する。
- URL 表示モードではタブ切替時に現在 URL を同期表示する。

### 12.11 閲覧履歴（お気に入りとは別系統）

- 最近開いたスレッド履歴を別管理する。
- 同一 URL は再訪時に先頭へ再配置し、上限超過分は末尾から削除する。
- お気に入りは永続ブックマーク、閲覧履歴は直近アクセス導線として役割分離する。

### 12.12 スクロール位置の保存・復元

- スレ表示時に前回 `ScrollTop` を復元する。
- タブ終了/最小化等のタイミングで現在 `ScrollTop` を保存する。
- `Folder.idx` の `ScrollTop` と整合して更新する。

### 12.13 既読化の確定条件

- `JumpAddress` 指定ジャンプ完了後、または新着アンカー移動後に既読化する。
- 既読化時はスレ/板の未読件数を再計算する。
- 既読更新は表示イベントと連動し、ダウンロード完了のみでは確定しない。

### 12.14 ログ削除（DAT/.tmp/.NG の同時削除）

- スレログ削除時、`*.dat`、`*.tmp`、`*.NG` を一括削除し、インデックス整合を更新する。
- 確認ダイアログ表示有無は設定で切り替える。
- 削除失敗ファイルがある場合は通知し、可能な範囲で整合回復を継続する。

### 12.15 Favorite/Round 保存時の退避

- Favorite および Round 系ファイル保存時は一時ファイル経由で更新し、旧ファイルを `~` 付き名で退避する。
- 自動退避ファイルは障害時の手動復旧に使用できる。

### 12.16 巡回リストの異常行隔離

- 巡回リスト読込でパース不能行がある場合、`ErrorBoard.2ch` / `ErrorItem.2ch` へ隔離保存する。
- 異常行は巡回対象から除外し、正常行のみで処理を継続する。

### 12.17 巡回実行制限（未ログイン時）

- 未ログイン時は前回巡回から一定時間未満の再実行を禁止する。
- 条件により 1 回あたりの巡回件数上限を適用する。
- サーバー負荷と規制回避のため、制限は UI 表示だけでなく実行制御に反映する。

### 12.18 巡回リスト旧形式互換

- Round ファイル先頭バージョンが現行でない場合は旧形式として読み替える。
- 初回読み替え後は現行形式で再保存し、以後は現行パーサを使用する。


