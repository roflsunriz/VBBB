/**
 * E2E: Built renderer smoke test with mocked IPC.
 *
 * Verifies that:
 *  - The built shell page opens and is visible.
 *  - The built shell route is loaded.
 *  - The three-pane layout (toolbar / left pane / status bar) renders.
 *  - The left-pane tab bar contains all four tab buttons.
 *  - The toolbar contains key action buttons.
 */
import { test, expect } from './fixtures/electron-fixture';

test.describe('アプリ起動', () => {
  test('shell.html が読み込まれる', async ({ window }) => {
    await expect(window).toHaveURL(/\/shell\.html$/);
  });

  test('ツールバー（header）が表示される', async ({ window }) => {
    await expect(window.locator('header')).toBeVisible();
  });

  test('ツールバーに主要ボタンが揃っている', async ({ window }) => {
    const header = window.locator('header');

    await expect(header.getByRole('button', { name: /板一覧更新/ })).toBeVisible();
    await expect(header.getByRole('button', { name: /外部板追加/ })).toBeVisible();
    await expect(header.getByRole('button', { name: /認証/ })).toBeVisible();
    await expect(header.getByRole('button', { name: /プロキシ/ })).toBeVisible();
    await expect(header.getByRole('button', { name: /巡回/ })).toBeVisible();
    await expect(header.getByRole('button', { name: /Cookie\/UA/ })).toBeVisible();
    await expect(header.getByRole('button', { name: /コンソール/ })).toBeVisible();
    await expect(header.getByRole('button', { name: /DSL/ })).toBeVisible();
  });

  test('左ペインのタブが 4 つ表示される', async ({ window }) => {
    await expect(window.getByRole('button', { name: '板一覧', exact: true })).toBeVisible();
    await expect(window.getByRole('button', { name: /お気に入り/ })).toBeVisible();
    await expect(window.getByRole('button', { name: /検索/ })).toBeVisible();
    await expect(window.getByRole('button', { name: /履歴/ })).toBeVisible();
  });

  test('ステータスバー（footer）が表示される', async ({ window }) => {
    await expect(window.locator('footer')).toBeVisible();
  });

  test('モーダルが初期状態で閉じている', async ({ window }) => {
    await expect(window.getByRole('dialog')).toHaveCount(0);
  });
});
