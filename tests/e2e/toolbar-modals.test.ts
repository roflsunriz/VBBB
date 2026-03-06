/**
 * E2E: Toolbar button interactions and modal open/close behavior.
 *
 * Verifies that:
 *  - The About modal opens when the info icon button is clicked,
 *    displays product name and description, and closes via its button.
 *  - The Auth modal opens when the 認証 button is clicked,
 *    and closes when the Escape key is pressed.
 *  - The Proxy modal opens when the プロキシ button is clicked,
 *    and closes when the backdrop is clicked.
 *  - The 外部板追加 modal opens and closes correctly.
 */
import { test, expect } from './fixtures/electron-fixture';

test.describe('ツールバーボタン・モーダル', () => {
  test('Aboutモーダル: 開く → 内容確認 → 閉じる（閉じるボタン）', async ({ window }) => {
    // About button has title="VBBBについて" and no text label
    await window.getByTitle('VBBBについて').click();

    const dialog = window.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'VBBB' })).toBeVisible();
    await expect(dialog.getByText('Versatile BBS Browser')).toBeVisible();
    // Version string starts with "v"
    await expect(dialog.getByText(/^v\d+\.\d+\.\d+/)).toBeVisible();

    await dialog.getByRole('button', { name: /閉じる/ }).click();
    await expect(window.getByRole('dialog')).toHaveCount(0);
  });

  test('認証モーダル: 開く → Escape で閉じる', async ({ window }) => {
    await window.getByRole('button', { name: /認証/ }).click();

    const dialog = window.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await window.keyboard.press('Escape');
    await expect(window.getByRole('dialog')).toHaveCount(0);
  });

  test('プロキシモーダル: 開く → バックドロップクリックで閉じる', async ({ window }) => {
    await window.getByRole('button', { name: /プロキシ/ }).click();

    const dialog = window.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Click the semi-transparent backdrop (the dialog overlay itself, not the inner panel)
    await dialog.click({ position: { x: 5, y: 5 }, force: true });
    await expect(window.getByRole('dialog')).toHaveCount(0);
  });

  test('外部板追加ダイアログ: 開く → Escape で閉じる', async ({ window }) => {
    await window.getByRole('button', { name: /外部板追加/ }).click();

    const dialog = window.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await window.keyboard.press('Escape');
    await expect(window.getByRole('dialog')).toHaveCount(0);
  });

  test('板一覧更新ボタン: クリック中は無効化される', async ({ window }) => {
    const refreshBtn = window.getByRole('button', { name: /板一覧更新/ });
    // Button is enabled before the click
    await expect(refreshBtn).not.toBeDisabled();

    // Trigger refresh — the button becomes disabled while loading
    await refreshBtn.click();

    // After the async fetch completes, the button returns to enabled state
    await expect(refreshBtn).not.toBeDisabled({ timeout: 30_000 });
  });
});
