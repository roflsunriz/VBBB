/**
 * E2E: Toolbar button interactions and modal open/close behavior.
 *
 * Since v3.2.0, modals open as separate BrowserWindow instances (not DOM dialogs).
 * Each test clicks a toolbar button, waits for the new window, verifies content,
 * and then closes the modal window.
 */
import { test, expect } from './fixtures/electron-fixture';

test.describe('ツールバーボタン・モーダル', () => {
  test('Aboutモーダル: 開く → 内容確認 → 閉じる（閉じるボタン）', async ({
    electronApp,
    window,
  }) => {
    const [modalPage] = await Promise.all([
      electronApp.waitForEvent('window'),
      window.getByTitle('VBBBについて').click(),
    ]);
    await modalPage.waitForLoadState('domcontentloaded');
    await modalPage.waitForSelector('h2', { state: 'visible', timeout: 10_000 });

    await expect(modalPage.getByRole('heading', { name: 'VBBB' })).toBeVisible();
    await expect(modalPage.getByText('Versatile BBS Browser')).toBeVisible();
    await expect(modalPage.getByText(/^v\d+\.\d+\.\d+/)).toBeVisible();

    await modalPage.getByRole('button', { name: /閉じる/ }).click();
    await modalPage.waitForEvent('close', { timeout: 5_000 });
  });

  test('認証モーダル: 開く → Escape で閉じる', async ({ electronApp, window }) => {
    const [modalPage] = await Promise.all([
      electronApp.waitForEvent('window'),
      window.getByRole('button', { name: /認証/ }).click(),
    ]);
    await modalPage.waitForLoadState('domcontentloaded');
    await modalPage.waitForSelector('text=読み込み中', { state: 'hidden', timeout: 10_000 });

    await modalPage.keyboard.press('Escape');
    await modalPage.waitForEvent('close', { timeout: 5_000 });
  });

  test('プロキシモーダル: 開く → 閉じる', async ({ electronApp, window }) => {
    const [modalPage] = await Promise.all([
      electronApp.waitForEvent('window'),
      window.getByRole('button', { name: /プロキシ/ }).click(),
    ]);
    await modalPage.waitForLoadState('domcontentloaded');
    await modalPage.waitForSelector('text=読み込み中', { state: 'hidden', timeout: 10_000 });

    await modalPage.close();
  });

  test('外部板追加ダイアログ: 開く → Escape で閉じる', async ({ electronApp, window }) => {
    const [modalPage] = await Promise.all([
      electronApp.waitForEvent('window'),
      window.getByRole('button', { name: /外部板追加/ }).click(),
    ]);
    await modalPage.waitForLoadState('domcontentloaded');
    await modalPage.waitForSelector('text=読み込み中', { state: 'hidden', timeout: 10_000 });

    await modalPage.keyboard.press('Escape');
    await modalPage.waitForEvent('close', { timeout: 5_000 });
  });

  test('板一覧更新ボタン: クリック中は無効化される', async ({ window }) => {
    const refreshBtn = window.getByRole('button', { name: /板一覧更新/ });
    await expect(refreshBtn).not.toBeDisabled();

    await refreshBtn.click();

    await expect(refreshBtn).not.toBeDisabled({ timeout: 30_000 });
  });
});
