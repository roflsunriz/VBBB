# Changelog

All notable changes to VBBB will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.1] - 2026-02-25

### Added

- 次スレ立て支援機能を実装
  - 現スレの >>1 をベースに次スレ用テンプレートを自動生成（タイトル番号+1、前スレURL置換、VIPQ2 `!extend` コマンド2行追加、`VIPQ2_EXTDAT` 除去）
  - レス数950以上のスレッドでツールバーに「次スレを立てる」ボタンを表示
  - 1000レス超過時の次スレバナーで次スレが見つからない場合に「次スレを立てる」ボタンを表示
  - DAT落ちスレッドに「次スレを立てる」ボタン付きバナーを表示
  - 新規スレッド作成エディタにテンプレートの初期値（タイトル・本文）を自動入力

## [1.6.0] - 2026-02-25

### Added

- `+N` 返信ポップアップの返信ツリー自動展開機能を実装
  - BFS（幅優先探索）で返信の連鎖（デイジーチェーン）や分岐を再帰的に収集し、1つのポップアップ内にフラット表示
  - 深さ1のみの制限を撤廃し、任意の深さの返信ツリーに対応（最大10件表示、超過時は「他にも返信があります」を表示）
- ポップアップ内の `>>N` アンカーリンクをクリッカブルに変換し、ホバーでネストされた子ポップアップを表示（最大深さ10段）
- ポップアップ内の外部URLクリックでブラウザで開く機能を追加
- CountBadge・ResItem コンポーネントにホバーインタラクション機能を追加
- スレッド内検索機能を追加

### Changed

- CI/リリースワークフローの実行環境を Ubuntu に変更

## [1.5.0] - 2026-02-23

### Added

- フォーム形式の DSL エディタモーダルを新設（ツールメニュー「DSLエディタ」/ Ctrl+Shift+D）
  - グローバル設定（SCHEDULE / COUNTDOWN）とPOSTブロックをフォームで入力し、.vbbs ソースをリアルタイム生成
  - 既存 .vbbs ファイルの読み込み・編集、名前を付けて保存、クリップボードコピーに対応
  - 投稿ブロックの動的追加・削除・折りたたみ
- DSL ソース生成ユーティリティ `generateDslSource` を追加（`parseDslScript` の逆操作）
- DSL ファイル保存用 IPC チャンネル `dsl:save-file` を追加
- ツールバーに DSL エディタボタンを追加
- `bun test` 向けに `bunfig.toml` と happy-dom グローバル登録を導入し、Bun 内蔵テストランナーでも全テスト合格するよう整備

### Changed

- プログラマティック書き込み欄の DSL タブからテキストエリアを廃止し、ファイル読み込み＋実行のみに簡素化
- ルート `tsconfig.json` に `@shared` / `@renderer` パスエイリアスを追加（bun test でのモジュール解決対応）
- `browsing-history` テストから `vi.setSystemTime` 依存を除去し、bun test 互換に改善

## [1.4.0] - 2026-02-23

### Added

- スレッド新規作成機能を実装（Slevo の ThreadCreatePostDialogExecutor を参考に移植）
  - スレッド一覧ヘッダーの「✏️+」ボタンから `NewThreadEditor` パネルを開いて板にスレッドを立てられる
  - タイトル（subject）・名前・メール・本文を入力して Ctrl+Enter または「スレッドを立てる」ボタンで送信
  - 作成成功後はスレッド一覧を自動リフレッシュし、新スレを自動で開く
- 次スレ自動移動機能を実装（5ch 閲覧ソフト標準的なシリーズ番号インクリメント方式）
  - スレッドが 950 レス以上でツールバーに「次スレ」ボタンが出現（手動検索）
  - スレッドが 1000 レス到達時に自動検索が走り、コンテンツ上部にバナーを表示
  - 次スレ検出アルゴリズム: タイトル最右端の数字を +1 してプレフィックス類似度で照合
  - 次スレが見つかった場合は「開く」ボタンでワンクリック移動、見つからない場合は「再検索」可能
- スレッドタブ間の前後移動機能を追加（Slevo の SwitchToNextTab / SwitchToPreviousTab に相当）
  - ThreadView のアクションバーに「‹」「›」ボタンを追加
  - `Alt+[` / `Alt+]` キーボードショートカットで前後のスレッドタブへ移動

### Changed

- `PostParams` 型に `subject?: string` フィールドを追加（新規スレッド作成時のスレッドタイトル）
- `PostParamsSchema` (Zod) を拡張し、`threadId` 空文字列時に `subject` を必須バリデーション
- `buildPostBody()` を新規スレッド作成モード対応に修正（`key` 省略・`subject` 追加・submit 文字列切替）

## [1.3.1] - 2026-02-22

### Added

- electron-updater を統合し、GitHub Releases を使った自動アップデート機能を実装（終了時にサイレントインストール対応）
- バンドル分析・可視化ツールを追加（rollup-plugin-visualizer による stats.html 生成）
- 複数コンポーネントのレイジーローディングを実装し、初回読み込みパフォーマンスを向上

### Changed

