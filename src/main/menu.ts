/**
 * Custom Electron application menu for VBBB.
 * Menu actions are dispatched via an EventEmitter that the IPC handler subscribes to.
 * This avoids the unreliable webContents.send → ipcRenderer.on path.
 */
import { EventEmitter } from 'node:events';
import { Menu, type MenuItemConstructorOptions } from 'electron';
import type { MenuAction } from '@shared/menu';
import { createLogger } from './logger';

const logger = createLogger('menu');

/**
 * Internal event emitter for menu actions.
 * The IPC handler for 'menu:wait-action' listens on 'action'.
 */
export const menuEmitter = new EventEmitter();

/**
 * Dispatch a menu action to the renderer via the event emitter.
 */
function dispatchAction(action: MenuAction): void {
  logger.info(`Menu action: ${action.type}`);
  menuEmitter.emit('action', action);
}

/**
 * Build and set the application menu.
 */
export function buildAppMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'ファイル',
      submenu: [
        {
          label: '板一覧を更新',
          accelerator: 'F5',
          click: () => {
            dispatchAction({ type: 'refresh-boards' });
          },
        },
        { type: 'separator' },
        { role: 'quit', label: '終了' },
      ],
    },
    {
      label: '表示',
      submenu: [
        {
          label: '板一覧',
          accelerator: 'CmdOrCtrl+1',
          click: () => {
            dispatchAction({ type: 'switch-tab', tab: 'boards' });
          },
        },
        {
          label: 'お気に入り',
          accelerator: 'CmdOrCtrl+2',
          click: () => {
            dispatchAction({ type: 'switch-tab', tab: 'favorites' });
          },
        },
        {
          label: '検索',
          accelerator: 'CmdOrCtrl+3',
          click: () => {
            dispatchAction({ type: 'switch-tab', tab: 'search' });
          },
        },
        { type: 'separator' },
        { role: 'toggleDevTools', label: '開発者ツール' },
      ],
    },
    {
      label: 'ツール',
      submenu: [
        {
          label: '認証設定 (UPLIFT/Be)',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => {
            dispatchAction({ type: 'open-modal', modal: 'auth' });
          },
        },
        {
          label: 'プロキシ設定',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => {
            dispatchAction({ type: 'open-modal', modal: 'proxy' });
          },
        },
        {
          label: '巡回リスト',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => {
            dispatchAction({ type: 'open-modal', modal: 'round' });
          },
        },
        {
          label: 'DSLエディタ',
          accelerator: 'CmdOrCtrl+Shift+D',
          click: () => {
            dispatchAction({ type: 'open-modal', modal: 'dsl-editor' });
          },
        },
        {
          label: '関連スレッド類似度',
          submenu: [
            {
              label: '40%',
              click: () => {
                dispatchAction({ type: 'set-related-thread-similarity', value: 40 });
              },
            },
            {
              label: '45%',
              click: () => {
                dispatchAction({ type: 'set-related-thread-similarity', value: 45 });
              },
            },
            {
              label: '50%',
              click: () => {
                dispatchAction({ type: 'set-related-thread-similarity', value: 50 });
              },
            },
            {
              label: '55%',
              click: () => {
                dispatchAction({ type: 'set-related-thread-similarity', value: 55 });
              },
            },
            {
              label: '60%',
              click: () => {
                dispatchAction({ type: 'set-related-thread-similarity', value: 60 });
              },
            },
            {
              label: '65%',
              click: () => {
                dispatchAction({ type: 'set-related-thread-similarity', value: 65 });
              },
            },
            {
              label: '70%',
              click: () => {
                dispatchAction({ type: 'set-related-thread-similarity', value: 70 });
              },
            },
            {
              label: '75%',
              click: () => {
                dispatchAction({ type: 'set-related-thread-similarity', value: 75 });
              },
            },
            {
              label: '80%',
              click: () => {
                dispatchAction({ type: 'set-related-thread-similarity', value: 80 });
              },
            },
            {
              label: '85%',
              click: () => {
                dispatchAction({ type: 'set-related-thread-similarity', value: 85 });
              },
            },
            {
              label: '90%',
              click: () => {
                dispatchAction({ type: 'set-related-thread-similarity', value: 90 });
              },
            },
            {
              label: '95%',
              click: () => {
                dispatchAction({ type: 'set-related-thread-similarity', value: 95 });
              },
            },
          ],
        },
        { type: 'separator' },
        {
          label: 'NG管理',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => {
            dispatchAction({ type: 'toggle-ng' });
          },
        },
        {
          label: 'Cookie/UA管理',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => {
            dispatchAction({ type: 'open-modal', modal: 'cookie-manager' });
          },
        },
        { type: 'separator' },
        {
          label: '診断コンソール',
          accelerator: 'CmdOrCtrl+Shift+L',
          click: () => {
            dispatchAction({ type: 'open-modal', modal: 'console' });
          },
        },
      ],
    },
    {
      label: 'ヘルプ',
      submenu: [
        {
          label: 'アップデート',
          click: () => {
            dispatchAction({ type: 'open-modal', modal: 'update' });
          },
        },
        { type: 'separator' },
        {
          label: 'VBBB について',
          click: () => {
            dispatchAction({ type: 'open-modal', modal: 'about' });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  logger.info('Application menu built');
}
