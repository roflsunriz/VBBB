/**
 * E2E: Left-pane tab navigation.
 *
 * The left pane has four tabs: 板一覧 / お気に入り / 検索 / 履歴.
 * Verifies that:
 *  - 板一覧 is selected by default on startup.
 *  - Clicking each tab activates it (gains the `border-b-2` class that
 *    signals the active-tab visual style in Tailwind).
 *  - Clicking 板一覧 again returns to the initial active state.
 */
import { test, expect } from './fixtures/electron-fixture';
import type { Page } from '@playwright/test';

/** Returns the tab button locator for the given label. */
function tabButton(window: Page, name: string) {
  return window.getByRole('button', { name: new RegExp(name) });
}

test.describe('左ペインタブ切り替え', () => {
  test('初期状態で板一覧タブがアクティブになっている', async ({ window }) => {
    await expect(tabButton(window, '板一覧')).toHaveClass(/border-b-2/);
    await expect(tabButton(window, 'お気に入り')).not.toHaveClass(/border-b-2/);
    await expect(tabButton(window, '検索')).not.toHaveClass(/border-b-2/);
    await expect(tabButton(window, '履歴')).not.toHaveClass(/border-b-2/);
  });

  test('お気に入りタブをクリックするとアクティブになる', async ({ window }) => {
    await tabButton(window, 'お気に入り').click();
    await expect(tabButton(window, 'お気に入り')).toHaveClass(/border-b-2/);
    await expect(tabButton(window, '板一覧')).not.toHaveClass(/border-b-2/);
  });

  test('検索タブをクリックするとアクティブになる', async ({ window }) => {
    await tabButton(window, '検索').click();
    await expect(tabButton(window, '検索')).toHaveClass(/border-b-2/);
    await expect(tabButton(window, '板一覧')).not.toHaveClass(/border-b-2/);
  });

  test('履歴タブをクリックするとアクティブになる', async ({ window }) => {
    await tabButton(window, '履歴').click();
    await expect(tabButton(window, '履歴')).toHaveClass(/border-b-2/);
    await expect(tabButton(window, '板一覧')).not.toHaveClass(/border-b-2/);
  });

  test('板一覧タブに戻るとアクティブになる', async ({ window }) => {
    // Navigate away first, then return
    await tabButton(window, '検索').click();
    await tabButton(window, '板一覧').click();
    await expect(tabButton(window, '板一覧')).toHaveClass(/border-b-2/);
    await expect(tabButton(window, '検索')).not.toHaveClass(/border-b-2/);
  });
});
