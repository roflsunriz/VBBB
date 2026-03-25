/**
 * PanelWindowManager — manages BrowserWindow instances for floating editor panels.
 *
 * Each panel (PostEditor, ProgrammaticPost, NgEditor) opens as an independent
 * OS-level child window with persisted position, size, and textarea dimensions.
 */
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { BrowserWindow, type BaseWindow } from 'electron';
import { is } from '@electron-toolkit/utils';
import type { PanelType, PanelWindowInitData, PanelWindowState } from '@shared/view-ipc';
import { createLogger } from './logger';

const logger = createLogger('panel-window');

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

const DEFAULT_PANEL_SIZES: Record<PanelType, { width: number; height: number }> = {
  'post-editor': { width: 520, height: 400 },
  'programmatic-post': { width: 600, height: 500 },
  'ng-editor': { width: 640, height: 520 },
};

const PANEL_STATE_FILE = 'panel-state.json';

interface PanelKey {
  readonly panelType: PanelType;
  readonly boardUrl: string;
  readonly threadId: string;
}

function panelKeyStr(key: PanelKey): string {
  return `${key.panelType}::${key.boardUrl}::${key.threadId}`;
}

type PanelStateMap = Record<string, PanelWindowState>;

export class PanelWindowManager {
  private readonly parentWindow: BaseWindow;
  private readonly dataDir: string;
  private readonly panels = new Map<string, BrowserWindow>();
  private readonly panelInitData = new Map<number, PanelWindowInitData>();
  private panelStates: PanelStateMap = {};

  constructor(parentWindow: BaseWindow, dataDir: string) {
    this.parentWindow = parentWindow;
    this.dataDir = dataDir;
    this.loadStates();
  }

  openPanel(
    panelType: PanelType,
    boardUrl: string,
    threadId: string,
    title: string,
    initialMessage?: string,
    hasExposedIps?: boolean,
  ): void {
    const key: PanelKey = { panelType, boardUrl, threadId };
    const keyStr = panelKeyStr(key);

    const existing = this.panels.get(keyStr);
    if (existing !== undefined && !existing.isDestroyed()) {
      existing.focus();
      return;
    }

    const stateKey = panelType;
    const saved = this.panelStates[stateKey];
    const defaults = DEFAULT_PANEL_SIZES[panelType];
    const width = saved?.width ?? defaults.width;
    const height = saved?.height ?? defaults.height;

    const winOptions: Electron.BrowserWindowConstructorOptions = {
      width,
      height,
      minWidth: 360,
      minHeight: 280,
      show: false,
      title: this.panelTitle(panelType, title),
      webPreferences: {
        preload: PRELOAD_PATH,
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    };

    if (saved?.x !== undefined && saved.y !== undefined) {
      winOptions.x = saved.x;
      winOptions.y = saved.y;
    }

    const win = new BrowserWindow(winOptions);

    const initData: PanelWindowInitData = {
      panelType,
      boardUrl,
      threadId,
      title,
      initialMessage,
      hasExposedIps,
    };

    this.panels.set(keyStr, win);
    this.panelInitData.set(win.webContents.id, initData);

    win.once('ready-to-show', () => {
      win.show();
    });

    win.on('close', () => {
      const bounds = win.getBounds();
      this.panelStates[stateKey] = {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      };
      this.saveStates();
    });

    win.on('closed', () => {
      this.panels.delete(keyStr);
      this.panelInitData.delete(win.webContents.id);
    });

    const page = `panel-${panelType}.html`;
    const url = rendererUrl(page);
    if (url.length > 0) {
      void win.loadURL(url);
    } else {
      void win.loadFile(rendererFilePath(page));
    }

    logger.info(`Opened ${panelType} panel for ${boardUrl} / ${threadId}`);
  }

  closePanel(panelType: PanelType, boardUrl: string, threadId: string): void {
    const keyStr = panelKeyStr({ panelType, boardUrl, threadId });
    const win = this.panels.get(keyStr);
    if (win !== undefined && !win.isDestroyed()) {
      win.close();
    }
  }

  getInitData(webContentsId: number): PanelWindowInitData | null {
    return this.panelInitData.get(webContentsId) ?? null;
  }

  destroyAll(): void {
    for (const win of this.panels.values()) {
      if (!win.isDestroyed()) {
        win.close();
      }
    }
    this.panels.clear();
    this.panelInitData.clear();
  }

  private panelTitle(panelType: PanelType, threadTitle: string): string {
    const prefix =
      panelType === 'post-editor'
        ? '書き込み'
        : panelType === 'programmatic-post'
          ? 'プログラマティック書き込み'
          : 'NGエディタ';
    return `${prefix} — ${threadTitle}`;
  }

  private loadStates(): void {
    try {
      const filePath = join(this.dataDir, PANEL_STATE_FILE);
      if (existsSync(filePath)) {
        const raw = readFileSync(filePath, 'utf-8');
        this.panelStates = JSON.parse(raw) as PanelStateMap;
      }
    } catch {
      this.panelStates = {};
    }
  }

  private saveStates(): void {
    try {
      const filePath = join(this.dataDir, PANEL_STATE_FILE);
      const dir = join(this.dataDir);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(filePath, JSON.stringify(this.panelStates, null, 2));
    } catch (err) {
      logger.info(`Failed to save panel states: ${String(err)}`);
    }
  }
}
