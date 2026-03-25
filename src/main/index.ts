import { join } from 'node:path';
import { app, BaseWindow, session, shell } from 'electron';
import { electronApp, optimizer } from '@electron-toolkit/utils';
import { performance } from 'node:perf_hooks';
import { registerIpcHandlers } from './ipc/handlers';
import { buildAppMenu } from './menu';
import { createLogger } from './logger';
import { loadWindowState, saveWindowState } from './services/window-state';
import { ViewManager } from './view-manager';
import { setViewManager } from './view-manager-ref';

const startupLogger = createLogger('startup');
const rendererLogger = createLogger('renderer');

function getDataDir(): string {
  return join(app.getPath('userData'), 'vbbb-data');
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

  const shellView = vm.createShellView();

  shellView.webContents.on('did-finish-load', () => {
    if (windowState.isMaximized) {
      mainWindow.maximize();
    }
    mainWindow.show();
  });

  mainWindow.on('close', () => {
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
    void shell.openExternal(details.url);
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

  const ipcReady = registerIpcHandlers();
  const tHandlesRegistered = performance.now();
  startupLogger.info(`IPC handles registered in ${(tHandlesRegistered - t0).toFixed(1)}ms`);

  createWindow();
  buildAppMenu();
  const tWindowCreated = performance.now();
  startupLogger.info(`Window created in ${(tWindowCreated - tHandlesRegistered).toFixed(1)}ms`);

  await ipcReady;
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
