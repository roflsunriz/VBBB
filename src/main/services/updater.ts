/**
 * Application update service using electron-updater.
 * Checks GitHub Releases for the latest version, downloads the installer
 * with progress reporting, and silently installs on quit.
 */
import { app } from 'electron';
import electronUpdater from 'electron-updater';
import type { UpdateInfo, ProgressInfo, UpdateDownloadedEvent } from 'electron-updater';

const { autoUpdater } = electronUpdater;
import type { UpdateCheckResult, UpdateProgress } from '@shared/update';
import { createLogger } from '../logger';

const logger = createLogger('updater');

// Suppress electron-updater's default console logger; we use our own logger via events.
autoUpdater.logger = null;
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

/**
 * Check GitHub Releases for the latest version.
 * In development (non-packaged) mode, returns the current version as latest with no update.
 */
export function checkForUpdate(): Promise<UpdateCheckResult> {
  if (!app.isPackaged) {
    logger.info('開発モード: アップデートチェックをスキップ');
    return Promise.resolve({ latestVersion: app.getVersion(), hasUpdate: false });
  }

  logger.info(`アップデート確認 (現在: ${app.getVersion()})`);

  return new Promise<UpdateCheckResult>((resolve, reject) => {
    const onAvailable = (info: UpdateInfo): void => {
      cleanup();
      logger.info(`更新あり: ${info.version}`);
      resolve({ latestVersion: info.version, hasUpdate: true });
    };

    const onNotAvailable = (info: UpdateInfo): void => {
      cleanup();
      logger.info(`最新版を使用中: ${info.version}`);
      resolve({ latestVersion: info.version, hasUpdate: false });
    };

    const onError = (err: Error): void => {
      cleanup();
      logger.error('アップデート確認エラー', err);
      reject(err);
    };

    function cleanup(): void {
      autoUpdater.removeListener('update-available', onAvailable);
      autoUpdater.removeListener('update-not-available', onNotAvailable);
      autoUpdater.removeListener('error', onError);
    }

    autoUpdater.once('update-available', onAvailable);
    autoUpdater.once('update-not-available', onNotAvailable);
    autoUpdater.once('error', onError);

    autoUpdater.checkForUpdates().catch((err: unknown) => {
      onError(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

/**
 * Download the update found by checkForUpdate, reporting progress via onProgress.
 * After download completes, quits and silently installs the new version,
 * then restarts the app automatically.
 */
export function downloadAndInstall(onProgress: (progress: UpdateProgress) => void): Promise<void> {
  logger.info('ダウンロード開始');

  return new Promise<void>((resolve, reject) => {
    const onProgressEvent = (info: ProgressInfo): void => {
      onProgress({
        percent: Math.min(Math.round(info.percent), 99),
        bytesDownloaded: info.transferred,
        totalBytes: info.total,
      });
    };

    const onDownloaded = (_event: UpdateDownloadedEvent): void => {
      cleanup();
      onProgress({ percent: 100, bytesDownloaded: 0, totalBytes: 0 });
      logger.info('ダウンロード完了。インストール準備中');
      resolve();
      // IPC レスポンスをレンダラーが受け取れるよう少し待ってから終了する
      setTimeout(() => {
        autoUpdater.quitAndInstall(true, true);
      }, 1000);
    };

    const onError = (err: Error): void => {
      cleanup();
      logger.error('ダウンロードエラー', err);
      reject(err);
    };

    function cleanup(): void {
      autoUpdater.removeListener('download-progress', onProgressEvent);
      autoUpdater.removeListener('update-downloaded', onDownloaded);
      autoUpdater.removeListener('error', onError);
    }

    autoUpdater.on('download-progress', onProgressEvent);
    autoUpdater.once('update-downloaded', onDownloaded);
    autoUpdater.once('error', onError);

    autoUpdater.downloadUpdate().catch((err: unknown) => {
      onError(err instanceof Error ? err : new Error(String(err)));
    });
  });
}
