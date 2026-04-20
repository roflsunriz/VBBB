import { expect, test } from './fixtures/electron-fixture';

test.describe('モーダル機能フロー', () => {
  test('外部板追加後に板一覧へ反映される', async ({ openApp }) => {
    const modal = await openApp('modal-host.html?modalType=add-board');

    await modal
      .getByPlaceholder('https://jbbs.shitaraba.jp/game/12345/')
      .fill('https://jbbs.shitaraba.jp/game/12345/');
    await modal.getByRole('button', { name: '追加', exact: true }).click();

    await expect(modal.getByText('game/12345 を追加しました')).toBeVisible();

    const shell = await openApp('shell.html');
    await shell.getByRole('button', { name: /^外部\s+\d+$/ }).click();
    await expect(shell.getByRole('button', { name: 'game/12345', exact: true })).toBeVisible();
  });

  test('認証モーダルで UPLIFT / Be のログイン状態が保持される', async ({ openApp }) => {
    const modal = await openApp('modal-host.html?modalType=auth');

    await modal.getByLabel('ユーザーID').fill('user-id');
    await modal.getByLabel('パスワード').first().fill('secret');
    await modal.getByRole('button', { name: 'ログイン', exact: true }).click();
    await expect(modal.getByText('UPLIFT: ログイン中')).toBeVisible();

    await modal.getByRole('button', { name: 'Be', exact: true }).click();
    await modal.getByLabel('メールアドレス').fill('user@example.com');
    await modal.getByLabel('パスワード').fill('be-secret');
    await modal.getByRole('button', { name: 'ログイン', exact: true }).click();
    await expect(modal.getByText('Be: ログイン中')).toBeVisible();

    await modal.reload();

    await expect(modal.getByText('UPLIFT: ログイン中')).toBeVisible();
    await modal.getByRole('button', { name: 'Be', exact: true }).click();
    await expect(modal.getByText('Be: ログイン中')).toBeVisible();
  });

  test('プロキシ設定が保存され再表示時にも維持される', async ({ openApp }) => {
    const modal = await openApp('modal-host.html?modalType=proxy');

    await modal.getByText('読み込み用プロキシ (ReadProxy)').click();
    await modal.getByText('書き込み用プロキシ (WriteProxy)').click();

    const checkboxes = modal.getByRole('checkbox');
    await checkboxes.nth(0).check();
    await checkboxes.nth(1).check();

    const textboxes = modal.getByRole('textbox');
    await textboxes.nth(0).fill('127.0.0.1');
    await textboxes.nth(1).fill('reader');
    await textboxes.nth(2).fill('reader-pass');
    await textboxes.nth(3).fill('127.0.0.2');
    await textboxes.nth(4).fill('writer');
    await textboxes.nth(5).fill('writer-pass');

    const spinbuttons = modal.getByRole('spinbutton');
    await spinbuttons.nth(0).fill('8080');
    await spinbuttons.nth(1).fill('9090');

    await modal.getByRole('button', { name: '保存', exact: true }).click();
    await expect(modal.getByText('保存しました')).toBeVisible();

    await modal.reload();

    await expect(textboxes.nth(0)).toHaveValue('127.0.0.1');
    await expect(spinbuttons.nth(0)).toHaveValue('8080');
    await expect(textboxes.nth(3)).toHaveValue('127.0.0.2');
    await expect(spinbuttons.nth(1)).toHaveValue('9090');
  });

  test('Cookie/UA 管理で Cookie 削除・UA 保存・BBS MENU とドメイン保存ができる', async ({
    openApp,
  }) => {
    const modal = await openApp('modal-host.html?modalType=cookie-manager');

    await expect(modal.getByText('.5ch.net')).toBeVisible();
    await modal.getByTitle('Cookie を削除').click();
    await expect(modal.getByText('Cookie はありません')).toBeVisible();

    await modal.getByRole('button', { name: 'User-Agent', exact: true }).click();
    await modal.getByLabel('User-Agent 文字列').fill('Changed UA');
    await modal.getByRole('button', { name: '保存', exact: true }).click();
    await expect(modal.getByText('User-Agent saved')).toBeVisible();

    await modal.getByRole('button', { name: 'BBSメニューURL', exact: true }).click();
    await modal
      .getByLabel('BBSメニューURL（1行に1つ）')
      .fill('https://menu.example.test/custom.html');
    await modal.getByRole('button', { name: '保存', exact: true }).click();
    await expect(modal.getByText('BBS メニュー URL を保存しました')).toBeVisible();

    await modal.getByRole('button', { name: 'ドメイン', exact: true }).click();
    await modal.getByLabel('5ch ベースドメイン').fill('itest.5ch.net');
    await modal.getByRole('button', { name: '保存', exact: true }).click();
    await expect(
      modal.getByText('5ch ドメインを保存しました。認証 Cookie は再設定が必要です。'),
    ).toBeVisible();
  });

  test('コンソールで絞り込み・検索・コピー・保存・削除・更新が動作する', async ({ openApp }) => {
    const modal = await openApp('modal-host.html?modalType=console');

    await modal.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: () => Promise.resolve(undefined),
        },
      });
    });

    await expect(modal.getByText('Shell ready')).toBeVisible();
    await modal.getByLabel('ログ検索').fill('Proxy');
    await expect(modal.getByText('Proxy disabled')).toBeVisible();

    await modal.getByLabel('検索対象フィールド').selectOption('message');
    await modal.getByRole('combobox').first().selectOption('warn');
    await expect(modal.getByText('Proxy disabled')).toBeVisible();
    await expect(modal.getByText('Shell ready')).not.toBeVisible();

    await modal.getByTitle('ログをコピー').click();
    await expect(modal.getByTitle('コピー済み')).toBeVisible();

    await modal.getByTitle('ログをファイルに保存').click();
    await expect(modal.getByTitle('保存しました')).toBeVisible();

    await modal.getByRole('button', { name: 'クリア', exact: true }).click();
    await expect(modal.getByText('ログエントリはありません')).toBeVisible();

    await modal.evaluate(() => {
      const state = window.__VBBB_TEST__?.getState() ?? {};
      const diagLogs = [
        {
          timestamp: '2026-04-20T10:10:00.000Z',
          level: 'warn',
          tag: 'refresh',
          message: 'Proxy refreshed log',
        },
      ];
      window.__VBBB_TEST__?.setState({ ...state, diagLogs });
    });
    await modal.getByTitle('更新').click();
    await expect(modal.getByText('Proxy refreshed log')).toBeVisible();
  });

  test('DSLエディタでプレビューとコピーが動作する', async ({ openApp }) => {
    const modal = await openApp('modal-host.html?modalType=dsl-editor');

    await modal.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: () => Promise.resolve(undefined),
        },
      });
    });

    await modal.getByPlaceholder('投稿本文を入力').fill('これはDSLのテストです');
    await expect(modal.locator('pre')).toContainText('これはDSLのテストです');
    await expect(modal.locator('pre')).toContainText('POST');

    await modal.getByRole('button', { name: 'コピー', exact: true }).click();
    await expect(modal.getByRole('button', { name: 'コピーしました', exact: true })).toBeVisible();
  });

  test('アップデート確認と更新開始が動作する', async ({ openApp }) => {
    const modal = await openApp('modal-host.html?modalType=update');

    await modal.getByRole('button', { name: '更新確認', exact: true }).click();
    await expect(modal.getByText('新しいバージョンが利用可能です')).toBeVisible();

    await modal.getByRole('button', { name: '更新開始', exact: true }).click();
    await expect(modal.getByText('インストール中です。完了後に自動で再起動します。')).toBeVisible();
  });
});
