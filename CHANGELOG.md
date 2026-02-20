# Changelog

All notable changes to VBBB will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.2.0]: https://github.com/roflsunriz/VBBB/compare/v1.1.2...v1.2.0
[1.1.2]: https://github.com/roflsunriz/VBBB/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/roflsunriz/VBBB/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/roflsunriz/VBBB/compare/v1.0.3...v1.1.0
[1.0.3]: https://github.com/roflsunriz/VBBB/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/roflsunriz/VBBB/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/roflsunriz/VBBB/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/roflsunriz/VBBB/releases/tag/v1.0.0
