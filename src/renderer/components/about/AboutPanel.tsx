import { mdiBulletinBoard, mdiClose, mdiGithub } from '@mdi/js';
import { MdiIcon } from '../common/MdiIcon';

declare const __APP_VERSION__: string;

interface AboutPanelProps {
  readonly onClose: () => void;
}

export function AboutPanel({ onClose }: AboutPanelProps): React.JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
      <MdiIcon path={mdiBulletinBoard} size={48} className="text-[var(--color-accent)]" />
      <h2 className="text-lg font-bold text-[var(--color-text-primary)]">VBBB</h2>
      <p className="text-center text-sm font-medium text-[var(--color-text-secondary)]">
        Versatile BBS Browser
      </p>
      <p className="text-center text-xs text-[var(--color-text-muted)]">v{__APP_VERSION__}</p>
      <p className="text-center text-xs text-[var(--color-text-muted)]">
        2ch/5ch互換BBSブラウザ
      </p>
      <p className="text-center text-xs text-[var(--color-text-muted)]">
        Electron + React + TypeScript
      </p>
      <button
        type="button"
        onClick={() => {
          void window.electronApi.invoke(
            'shell:open-external',
            'https://github.com/roflsunriz/VBBB',
          );
        }}
        className="flex items-center gap-1 rounded border border-[var(--color-border-primary)] px-3 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
      >
        <MdiIcon path={mdiGithub} size={14} />
        https://github.com/roflsunriz/VBBB
      </button>
      <button
        type="button"
        onClick={onClose}
        className="flex items-center gap-1 rounded bg-[var(--color-accent)] px-4 py-1.5 text-xs text-white hover:opacity-90"
      >
        <MdiIcon path={mdiClose} size={12} />
        閉じる
      </button>
    </div>
  );
}
