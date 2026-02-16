/**
 * Search panel component.
 * Supports local DAT search and remote ff5ch.syoboi.jp search.
 * Remote search renders results in a webview.
 */
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { mdiMagnify, mdiClose, mdiShieldCheck } from '@mdi/js';
import type { SearchResult, SearchTarget } from '@shared/search';
import { parseThreadUrl } from '@shared/url-parser';
import { useBBSStore } from '../../stores/bbs-store';
import { MdiIcon } from '../common/MdiIcon';

type SearchMode = 'local' | 'remote';

/** F6: Default ad block CSS rules for ff5ch.syoboi.jp */
const AD_BLOCK_KEY = 'vbbb-adblock-enabled';
const AD_BLOCK_RULES_KEY = 'vbbb-adblock-rules';
const DEFAULT_AD_RULES = [
  'iframe[src*="ad"]',
  'div[class*="ad"]',
  'div[id*="ad"]',
  'ins.adsbygoogle',
  '.advertisement',
  '.ad-banner',
  '[data-ad]',
  'div[class*="sponsor"]',
  'div[class*="promo"]',
].join('\n');

function loadAdBlockEnabled(): boolean {
  try { return localStorage.getItem(AD_BLOCK_KEY) !== 'false'; } catch { return true; }
}

function loadAdBlockRules(): string {
  try { return localStorage.getItem(AD_BLOCK_RULES_KEY) ?? DEFAULT_AD_RULES; } catch { return DEFAULT_AD_RULES; }
}

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
  const [adBlockEnabled, setAdBlockEnabled] = useState(loadAdBlockEnabled);
  const [adBlockRules, setAdBlockRules] = useState(loadAdBlockRules);
  const [adBlockEditorOpen, setAdBlockEditorOpen] = useState(false);

  // F6: Build CSS from ad block rules
  const adBlockCss = useMemo(() => {
    if (!adBlockEnabled) return '';
    return adBlockRules
      .split('\n')
      .map((r) => r.trim())
      .filter((r) => r.length > 0)
      .map((r) => `${r} { display: none !important; }`)
      .join('\n');
  }, [adBlockEnabled, adBlockRules]);

  // F6: Inject ad block CSS into webview
  useEffect(() => {
    const wv = webviewRef.current;
    if (wv === null || remoteUrl === null || adBlockCss.length === 0) return;

    const handleDomReady = (): void => {
      const webviewEl = wv as unknown as { executeJavaScript: (code: string) => void };
      if (typeof webviewEl.executeJavaScript === 'function') {
        const escaped = adBlockCss.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
        webviewEl.executeJavaScript(
          `(() => { const s = document.createElement('style'); s.textContent = '${escaped}'; document.head.appendChild(s); })()`,
        );
      }
    };
    wv.addEventListener('dom-ready', handleDomReady);
    return () => { wv.removeEventListener('dom-ready', handleDomReady); };
  }, [remoteUrl, adBlockCss]);

  // F7: Intercept navigation in webview to open 5ch threads natively (blocking webView)
  useEffect(() => {
    const wv = webviewRef.current;
    if (wv === null || remoteUrl === null) return;

    const tryOpenThread = (url: string): boolean => {
      const parsed = parseThreadUrl(url);
      if (parsed !== null) {
        void openThread(parsed.boardUrl, parsed.threadId, parsed.title);
        return true;
      }
      return false;
    };

    const handleNavigation = (e: Event): void => {
      const navEvent = e as CustomEvent & { url: string };
      if (tryOpenThread(navEvent.url)) {
        e.preventDefault();
      }
    };

    const handleNewWindow = (e: Event): void => {
      e.preventDefault();
      const newWinEvent = e as CustomEvent & { url: string };
      if (!tryOpenThread(newWinEvent.url)) {
        // Open non-thread URLs externally
        void window.electronApi.invoke('shell:open-external', newWinEvent.url);
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

      {/* F6: Ad block toggle (remote mode only) */}
      {mode === 'remote' && (
        <div className="flex items-center gap-2 border-b border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)]/50 px-2 py-1">
          <label className="flex cursor-pointer items-center gap-1 text-xs text-[var(--color-text-secondary)]">
            <input
              type="checkbox"
              checked={adBlockEnabled}
              onChange={(e) => {
                setAdBlockEnabled(e.target.checked);
                try { localStorage.setItem(AD_BLOCK_KEY, String(e.target.checked)); } catch { /* ignore */ }
              }}
              className="accent-[var(--color-accent)]"
            />
            <MdiIcon path={mdiShieldCheck} size={11} />
            広告ブロック
          </label>
          <button
            type="button"
            onClick={() => { setAdBlockEditorOpen((p) => !p); }}
            className="rounded px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]"
          >
            ルール編集
          </button>
        </div>
      )}

      {/* F6: Ad block rules editor */}
      {adBlockEditorOpen && mode === 'remote' && (
        <div className="border-b border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)] p-2">
          <p className="mb-1 text-[10px] text-[var(--color-text-muted)]">
            CSSセレクタを1行に1つ入力してください。マッチした要素が非表示になります。
          </p>
          <textarea
            value={adBlockRules}
            onChange={(e) => {
              setAdBlockRules(e.target.value);
              try { localStorage.setItem(AD_BLOCK_RULES_KEY, e.target.value); } catch { /* ignore */ }
            }}
            rows={5}
            className="w-full resize-none rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-2 py-1 font-mono text-[10px] leading-relaxed text-[var(--color-text-primary)] focus:outline-none"
          />
          <button
            type="button"
            onClick={() => {
              setAdBlockRules(DEFAULT_AD_RULES);
              try { localStorage.setItem(AD_BLOCK_RULES_KEY, DEFAULT_AD_RULES); } catch { /* ignore */ }
            }}
            className="mt-1 rounded px-2 py-0.5 text-[10px] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]"
          >
            デフォルトに戻す
          </button>
        </div>
      )}

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
