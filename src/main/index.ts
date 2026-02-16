import { join } from 'node:path';
import { app, BrowserWindow, shell } from 'electron';
import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import { registerIpcHandlers } from './ipc/handlers';
import { buildAppMenu } from './menu';
import { createLogger } from './logger';
import { loadWindowState, saveWindowState } from './services/window-state';

const rendererLogger = createLogger('renderer');

function getDataDir(): string {
  return join(app.getPath('userData'), 'vbbb-data');
}

function createWindow(): BrowserWindow {
  const dataDir = getDataDir();
  const windowState = loadWindowState(dataDir);

  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: windowState.width,
    height: windowState.height,
    minWidth: 800,
    minHeight: 600,
    show: false,
    title: `VBBB - Versatile BBS Browser v${app.getVersion()}`,
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  };

  // Restore position only if valid (not -1)
  if (windowState.x >= 0 && windowState.y >= 0) {
    windowOptions.x = windowState.x;
    windowOptions.y = windowState.y;
  }

  const mainWindow = new BrowserWindow(windowOptions);

  // Restore maximized state after window is ready
  mainWindow.on('ready-to-show', () => {
    if (windowState.isMaximized) {
      mainWindow.maximize();
    }
    mainWindow.show();
  });

  // Save window state before close
  mainWindow.on('close', () => {
    const isMaximized = mainWindow.isMaximized();
    // Get bounds from non-maximized state for proper restore
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

  // Prevent renderer <title> from overriding BrowserWindow title
  mainWindow.on('page-title-updated', (e) => {
    e.preventDefault();
  });

  // Forward renderer console errors/warnings to terminal
  mainWindow.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2) {
      rendererLogger.info(`[${level >= 3 ? 'ERROR' : 'WARN'}] ${message}`);
    }
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL'] !== undefined) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return mainWindow;
}

void app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.vbbb.app');

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  registerIpcHandlers();
  createWindow();
  buildAppMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
