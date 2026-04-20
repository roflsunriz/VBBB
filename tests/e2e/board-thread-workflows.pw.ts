import type { Page } from '@playwright/test';

import { expect, test } from './fixtures/electron-fixture';

async function getInvocations(page: Page) {
  return page.evaluate(() => window.__VBBB_TEST__?.invocations ?? []);
}

test.describe('板タブとスレッドタブ', () => {
  test('巡回パネルで一覧表示・実行・削除・タイマー切替ができる', async ({ openApp }) => {
    const modal = await openApp('modal-host.html?modalType=round');

    await expect(modal.getByText('なんでも実況J')).toBeVisible();
    await modal.getByRole('button', { name: /スレッド \(1\)/ }).click();
    await expect(modal.getByText('実況スレ Part1')).toBeVisible();

    await modal.getByTitle('手動巡回').click();
    await expect
      .poll(async () =>
        (await getInvocations(modal)).some((call) => call.channel === 'round:execute'),
      )
      .toBeTruthy();

    await modal.getByRole('button', { name: /自動巡回 OFF/ }).click();
    await expect(modal.getByRole('button', { name: /自動巡回 ON/ })).toBeVisible();

    await modal.getByRole('button', { name: /板 \(1\)/ }).click();
    await modal.getByLabel('削除').click();
    await expect(modal.getByText('登録なし')).toBeVisible();
  });

  test('板タブで検索・お気に入り追加・NG追加・スレ立てができる', async ({ openApp }) => {
    const page = await openApp('board-tab.html');

    await expect(page.getByText('実況スレ Part1')).toBeVisible();

    const filter = page.getByPlaceholder('スレッドを検索...');
    await filter.fill('避難所');
    await expect(page.getByText('避難所スレ')).toBeVisible();
    await expect(page.getByText('実況スレ Part1')).not.toBeVisible();

    await page.getByLabel('検索をクリア').click();
    const row = page.getByText('実況スレ Part1');
    await expect(row).toBeVisible();

    await row.click({ button: 'right' });
    await page.getByRole('button', { name: 'お気に入りに追加', exact: true }).click();
    await expect
      .poll(async () => (await getInvocations(page)).some((call) => call.channel === 'fav:add'))
      .toBeTruthy();

    await row.click({ button: 'right' });
    await page.getByRole('button', { name: /NGスレッド \(あぼーん\)/ }).click();
    await expect
      .poll(async () => (await getInvocations(page)).some((call) => call.channel === 'ng:add-rule'))
      .toBeTruthy();

    await page.getByTitle('スレッドを新規作成').click();
    await page.locator('input[placeholder="スレッドタイトル（必須）"]').fill('新スレタイトル');
    await page.locator('textarea[placeholder="本文を入力 (Ctrl+Enter で送信)"]').fill('新スレ本文');
    await page.getByRole('button', { name: 'スレッドを立てる', exact: true }).click();
    await expect(page.getByText('スレッド作成成功')).toBeVisible();
    await expect
      .poll(async () =>
        (await getInvocations(page)).some(
          (call) =>
            call.channel === 'bbs:post' &&
            typeof call.args[0] === 'object' &&
            call.args[0] !== null &&
            'subject' in call.args[0],
        ),
      )
      .toBeTruthy();
  });

  test('スレッドタブで更新・相対時刻・分析・次スレ・書き込み導線が動く', async ({ openApp }) => {
    const page = await openApp('thread-tab.html');

    await expect(page.getByText('実況スレ Part1').first()).toBeVisible();
    await page.getByTitle('相対時刻: OFF').click();
    await expect(page.getByText(/秒前|分前|時間前|日前/).first()).toBeVisible();

    await page.getByTitle('スレッド分析').click();
    await expect(page.getByText('スレッド分析')).toBeVisible();
    await page.getByRole('button', { name: /画像一覧/ }).click();
    await expect(page.getByRole('button', { name: /まとめてダウンロード/ })).toBeVisible();
    await page.getByRole('button', { name: /まとめてダウンロード/ }).click();
    await expect
      .poll(async () =>
        (await getInvocations(page)).some((call) => call.channel === 'image:save-bulk'),
      )
      .toBeTruthy();

    await page.getByRole('button', { name: '次スレ', exact: true }).click();
    await expect
      .poll(async () =>
        (await getInvocations(page)).some(
          (call) => call.channel === 'view:open-thread-request' && call.args[1] === '1234567891',
        ),
      )
      .toBeTruthy();

    await page.getByTitle('現スレの>>1をベースに次スレを立てる').click();
    await expect
      .poll(async () =>
        (await getInvocations(page)).some(
          (call) => call.channel === 'view:open-board-new-thread-editor',
        ),
      )
      .toBeTruthy();

    await page.getByTitle('スレッドを更新').click();
    await expect(page.getByText('更新後のレス')).toBeVisible();

    await page.getByRole('button', { name: '書き込み', exact: true }).click();
    await expect
      .poll(async () =>
        (await getInvocations(page)).some(
          (call) => call.channel === 'panel:open' && call.args[0] === 'post-editor',
        ),
      )
      .toBeTruthy();

    await page.getByTitle('NG管理').click();
    await expect
      .poll(async () =>
        (await getInvocations(page)).some(
          (call) => call.channel === 'panel:open' && call.args[0] === 'ng-editor',
        ),
      )
      .toBeTruthy();
  });

  test('スレッドタブでインライン表示切替とプログラマティック書き込み導線が動く', async ({
    openApp,
  }) => {
    const page = await openApp('thread-tab.html');
    const mediaViewerButtons = page.getByRole('button', { name: '画像ビューアを開く' });

    await expect(mediaViewerButtons.first()).toBeVisible();

    await page.getByTitle('インライン画像/動画: ON').click();
    await expect(page.getByTitle('インライン画像/動画: OFF')).toBeVisible();
    await expect(mediaViewerButtons).toHaveCount(0);

    await page.getByRole('button', { name: 'プログラマティック書き込み', exact: true }).click();
    await expect
      .poll(async () =>
        (await getInvocations(page)).some(
          (call) => call.channel === 'panel:open' && call.args[0] === 'programmatic-post',
        ),
      )
      .toBeTruthy();
  });
});
