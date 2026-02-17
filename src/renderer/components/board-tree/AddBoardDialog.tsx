/**
 * Dialog for adding Shitaraba / Machi BBS boards/threads via URL.
 * Parses the URL to detect board type and extracts board/thread info.
 */
import { useState, useCallback } from 'react';
import { mdiPlus, mdiClose, mdiLinkVariant } from '@mdi/js';
import { parseExternalBoardUrl } from '@shared/url-parser';
import { useBBSStore } from '../../stores/bbs-store';
import { MdiIcon } from '../common/MdiIcon';

export function AddBoardDialog({ onClose }: { readonly onClose: () => void }): React.JSX.Element {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const selectBoard = useBBSStore((s) => s.selectBoard);
  const openThread = useBBSStore((s) => s.openThread);

  const handleAdd = useCallback(async () => {
    setError(null);
    setResult(null);

    if (url.trim().length === 0) {
      setError('URLを入力してください');
      return;
    }

    const parsed = parseExternalBoardUrl(url);
    if (parsed === null) {
      setError('対応していないURLです。したらば / JBBS / まちBBSのURLを入力してください。');
      return;
    }

    // Open the board
    await selectBoard(parsed.board);

    // If a thread URL was provided, open the thread too
    if (parsed.threadId !== undefined) {
      void openThread(parsed.board.url, parsed.threadId, '');
    }

    setResult(`${parsed.board.title} を追加しました${parsed.threadId !== undefined ? ' (スレッドを開きます)' : ''}`);
    setUrl('');
  }, [url, selectBoard, openThread]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      void handleAdd();
    }
  }, [handleAdd]);

  return (
    <div className="flex flex-col gap-3 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-text-primary)]">
          <MdiIcon path={mdiLinkVariant} size={16} />
          外部掲示板を追加
        </h3>
        <button type="button" onClick={onClose} className="rounded p-1 hover:bg-[var(--color-bg-hover)]" aria-label="閉じる">
          <MdiIcon path={mdiClose} size={14} />
        </button>
      </div>

      <p className="text-xs text-[var(--color-text-muted)]">
        したらば / JBBS / まちBBSの板またはスレッドのURLを入力してください。
      </p>

      {/* URL input */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={url}
          onChange={(e) => { setUrl(e.target.value); }}
          onKeyDown={handleKeyDown}
          placeholder="https://jbbs.shitaraba.jp/game/12345/"
          className="min-w-0 flex-1 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-1.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
        />
        <button
          type="button"
          onClick={() => { void handleAdd(); }}
          className="flex items-center gap-1 rounded bg-[var(--color-accent)] px-3 py-1.5 text-xs text-white hover:opacity-90"
        >
          <MdiIcon path={mdiPlus} size={12} />
          追加
        </button>
      </div>

      {/* Feedback */}
      {error !== null && (
        <p className="text-xs text-[var(--color-error)]">{error}</p>
      )}
      {result !== null && (
        <p className="text-xs text-[var(--color-success)]">{result}</p>
      )}

      {/* Supported URL examples */}
      <div className="rounded bg-[var(--color-bg-primary)] p-2 text-xs text-[var(--color-text-muted)]">
        <p className="mb-1 font-medium">対応URL例:</p>
        <ul className="ml-3 list-disc space-y-0.5">
          <li>https://jbbs.shitaraba.jp/game/12345/</li>
          <li>https://jbbs.shitaraba.jp/bbs/read.cgi/game/12345/1234567890/</li>
          <li>https://jbbs.shitaraba.jp/game/12345/dat/1234567890.dat</li>
          <li>https://machi.to/hokkaidou/</li>
          <li>https://machi.to/bbs/read.cgi/hokkaidou/1234567890/</li>
          <li>https://machi.to/hokkaidou/dat/1234567890.dat</li>
        </ul>
      </div>
    </div>
  );
}
