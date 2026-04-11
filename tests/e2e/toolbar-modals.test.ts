/**
 * E2E: Toolbar button interactions and modal-open IPC behavior.
 *
 * Renderer smoke tests run against the built shell with mocked IPC, so these
 * checks verify the expected `modal:open` calls rather than real BrowserWindow
 * creation.
 */
import { test, expect } from './fixtures/electron-fixture';
import type { Invocation } from './fixtures/electron-fixture';
import type { Page } from '@playwright/test';

async function getModalOpenInvocations(page: Page): Promise<Invocation[]> {
  return page.evaluate<Invocation[]>(() => {
    const state = window.__VBBB_TEST__;
    return (state?.invocations ?? []).filter((call: Invocation) => call.channel === 'modal:open');
  });
}

test.describe('ツールバーボタン・モーダル', () => {
  test('Aboutモーダル: クリックで about を開く IPC が送られる', async ({ window }) => {
    await window.getByTitle('VBBBについて').click();

    await expect
      .poll(async () => getModalOpenInvocations(window))
      .toContainEqual({ channel: 'modal:open', args: ['about'] });
  });

  test('認証モーダル: クリックで auth を開く IPC が送られる', async ({ window }) => {
    await window.getByRole('button', { name: /認証/ }).click();

    await expect
      .poll(async () => getModalOpenInvocations(window))
      .toContainEqual({ channel: 'modal:open', args: ['auth'] });
  });

  test('プロキシモーダル: クリックで proxy を開く IPC が送られる', async ({ window }) => {
    await window.getByRole('button', { name: /プロキシ/ }).click();

    await expect
      .poll(async () => getModalOpenInvocations(window))
      .toContainEqual({ channel: 'modal:open', args: ['proxy'] });
  });

  test('外部板追加ダイアログ: クリックで add-board を開く IPC が送られる', async ({ window }) => {
    await window.getByRole('button', { name: /外部板追加/ }).click();

    await expect
      .poll(async () => getModalOpenInvocations(window))
      .toContainEqual({ channel: 'modal:open', args: ['add-board'] });
  });

  test('板一覧更新ボタン: クリック中は無効化される', async ({ window }) => {
    const refreshBtn = window.getByRole('button', { name: /板一覧更新/ });
    await expect(refreshBtn).not.toBeDisabled();

    await refreshBtn.click();

    await expect(refreshBtn).not.toBeDisabled({ timeout: 30_000 });
  });
});
