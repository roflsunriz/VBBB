/**
 * Search panel component.
 * Supports local DAT search and remote ff5ch.syoboi.jp search.
 * Remote search renders results in a webview.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { mdiMagnify, mdiClose } from '@mdi/js';
import type { SearchResult, SearchTarget } from '@shared/search';
import { parseThreadUrl } from '@shared/url-parser';
import { useBBSStore } from '../../stores/bbs-store';
import { MdiIcon } from '../common/MdiIcon';

type SearchMode = 'local' | 'remote';

export function SearchPanel({ onClose }: { readonly onClose: () => void }): React.JSX.Element {
  const [mode, setMode] = useState<SearchMode>('local');
  const [pattern, setPattern] = useState('');
  const [target, setTarget] = useState<SearchTarget>('all');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [localResults, setLocalResults] = useState<readonly SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);

  const selectedBoard = useBBSStore((s) => s.selectedBoard);
  const openThread = useBBSStore((s) => s.openThread);
  const webviewRef = useRef<HTMLElement>(null);

  // Intercept navigation in webview to open 5ch threads in VBBB
  useEffect(() => {
    const wv = webviewRef.current;
    if (wv === null || remoteUrl === null) return;

    const handleNavigation = (e: Event): void => {
      const navEvent = e as CustomEvent & { url: string };
      const parsed = parseThreadUrl(navEvent.url);
      if (parsed !== null) {
        e.preventDefault();
        void openThread(parsed.boardUrl, parsed.threadId, parsed.title);
      }
    };

    const handleNewWindow = (e: Event): void => {
      const newWinEvent = e as CustomEvent & { url: string };
      e.preventDefault();
      const parsed = parseThreadUrl(newWinEvent.url);
      if (parsed !== null) {
        void openThread(parsed.boardUrl, parsed.threadId, parsed.title);
      }
    };

    wv.addEventListener('will-navigate', handleNavigation);
    wv.addEventListener('new-window', handleNewWindow);
    return () => {
      wv.removeEventListener('will-navigate', handleNavigation);
      wv.removeEventListener('new-window', handleNewWindow);
    };
  }, [remoteUrl, openThread]);

  const handleSearch = useCallback(async () => {
    if (pattern.trim().length === 0) return;
    setSearching(true);
    setError(null);
    try {
      if (mode === 'local') {
        if (selectedBoard === null) {
          setError('板を選択してください');
          return;
        }
        const results = await window.electronApi.invoke('search:local', {
          boardUrl: selectedBoard.url,
          pattern: pattern.trim(),
          target,
          caseSensitive,
        });
        setLocalResults(results);
        setRemoteUrl(null);
      } else {
        const url = await window.electronApi.invoke('search:remote-url', pattern.trim());
        setRemoteUrl(url);
        setLocalResults([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  }, [pattern, mode, target, caseSensitive, selectedBoard]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      void handleSearch();
    }
  }, [handleSearch]);

  const handleResultClick = useCallback((boardUrl: string, threadId: string, title: string) => {
    void openThread(boardUrl, threadId, title);
  }, [openThread]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border-primary)] px-2 py-1">
        <span className="text-xs font-semibold text-[var(--color-text-secondary)]">検索</span>
        <button type="button" onClick={onClose} className="rounded p-0.5 hover:bg-[var(--color-bg-hover)]" aria-label="閉じる">
          <MdiIcon path={mdiClose} size={12} />
        </button>
      </div>

      {/* Mode toggle */}
      <div className="flex border-b border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)]">
        <button
          type="button"
          onClick={() => { setMode('local'); }}
          className={`flex-1 px-2 py-1 text-xs ${mode === 'local' ? 'border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'}`}
        >
          ローカル検索
        </button>
        <button
          type="button"
          onClick={() => { setMode('remote'); }}
          className={`flex-1 px-2 py-1 text-xs ${mode === 'remote' ? 'border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'}`}
        >
          リモート検索
        </button>
      </div>

      {/* Search input */}
      <div className="border-b border-[var(--color-border-secondary)] p-2">
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={pattern}
            onChange={(e) => { setPattern(e.target.value); }}
            onKeyDown={handleKeyDown}
            placeholder={mode === 'local' ? '検索パターン (正規表現)' : 'キーワード (ff5ch.syoboi.jp)'}
            className="flex-1 rounded border border-[var(--color-border-secondary)] bg-[var(--color-bg-primary)] px-2 py-1 text-xs text-[var(--color-text-primary)]"
          />
          <button
            type="button"
            onClick={() => { void handleSearch(); }}
            disabled={searching}
            className="rounded bg-[var(--color-accent)] p-1 text-white hover:opacity-80 disabled:opacity-50"
            aria-label="検索"
          >
            <MdiIcon path={mdiMagnify} size={14} />
          </button>
        </div>
        {mode === 'local' && (
          <div className="mt-1 flex items-center gap-2 text-xs">
            <select
              value={target}
              onChange={(e) => { setTarget(e.target.value as SearchTarget); }}
              className="rounded border border-[var(--color-border-secondary)] bg-[var(--color-bg-primary)] px-1 py-0.5 text-xs text-[var(--color-text-primary)]"
            >
              <option value="all">全て</option>
              <option value="name">名前</option>
              <option value="mail">メール</option>
              <option value="id">ID</option>
              <option value="body">本文</option>
            </select>
            <label className="flex items-center gap-1 text-[var(--color-text-muted)]">
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => { setCaseSensitive(e.target.checked); }}
              />
              大小区別
            </label>
          </div>
        )}
      </div>

      {/* Error */}
      {error !== null && (
        <div className="px-2 py-1 text-xs text-[var(--color-error)]">{error}</div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {searching && (
          <div className="flex items-center justify-center py-4 text-xs text-[var(--color-text-muted)]">検索中...</div>
        )}

        {/* Local results */}
        {localResults.map((r, i) => (
          <button
            key={`${r.threadId}-${String(r.resNumber)}-${String(i)}`}
            type="button"
            onClick={() => { handleResultClick(r.boardUrl, r.threadId, r.threadTitle); }}
            className="w-full border-b border-[var(--color-border-secondary)] px-2 py-1 text-left text-xs hover:bg-[var(--color-bg-hover)]"
          >
            <div className="font-medium text-[var(--color-text-primary)]">{r.threadTitle}</div>
            <div className="text-[var(--color-text-muted)]">
              <span className="text-[var(--color-accent)]">{r.resNumber}</span>: {r.matchedLine}
            </div>
          </button>
        ))}

        {/* Remote results (webview) */}
        {remoteUrl !== null && mode === 'remote' && (
          <webview
            ref={webviewRef as React.Ref<HTMLElement>}
            src={remoteUrl}
            className="h-full w-full"
          />
        )}

        {!searching && localResults.length === 0 && remoteUrl === null && (
          <div className="flex items-center justify-center py-4 text-xs text-[var(--color-text-muted)]">
            検索結果なし
          </div>
        )}
      </div>
    </div>
  );
}
