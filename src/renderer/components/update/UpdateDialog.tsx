/**
 * Update dialog component.
 * Shows the current/latest version, a progress bar, and controls to
 * check for updates, start the download, or cancel.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  mdiClose,
  mdiCheckCircle,
  mdiAlertCircle,
  mdiCloudDownload,
  mdiLoading,
  mdiInformationOutline,
} from '@mdi/js';
import { MdiIcon } from '../common/MdiIcon';
import type { UpdateProgress } from '@shared/update';

type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'update-available'
  | 'downloading'
  | 'complete'
  | 'error';

interface Props {
  readonly onClose: () => void;
}

function isUpdateProgress(value: unknown): value is UpdateProgress {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj['percent'] === 'number' &&
    typeof obj['bytesDownloaded'] === 'number' &&
    typeof obj['totalBytes'] === 'number'
  );
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'] as const;
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const unit = units[i] ?? 'B';
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${unit}`;
}

export function UpdateDialog({ onClose }: Props): React.JSX.Element {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [latestVersion, setLatestVersion] = useState('');
  const [progress, setProgress] = useState<UpdateProgress>({
    percent: 0,
    bytesDownloaded: 0,
    totalBytes: 0,
  });
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const unsubscribe = window.electronApi.on('update:progress', (...args: unknown[]) => {
      const prog = args[0];
      if (isUpdateProgress(prog)) {
        setProgress(prog);
      }
    });
    return unsubscribe;
  }, []);

  const handleCheck = useCallback(async () => {
    setStatus('checking');
    setErrorMessage('');
    try {
      const result = await window.electronApi.invoke('update:check');
      setLatestVersion(result.latestVersion);
      setStatus(result.hasUpdate ? 'update-available' : 'up-to-date');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const handleDownload = useCallback(async () => {
    setStatus('downloading');
    setProgress({ percent: 0, bytesDownloaded: 0, totalBytes: 0 });
    setErrorMessage('');
    try {
      await window.electronApi.invoke('update:download-and-install');
      setStatus('complete');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const canCheck = status !== 'checking' && status !== 'downloading';
  const canDownload = status === 'update-available';
  const showProgress = status === 'downloading' || status === 'complete';

  return (
    <div className="flex flex-col gap-5 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-6 w-[420px]">
      <h2 className="text-base font-bold text-[var(--color-text-primary)]">アップデート</h2>

      {/* Version info */}
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <span className="text-[var(--color-text-muted)]">現在のバージョン:</span>
        <span className="font-mono text-[var(--color-text-primary)]">v{__APP_VERSION__}</span>
        <span className="text-[var(--color-text-muted)]">最新バージョン:</span>
        <span className="font-mono text-[var(--color-text-primary)]">
          {latestVersion ? `v${latestVersion}` : '—'}
        </span>
      </div>

      {/* Status message */}
      {status === 'checking' && (
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
          <MdiIcon path={mdiLoading} size={16} className="animate-spin" />
          <span>更新を確認しています…</span>
        </div>
      )}
      {status === 'up-to-date' && (
        <div className="flex items-center gap-2 text-sm text-[var(--color-success)]">
          <MdiIcon path={mdiCheckCircle} size={16} />
          <span>最新版を使用しています</span>
        </div>
      )}
      {status === 'update-available' && (
        <div className="flex items-center gap-2 text-sm text-[var(--color-accent)]">
          <MdiIcon path={mdiCloudDownload} size={16} />
          <span>新しいバージョンが利用可能です</span>
        </div>
      )}
      {status === 'downloading' && (
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
          <MdiIcon path={mdiLoading} size={16} className="animate-spin" />
          <span>ダウンロード中…</span>
        </div>
      )}
      {status === 'complete' && (
        <div className="flex items-center gap-2 text-sm text-[var(--color-success)]">
          <MdiIcon path={mdiCheckCircle} size={16} />
          <span>インストール中です。完了後に自動で再起動します。</span>
        </div>
      )}
      {status === 'error' && (
        <div className="flex items-center gap-2 text-sm text-[var(--color-error)]">
          <MdiIcon path={mdiAlertCircle} size={16} />
          <span>{errorMessage || 'エラーが発生しました'}</span>
        </div>
      )}
      {status === 'idle' && (
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
          <MdiIcon path={mdiInformationOutline} size={16} />
          <span>「更新確認」を押して最新版を確認してください</span>
        </div>
      )}

      {/* Progress bar */}
      <div className={showProgress ? 'flex flex-col gap-1' : 'invisible flex flex-col gap-1'}>
        <div className="flex justify-between text-xs text-[var(--color-text-muted)]">
          <span>
            {progress.totalBytes > 0
              ? `${formatBytes(progress.bytesDownloaded)} / ${formatBytes(progress.totalBytes)}`
              : progress.bytesDownloaded > 0
                ? formatBytes(progress.bytesDownloaded)
                : ''}
          </span>
          <span>{progress.percent}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-bg-primary)]">
          <div
            className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-200"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      </div>

      {/* Buttons */}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            void handleCheck();
          }}
          disabled={!canCheck}
          className="flex items-center gap-1 rounded border border-[var(--color-border-primary)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === 'checking' && (
            <MdiIcon path={mdiLoading} size={12} className="animate-spin" />
          )}
          更新確認
        </button>
        <button
          type="button"
          onClick={() => {
            void handleDownload();
          }}
          disabled={!canDownload}
          className="flex items-center gap-1 rounded bg-[var(--color-accent)] px-3 py-1.5 text-xs text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === 'downloading' && (
            <MdiIcon path={mdiLoading} size={12} className="animate-spin" />
          )}
          更新開始
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 rounded border border-[var(--color-border-primary)] px-3 py-1.5 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
        >
          <MdiIcon path={mdiClose} size={12} />
          キャンセル
        </button>
      </div>
    </div>
  );
}
