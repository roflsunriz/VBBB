/**
 * Search panel component.
 * Supports local DAT search and remote ff5ch.syoboi.jp search.
 * Remote search results are scraped in main process and rendered in-app.
 */
import { useState, useCallback, useRef } from 'react';
import { mdiMagnify, mdiClose } from '@mdi/js';
import { SearchInputWithHistory } from '../common/SearchInputWithHistory';
import type { LocalSearchAllResult, SearchTarget } from '@shared/search';
import type { RemoteSearchItem, RemoteSearchResult } from '@shared/remote-search';
import { LocalSearchScope } from '@shared/search';
import { parseAnyThreadUrl } from '@shared/url-parser';
import { useBBSStore } from '../../stores/bbs-store';
import { MdiIcon } from '../common/MdiIcon';
import { useScrollKeyboard } from '../../hooks/use-scroll-keyboard';

type SearchMode = 'local' | 'remote';

export function SearchPanel(): React.JSX.Element {
  const [mode, setMode] = useState<SearchMode>('local');
  const [pattern, setPattern] = useState('');
  const [target, setTarget] = useState<SearchTarget>('all');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [scope, setScope] = useState<LocalSearchScope>(LocalSearchScope.All);
  const [localResults, setLocalResults] = useState<readonly LocalSearchAllResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remoteResults, setRemoteResults] = useState<RemoteSearchResult | null>(null);

  const selectBoard = useBBSStore((s) => s.selectBoard);
  const openThread = useBBSStore((s) => s.openThread);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const handleScrollKeyboard = useScrollKeyboard(scrollContainerRef);

  const runSearch = useCallback(
    async (query: string, start?: number) => {
      if (query.trim().length === 0) return;
      setSearching(true);
      setError(null);
      try {
        if (mode === 'local') {
          const results = await window.electronApi.invoke('search:local-all', {
            pattern: query.trim(),
            scope,
            target,
            caseSensitive,
          });
          setLocalResults(results);
          setRemoteResults(null);
        } else {
          const result = await window.electronApi.invoke('search:remote', {
            keywords: query.trim(),
            ...(start !== undefined && start > 0 ? { start } : {}),
          });
          setRemoteResults(result);
          setLocalResults([]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSearching(false);
      }
    },
    [mode, scope, target, caseSensitive],
  );

  const handleSearch = useCallback(() => {
    void runSearch(pattern);
  }, [runSearch, pattern]);

  const handleRemoteNext = useCallback(() => {
    if (mode !== 'remote') return;
    if (remoteResults?.nextStart === null || remoteResults?.nextStart === undefined) return;
    void runSearch(pattern, remoteResults.nextStart);
  }, [mode, pattern, remoteResults?.nextStart, runSearch]);

  const handleSearchFromInput = useCallback(
    (query: string) => {
      setPattern(query);
      void runSearch(query);
    },
    [runSearch],
  );

  const handleResultClick = useCallback(
    (result: LocalSearchAllResult) => {
      switch (result.kind) {
        case 'board':
          void selectBoard({
            title: result.boardTitle,
            url: result.boardUrl,
            bbsId: '',
            serverUrl: '',
            boardType: '2ch',
          });
          break;
        case 'subject':
          void openThread(result.boardUrl, result.threadId, result.threadTitle);
          break;
        case 'dat':
          void openThread(result.boardUrl, result.threadId, result.threadTitle);
          break;
        default: {
          const _never: never = result;
          void _never;
        }
      }
    },
    [openThread, selectBoard],
  );

  const handleRemoteResultClick = useCallback(
    (result: RemoteSearchItem) => {
      const parsed = parseAnyThreadUrl(result.threadUrl);
      if (parsed !== null) {
        void (async () => {
          await selectBoard(parsed.board);
          await openThread(parsed.board.url, parsed.threadId, parsed.titleHint);
        })();
        return;
      }
      void window.electronApi.invoke('shell:open-external', result.threadUrl);
    },
    [openThread, selectBoard],
  );

  return (
    <div className="flex h-full flex-col" onKeyDown={handleScrollKeyboard}>
      {/* Mode toggle */}
      <div className="flex border-b border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)]">
        <button
          type="button"
          onClick={() => {
            setMode('local');
          }}
          className={`flex-1 px-2 py-1 text-xs ${mode === 'local' ? 'border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'}`}
        >
          ローカル検索
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('remote');
          }}
          className={`flex-1 px-2 py-1 text-xs ${mode === 'remote' ? 'border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'}`}
        >
          リモート検索
        </button>
      </div>

      {/* Search input */}
      <div className="border-b border-[var(--color-border-secondary)] p-2">
        <div className="flex items-center gap-1">
          <SearchInputWithHistory
            value={pattern}
            onChange={setPattern}
            onSearch={handleSearchFromInput}
            storageKey="vbbb-search-history-search-panel"
            placeholder={
              mode === 'local' ? '検索パターン (正規表現)' : 'キーワード (ff5ch.syoboi.jp)'
            }
            inputClassName="flex-1 rounded border border-[var(--color-border-secondary)] bg-[var(--color-bg-primary)] px-2 py-1 text-xs text-[var(--color-text-primary)]"
            disabled={searching}
          />
          {pattern.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setPattern('');
              }}
              className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
              aria-label="検索をクリア"
            >
              <MdiIcon path={mdiClose} size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={handleSearch}
            disabled={searching}
            className="rounded bg-[var(--color-accent)] p-1 text-white hover:opacity-80 disabled:opacity-50"
            aria-label="検索"
          >
            <MdiIcon path={mdiMagnify} size={14} />
          </button>
        </div>
        {mode === 'local' && (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <select
              value={scope}
              onChange={(e) => {
                setScope(e.target.value as LocalSearchScope);
              }}
              className="rounded border border-[var(--color-border-secondary)] bg-[var(--color-bg-primary)] px-1 py-0.5 text-xs text-[var(--color-text-primary)]"
            >
              <option value={LocalSearchScope.All}>すべて</option>
              <option value={LocalSearchScope.Boards}>板名</option>
              <option value={LocalSearchScope.Subjects}>スレッド名</option>
              <option value={LocalSearchScope.DatCache}>スレッド内容</option>
            </select>
            {(scope === LocalSearchScope.DatCache || scope === LocalSearchScope.All) && (
              <select
                value={target}
                onChange={(e) => {
                  setTarget(e.target.value as SearchTarget);
                }}
                className="rounded border border-[var(--color-border-secondary)] bg-[var(--color-bg-primary)] px-1 py-0.5 text-xs text-[var(--color-text-primary)]"
              >
                <option value="all">全フィールド</option>
                <option value="name">名前</option>
                <option value="mail">メール</option>
                <option value="id">ID</option>
                <option value="body">本文</option>
              </select>
            )}
            <label className="flex items-center gap-1 text-[var(--color-text-muted)]">
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => {
                  setCaseSensitive(e.target.checked);
                }}
              />
              大小区別
            </label>
          </div>
        )}
      </div>

      {/* Error */}
      {error !== null && <div className="px-2 py-1 text-xs text-[var(--color-error)]">{error}</div>}

      {/* Results */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        {searching && (
          <div className="flex items-center justify-center py-4 text-xs text-[var(--color-text-muted)]">
            検索中...
          </div>
        )}

        {/* Local results */}
        {localResults.map((r, i) => (
          <button
            key={`${r.kind}-${r.boardUrl}-${r.kind !== 'board' ? r.threadId : ''}-${r.kind === 'dat' ? String(r.resNumber) : ''}-${String(i)}`}
            type="button"
            onClick={() => {
              handleResultClick(r);
            }}
            className="w-full border-b border-[var(--color-border-secondary)] px-2 py-1 text-left text-xs hover:bg-[var(--color-bg-hover)]"
          >
            {r.kind === 'board' && (
              <>
                <div className="text-[10px] text-[var(--color-text-muted)]">{r.categoryName}</div>
                <div className="font-medium text-[var(--color-text-primary)]">{r.boardTitle}</div>
              </>
            )}
            {r.kind === 'subject' && (
              <>
                <div className="text-[10px] text-[var(--color-text-muted)]">{r.boardTitle}</div>
                <div className="font-medium text-[var(--color-text-primary)]">
                  {r.threadTitle}{' '}
                  <span className="text-[var(--color-text-muted)]">({r.count})</span>
                </div>
              </>
            )}
            {r.kind === 'dat' && (
              <>
                <div className="text-[10px] text-[var(--color-text-muted)]">
                  {r.boardTitle} &gt; {r.threadTitle}
                </div>
                <div className="text-[var(--color-text-muted)]">
                  <span className="text-[var(--color-accent)]">{r.resNumber}</span>: {r.matchedLine}
                </div>
              </>
            )}
          </button>
        ))}

        {/* Remote results */}
        {mode === 'remote' && remoteResults !== null && (
          <>
            <div className="border-b border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)]/50 px-2 py-1 text-[10px] text-[var(--color-text-muted)]">
              {remoteResults.totalCount !== null &&
              remoteResults.rangeStart !== null &&
              remoteResults.rangeEnd !== null
                ? `${remoteResults.totalCount.toLocaleString()} 件 (${remoteResults.rangeStart} - ${remoteResults.rangeEnd})`
                : `${remoteResults.items.length} 件`}
            </div>
            {remoteResults.items.map((item) => (
              <button
                key={`${item.threadUrl}-${item.responseCount}`}
                type="button"
                onClick={() => {
                  handleRemoteResultClick(item);
                }}
                className="w-full border-b border-[var(--color-border-secondary)] px-2 py-1 text-left text-xs hover:bg-[var(--color-bg-hover)]"
              >
                <div className="font-medium text-[var(--color-text-primary)]">
                  {item.threadTitle}{' '}
                  <span className="text-[var(--color-text-muted)]">({item.responseCount})</span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-[var(--color-text-muted)]">
                  <span>{item.boardTitle}</span>
                  <span>{item.lastUpdated}</span>
                  {item.responsesPerHour !== null && <span>({item.responsesPerHour} res/h)</span>}
                </div>
              </button>
            ))}
            {remoteResults.items.length === 0 && (
              <div className="px-2 py-3 text-xs text-[var(--color-text-muted)]">
                リモート検索結果なし
              </div>
            )}
            {remoteResults.nextStart !== null && (
              <div className="flex justify-center px-2 py-2">
                <button
                  type="button"
                  onClick={handleRemoteNext}
                  disabled={searching}
                  className="rounded border border-[var(--color-border-secondary)] px-3 py-1 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] disabled:opacity-50"
                >
                  次の50件
                </button>
              </div>
            )}
          </>
        )}

        {!searching && localResults.length === 0 && remoteResults === null && (
          <div className="flex items-center justify-center py-4 text-xs text-[var(--color-text-muted)]">
            検索結果なし
          </div>
        )}
      </div>
    </div>
  );
}
