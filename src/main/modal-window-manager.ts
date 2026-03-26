/**
 * ModalWindowManager — manages BrowserWindow instances for application modals.
 *
 * Each modal (auth, proxy, console, etc.) opens as an independent OS-level
 * child window. Only one instance per modal type is allowed at a time.
 */
import { join } from 'node:path';
import { BrowserWindow } from 'electron';
import { is } from '@electron-toolkit/utils';
import type { ModalWindowType, ModalWindowInitData } from '@shared/view-ipc';
import { createLogger } from './logger';

const logger = createLogger('modal-window');

const PRELOAD_PATH = join(__dirname, '../preload/index.mjs');

function rendererUrl(page: string): string {
  if (is.dev && process.env['ELECTRON_RENDERER_URL'] !== undefined) {
    return `${process.env['ELECTRON_RENDERER_URL']}/${page}`;
  }
  return '';
}

function rendererFilePath(page: string): string {
  return join(__dirname, `../renderer/${page}`);
}

interface ModalConfig {
  readonly width: number;
  readonly height: number;
  readonly title: string;
  readonly resizable: boolean;
}

const MODAL_CONFIGS: Record<ModalWindowType, ModalConfig> = {
  auth: { width: 500, height: 400, title: '認証設定', resizable: true },
  proxy: { width: 520, height: 480, title: 'プロキシ設定', resizable: true },
  round: { width: 480, height: 500, title: '巡回リスト', resizable: true },
  ng: { width: 672, height: 520, title: 'NG設定', resizable: true },
  about: { width: 384, height: 400, title: 'VBBBについて', resizable: false },
  'cookie-manager': { width: 600, height: 500, title: 'Cookie/UA管理', resizable: true },
  console: { width: 900, height: 600, title: '診断コンソール', resizable: true },
  'add-board': { width: 512, height: 320, title: '外部板追加', resizable: false },
  update: { width: 384, height: 300, title: 'アップデート確認', resizable: false },
  'dsl-editor': { width: 800, height: 600, title: 'DSLエディタ', resizable: true },
};

export class ModalWindowManager {
  private readonly modals = new Map<ModalWindowType, BrowserWindow>();
  private readonly modalInitData = new Map<number, ModalWindowInitData>();
  private onModalClosed: ((modalType: ModalWindowType) => void) | null = null;

  setOnModalClosed(callback: (modalType: ModalWindowType) => void): void {
    this.onModalClosed = callback;
  }

  openModal(modalType: ModalWindowType): void {
    const existing = this.modals.get(modalType);
    if (existing !== undefined && !existing.isDestroyed()) {
      existing.focus();
      return;
    }

    const config = MODAL_CONFIGS[modalType];

    const win = new BrowserWindow({
      width: config.width,
      height: config.height,
      minWidth: 300,
      minHeight: 200,
      show: false,
      title: config.title,
      resizable: config.resizable,
      minimizable: false,
      maximizable: config.resizable,
      webPreferences: {
        preload: PRELOAD_PATH,
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    const webContentsId = win.webContents.id;
    this.modals.set(modalType, win);
    this.modalInitData.set(webContentsId, { modalType });

    win.once('ready-to-show', () => {
      win.show();
    });

    win.on('closed', () => {
      this.modals.delete(modalType);
      this.modalInitData.delete(webContentsId);
      this.onModalClosed?.(modalType);
      logger.info(`Modal closed: ${modalType}`);
    });

    const page = 'modal-host.html';
    const url = rendererUrl(page);
    if (url.length > 0) {
      void win.loadURL(url);
    } else {
      void win.loadFile(rendererFilePath(page));
    }

    logger.info(`Opened modal: ${modalType}`);
  }

  getInitData(webContentsId: number): ModalWindowInitData | null {
    return this.modalInitData.get(webContentsId) ?? null;
  }

  destroyAll(): void {
    for (const win of this.modals.values()) {
      if (!win.isDestroyed()) {
        win.destroy();
      }
    }
    this.modals.clear();
    this.modalInitData.clear();
  }
}
