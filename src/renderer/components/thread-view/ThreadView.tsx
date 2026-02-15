/**
 * Thread view panel (右ペイン).
 * Displays thread responses with tabs for multiple threads.
 * Supports anchor links (>>N) with hover popups and NG filtering.
 */
import { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { mdiClose, mdiPencil, mdiShieldOff } from '@mdi/js';
import type { Res } from '@shared/domain';
import { type NgRule, type NgFilterResult, AbonType, NgFilterResult as NgFilterResultEnum } from '@shared/ng';
import { useBBSStore } from '../../stores/bbs-store';
import { MdiIcon } from '../common/MdiIcon';
import { sanitizeHtml } from '../../hooks/use-sanitize';
import { convertAnchorsToLinks } from '../../utils/anchor-parser';
import { PostEditor } from '../post-editor/PostEditor';
import { ResPopup } from './ResPopup';
import { NgEditor } from '../ng-editor/NgEditor';

/** Popup state for anchor hover */
interface PopupState {
  readonly resNumbers: readonly number[];
  readonly x: number;
  readonly y: number;
}

/**
 * Apply NG rules to a single response (renderer-side matching).
 */
function applyNgFilter(rules: readonly NgRule[], res: Res, boardId: string, threadId: string): NgFilterResult {
  const fullText = `${res.name}\t${res.mail}\t${res.dateTime}\t${res.body}`;
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.boardId !== undefined && rule.boardId !== boardId) continue;
    if (rule.threadId !== undefined && rule.threadId !== threadId) continue;

    if (rule.matchMode === 'regexp') {
      const pattern = rule.tokens[0];
      if (pattern === undefined) continue;
      try {
        if (new RegExp(pattern, 'i').test(fullText)) {
          return rule.abonType === AbonType.Transparent
            ? NgFilterResultEnum.TransparentAbon
            : NgFilterResultEnum.NormalAbon;
        }
      } catch {
        continue;
      }
    } else {
      if (rule.tokens.every((token) => fullText.includes(token))) {
        return rule.abonType === AbonType.Transparent
          ? NgFilterResultEnum.TransparentAbon
          : NgFilterResultEnum.NormalAbon;
      }
    }
  }
  return NgFilterResultEnum.None;
}

function ResItem({
  res,
  ngResult,
  onAnchorHover,
  onAnchorLeave,
}: {
  readonly res: Res;
  readonly ngResult: NgFilterResult;
  readonly onAnchorHover: (nums: readonly number[], x: number, y: number) => void;
  readonly onAnchorLeave: () => void;
}): React.JSX.Element | null {
  // Transparent abon: completely hidden
  if (ngResult === NgFilterResultEnum.TransparentAbon) return null;

  // Normal abon: show placeholder
  if (ngResult === NgFilterResultEnum.NormalAbon) {
    return (
      <div className="border-b border-[var(--color-border-secondary)] px-4 py-2 opacity-40" id={`res-${String(res.number)}`}>
        <div className="mb-1 flex flex-wrap items-baseline gap-2 text-xs">
          <span className="font-bold text-[var(--color-res-abon)]">{res.number}</span>
          <span className="text-[var(--color-res-abon)]">あぼーん</span>
        </div>
        <div className="text-sm text-[var(--color-res-abon)]">あぼーん</div>
      </div>
    );
  }

  const bodyHtml = convertAnchorsToLinks(sanitizeHtml(res.body));

  const handleMouseOver = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target;
      if (!(target instanceof HTMLAnchorElement)) return;
      if (!target.classList.contains('anchor-link')) return;

      const numsAttr = target.dataset['anchorNums'];
      if (numsAttr === undefined || numsAttr === '') return;

      const nums = numsAttr.split(',').map(Number).filter((n) => n > 0);
      if (nums.length > 0) {
        onAnchorHover(nums, e.clientX, e.clientY);
      }
    },
    [onAnchorHover],
  );

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target;
    if (!(target instanceof HTMLAnchorElement)) return;
    if (!target.classList.contains('anchor-link')) return;

    e.preventDefault();
    const href = target.getAttribute('href');
    if (href === null) return;

    const targetEl = document.querySelector(href);
    if (targetEl !== null) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  return (
    <div className="border-b border-[var(--color-border-secondary)] px-4 py-2" id={`res-${String(res.number)}`}>
      <div className="mb-1 flex flex-wrap items-baseline gap-2 text-xs">
        <span className="font-bold text-[var(--color-res-number)]">{res.number}</span>
        <span className="text-[var(--color-res-name)]" dangerouslySetInnerHTML={{ __html: sanitizeHtml(res.name) }} />
        {res.mail.length > 0 && (
          <span className="text-[var(--color-res-mail)]">[{res.mail}]</span>
        )}
        <span className="text-[var(--color-res-datetime)]">{res.dateTime}</span>
      </div>
      <div
        className="res-body text-sm leading-relaxed text-[var(--color-res-body)]"
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
        onMouseOver={handleMouseOver}
        onMouseOut={onAnchorLeave}
        onClick={handleClick}
        role="presentation"
      />
    </div>
  );
}

/**
 * Extract boardId from a board URL.
 */
