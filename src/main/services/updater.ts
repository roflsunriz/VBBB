/**
 * Application update service.
 * Checks the GitHub Releases API for the latest version and downloads
 * the Windows installer with progress reporting.
 */
import { app, shell } from 'electron';
import { spawn } from 'node:child_process';
import { get as httpsGet } from 'node:https';
import { createWriteStream, writeFileSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import type { UpdateCheckResult, UpdateProgress } from '@shared/update';
import { httpFetch } from './http-client';
import { createLogger } from '../logger';

const logger = createLogger('updater');

const GITHUB_REPO = 'roflsunriz/VBBB';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

/** Windows installer download URL obtained from the last checkForUpdate call. */
let pendingDownloadUrl: string | null = null;

interface GitHubAsset {
  readonly name: string;
  readonly browser_download_url: string;
}

function parseGitHubRelease(raw: unknown): { tagName: string; assets: readonly GitHubAsset[] } {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('GitHub API レスポンスが無効です');
  }
  const obj = raw as Record<string, unknown>;
  const tagName = typeof obj['tag_name'] === 'string' ? obj['tag_name'] : null;
  if (tagName === null) {
    throw new Error('タグ名が取得できませんでした');
  }
  const rawAssets = Array.isArray(obj['assets']) ? (obj['assets'] as unknown[]) : [];
  const assets: GitHubAsset[] = rawAssets.flatMap((a) => {
    if (typeof a !== 'object' || a === null) return [];
    const asset = a as Record<string, unknown>;
    const name = typeof asset['name'] === 'string' ? asset['name'] : '';
    const url = typeof asset['browser_download_url'] === 'string' ? asset['browser_download_url'] : '';
    if (!name || !url) return [];
    return [{ name, browser_download_url: url }];
  });
  return { tagName, assets };
}

function compareVersions(a: string, b: string): number {
  const aParts = a.split('.').map((x) => parseInt(x, 10));
  const bParts = b.split('.').map((x) => parseInt(x, 10));
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const aPart = aParts[i] ?? 0;
    const bPart = bParts[i] ?? 0;
    if (aPart !== bPart) return aPart - bPart;
  }
  return 0;
}

/**
 * Check GitHub Releases API for the latest version.
 * Stores the Windows installer URL internally for use by downloadAndInstall.
 */
export async function checkForUpdate(currentVersion: string): Promise<UpdateCheckResult> {
  logger.info(`アップデート確認 (現在: ${currentVersion})`);

  const response = await httpFetch(
    {
      url: GITHUB_API_URL,
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      acceptGzip: true,
    },
    { maxRetries: 2, initialDelayMs: 500, maxDelayMs: 5000, retryableStatuses: [429, 503] },
  );

  if (response.status !== 200) {
    throw new Error(`GitHub API エラー: HTTP ${String(response.status)}`);
  }

  const data: unknown = JSON.parse(response.body.toString('utf-8'));
  const { tagName, assets } = parseGitHubRelease(data);
  const latestVersion = tagName.startsWith('v') ? tagName.slice(1) : tagName;
  const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;

  pendingDownloadUrl = null;
  for (const asset of assets) {
    if (asset.name.endsWith('.exe')) {
      pendingDownloadUrl = asset.browser_download_url;
      break;
    }
  }

  logger.info(`最新バージョン: ${latestVersion}, 更新あり: ${String(hasUpdate)}, URL: ${pendingDownloadUrl ?? 'なし'}`);
  return { latestVersion, hasUpdate };
}

