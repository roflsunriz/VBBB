# Changelog

All notable changes to VBBB will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.2]: https://github.com/roflsunriz/VBBB/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/roflsunriz/VBBB/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/roflsunriz/VBBB/releases/tag/v1.0.0