function extractBoardId(boardUrl: string): string {
  try {
    const segments = new URL(boardUrl).pathname.split('/').filter((s) => s.length > 0);
    return segments[segments.length - 1] ?? '';
  } catch {
    return '';
  }
}

export function ThreadView(): React.JSX.Element {
  const tabs = useBBSStore((s) => s.tabs);
  const activeTabId = useBBSStore((s) => s.activeTabId);
  const closeTab = useBBSStore((s) => s.closeTab);
  const setActiveTab = useBBSStore((s) => s.setActiveTab);
  const postEditorOpen = useBBSStore((s) => s.postEditorOpen);
  const togglePostEditor = useBBSStore((s) => s.togglePostEditor);
  const ngRules = useBBSStore((s) => s.ngRules);
  const ngEditorOpen = useBBSStore((s) => s.ngEditorOpen);
  const toggleNgEditor = useBBSStore((s) => s.toggleNgEditor);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [popup, setPopup] = useState<PopupState | null>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Pre-compute NG results for all responses in active tab
  const ngResults = useMemo(() => {
    if (activeTab === undefined || ngRules.length === 0) return new Map<number, NgFilterResult>();
    const boardId = extractBoardId(activeTab.boardUrl);
    const results = new Map<number, NgFilterResult>();
    for (const res of activeTab.responses) {
      const result = applyNgFilter(ngRules, res, boardId, activeTab.threadId);
      if (result !== NgFilterResultEnum.None) {
        results.set(res.number, result);
      }
    }
    return results;
  }, [activeTab, ngRules]);

  // Scroll to top when tab changes
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [activeTabId]);

  // Close popup on tab change
  useEffect(() => {
    setPopup(null);
  }, [activeTabId]);

  const handleCloseTab = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      e.stopPropagation();
      closeTab(tabId);
    },
    [closeTab],
  );

  const handleAnchorHover = useCallback((nums: readonly number[], x: number, y: number) => {
    setPopup({ resNumbers: nums, x, y });
  }, []);

  const handleAnchorLeave = useCallback(() => {
    setTimeout(() => {
      setPopup(null);
    }, 150);
  }, []);

  const handlePopupClose = useCallback(() => {
    setPopup(null);
  }, []);

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      {/* Tab bar */}
      <div className="flex h-8 items-center border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => { setActiveTab(tab.id); }}
              className={`group flex max-w-48 shrink-0 items-center gap-1 rounded-t px-2 py-1 text-xs ${
                tab.id === activeTabId
                  ? 'bg-[var(--color-bg-active)] text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              <span className="truncate">{tab.title}</span>
              <button
                type="button"
                onClick={(e) => { handleCloseTab(e, tab.id); }}
                className="ml-1 rounded p-0.5 opacity-0 hover:bg-[var(--color-bg-tertiary)] group-hover:opacity-100"
                aria-label="タブを閉じる"
              >
                <MdiIcon path={mdiClose} size={10} />
              </button>
            </button>
          ))}
        </div>
        {activeTab !== undefined && (
          <div className="mr-2 flex items-center gap-1">
            <button
              type="button"
              onClick={toggleNgEditor}
              className={`rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] ${
                ngEditorOpen ? 'bg-[var(--color-bg-active)] text-[var(--color-error)]' : ''
              }`}
              title="NG管理"
            >
              <MdiIcon path={mdiShieldOff} size={14} />
            </button>
            <button
              type="button"
              onClick={togglePostEditor}
              className={`rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] ${
                postEditorOpen ? 'bg-[var(--color-bg-active)] text-[var(--color-accent)]' : ''
              }`}
              title="書き込み"
            >
              <MdiIcon path={mdiPencil} size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex min-h-0 flex-1 flex-col">
        {activeTab === undefined ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-xs text-[var(--color-text-muted)]">スレッドを選択してください</p>
          </div>
        ) : (
          <>
            {/* Thread title */}
            <div className="border-b border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)]/30 px-4 py-1.5">
              <h2 className="text-sm font-medium text-[var(--color-text-primary)]">{activeTab.title}</h2>
              <p className="text-xs text-[var(--color-text-muted)]">{activeTab.responses.length} レス</p>
            </div>

            {/* Responses */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto">
              {activeTab.responses.map((res) => (
                <ResItem
                  key={res.number}
                  res={res}
                  ngResult={ngResults.get(res.number) ?? NgFilterResultEnum.None}
                  onAnchorHover={handleAnchorHover}
                  onAnchorLeave={handleAnchorLeave}
                />
              ))}
            </div>

            {/* NG Editor */}
            {ngEditorOpen && <NgEditor />}

            {/* Post editor */}
            {postEditorOpen && (
              <PostEditor boardUrl={activeTab.boardUrl} threadId={activeTab.threadId} />
            )}
          </>
        )}
      </div>

      {/* Anchor popup */}
      {popup !== null && activeTab !== undefined && (
        <ResPopup
          resNumbers={popup.resNumbers}
          responses={activeTab.responses}
          position={{ x: popup.x, y: popup.y }}
          onClose={handlePopupClose}
        />
      )}
    </section>
  );
}
