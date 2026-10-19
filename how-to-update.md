- Node.js 24以上と最新のBunを用意し、リリース対象外の未コミット差分がないことを確認します。

作業前に [findings.md](findings.md) を全文読み、固有の環境・ツール・例外条件を確認する。以下は更新と復旧の手順の正本とする。

- package.jsonのバージョンを上げます。目安はv1.2.3の場合、1（メジャー）は破壊的変更や大幅な機能強化、2（マイナー）は小さな機能追加やバグ修正、3（パッチ）はバグ修正です。
- src/types/file-format.tsのDEFAULT_USER_AGENTのバージョン番号を更新します。
- .env.exampleのユーザーエージェントのバージョン番号を更新します。
- CHANGELOG.mdに変更点を記載し、必要であればREADME.mdも更新します。チェンジログは前回のタグからのコミット履歴を全て参照して詳細に記述します。
- E2Eテストとユニットテストを実行し失敗しないことを確認します。失敗する場合はCI/CDとReleaseワークフローが失敗するので修正してからコミットプッシュします。
- `bun audit`を実行し、既知の依存脆弱性が0件であることを確認します。警告がある場合は依存関係とロックファイルを更新し、全検証を再実行します。
- フォーマット(prettier)を実行し、コードの整形を行います。
- ここまでの変更をリモートリポジトリにコミットプッシュします。
- `git tag <タグ名>`でタグを作成し、`git push origin <タグ名>`でタグをプッシュします。
- GitHub ActionsのReleaseワークフローが実行され、ビルドが始まります。
- リリースが自動作成されます。

## Dependabot PR の更新


Dependabot version update は毎月28日00:00、検証済み PR の自動マージは同日18:00（いずれも `Asia/Tokyo`）にまとめます。28日より前に自動マージせず、現在の head SHA と全 PR チェックを月末処理で再確認します。
前提は `.github/dependabot.yml` と PR 用 CI（CI）です。更新 PR の head SHA と `gh pr checks <PR番号>` の結果を確認してください。patch／minor は全チェック成功後に自動取り込みされます。初回 CI 失敗は failed jobs のみを 1 回再実行し、再失敗時は `bun.lock` の再生成を試み、修復後の CI を再実行します。変更がない場合や再度失敗した場合は PR を残します。

設定を変えたときは `actionlint .github/workflows/dependabot-automation.yml` と実際の PR の Actions 結果を確認します。問題があれば呼び出し先の共通 workflow SHA を直前の検証済み値へ戻すコミットを push します。取り込まれた依存更新に問題があれば通常の revert コミットで復旧します。

## 依存脆弱性の更新

`package.json` の `overrides` は、上流パッケージが fast-uri の旧版を固定している間に安全な patch 版を選ぶために使う。上流が安全版を採用したら override を減らせるか確認する。更新時は `bun install --lockfile-only --ignore-scripts`、`bun install --frozen-lockfile`、`bun audit` を実行し、該当する lint・型・テスト・ビルドを確認する。問題があれば更新コミットを revert し、lockfile と package.json を同じ版へ戻す。

他の推移依存にも安全版を選ぶoverrideがあるため、更新時は既存の固定版も再監査する。`global-agent` は4系へ更新することで、旧ダウンローダーが引く修正版のない `sprintf-js` を除いている。上流が安全な依存へ移行したらこの指定を見直す。

ReactとReact DOMは完全に同じバージョンへ更新し、両方の型定義も対応する版へ揃える。TypeScript ESLintのparserとpluginも一緒に更新する。TypeScriptはparserの対応範囲を確認して選ぶ。2026-10-15時点ではTypeScript 6.0.3を使用し、parser 8.71.2が対応していない7系は採用しない。TypeScript 6ではNode型の自動取り込みに依存せず、`@types/node` と両tsconfigの `types` を明示する。

CI 完了より Dependabot の分類が遅れる場合は、`callback_workflow_file` が指す呼び出し側 workflow を `workflow_dispatch` し、同じ PR 番号・head SHA・全チェックを再確認する。呼び出し側のファイル名を変える際はこの入力も一緒に更新する。