function doStreamDownload(
  url: string,
  destPath: string,
  onProgress: (progress: UpdateProgress) => void,
  redirectCount: number,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (redirectCount > 10) {
      reject(new Error('リダイレクトが多すぎます'));
      return;
    }

    const file = createWriteStream(destPath);

    httpsGet(url, { headers: { 'User-Agent': 'VBBB-Updater' } }, (response) => {
      const { statusCode } = response;
      const rawLocation = response.headers['location'];
      const location =
        typeof rawLocation === 'string'
          ? rawLocation
          : Array.isArray(rawLocation)
            ? rawLocation[0]
            : undefined;

      const isRedirect =
        (statusCode === 301 ||
          statusCode === 302 ||
          statusCode === 307 ||
          statusCode === 308) &&
        location !== undefined;

      if (isRedirect && location !== undefined) {
        response.resume();
        file.close(() => {
          doStreamDownload(location, destPath, onProgress, redirectCount + 1)
            .then(resolve)
            .catch(reject);
        });
        return;
      }

      if (statusCode !== 200) {
        response.resume();
        file.close();
        reject(new Error(`ダウンロードエラー: HTTP ${String(statusCode ?? 'unknown')}`));
        return;
      }

      const rawContentLength = response.headers['content-length'];
      const totalBytes =
        typeof rawContentLength === 'string' ? parseInt(rawContentLength, 10) : 0;
      let bytesDownloaded = 0;

      response.on('data', (chunk: unknown) => {
        const len = Buffer.isBuffer(chunk)
          ? chunk.length
          : typeof chunk === 'string'
            ? Buffer.byteLength(chunk)
            : 0;
        bytesDownloaded += len;
        const percent =
          totalBytes > 0
            ? Math.min(Math.round((bytesDownloaded / totalBytes) * 100), 99)
            : 0;
        onProgress({ percent, bytesDownloaded, totalBytes });
      });

      response.pipe(file);

      file.on('finish', () => {
        const finalTotal = totalBytes > 0 ? totalBytes : bytesDownloaded;
        file.close(() => {
          onProgress({ percent: 100, bytesDownloaded: finalTotal, totalBytes: finalTotal });
          resolve();
        });
      });

      file.on('error', (err: Error) => {
        void unlink(destPath).catch(() => {});
        reject(err);
      });
    }).on('error', (err: Error) => {
      void unlink(destPath).catch(() => {});
      reject(err);
    });
  });
}

/**
 * Download the Windows installer from the URL obtained by checkForUpdate,
 * reporting progress via the onProgress callback, then launch the installer.
 */
export async function downloadAndInstall(
  onProgress: (progress: UpdateProgress) => void,
): Promise<void> {
  if (pendingDownloadUrl === null) {
    throw new Error('ダウンロードURLがありません。先に更新確認を実行してください。');
  }

  const downloadUrl = pendingDownloadUrl;
  const urlParts = downloadUrl.split('/');
  const fileName = urlParts[urlParts.length - 1] ?? 'VBBB-Setup.exe';
  const tmpPath = join(tmpdir(), fileName);

  logger.info(`ダウンロード開始: ${downloadUrl} → ${tmpPath}`);
  await doStreamDownload(downloadUrl, tmpPath, onProgress, 0);

  logger.info(`インストーラー起動: ${tmpPath}`);

  if (app.isPackaged) {
    const exePath = app.getPath('exe');
    const installDir = dirname(exePath);
    const processName = basename(exePath, '.exe');

    // PowerShell ヘルパースクリプト:
    //   1. 現在の VBBB プロセスが終了するまで待機（最大 30 秒）
    //   2. インストーラーをサイレント実行（/S /D=<インストールDir>）
    //   3. インストール成功後に新バージョンを自動起動
    const helperScriptPath = join(tmpdir(), 'vbbb-update-helper.ps1');
    const helperScript = [
      '$ErrorActionPreference = "SilentlyContinue"',
      `$timeout = 30`,
      `$elapsed = 0`,
      `while ((Get-Process -Name "${processName}" -ErrorAction SilentlyContinue) -and ($elapsed -lt $timeout)) {`,
      '    Start-Sleep -Milliseconds 500',
      '    $elapsed += 0.5',
      '}',
      `$result = Start-Process -FilePath "${tmpPath}" -ArgumentList "/S","/D=${installDir}" -Wait -PassThru`,
      'if ($null -ne $result -and $result.ExitCode -eq 0) {',
      `    Start-Process -FilePath "${exePath}"`,
      '}',
    ].join('\r\n');

    writeFileSync(helperScriptPath, helperScript, 'utf-8');
    logger.info(`サイレントインストール + 自動再起動ヘルパーを起動: ${helperScriptPath}`);

    spawn(
      'powershell.exe',
      ['-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', helperScriptPath],
      { detached: true, stdio: 'ignore' },
    ).unref();

    // IPC レスポンスをレンダラーが受け取れるよう少し待ってから終了する
    setTimeout(() => { app.quit(); }, 1500);
  } else {
    // 開発モードではサイレントインストール先が不明なため通常起動にフォールバック
    const error = await shell.openPath(tmpPath);
    if (error) {
      throw new Error(`インストーラーの起動に失敗しました: ${error}`);
    }
  }
}
