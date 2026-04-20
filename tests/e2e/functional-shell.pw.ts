import { expect, test } from './fixtures/electron-fixture';

test.describe('UI機能フロー', () => {
  test('板一覧更新と検索バーが動作する', async ({ window }) => {
    await expect(window.getByRole('button', { name: /ニュース/ })).toBeVisible();
    await expect(window.getByRole('button', { name: /新着カテゴリ/ })).not.toBeVisible();

    await window.getByRole('button', { name: /板一覧更新/ }).click();

    await expect(window.getByRole('button', { name: /新着カテゴリ/ })).toBeVisible();

    const searchInput = window.getByPlaceholder('カテゴリ・板を検索...');
    await searchInput.fill('ソフト');

    await expect(window.getByRole('button', { name: /新着カテゴリ/ })).toBeVisible();
    await window.getByRole('button', { name: /新着カテゴリ/ }).click();
    await expect(window.getByRole('button', { name: 'ソフトウェア', exact: true })).toBeVisible();
    await expect(window.getByRole('button', { name: /ニュース/ })).not.toBeVisible();
  });

  test('板一覧から通常導線で板タブを開き、お気に入り追加・フォルダ移動・削除ができる', async ({
    window,
  }) => {
    await window.getByRole('button', { name: /ニュース/ }).click();
    const boardRow = window.getByRole('button', { name: 'なんでも実況J', exact: true });
    await expect(boardRow).toBeVisible();

    await boardRow.click();
    await expect(window.locator('text=なんでも実況J').nth(1)).toBeVisible();

    await boardRow.click({ button: 'right' });
    await window.getByRole('menuitem', { name: 'お気に入りに追加' }).click();

    await window.getByRole('button', { name: 'お気に入り', exact: true }).click();
    await expect(window.getByText('なんでも実況J')).toBeVisible();

    await window.getByTitle('フォルダを作成').click();
    await window.getByPlaceholder('フォルダ名を入力...').fill('巡回候補');
    await window.getByPlaceholder('フォルダ名を入力...').press('Enter');

    const favItem = window
      .locator('aside')
      .getByRole('button', { name: 'なんでも実況J', exact: true });
    await favItem.click({ button: 'right' });
    await window.getByRole('menuitem', { name: /フォルダに移動/ }).click();
    await window.getByRole('menuitem', { name: '巡回候補', exact: true }).click();

    await expect(window.getByText('巡回候補')).toBeVisible();
    await expect(window.locator('aside').getByText('なんでも実況J')).toBeVisible();

    await favItem.click({ button: 'right' });
    await window.getByRole('menuitem', { name: /削除/ }).click();
    await expect(window.locator('aside').getByText('なんでも実況J')).not.toBeVisible();
  });

  test('検索タブのローカル検索とリモート検索が表示される', async ({ window }) => {
    await window.getByRole('button', { name: '検索', exact: true }).click();

    const searchInput = window.getByPlaceholder('検索パターン (正規表現)');
    await searchInput.fill('実況');
    await window.getByLabel('検索', { exact: true }).click();

    const localSubject = window.getByRole('button', { name: /なんでも実況J.*実況スレ/ }).first();
    await expect(localSubject).toBeVisible();
    await localSubject.click();
    await expect(window.getByText('実況スレ').last()).toBeVisible();

    await window.getByRole('button', { name: 'リモート検索', exact: true }).click();
    const remoteInput = window.getByPlaceholder('キーワード (ff5ch.syoboi.jp)');
    await remoteInput.fill('playwright');
    await window.getByLabel('検索', { exact: true }).click();

    await expect(window.getByText('Playwright 総合')).toBeVisible();
    await expect(window.getByText('なんでも実況J')).toBeVisible();
  });

  test('履歴タブで検索・更新・削除ができる', async ({ window }) => {
    await window.getByRole('button', { name: '履歴', exact: true }).click();
    const historyPanel = window
      .locator('div')
      .filter({ hasText: /^履歴 \(1\)/ })
      .first();
    await expect(window.getByText('実況スレ')).toBeVisible();

    await historyPanel.getByRole('button', { name: '更新', exact: true }).click();
    await expect(window.getByText('実況スレ')).toBeVisible();

    const historySearch = window.getByPlaceholder('履歴を検索...');
    await historySearch.fill('実況');
    await expect(window.getByText('実況スレ')).toBeVisible();

    await historyPanel.getByTitle('履歴をすべて削除').click();
    await expect(window.getByText('履歴はありません')).toBeVisible();
  });
});