- electron-builder の設定を強化（最大圧縮・不要な WebGPU DLL の削除によるアプリサイズ削減）
- GitHub Actions のリリースワークフローを改善（CHANGELOG.md からリリースノートを自動抽出・ドラフトなし自動リリース）
- IPC ハンドラーのアップデート確認プロセスを簡略化
- package.json の依存関係を整理（@mdi/js、@tanstack/react-virtual、dompurify を追加）

## [1.3.0] - 2026-02-22

### Added

- コンテキストメニューの表示位置を改善する ContextMenuContainer コンポーネントを追加
- 画像の一括保存機能を追加（保存先フォルダをユーザーが選択可能）

### Changed

- IPC ハンドラー登録を最適化し、コンポーネントの遅延ロードを導入してパフォーマンスを向上

## [1.2.1] - 2026-02-21

### Added

- アプリ内アップデート確認機能を追加（GitHub Releases と連携したダイアログ表示）
- アプリメニューに GitHub リポジトリへのリンクを追加

### Fixed

- ThreadView のスクロール復元ロジックを改善

## [1.2.0] - 2026-02-20

### Added

- プログラマティック書き込み欄に DSL（ドメイン固有言語）サポートを導入し、構造化された書き込み指示の記述が可能に
- ThreadView にレスポンス ID の表示を追加
- DAT 落ちスレッドのハンドリング機能を実装（dat サービス・JBBS サービス・UI）

## [1.1.2] - 2026-02-19

### Added

- スレッド表示のスクロール復元に新規レスポンス追跡を追加し、正確な位置復元を強化
- dateTime フィールドへの IP ベース識別子抽出に対応

### Changed

- 投稿時の文字エンコード処理を強化（マルチバイト文字の互換性向上）

## [1.1.1] - 2026-02-18

### Fixed

- 投稿直後に自分の投稿ハイライトが適用されないバグを修正（`post:save-history` 保存完了後に `loadPostHistory` でストアを更新するよう変更）

## [1.1.0] - 2026-02-18

### Added

- 検索入力欄に検索履歴機能を追加（SearchInputWithHistory コンポーネント）。板ツリー・お気に入り・履歴・検索・スレッド一覧の各検索欄で履歴を localStorage に永続化し、過去の検索キーワードを候補表示から選択可能
- タブ切り替え時に直前のアクティブタブのスクロール位置を保存し、再訪時に復元する機能を追加

## [1.0.3] - 2026-02-18

### Added

- スレッド一覧の検索キーワード・並び替えを板タブごとに独立化（タブを切り替えても検索/ソート状態を保持）
- 書き込み欄・分析欄・プログラマティック書き込み欄をスレッドタブごとに独立化（NG欄は共通のまま維持）
- 返信を受けたレスのレス番前に `+N` バッジを表示し、マウスホバーで返信内容をポップアップ表示

## [1.0.2] - 2026-02-18

### Added

- 画像プレビューモーダル（ImageModal）にページ URL を外部ブラウザで開くリンクを追加（`pageUrl` prop 経由）
- ImageThumbnail から元 URL を ImageModal へ渡すよう対応し、ユーザーナビゲーションを改善

### Fixed

- フィルター適用・解除時にスクロール位置を保持するよう改善（ThreadView）
- フィルター適用中の仮想スクロール描画の安定性向上（アイテムキーのユニーク化）

## [1.0.1] - 2026-02-18

### Fixed

- 仮想スクロール導入後、画像プレビューモーダルがウィンドウ全体ではなくレス行の高さ範囲にのみ表示されていたバグを修正（`createPortal` で `document.body` 直下にレンダリングするよう変更）

## [1.0.0] - 2026-02-18

### Added

- 2ch/5ch 系掲示板の板一覧・スレッド一覧・スレッド表示
- DAT 形式の読み込み・差分取得
- 書き込み機能（2ch/5ch, JBBS, まちBBS）
- タブ管理・タブ永続化
- お気に入り管理
- 閲覧履歴・書き込み履歴
- NGフィルタ（あぼーん機能）
- こてはん管理
- キーワードローカル検索・リモート検索
- 板・スレッドのラウンドリスト管理
- プロキシ設定（HTTP/HTTPS）
- 画像プレビュー
- BE 認証・Uplift 認証サポート
- 外部プラグイン対応（JBBS, まちBBS）
- Windows 10/11 x64 用 NSIS インストーラー
- ライセンスを MIT に変更

[1.6.1]: https://github.com/roflsunriz/VBBB/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/roflsunriz/VBBB/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/roflsunriz/VBBB/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/roflsunriz/VBBB/compare/v1.3.1...v1.4.0
[1.3.1]: https://github.com/roflsunriz/VBBB/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/roflsunriz/VBBB/compare/v1.2.1...v1.3.0
[1.2.1]: https://github.com/roflsunriz/VBBB/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/roflsunriz/VBBB/compare/v1.1.2...v1.2.0
[1.1.2]: https://github.com/roflsunriz/VBBB/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/roflsunriz/VBBB/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/roflsunriz/VBBB/compare/v1.0.3...v1.1.0
[1.0.3]: https://github.com/roflsunriz/VBBB/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/roflsunriz/VBBB/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/roflsunriz/VBBB/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/roflsunriz/VBBB/releases/tag/v1.0.0
