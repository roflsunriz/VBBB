import { join } from 'node:path';
import { app, BaseWindow, session } from 'electron';
import { electronApp, optimizer } from '@electron-toolkit/utils';
import { performance } from 'node:perf_hooks';
import { lookupBoard, lookupCachedBoard, registerIpcHandlers } from './ipc/handlers';
import { buildAppMenu } from './menu';
import { createLogger } from './logger';
import { loadWindowState, saveWindowState } from './services/window-state';
import {
  loadSavedTabs,
  loadSessionState,
  saveSessionStateSync,
  saveTabsSync,
} from './services/tab-persistence';
import { loadFolderIdx } from './services/subject';
import { getBoardDir } from './services/file-io';
import { openExternalUrl } from './services/open-external';
import { ViewManager } from './view-manager';
import { setViewManager, getViewManagerOrNull } from './view-manager-ref';
import { PanelWindowManager } from './panel-window-manager';
import { setPanelWindowManager } from './panel-window-ref';
import { ModalWindowManager } from './modal-window-manager';
import { setModalWindowManager } from './modal-window-ref';

const startupLogger = createLogger('startup');
const rendererLogger = createLogger('renderer');
const layoutDebugLogger = createLogger('layout-debug');

function getDataDir(): string {
  return join(app.getPath('userData'), 'vbbb-data');
}

function scheduleLayoutDebugDumps(vm: ViewManager): void {
  if (process.env['VBBB_LAYOUT_DEBUG'] !== '1') return;

  for (const delayMs of [100, 500, 1500, 3000]) {
    setTimeout(() => {
      void vm
        .getLayoutDebugInfo()
        .then((info) => {
          layoutDebugLogger.info(`after ${String(delayMs)}ms ${JSON.stringify(info)}`);
        })
        .catch((error: unknown) => {
          layoutDebugLogger.warn(
            `after ${String(delayMs)}ms failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
    }, delayMs);
  }
}

const userDataDir = process.env['VBBB_USER_DATA_DIR'];
if (userDataDir !== undefined && userDataDir.length > 0) {
  app.setPath('userData', userDataDir);
}

function createWindow(): BaseWindow {
  const dataDir = getDataDir();
  const windowState = loadWindowState(dataDir);

  const windowOptions: Electron.BaseWindowConstructorOptions = {
    width: windowState.width,
    height: windowState.height,
    minWidth: 800,
    minHeight: 600,
    show: false,
    title: `VBBB - Versatile BBS Browser v${app.getVersion()}`,
    icon: join(__dirname, '../../resources/icon.png'),
  };

  if (windowState.x >= 0 && windowState.y >= 0) {
    windowOptions.x = windowState.x;
    windowOptions.y = windowState.y;
  }

  const mainWindow = new BaseWindow(windowOptions);

  const vm = new ViewManager(mainWindow);
  setViewManager(vm);

  const panelMgr = new PanelWindowManager(mainWindow, dataDir);
  setPanelWindowManager(panelMgr);

  const modalMgr = new ModalWindowManager(dataDir);
  modalMgr.setOnModalClosed((modalType) => {
    const vm = getViewManagerOrNull();
    if (vm !== null) {
      vm.broadcastToShell('modal:closed', { modalType });
    }
  });
  setModalWindowManager(modalMgr);

  const savedTabs = loadSavedTabs(dataDir);
  const session = loadSessionState(dataDir);

  const shellView = vm.createShellView();

  shellView.webContents.on('did-finish-load', () => {
    if (savedTabs.length > 0 || (session.boardTabUrls ?? []).length > 0) {
      const lookupKokomade = (boardUrl: string, threadId: string): number => {
        try {
          const board = lookupBoard(boardUrl);
          const boardDir = getBoardDir(dataDir, board.url);
          const indices = loadFolderIdx(boardDir);
          const datFileName = `${threadId}.dat`;
          const idx = indices.find((i) => i.fileName === datFileName);
          return idx?.kokomade ?? -1;
        } catch {
          return -1;
        }
      };
      vm.restoreTabs(savedTabs, session, lookupBoard, lookupCachedBoard, lookupKokomade);
    }
    vm.warmPool();
    if (windowState.isMaximized) {
      mainWindow.maximize();
    }
    vm.handleWindowResize();
    mainWindow.show();
    scheduleLayoutDebugDumps(vm);
  });

  mainWindow.on('close', () => {
    const savedThreadTabs = vm.getSavedThreadTabs();
    const boardTabs = vm.getSavedBoardTabs();
    const boardUrls = vm.getSavedBoardTabUrls();
    const activeBoardTabId = vm.getActiveBoardTabId();
    const activeThreadTabId = vm.getActiveThreadTabId();
    saveTabsSync(dataDir, savedThreadTabs);
    saveSessionStateSync(dataDir, {
      selectedBoardUrl: boardUrls[0] ?? null,
      boardTabs,
      boardTabUrls: boardUrls,
      activeBoardTabId: activeBoardTabId ?? undefined,
      activeThreadTabId: activeThreadTabId ?? undefined,
    });

    const isMaximized = mainWindow.isMaximized();
    if (isMaximized) {
      mainWindow.unmaximize();
    }
    const bounds = mainWindow.getBounds();
    void saveWindowState(dataDir, {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized,
    });
  });

  mainWindow.on('closed', () => {
    panelMgr.destroyAll();
    setPanelWindowManager(null);
    vm.destroyAll();
    setViewManager(null);
  });

  mainWindow.on('resize', () => {
    vm.handleWindowResize();
  });

  shellView.webContents.on('console-message', (event) => {
    const { level, message } = event;
    if (level === 'warning' || level === 'error') {
      rendererLogger.info(`[${level === 'error' ? 'ERROR' : 'WARN'}] ${message}`);
    }
  });

  shellView.webContents.setWindowOpenHandler((details) => {
    void openExternalUrl(details.url);
    return { action: 'deny' };
  });

  return mainWindow;
}

void app.whenReady().then(async () => {
  const t0 = performance.now();
  electronApp.setAppUserModelId('com.vbbb.app');

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://video.twimg.com/*'] },
    (details, callback) => {
      const headers = { ...details.requestHeaders };
      headers['Referer'] = 'https://x.com/';
      headers['Origin'] = 'https://x.com';
      callback({ requestHeaders: headers });
    },
  );

  await registerIpcHandlers();
  const tHandlesRegistered = performance.now();
  startupLogger.info(`IPC handles registered in ${(tHandlesRegistered - t0).toFixed(1)}ms`);

  createWindow();
  buildAppMenu();
  const tWindowCreated = performance.now();
  startupLogger.info(`Window created in ${(tWindowCreated - tHandlesRegistered).toFixed(1)}ms`);

  const tReady = performance.now();
  startupLogger.info(`Startup complete in ${(tReady - t0).toFixed(1)}ms`);

  app.on('activate', () => {
    if (BaseWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
