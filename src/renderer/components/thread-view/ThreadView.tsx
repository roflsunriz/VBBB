/**
 * Thread view panel (右ペイン).
 * Displays thread responses with tabs for multiple threads.
 * Supports anchor links (>>N) with hover popups and NG filtering.
 */
import { useCallback, useRef, useEffect, useState, useMemo, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { mdiClose, mdiPencil, mdiShieldOff, mdiFormatColorHighlight, mdiClockOutline, mdiChartBar, mdiRobot, mdiRefresh, mdiLoading, mdiImage, mdiViewSequential, mdiViewParallel } from '@mdi/js';
import type { Res } from '@shared/domain';
import { BoardType } from '@shared/domain';
import type { FavItem, FavNode } from '@shared/favorite';
import { type NgRule, type NgFilterResult, AbonType, NgFilterResult as NgFilterResultEnum } from '@shared/ng';
import type { PostHistoryEntry } from '@shared/post-history';
import { detectBoardTypeByHost, buildResPermalink } from '@shared/url-parser';
import { useBBSStore } from '../../stores/bbs-store';
import { MdiIcon } from '../common/MdiIcon';
import { sanitizeHtml } from '../../hooks/use-sanitize';
import { convertAnchorsToLinks, parseAnchors } from '../../utils/anchor-parser';
import { detectImageUrls, detectVideoUrls } from '../../utils/image-detect';
import { linkifyUrls } from '../../utils/url-linkify';
import { RefreshOverlay } from '../common/RefreshOverlay';
import { ResPopup } from './ResPopup';
import { ImageThumbnail } from './ImageThumbnail';
import { InlineVideo } from './InlineVideo';

// Heavy panels: loaded on first open (never shown on startup)
const PostEditor = lazy(() =>
  import('../post-editor/PostEditor').then((m) => ({ default: m.PostEditor })),
);
const ProgrammaticPost = lazy(() =>
  import('../post-editor/ProgrammaticPost').then((m) => ({ default: m.ProgrammaticPost })),
);
const ThreadAnalysis = lazy(() =>
  import('./ThreadAnalysis').then((m) => ({ default: m.ThreadAnalysis })),
);
const NgEditor = lazy(() =>
  import('../ng-editor/NgEditor').then((m) => ({ default: m.NgEditor })),
);
import { extractId, extractWatchoi, extractKotehan, buildCountMap, estimateFromWatchoi } from '../../utils/thread-analysis';
import { isAsciiArt } from '../../utils/aa-detect';
import type { WatchoiInfo } from '../../utils/thread-analysis';
import { extractIps, threadHasExposedIps } from '../../utils/ip-detect';
import type { IpLookupResult } from '@shared/ipc';
import { useScrollKeyboard } from '../../hooks/use-scroll-keyboard';
import { useDragReorder } from '../../hooks/use-drag-reorder';
import { useTabOrientation } from '../../hooks/use-tab-orientation';
import { ContextMenuContainer } from '../common/ContextMenuContainer';

/** Be ID regex for matching "BE:ID-Level" in datetime field */
const BE_PATTERN = /BE:(\d+)-(\d+)/;

/** Parse a Japanese datetime like "2024/01/01(月) 12:34:56.78" into a Date */
const DATE_PATTERN = /(\d{4})\/(\d{1,2})\/(\d{1,2})\([^)]*\)\s*(\d{1,2}):(\d{2}):(\d{2})/;

function parseResDateTime(dateTime: string): Date | null {
  const m = DATE_PATTERN.exec(dateTime);
  if (m === null) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  const s = Number(m[6]);
  return new Date(y, mo, d, h, mi, s);
}

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return '';
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${String(diffSec)}秒前`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${String(diffMin)}分前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${String(diffHour)}時間前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 365) return `${String(diffDay)}日前`;
  return `${String(Math.floor(diffDay / 365))}年前`;
}

/**
 * Render datetime text, converting Be IDs into clickable profile links.
 * Optionally shows relative time.
 */
function renderDateTimeWithBe(dateTime: string, resNumber: number, showRelative: boolean): React.ReactNode {
  const match = BE_PATTERN.exec(dateTime);
  const relativeNode = showRelative ? (() => {
    const parsed = parseResDateTime(dateTime);
    if (parsed === null) return null;
    return (
      <span className="ml-1 text-[var(--color-text-muted)] opacity-70">({formatRelativeTime(parsed)})</span>
    );
  })() : null;

  if (match?.[1] === undefined || match[2] === undefined) {
    return <>{dateTime}{relativeNode}</>;
  }

  const beId = match[1];
  const before = dateTime.substring(0, match.index);
  const after = dateTime.substring(match.index + match[0].length);
  const profileUrl = `https://be.5ch.net/test/p.php?i=${beId}/${String(resNumber)}`;

  return (
    <>
      {before}
      <a
        href={profileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[var(--color-link)] hover:underline"
        title={`Be Profile: ${beId}`}
      >
        {match[0]}
      </a>
      {after}
      {relativeNode}
    </>
  );
}

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

/** Highlight type for a response */
type HighlightType = 'none' | 'own' | 'reply';

/** F31: Count badge component */
function CountBadge({ count, onClick }: { readonly count: number; readonly onClick: () => void }): React.JSX.Element | null {
  if (count <= 1) return null;
  const color = count >= 10 ? 'text-[var(--color-error)]' : count >= 5 ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-muted)]';
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`ml-0.5 cursor-pointer rounded bg-[var(--color-bg-tertiary)] px-1 py-0 text-[10px] font-bold ${color} hover:opacity-80`}
      title={`${String(count)}回書き込み — クリックで一覧`}
    >
      ({count})
    </button>
  );
}

/** F29: ワッチョイ estimation popup */
function WatchoiPopup({ info, x, y, onClose }: {
  readonly info: WatchoiInfo;
  readonly x: number;
  readonly y: number;
  readonly onClose: () => void;
}): React.JSX.Element {
  const estimation = estimateFromWatchoi(info);
  const popupRef = useRef<HTMLDivElement>(null);

  // Clamp popup within viewport
  useEffect(() => {
    const el = popupRef.current;
    if (el === null) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let cx = x;
    let cy = y;
    if (cx + rect.width > vw) cx = vw - rect.width - 4;
    if (cy + rect.height > vh) cy = vh - rect.height - 4;
    if (cx < 0) cx = 4;
    if (cy < 0) cy = 4;
    el.style.left = `${String(cx)}px`;
    el.style.top = `${String(cy)}px`;
  });

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        role="button"
        tabIndex={-1}
        aria-label="閉じる"
      />
      <div
        ref={popupRef}
        className="fixed z-50 min-w-56 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-3 shadow-lg"
        style={{ left: x, top: y }}
      >
        <h4 className="mb-2 text-xs font-bold text-[var(--color-text-primary)]">ワッチョイ分析</h4>
        <table className="w-full text-xs text-[var(--color-text-secondary)]">
          <tbody>
            <tr><td className="whitespace-nowrap pr-2 font-semibold">ラベル</td><td>{info.label.normalize('NFKC')}</td></tr>
            <tr><td className="whitespace-nowrap pr-2 font-semibold">回線種別</td><td>{estimation.connectionType}</td></tr>
            {estimation.suffixHint !== null && (
              <tr><td className="whitespace-nowrap pr-2 font-semibold">接続方法</td><td>{estimation.suffixHint}</td></tr>
            )}
            <tr>
              <td className="whitespace-nowrap pr-2 font-semibold">IPハッシュ</td>
              <td className="font-mono">{info.ipHash.toUpperCase()}<span className="ml-1 font-sans text-[var(--color-text-muted)]">(同一IP = 同一値)</span></td>
            </tr>
            <tr>
              <td className="whitespace-nowrap pr-2 font-semibold">UAハッシュ</td>
              <td className="font-mono">{info.uaHash.toUpperCase()}<span className="ml-1 font-sans text-[var(--color-text-muted)]">(同一ブラウザ = 同一値)</span></td>
            </tr>
          </tbody>
        </table>
        <p className="mt-2 text-[10px] leading-snug text-[var(--color-text-muted)]">
          ※ KOROKORO (XXXX-YYYY) は毎週木曜にリセット。同一週・同一板内で有効です。
        </p>
      </div>
    </>
  );
}

/** F28: IP info popup */
function IpPopup({ ip, x, y, onClose }: {
  readonly ip: string;
  readonly x: number;
  readonly y: number;
  readonly onClose: () => void;
}): React.JSX.Element {
  const [info, setInfo] = useState<IpLookupResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await window.electronApi.invoke('ip:lookup', ip);
        if (!cancelled) { setInfo(result); setLoading(false); }
      } catch (err) {
        if (!cancelled) { setError(err instanceof Error ? err.message : String(err)); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [ip]);

  // Clamp popup within viewport
  useEffect(() => {
    const el = popupRef.current;
    if (el === null) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let cx = x;
    let cy = y;
    if (cx + rect.width > vw) cx = vw - rect.width - 4;
    if (cy + rect.height > vh) cy = vh - rect.height - 4;
    if (cx < 0) cx = 4;
    if (cy < 0) cy = 4;
    el.style.left = `${String(cx)}px`;
    el.style.top = `${String(cy)}px`;
  });

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        role="button"
        tabIndex={-1}
        aria-label="閉じる"
      />
      <div
        ref={popupRef}
        className="fixed z-50 min-w-52 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-3 shadow-lg"
        style={{ left: x, top: y }}
      >
        <h4 className="mb-2 text-xs font-bold text-[var(--color-text-primary)]">IP情報: {ip}</h4>
        {loading && <p className="text-xs text-[var(--color-text-muted)]">読み込み中...</p>}
        {error !== null && <p className="text-xs text-[var(--color-error)]">{error}</p>}
        {info !== null && (
          <table className="w-full text-xs text-[var(--color-text-secondary)]">
            <tbody>
              <tr><td className="pr-2 font-semibold">国</td><td>{info.country}</td></tr>
              <tr><td className="pr-2 font-semibold">地域</td><td>{info.region}</td></tr>
              <tr><td className="pr-2 font-semibold">都市</td><td>{info.city}</td></tr>
              <tr><td className="pr-2 font-semibold">ISP</td><td>{info.isp}</td></tr>
              <tr><td className="pr-2 font-semibold">組織</td><td>{info.org}</td></tr>
              <tr><td className="pr-2 font-semibold">AS</td><td>{info.as}</td></tr>
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function ResItem({
  res,
  boardUrl,
  threadId,
  ngResult,
  highlightType,
  showRelativeTime,
  inlineMediaEnabled,
  allThreadImageUrls,
  idCount,
  watchoiCount,
  kotehanCount,
  replyNumbers,
  onAnchorHover,
  onAnchorLeave,
  onResNumberClick,
  onSetKokomade,
  onAddNgWord,
  onFilterById,
  onFilterByWatchoi,
  onScrollToResNumber,
  onFilterByKotehan,
  aaOverride,
  onToggleAaFont,
}: {
  readonly res: Res;
  readonly boardUrl: string;
  readonly threadId: string;
  readonly ngResult: NgFilterResult;
  readonly highlightType: HighlightType;
  readonly showRelativeTime: boolean;
  readonly inlineMediaEnabled: boolean;
  readonly allThreadImageUrls: readonly string[];
  readonly idCount: number;
  readonly watchoiCount: number;
  readonly kotehanCount: number;
  /** Response numbers that reference (reply to) this response */
  readonly replyNumbers: readonly number[];
  readonly onAnchorHover: (nums: readonly number[], x: number, y: number) => void;
  readonly onAnchorLeave: () => void;
  readonly onResNumberClick: (resNumber: number) => void;
  readonly onSetKokomade: (resNumber: number) => void;
  readonly onAddNgWord: (selectedText: string) => void;
  readonly onFilterById: (id: string) => void;
  readonly onFilterByWatchoi: (label: string) => void;
  readonly onScrollToResNumber: (resNumber: number) => void;
  readonly onFilterByKotehan: (name: string) => void;
  readonly aaOverride: boolean | undefined;
  readonly onToggleAaFont: (resNumber: number, forceAa: boolean) => void;
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

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [watchoiPopup, setWatchoiPopup] = useState<{ info: WatchoiInfo; x: number; y: number } | null>(null);
  const [ipPopup, setIpPopup] = useState<{ ip: string; x: number; y: number } | null>(null);

  const [selectedText, setSelectedText] = useState('');

  // F31: extracted values for this res
  const resId = useMemo(() => extractId(res), [res]);
  const resWatchoi = useMemo(() => extractWatchoi(res), [res]);
  const resKotehan = useMemo(() => extractKotehan(res), [res]);

  // F28: Extract IPs
  const resIps = useMemo(() => extractIps(res), [res]);

  // F29: handle ワッチョイ click
  const handleWatchoiClick = useCallback((e: React.MouseEvent) => {
    if (resWatchoi === null) return;
    e.stopPropagation();
    setWatchoiPopup({ info: resWatchoi, x: e.clientX, y: e.clientY });
  }, [resWatchoi]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const selection = window.getSelection();
    setSelectedText(selection !== null ? selection.toString().trim() : '');
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleKokomade = useCallback(() => {
    onSetKokomade(res.number);
    setContextMenu(null);
  }, [onSetKokomade, res.number]);

  const handleQuoteClick = useCallback(() => {
    onResNumberClick(res.number);
  }, [onResNumberClick, res.number]);

  const handleAddNg = useCallback(() => {
    if (selectedText.length > 0) {
      onAddNgWord(selectedText);
    }
    setContextMenu(null);
  }, [selectedText, onAddNgWord]);

  // Close context menu on click outside
  useEffect(() => {
    if (contextMenu === null) return;
    const handler = (): void => { setContextMenu(null); };
    document.addEventListener('click', handler);
    return () => { document.removeEventListener('click', handler); };
  }, [contextMenu]);

  const bodyHtml = linkifyUrls(convertAnchorsToLinks(sanitizeHtml(res.body)));

  // ASCII art detection and manual override
  const isAutoAa = useMemo(() => isAsciiArt(res.body), [res.body]);
  const isAaFinal = aaOverride ?? isAutoAa;

  // Detect image URLs in the body for inline thumbnails
  const images = useMemo(() => detectImageUrls(res.body), [res.body]);
  // Detect video URLs in the body for inline players
  const videos = useMemo(() => detectVideoUrls(res.body), [res.body]);

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

    // Handle external URL links
    if (target.classList.contains('external-url')) {
      e.preventDefault();
      const url = target.dataset['url'];
      if (url !== undefined && url.length > 0) {
        void window.electronApi.invoke('shell:open-external', url);
      }
      return;
    }

    // Handle anchor links (>>N) — use virtualizer-based scroll
    if (!target.classList.contains('anchor-link')) return;

    e.preventDefault();
    const href = target.getAttribute('href');
    if (href === null) return;

    const anchorMatch = /^#res-(\d+)$/.exec(href);
    if (anchorMatch?.[1] !== undefined) {
      onScrollToResNumber(Number(anchorMatch[1]));
    }
  }, [onScrollToResNumber]);

  const highlightClass =
    highlightType === 'own'
      ? 'border-l-2 border-l-[var(--color-highlight-own-border)] bg-[var(--color-highlight-own)]'
      : highlightType === 'reply'
        ? 'border-l-2 border-l-[var(--color-highlight-reply-border)] bg-[var(--color-highlight-reply)]'
        : '';

  const replyCount = replyNumbers.length;

  return (
    <div className={`border-b border-[var(--color-border-secondary)] px-4 py-2 ${highlightClass}`} id={`res-${String(res.number)}`} onContextMenu={handleContextMenu}>
      <div className="mb-1 flex flex-wrap items-baseline gap-2 text-xs">
        {replyCount > 0 && (
          <button
            type="button"
            className="cursor-pointer rounded border-none bg-transparent p-0 text-[10px] font-semibold text-[var(--color-link)] hover:underline"
            onMouseEnter={(e) => { onAnchorHover(replyNumbers, e.clientX, e.clientY); }}
            onMouseLeave={onAnchorLeave}
            onClick={(e) => { e.stopPropagation(); onAnchorHover(replyNumbers, e.clientX, e.clientY); }}
            title={`${String(replyCount)}件の返信`}
          >
            +{replyCount}
          </button>
        )}
        <button
          type="button"
          className="cursor-pointer border-none bg-transparent p-0 font-bold text-[var(--color-res-number)] hover:underline"
          onClick={handleQuoteClick}
          title={`>>${String(res.number)} を引用`}
        >
          {res.number}
        </button>
        <span className="inline-flex items-baseline gap-0.5">
          <span className="text-[var(--color-res-name)]" dangerouslySetInnerHTML={{ __html: sanitizeHtml(res.name) }} />
          {resKotehan !== null && (
            <CountBadge count={kotehanCount} onClick={() => { onFilterByKotehan(resKotehan); }} />
          )}
          {resWatchoi !== null && (
            <>
              <button
                type="button"
                onClick={handleWatchoiClick}
                className="ml-0.5 cursor-pointer rounded bg-[var(--color-bg-tertiary)] px-1 py-0 text-[10px] text-[var(--color-link)] hover:underline"
                title="クリックでワッチョイ分析"
              >
                {resWatchoi.prefix.normalize('NFKC')}
              </button>
              <CountBadge count={watchoiCount} onClick={() => { onFilterByWatchoi(resWatchoi.label); }} />
            </>
          )}
        </span>
        {res.mail.length > 0 && (
          <span className="text-[var(--color-res-mail)]">[{res.mail}]</span>
        )}
        <span className="inline-flex items-baseline gap-0.5 text-[var(--color-res-datetime)]">
          {renderDateTimeWithBe(res.dateTime, res.number, showRelativeTime)}
          {resId !== null && res.id !== undefined && (
            <span>ID:{resId}</span>
          )}
          {resId !== null && (
            <CountBadge count={idCount} onClick={() => { onFilterById(resId); }} />
          )}
        </span>
        {/* F28: Clickable IP addresses */}
        {resIps.length > 0 && resIps.map((ip) => (
          <button
            key={ip}
            type="button"
            onClick={(e) => { e.stopPropagation(); setIpPopup({ ip, x: e.clientX, y: e.clientY }); }}
            className="rounded bg-[var(--color-bg-tertiary)] px-1 py-0 text-[10px] text-[var(--color-warning)] hover:underline"
            title={`IP情報: ${ip}`}
          >
            {ip}
          </button>
        ))}
      </div>
      <div
        className={`res-body ${isAaFinal ? 'aa-font' : 'text-sm leading-relaxed'} text-[var(--color-res-body)]`}
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
        onMouseOver={handleMouseOver}
        onMouseOut={onAnchorLeave}
        onClick={handleClick}
        role="presentation"
      />
      {inlineMediaEnabled && images.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-2">
          {images.map((img) => (
            <ImageThumbnail key={img.url} url={img.url} displayUrl={img.displayUrl} allImageUrls={allThreadImageUrls} />
          ))}
        </div>
      )}
      {inlineMediaEnabled && videos.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-2">
          {videos.map((vid) => (
            <InlineVideo key={vid.url} url={vid.url} originalUrl={vid.originalUrl} />
          ))}
        </div>
      )}

      {/* Context menu — rendered via portal to escape transform containing block */}
      {contextMenu !== null && createPortal(
        <ContextMenuContainer
          x={contextMenu.x}
          y={contextMenu.y}
          className="fixed z-50 min-w-40 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] py-1 shadow-lg"
          onClick={handleCloseContextMenu}
          role="menu"
        >
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
            onClick={handleKokomade}
            role="menuitem"
          >
            ここまで読んだ
          </button>
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
            onClick={handleQuoteClick}
            role="menuitem"
          >
            レスを引用 (&gt;&gt;{res.number})
          </button>
          <div className="mx-2 my-0.5 border-t border-[var(--color-border-secondary)]" />
          {/* F18: Copy options */}
          {(() => {
            const plainName = res.name.replace(/<[^>]+>/g, '');
            const plainBody = res.body.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
            const permalink = buildResPermalink(boardUrl, threadId, res.number);
            const header = `${String(res.number)} ${plainName}${res.mail.length > 0 ? ` [${res.mail}]` : ''} ${res.dateTime}`;
            return [
              { label: '名前をコピー', value: header },
              { label: '本文をコピー', value: plainBody },
              { label: 'URLをコピー', value: permalink },
              { label: '名前+本文+URL', value: `${header}\n${plainBody}\n${permalink}` },
              { label: '本文+URL', value: `${plainBody}\n${permalink}` },
            ] as const;
          })().map((opt) => (
            <button
              key={opt.label}
              type="button"
              className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
              onClick={() => { void navigator.clipboard.writeText(opt.value.trim()); setContextMenu(null); }}
              role="menuitem"
            >
              {opt.label}
            </button>
          ))}
          {selectedText.length > 0 && (
            <>
              <div className="mx-2 my-0.5 border-t border-[var(--color-border-secondary)]" />
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
                onClick={handleAddNg}
                role="menuitem"
              >
                &quot;{selectedText.length > 20 ? `${selectedText.slice(0, 20)}…` : selectedText}&quot; をNGワードに追加
              </button>
            </>
          )}
          <div className="mx-2 my-0.5 border-t border-[var(--color-border-secondary)]" />
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
            onClick={() => { onToggleAaFont(res.number, !isAaFinal); setContextMenu(null); }}
            role="menuitem"
          >
            {isAaFinal ? '通常フォントに戻す' : 'AAフォントで表示'}
          </button>
        </ContextMenuContainer>,
        document.body,
      )}

      {/* F29: ワッチョイ popup — rendered via portal to escape transform containing block */}
      {watchoiPopup !== null && createPortal(
        <WatchoiPopup
          info={watchoiPopup.info}
          x={watchoiPopup.x}
          y={watchoiPopup.y}
          onClose={() => { setWatchoiPopup(null); }}
        />,
        document.body,
      )}

      {/* F28: IP info popup — rendered via portal to escape transform containing block */}
      {ipPopup !== null && createPortal(
        <IpPopup
          ip={ipPopup.ip}
          x={ipPopup.x}
          y={ipPopup.y}
          onClose={() => { setIpPopup(null); }}
        />,
        document.body,
      )}
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

/** Anchor pattern for extracting >>N references from body HTML */
const ANCHOR_REF_PATTERN = />>(\d+)/g;

/**
 * Build a set of own post res numbers by matching post history entries
 * against thread responses by message content.
 */
function buildOwnResNumbers(
  responses: readonly Res[],
  postHistory: readonly PostHistoryEntry[],
  boardUrl: string,
  threadId: string,
): ReadonlySet<number> {
  const threadEntries = postHistory.filter(
    (h) => h.boardUrl === boardUrl && h.threadId === threadId,
  );
  if (threadEntries.length === 0) return new Set<number>();

  const set = new Set<number>();
  for (const entry of threadEntries) {
    const normalizedMsg = entry.message.trim();
    for (const res of responses) {
      // Strip HTML tags from body for comparison
      const plainBody = res.body
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&gt;/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .trim();
      if (plainBody === normalizedMsg) {
        set.add(res.number);
      }
    }
  }
  return set;
}

/**
 * Build a set of res numbers that are replies to own posts.
 * Scans all responses for >>N anchors pointing to own posts.
 */
function buildReplyResNumbers(
  responses: readonly Res[],
  ownResNumbers: ReadonlySet<number>,
): ReadonlySet<number> {
  if (ownResNumbers.size === 0) return new Set<number>();

  const set = new Set<number>();
  for (const res of responses) {
    if (ownResNumbers.has(res.number)) continue;
    ANCHOR_REF_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null = ANCHOR_REF_PATTERN.exec(res.body);
    while (match !== null) {
      const refNum = Number(match[1]);
      if (ownResNumbers.has(refNum)) {
        set.add(res.number);
        break;
      }
      match = ANCHOR_REF_PATTERN.exec(res.body);
    }
  }
  return set;
}

export function ThreadView(): React.JSX.Element {
  const tabs = useBBSStore((s) => s.tabs);
  const activeTabId = useBBSStore((s) => s.activeTabId);
  const closeTab = useBBSStore((s) => s.closeTab);
  const setActiveTab = useBBSStore((s) => s.setActiveTab);
  const refreshActiveThread = useBBSStore((s) => s.refreshActiveThread);
  const refreshThreadTab = useBBSStore((s) => s.refreshThreadTab);
  const reorderThreadTabs = useBBSStore((s) => s.reorderThreadTabs);
  const updateTabScroll = useBBSStore((s) => s.updateTabScroll);
  const updateTabKokomade = useBBSStore((s) => s.updateTabKokomade);
  const toggleTabPostEditor = useBBSStore((s) => s.toggleTabPostEditor);
  const closeTabPostEditor = useBBSStore((s) => s.closeTabPostEditor);
  const openTabPostEditorWithQuote = useBBSStore((s) => s.openTabPostEditorWithQuote);
  const toggleTabAnalysis = useBBSStore((s) => s.toggleTabAnalysis);
  const toggleTabProgPost = useBBSStore((s) => s.toggleTabProgPost);
  const closeTabProgPost = useBBSStore((s) => s.closeTabProgPost);

  const handleTogglePostEditor = useCallback(() => {
    if (activeTabId !== null) toggleTabPostEditor(activeTabId);
  }, [activeTabId, toggleTabPostEditor]);

  const handleToggleProgPost = useCallback(() => {
    if (activeTabId !== null) toggleTabProgPost(activeTabId);
  }, [activeTabId, toggleTabProgPost]);

  const handleCloseProgPost = useCallback(() => {
    if (activeTabId !== null) closeTabProgPost(activeTabId);
  }, [activeTabId, closeTabProgPost]);
  const ngRules = useBBSStore((s) => s.ngRules);
  const ngEditorOpen = useBBSStore((s) => s.ngEditorOpen);
  const toggleNgEditor = useBBSStore((s) => s.toggleNgEditor);
  const openNgEditorWithToken = useBBSStore((s) => s.openNgEditorWithToken);
  const postHistory = useBBSStore((s) => s.postHistory);
  const highlightSettings = useBBSStore((s) => s.highlightSettings);
  const setHighlightSettings = useBBSStore((s) => s.setHighlightSettings);
  const addFavorite = useBBSStore((s) => s.addFavorite);
  const removeFavorite = useBBSStore((s) => s.removeFavorite);
  const favorites = useBBSStore((s) => s.favorites);
  const scrollRef = useRef<HTMLDivElement>(null);
  const handleScrollKeyboard = useScrollKeyboard(scrollRef);
  const edgeRefreshUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const edgeRefreshLockedRef = useRef(false);
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [tabCtxMenu, setTabCtxMenu] = useState<{ x: number; y: number; tabId: string; isFavorite: boolean } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [edgeRefreshing, setEdgeRefreshing] = useState(false);

  // Build favorite lookup for thread URLs
  const favoriteUrlToId = useMemo(() => {
    const map = new Map<string, string>();
    const walk = (nodes: readonly FavNode[]): void => {
      for (const node of nodes) {
        if (node.kind === 'item' && node.type === 'thread') {
          map.set(node.url, node.id);
        }
        if (node.kind === 'folder') {
          walk(node.children);
        }
      }
    };
    walk(favorites.children);
    return map;
  }, [favorites]);

  // Close tab context menu on click
  useEffect(() => {
    if (tabCtxMenu === null) return;
    const handler = (): void => { setTabCtxMenu(null); };
    document.addEventListener('click', handler);
    return () => { document.removeEventListener('click', handler); };
  }, [tabCtxMenu]);

  const handleTabContextMenu = useCallback((e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const tab = tabs.find((t) => t.id === tabId);
    const threadUrl = tab !== undefined ? `${tab.boardUrl}dat/${tab.threadId}.dat` : '';
    setTabCtxMenu({ x: e.clientX, y: e.clientY, tabId, isFavorite: favoriteUrlToId.has(threadUrl) });
  }, [tabs, favoriteUrlToId]);

  const handleTabCtxToggleFavorite = useCallback(() => {
    if (tabCtxMenu === null) return;
    const tab = tabs.find((t) => t.id === tabCtxMenu.tabId);
    if (tab === undefined) return;
    const threadUrl = `${tab.boardUrl}dat/${tab.threadId}.dat`;
    const existingFavId = favoriteUrlToId.get(threadUrl);
    if (existingFavId !== undefined) {
      void removeFavorite(existingFavId);
    } else {
      let boardType: BoardType;
      try {
        boardType = detectBoardTypeByHost(new URL(tab.boardUrl).hostname.toLowerCase());
      } catch {
        boardType = BoardType.Type2ch;
      }
      const node: FavItem = {
        id: `fav-${tab.threadId}-${String(Date.now())}`,
        kind: 'item',
        type: 'thread',
        boardType,
        url: threadUrl,
        title: tab.title,
      };
      void addFavorite(node);
    }
    setTabCtxMenu(null);
  }, [tabCtxMenu, tabs, favoriteUrlToId, addFavorite, removeFavorite]);

  const handleAddTabToRound = useCallback(() => {
    if (tabCtxMenu === null) return;
    const tab = tabs.find((t) => t.id === tabCtxMenu.tabId);
    if (tab === undefined) return;
    void window.electronApi.invoke('round:add-item', {
      url: tab.boardUrl,
      boardTitle: '',
      fileName: `${tab.threadId}.dat`,
      threadTitle: tab.title,
      roundName: '',
    });
    setTabCtxMenu(null);
  }, [tabCtxMenu, tabs]);

  const handleRefreshCurrentThread = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refreshActiveThread();
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, refreshActiveThread]);

  const handleRefreshTabFromMenu = useCallback(async () => {
    if (tabCtxMenu === null || refreshing) return;
    setRefreshing(true);
    try {
      await refreshThreadTab(tabCtxMenu.tabId);
    } finally {
      setRefreshing(false);
      setTabCtxMenu(null);
    }
  }, [tabCtxMenu, refreshing, refreshThreadTab]);

  const RELATIVE_TIME_KEY = 'vbbb-relative-time';
  const [showRelativeTime, setShowRelativeTime] = useState(() => {
    try { return localStorage.getItem(RELATIVE_TIME_KEY) === 'true'; } catch { return false; }
  });
  const handleToggleRelativeTime = useCallback(() => {
    setShowRelativeTime((prev) => {
      const next = !prev;
      try { localStorage.setItem(RELATIVE_TIME_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // F16: Analysis panel toggle (per tab)
  const handleToggleAnalysis = useCallback(() => {
    if (activeTabId !== null) toggleTabAnalysis(activeTabId);
  }, [activeTabId, toggleTabAnalysis]);

  // Inline media (image/video) toggle — persisted in localStorage
  const [inlineMediaEnabled, setInlineMediaEnabled] = useState(() => {
    try { return localStorage.getItem('vbbb-inline-media') !== 'false'; } catch { return true; }
  });
  const handleToggleInlineMedia = useCallback(() => {
    setInlineMediaEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem('vbbb-inline-media', String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // F31: Filter state (when user clicks an ID/ワッチョイ/コテハン count badge)
  const [filterKey, setFilterKey] = useState<{ type: 'id' | 'watchoi' | 'kotehan'; value: string } | null>(null);

  // Preserve scroll position across filter apply/clear cycles.
  // Saved when transitioning from no-filter → filter; restored when transitioning back to no-filter.
  // preFilterResNumberRef stores the first visible res number for index-based restoration
  // (more reliable than pixel-based with TanStack Virtual's estimated sizes).
  // preFilterScrollTopRef is kept as pixel-based fallback.
  const preFilterScrollTopRef = useRef<number>(0);
  const preFilterResNumberRef = useRef<number>(0);
  const prevFilterKeyRef = useRef<{ type: 'id' | 'watchoi' | 'kotehan'; value: string } | null>(null);

  // Restore scroll when filter is cleared (non-null → null transition).
  // Uses index-based scrollToIndex when available (same approach as tab restoration),
  // falls back to pixel-based scrollTo.
  useEffect(() => {
    const prevFilter = prevFilterKeyRef.current;
    prevFilterKeyRef.current = filterKey;
    if (prevFilter !== null && filterKey === null) {
      const savedResNumber = preFilterResNumberRef.current;
      const savedScrollTop = preFilterScrollTopRef.current;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (savedResNumber > 0) {
            const index = resNumberToIndexRef.current.get(savedResNumber);
            if (index !== undefined) {
              virtualizerRef.current.scrollToIndex(index, { align: 'start' });
              return;
            }
          }
          if (savedScrollTop > 0) {
            scrollRef.current?.scrollTo(0, savedScrollTop);
          }
        });
      });
    }
  }, [filterKey]);

  // Save pre-filter scroll position (both res number and pixel offset).
  // virtualizerRef / displayResponsesRef are declared after these callbacks but are
  // accessible at call-time since all hooks initialise before any user event fires.
  const savePreFilterScroll = useCallback((): void => {
    preFilterScrollTopRef.current = scrollRef.current?.scrollTop ?? 0;
    const firstItem = virtualizerRef.current.getVirtualItems()[0];
    if (firstItem !== undefined) {
      const res = displayResponsesRef.current[firstItem.index];
      preFilterResNumberRef.current = res?.number ?? 0;
    } else {
      preFilterResNumberRef.current = 0;
    }
  }, []);

  const handleFilterById = useCallback((id: string) => {
    if (filterKey === null) {
      savePreFilterScroll();
    }
    setFilterKey((prev) => (prev?.type === 'id' && prev.value === id) ? null : { type: 'id', value: id });
  }, [filterKey, savePreFilterScroll]);
  const handleFilterByWatchoi = useCallback((label: string) => {
    if (filterKey === null) {
      savePreFilterScroll();
    }
    setFilterKey((prev) => (prev?.type === 'watchoi' && prev.value === label) ? null : { type: 'watchoi', value: label });
  }, [filterKey, savePreFilterScroll]);
  const handleFilterByKotehan = useCallback((name: string) => {
    if (filterKey === null) {
      savePreFilterScroll();
    }
    setFilterKey((prev) => (prev?.type === 'kotehan' && prev.value === name) ? null : { type: 'kotehan', value: name });
  }, [filterKey, savePreFilterScroll]);
  const handleClearFilter = useCallback(() => { setFilterKey(null); }, []);

  // AA font override state: manual per-post toggle (true = force AA, false = force normal)
  const [aaOverrides, setAaOverrides] = useState(() => new Map<number, boolean>());
  const handleToggleAaFont = useCallback((resNumber: number, forceAa: boolean) => {
    setAaOverrides((prev) => {
      const next = new Map(prev);
      next.set(resNumber, forceAa);
      return next;
    });
  }, []);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Per-tab panel states derived from the active tab
  const postEditorOpen = activeTab?.postEditorOpen ?? false;
  const analysisOpen = activeTab?.analysisOpen ?? false;
  const progPostOpen = activeTab?.progPostOpen ?? false;
  const postEditorInitialMessage = activeTab?.postEditorInitialMessage ?? '';

  // Build reply map: maps each resNumber → list of resNumbers that reference it (>>N)
  const replyMap = useMemo<ReadonlyMap<number, readonly number[]>>(() => {
    if (activeTab === undefined) return new Map<number, readonly number[]>();
    const map = new Map<number, number[]>();
    for (const res of activeTab.responses) {
      const anchors = parseAnchors(res.body);
      const referenced = new Set<number>();
      for (const anchor of anchors) {
        for (const num of anchor.numbers) {
          referenced.add(num);
        }
      }
      for (const num of referenced) {
        const existing = map.get(num);
        if (existing !== undefined) {
          existing.push(res.number);
        } else {
          map.set(num, [res.number]);
        }
      }
    }
    return map;
  }, [activeTab]);

  // Collect all image URLs across the entire thread for modal keyboard navigation
  const allThreadImageUrls = useMemo<readonly string[]>(() => {
    if (activeTab === undefined) return [];
    const urls: string[] = [];
    const seen = new Set<string>();
    for (const r of activeTab.responses) {
      for (const img of detectImageUrls(r.body)) {
        // displayUrl is always the actual image URL (thumbnail for rich media, normalized for direct images)
        if (!seen.has(img.displayUrl)) {
          seen.add(img.displayUrl);
          urls.push(img.displayUrl);
        }
      }
    }
    return urls;
  }, [activeTab]);

  // F31: Pre-compute ID/ワッチョイ/コテハン count maps
  const idCountMap = useMemo(() => {
    if (activeTab === undefined) return new Map<string, { count: number; resNumbers: number[] }>();
    return buildCountMap(activeTab.responses, extractId);
  }, [activeTab]);

  const watchoiCountMap = useMemo(() => {
    if (activeTab === undefined) return new Map<string, { count: number; resNumbers: number[] }>();
    return buildCountMap(activeTab.responses, (r) => {
      const info = extractWatchoi(r);
      return info !== null ? info.label : null;
    });
  }, [activeTab]);

  const kotehanCountMap = useMemo(() => {
    if (activeTab === undefined) return new Map<string, { count: number; resNumbers: number[] }>();
    return buildCountMap(activeTab.responses, extractKotehan);
  }, [activeTab]);

  // F35: Check if thread has exposed IPs (for privacy warning in PostEditor)
  const hasExposedIps = useMemo(() => {
    if (activeTab === undefined) return false;
    return threadHasExposedIps(activeTab.responses);
  }, [activeTab]);

  // F31: Filter responses if filter is active
  const filteredResNumbers = useMemo<ReadonlySet<number> | null>(() => {
    if (filterKey === null || activeTab === undefined) return null;
    const set = new Set<number>();
    for (const res of activeTab.responses) {
      if (filterKey.type === 'id') {
        const id = extractId(res);
        if (id === filterKey.value) set.add(res.number);
      } else if (filterKey.type === 'watchoi') {
        const w = extractWatchoi(res);
        if (w !== null && w.label === filterKey.value) set.add(res.number);
      } else if (filterKey.type === 'kotehan') {
        const k = extractKotehan(res);
        if (k === filterKey.value) set.add(res.number);
      }
    }
    return set;
  }, [filterKey, activeTab]);

  // Build the display-ready response list (filtered or full)
  const displayResponses = useMemo(() => {
    if (activeTab === undefined) return [];
    if (filteredResNumbers === null) return activeTab.responses;
    return activeTab.responses.filter((res) => filteredResNumbers.has(res.number));
  }, [activeTab, filteredResNumbers]);

  // Map resNumber -> index in displayResponses for virtual scroll navigation
  const resNumberToIndex = useMemo(() => {
    const map = new Map<number, number>();
    for (let i = 0; i < displayResponses.length; i++) {
      const res = displayResponses[i];
      if (res !== undefined) {
        map.set(res.number, i);
      }
    }
    return map;
  }, [displayResponses]);

  // Virtual scrolling for the response list
  // getItemKey ensures size cache is keyed by res number, not by index.
  // Without this, applying a filter changes which item occupies each index,
  // causing the virtualizer to reuse wrong cached heights → overlapping text / huge gaps.
  const virtualizer = useVirtualizer({
    count: displayResponses.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 80,
    overscan: 5,
    getItemKey: (index) => displayResponses[index]?.number ?? index,
  });

  // Stable refs for use in callbacks without deps churn
  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;
  const displayResponsesRef = useRef(displayResponses);
  displayResponsesRef.current = displayResponses;
  const resNumberToIndexRef = useRef(resNumberToIndex);
  resNumberToIndexRef.current = resNumberToIndex;

  // Scroll to a specific res number using the virtualizer
  const scrollToResNumber = useCallback((resNumber: number) => {
    const index = resNumberToIndex.get(resNumber);
    if (index !== undefined) {
      virtualizerRef.current.scrollToIndex(index, { align: 'center', behavior: 'smooth' });
    }
  }, [resNumberToIndex]);

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

  // Pre-compute highlight data
  const ownResNumbers = useMemo(() => {
    if (activeTab === undefined || !highlightSettings.highlightOwnPosts) {
      return new Set<number>();
    }
    return buildOwnResNumbers(activeTab.responses, postHistory, activeTab.boardUrl, activeTab.threadId);
  }, [activeTab, postHistory, highlightSettings.highlightOwnPosts]);

  const replyResNumbers = useMemo(() => {
    if (!highlightSettings.highlightRepliesToOwn || activeTab === undefined) {
      return new Set<number>();
    }
    return buildReplyResNumbers(activeTab.responses, ownResNumbers);
  }, [activeTab, ownResNumbers, highlightSettings.highlightRepliesToOwn]);

  const getHighlightType = useCallback((resNumber: number): HighlightType => {
    if (ownResNumbers.has(resNumber)) return 'own';
    if (replyResNumbers.has(resNumber)) return 'reply';
    return 'none';
  }, [ownResNumbers, replyResNumbers]);

  const handleToggleHighlight = useCallback(() => {
    const bothOn = highlightSettings.highlightOwnPosts && highlightSettings.highlightRepliesToOwn;
    if (bothOn) {
      setHighlightSettings({ highlightOwnPosts: false, highlightRepliesToOwn: false });
    } else {
      setHighlightSettings({ highlightOwnPosts: true, highlightRepliesToOwn: true });
    }
  }, [highlightSettings, setHighlightSettings]);

  // Restore scroll position when the active tab changes (tab open / tab switch).
  //
  // This effect fires ONLY when activeTabId changes — intentionally NOT when
  // scrollTop / scrollResNumber change during normal scrolling. Adding those
  // values to the dependency array would re-trigger the restoration on every
  // debounced scroll event, calling scrollToIndex with stale estimated offsets
  // and causing the viewport to jump upward (the "下端を維持できない" bug).
  //
  // The values of activeTabScrollTop / activeTabScrollResNumber are read from
  // the store at the time the effect runs. Because restoreTabs calls
  // updateTabScroll (which sets scrollResNumber from tab.sav) *before* setting
  // activeTabId, the effect always sees the final, correct values.
  //
  // Primary path (scrollResNumber > 0): use virtualizer.scrollToIndex so that
  // the restoration is index-based rather than pixel-based. Pixel offsets drift
  // when TanStack Virtual re-measures items with sizes differing from the 80px
  // estimate, causing the viewport to land above the intended position.
  // Retries by checking visibility after each retryDelay (not synchronously,
  // because the DOM scroll is asynchronous relative to scrollToIndex).
  //
  // Fallback (scrollResNumber === 0, scrollTop > 0): legacy pixel-based scroll
  // for tabs restored from old tab.sav / Folder.idx without scrollResNumber.
  const activeTabScrollTop = activeTab?.scrollTop ?? 0;
  const activeTabScrollResNumber = activeTab?.scrollResNumber ?? 0;
  const activeTabScrollResOffset = activeTab?.scrollResOffset ?? 0;
  useEffect(() => {
    const container = scrollRef.current;
    const diagLog = (level: 'info' | 'warn' | 'error' | 'success', message: string): void => {
      const diagLevel = level === 'success' ? 'info' : level;
      void window.electronApi.invoke('diag:add-log', diagLevel, 'scroll', message);
    };

    if (container === null) {
      diagLog('warn', `[scroll-restore] tabId=${activeTabId ?? 'null'} container=null — skip`);
      return;
    }

    const resCount = displayResponsesRef.current.length;
    const initScrollTop = container.scrollTop;
    const initScrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;

    diagLog('info',
      `[scroll-restore] START tabId=${activeTabId ?? 'null'} ` +
      `resNum=${String(activeTabScrollResNumber)} scrollTop=${String(activeTabScrollTop)} ` +
      `responses=${String(resCount)} container.scrollTop=${String(initScrollTop)} ` +
      `scrollHeight=${String(initScrollHeight)} clientHeight=${String(clientHeight)}`
    );

    if (activeTabScrollResNumber > 0) {
      // Index-based restoration — snapshot the target res number at effect time
      const targetResNumber = activeTabScrollResNumber;
      let cancelled = false;
      let retries = 0;
      const maxRetries = 20;
      const retryDelay = 50;

      const tryScrollToIndex = (): void => {
        if (cancelled) return;
        const targetIndex = resNumberToIndexRef.current.get(targetResNumber);
        if (targetIndex === undefined) {
          diagLog('warn',
            `[scroll-restore] resNum=${String(targetResNumber)} not in displayResponses — abort`
          );
          return;
        }
        const totalSize = virtualizerRef.current.getTotalSize();
        diagLog('info',
          `[scroll-restore] scrollToIndex retry=${String(retries)} ` +
          `targetResNum=${String(targetResNumber)} targetIndex=${String(targetIndex)} ` +
          `estimatedTotalSize=${String(totalSize)} ` +
          `container.scrollTop=${String(container.scrollTop)} scrollHeight=${String(container.scrollHeight)}`
        );
        virtualizerRef.current.scrollToIndex(targetIndex, { align: 'start' });
        // Check visibility after retryDelay (DOM scroll is async, so the virtual
        // items list reflects the new position only after the browser has scrolled)
        setTimeout(() => {
          if (cancelled) return;
          const items = virtualizerRef.current.getVirtualItems();
          const isVisible = items.some((item) => item.index === targetIndex);
          const firstItem = items[0];
          const lastItem = items[items.length - 1];
          diagLog(isVisible ? 'success' : 'warn',
            `[scroll-restore] check retry=${String(retries)} ` +
            `visible=${String(isVisible)} container.scrollTop=${String(container.scrollTop)} ` +
            `scrollHeight=${String(container.scrollHeight)} ` +
            `virtualItems=${String(items.length)} ` +
            `range=[${String(firstItem?.index ?? -1)}..${String(lastItem?.index ?? -1)}]`
          );
          if (!isVisible && retries < maxRetries) {
            retries += 1;
            tryScrollToIndex();
          } else if (isVisible) {
            // Apply intra-item offset to restore the exact sub-item scroll position.
            // scrollResOffset = pixels from the top of the target virtual item to the viewport top.
            const savedOffset = activeTabScrollResOffset;
            if (savedOffset > 0) {
              const maxScroll = container.scrollHeight - container.clientHeight;
              container.scrollTop = Math.min(container.scrollTop + savedOffset, maxScroll);
            }
            diagLog('success',
              `[scroll-restore] DONE (index) retries=${String(retries)} ` +
              `offset=${String(savedOffset)} final.scrollTop=${String(container.scrollTop)}`
            );
          } else {
            diagLog('error',
              `[scroll-restore] GAVE UP after ${String(retries)} retries ` +
              `final.scrollTop=${String(container.scrollTop)} scrollHeight=${String(container.scrollHeight)}`
            );
          }
        }, retryDelay);
      };

      requestAnimationFrame(() => {
        requestAnimationFrame(tryScrollToIndex);
      });
      return () => { cancelled = true; };
    }

    if (activeTabScrollTop <= 0) {
      diagLog('info', `[scroll-restore] scrollTop=0 — scroll to top`);
      container.scrollTo(0, 0);
      return;
    }

    // Legacy pixel-based fallback.
    // Clamp target to the maximum reachable scroll position to avoid infinite
    // retries when the saved offset exceeds the current scrollHeight.
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const clampedScrollTop = Math.min(activeTabScrollTop, maxScrollTop);
    diagLog('info',
      `[scroll-restore] LEGACY path scrollTop=${String(activeTabScrollTop)} ` +
      `clamped=${String(clampedScrollTop)} maxScrollTop=${String(maxScrollTop)} ` +
      `scrollHeight=${String(container.scrollHeight)}`
    );
    let cancelled = false;
    let retries = 0;
    const maxRetries = 10;
    const retryDelay = 50;

    const tryScroll = (): void => {
      if (cancelled) return;
      container.scrollTo(0, clampedScrollTop);
      const diff = Math.abs(container.scrollTop - clampedScrollTop);
      diagLog(diff <= 2 ? 'success' : 'warn',
        `[scroll-restore] legacy retry=${String(retries)} ` +
        `target=${String(clampedScrollTop)} actual=${String(container.scrollTop)} diff=${String(diff)} ` +
        `scrollHeight=${String(container.scrollHeight)}`
      );
      if (diff > 2 && retries < maxRetries) {
        retries += 1;
        setTimeout(tryScroll, retryDelay);
      } else if (diff <= 2) {
        diagLog('success',
          `[scroll-restore] DONE (legacy) retries=${String(retries)} final.scrollTop=${String(container.scrollTop)}`
        );
      } else {
        diagLog('error',
          `[scroll-restore] GAVE UP (legacy) after ${String(retries)} retries ` +
          `final.scrollTop=${String(container.scrollTop)} scrollHeight=${String(container.scrollHeight)}`
        );
      }
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(tryScroll);
    });

    return () => { cancelled = true; };
  }, [activeTabId]);

  // Track the last visible response number at the viewport bottom.
  // Updated cheaply on scroll (ref only, no state update / IPC).
  // The value is committed to kokomade only on tab switch or tab close.
  const lastVisibleResRef = useRef(-1);

  // Save scroll position on scroll (debounced) and track last visible res in ref
  useEffect(() => {
    const container = scrollRef.current;
    if (container === null || activeTabId === null) return;

    let timeout: ReturnType<typeof setTimeout> | null = null;
    const handleScroll = (): void => {
      if (timeout !== null) clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (activeTabId !== null) {
          const scrollTopVal = container.scrollTop;
          const items = virtualizerRef.current.getVirtualItems();
          const responses = displayResponsesRef.current;

          // Find first visible response number and its intra-item offset
          let firstVisible = 0;
          let firstVisibleOffset = 0;
          for (const item of items) {
            if (item.end > scrollTopVal) {
              const res = responses[item.index];
              if (res !== undefined) {
                firstVisible = res.number;
                // How many pixels from the item's estimated top to the viewport top
                firstVisibleOffset = Math.max(0, Math.round(scrollTopVal - item.start));
                break;
              }
            }
          }

          void window.electronApi.invoke('diag:add-log', 'info', 'scroll',
            `[scroll-save] tabId=${activeTabId} scrollTop=${String(scrollTopVal)} ` +
            `firstResNum=${String(firstVisible)} offset=${String(firstVisibleOffset)} ` +
            `totalSize=${String(virtualizerRef.current.getTotalSize())} ` +
            `scrollHeight=${String(container.scrollHeight)}`
          );
          updateTabScroll(
            activeTabId,
            scrollTopVal,
            firstVisible > 0 ? firstVisible : undefined,
            firstVisible > 0 ? firstVisibleOffset : undefined,
          );

          // Lightweight: just update the ref, no state change
          const viewportBottom = scrollTopVal + container.clientHeight;
          let lastVisible = -1;
          for (const item of items) {
            if (item.start < viewportBottom) {
              const res = responses[item.index];
              if (res !== undefined) {
                lastVisible = res.number;
              }
            }
          }
          lastVisibleResRef.current = lastVisible;
        }
      }, 300);
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (timeout !== null) clearTimeout(timeout);
    };
  }, [activeTabId, updateTabScroll]);

  // Close popup and reset AA overrides on tab change
  useEffect(() => {
    setPopup(null);
    setAaOverrides((prev) => prev.size > 0 ? new Map<number, boolean>() : prev);
    preFilterScrollTopRef.current = 0;
    preFilterResNumberRef.current = 0;
    prevFilterKeyRef.current = null;
  }, [activeTabId]);

  // Seed lastVisibleResRef after layout settles on tab open/switch.
  // This covers the case where no scroll event fires (e.g. scrollTop === 0).
  useEffect(() => {
    if (activeTabId === null) return;
    lastVisibleResRef.current = -1;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      const container = scrollRef.current;
      if (container === null) return;
      const viewportBottom = container.scrollTop + container.clientHeight;
      const items = virtualizerRef.current.getVirtualItems();
      const responses = displayResponsesRef.current;
      let lastVisible = -1;
      for (const item of items) {
        if (item.start < viewportBottom) {
          const res = responses[item.index];
          if (res !== undefined) {
            lastVisible = res.number;
          }
        }
      }
      lastVisibleResRef.current = lastVisible;
    }, 800);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [activeTabId]);

  // Commit kokomade when leaving a tab (switch or component unmount).
  // The cleanup captures the outgoing tabId and persists the ref value.
  useEffect(() => {
    const tabId = activeTabId;
    return () => {
      if (tabId !== null && lastVisibleResRef.current >= 1) {
        updateTabKokomade(tabId, lastVisibleResRef.current);
      }
    };
  }, [activeTabId, updateTabKokomade]);

  const handleCloseTab = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      e.stopPropagation();
      // Flush kokomade before the tab is removed from state
      if (lastVisibleResRef.current >= 1) {
        updateTabKokomade(tabId, lastVisibleResRef.current);
      }
      closeTab(tabId);
    },
    [closeTab, updateTabKokomade],
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

  const handleResNumberClick = useCallback((resNumber: number) => {
    if (activeTabId !== null) openTabPostEditorWithQuote(activeTabId, resNumber);
  }, [activeTabId, openTabPostEditorWithQuote]);

  const handleSetKokomade = useCallback((resNumber: number) => {
    if (activeTabId !== null) {
      updateTabKokomade(activeTabId, resNumber);
    }
  }, [activeTabId, updateTabKokomade]);

  // F16: Scroll to a specific response number (virtualizer-based)
  const handleScrollToRes = useCallback((resNumber: number) => {
    scrollToResNumber(resNumber);
  }, [scrollToResNumber]);

  const handleAddNgWord = useCallback((selectedText: string) => {
    if (activeTab === undefined) return;
    const boardId = extractBoardId(activeTab.boardUrl);
    openNgEditorWithToken(selectedText, boardId, activeTab.threadId);
  }, [activeTab, openNgEditorWithToken]);

  const handleThreadWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const container = scrollRef.current;
    if (container === null) return;
    if (edgeRefreshLockedRef.current || refreshing) return;

    const atTop = container.scrollTop <= 0;
    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 5;
    const scrollingUp = e.deltaY < 0;
    const scrollingDown = e.deltaY > 0;

    if ((atTop && scrollingUp) || (atBottom && scrollingDown)) {
      edgeRefreshLockedRef.current = true;
      setEdgeRefreshing(true);
      void handleRefreshCurrentThread().finally(() => { setEdgeRefreshing(false); });

      if (edgeRefreshUnlockTimerRef.current !== null) {
        clearTimeout(edgeRefreshUnlockTimerRef.current);
      }
      edgeRefreshUnlockTimerRef.current = setTimeout(() => {
        edgeRefreshLockedRef.current = false;
        edgeRefreshUnlockTimerRef.current = null;
      }, 1200);
    }
  }, [refreshing, handleRefreshCurrentThread]);

  useEffect(() => {
    return () => {
      if (edgeRefreshUnlockTimerRef.current !== null) {
        clearTimeout(edgeRefreshUnlockTimerRef.current);
      }
    };
  }, []);

  const { getDragProps: getThreadTabDragProps, dragOverIndex: threadTabDragOverIndex, dragSourceIndex: threadTabDragSourceIndex } = useDragReorder({
    itemCount: tabs.length,
    onReorder: reorderThreadTabs,
  });

  const [threadTabOrientation, toggleThreadTabOrientation] = useTabOrientation('vbbb-thread-tab-orientation');
  const isVerticalThreadTabs = threadTabOrientation === 'vertical';

  const threadTabDragIndicator = (i: number): string =>
    threadTabDragOverIndex === i && threadTabDragSourceIndex !== i
      ? isVerticalThreadTabs
        ? ' border-t-2 border-t-[var(--color-accent)]'
        : ' border-l-2 border-l-[var(--color-accent)]'
      : '';

  const renderThreadTabItem = (tab: typeof tabs[number], i: number): React.ReactNode => (
    <div
      key={tab.id}
      role="tab"
      tabIndex={0}
      title={tab.title}
      {...getThreadTabDragProps(i)}
      onClick={() => {
        if (activeTabId !== null && activeTabId !== tab.id && scrollRef.current !== null) {
          updateTabScroll(activeTabId, scrollRef.current.scrollTop);
        }
        setActiveTab(tab.id);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (activeTabId !== null && activeTabId !== tab.id && scrollRef.current !== null) {
            updateTabScroll(activeTabId, scrollRef.current.scrollTop);
          }
          setActiveTab(tab.id);
        }
      }}
      onContextMenu={(e) => { handleTabContextMenu(e, tab.id); }}
      className={`group flex cursor-pointer items-center gap-1 text-xs transition-opacity ${
        isVerticalThreadTabs ? 'rounded px-2 py-1' : 'max-w-48 shrink-0 rounded-t px-2 py-1'
      } ${
        tab.id === activeTabId
          ? 'bg-[var(--color-bg-active)] text-[var(--color-text-primary)]'
          : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]'
      }${threadTabDragSourceIndex === i ? ' opacity-50' : ''}${threadTabDragIndicator(i)}`}
      aria-selected={tab.id === activeTabId}
    >
      <span className="truncate">
        {tab.isDatFallen && (
          <span className="mr-0.5 font-bold text-[var(--color-error)]">【DAT落ち】</span>
        )}
        {tab.title}
      </span>
      <button
        type="button"
        onClick={(e) => { handleCloseTab(e, tab.id); }}
        className="ml-1 shrink-0 rounded p-0.5 opacity-0 hover:bg-[var(--color-bg-tertiary)] group-hover:opacity-100"
        aria-label="タブを閉じる"
      >
        <MdiIcon path={mdiClose} size={10} />
      </button>
    </div>
  );

  const actionButtons = activeTab !== undefined ? (
    <div className={`flex items-center gap-1 ${isVerticalThreadTabs ? 'px-2' : 'mr-2'}`}>
      <button
        type="button"
        onClick={() => { void handleRefreshCurrentThread(); }}
        className={`rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] ${
          refreshing ? 'bg-[var(--color-bg-active)] text-[var(--color-accent)]' : ''
        }`}
        title="スレッドを更新"
      >
        <MdiIcon path={refreshing ? mdiLoading : mdiRefresh} size={14} className={refreshing ? 'animate-spin' : ''} />
      </button>
      <button
        type="button"
        onClick={handleToggleInlineMedia}
        className={`rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] ${
          inlineMediaEnabled ? 'bg-[var(--color-bg-active)] text-[var(--color-accent)]' : ''
        }`}
        title={inlineMediaEnabled ? 'インライン画像/動画: ON' : 'インライン画像/動画: OFF'}
      >
        <MdiIcon path={mdiImage} size={14} />
      </button>
      <button
        type="button"
        onClick={handleToggleRelativeTime}
        className={`rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] ${
          showRelativeTime ? 'bg-[var(--color-bg-active)] text-[var(--color-accent)]' : ''
        }`}
        title={showRelativeTime ? '相対時刻: ON' : '相対時刻: OFF'}
      >
        <MdiIcon path={mdiClockOutline} size={14} />
      </button>
      <button
        type="button"
        onClick={handleToggleHighlight}
        className={`rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] ${
          highlightSettings.highlightOwnPosts ? 'bg-[var(--color-bg-active)] text-[var(--color-warning)]' : ''
        }`}
        title={highlightSettings.highlightOwnPosts ? 'ハイライト: ON' : 'ハイライト: OFF'}
      >
        <MdiIcon path={mdiFormatColorHighlight} size={14} />
      </button>
      <button
        type="button"
        onClick={handleToggleAnalysis}
        className={`rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] ${
          analysisOpen ? 'bg-[var(--color-bg-active)] text-[var(--color-accent)]' : ''
        }`}
        title="スレッド分析"
      >
        <MdiIcon path={mdiChartBar} size={14} />
      </button>
      <button
        type="button"
        onClick={toggleNgEditor}
        className={`rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] ${
          ngEditorOpen ? 'bg-[var(--color-bg-active)] text-[var(--color-error)]' : ''
        }`}
        title="NG管理（共通）"
      >
        <MdiIcon path={mdiShieldOff} size={14} />
      </button>
      <button
        type="button"
        onClick={handleTogglePostEditor}
        className={`rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] ${
          postEditorOpen ? 'bg-[var(--color-bg-active)] text-[var(--color-accent)]' : ''
        }`}
        title="書き込み"
      >
        <MdiIcon path={mdiPencil} size={14} />
      </button>
      <button
        type="button"
        onClick={handleToggleProgPost}
        className={`rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] ${
          progPostOpen ? 'bg-[var(--color-bg-active)] text-[var(--color-accent)]' : ''
        }`}
        title="プログラマティック書き込み"
      >
        <MdiIcon path={mdiRobot} size={14} />
      </button>
    </div>
  ) : null;

  return (
    <section className={`flex min-w-0 flex-1 ${isVerticalThreadTabs ? 'flex-row' : 'flex-col'}`} onKeyDown={handleScrollKeyboard}>
      {/* Tab bar */}
      {isVerticalThreadTabs ? (
        <div className="flex w-36 shrink-0 flex-col border-r border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
          <div className="flex items-center justify-end border-b border-[var(--color-border-secondary)] px-1 py-0.5">
            <button
              type="button"
              onClick={toggleThreadTabOrientation}
              className="shrink-0 rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
              title="タブを横に表示"
            >
              <MdiIcon path={mdiViewParallel} size={12} />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1 py-0.5">
            {tabs.map((tab, i) => renderThreadTabItem(tab, i))}
          </div>
        </div>
      ) : (
        <div className="flex h-8 items-center border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
          <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1">
            {tabs.map((tab, i) => renderThreadTabItem(tab, i))}
          </div>
          <button
            type="button"
            onClick={toggleThreadTabOrientation}
            className="mr-1 shrink-0 rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
            title="タブを縦に表示"
          >
            <MdiIcon path={mdiViewSequential} size={12} />
          </button>
          {actionButtons}
        </div>
      )}

      {/* Main content column */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Action buttons bar (separate when vertical tabs) */}
        {isVerticalThreadTabs && actionButtons !== null && (
          <div className="flex h-8 items-center border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
            {actionButtons}
          </div>
        )}

      {/* Content */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {activeTab === undefined ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-xs text-[var(--color-text-muted)]">スレッドを選択してください</p>
          </div>
        ) : (
          <>
            {/* Thread title */}
            <div className="border-b border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)]/30 px-4 py-1.5">
              <h2 className="text-sm font-medium text-[var(--color-text-primary)]">
                {activeTab.isDatFallen && (
                  <span className="mr-1 font-bold text-[var(--color-error)]">【DAT落ち】</span>
                )}
                {activeTab.title}
              </h2>
              <p className="text-xs text-[var(--color-text-muted)]">{activeTab.responses.length} レス</p>
            </div>

            {/* F31: Filter banner */}
            {filterKey !== null && (
              <div className="flex items-center gap-2 border-b border-[var(--color-border-secondary)] bg-[var(--color-bg-tertiary)] px-4 py-1">
                <span className="text-xs text-[var(--color-text-secondary)]">
                  フィルタ: {filterKey.type === 'id' ? 'ID' : filterKey.type === 'watchoi' ? 'ワッチョイ' : 'コテハン'} = {filterKey.value}
                </span>
                <button
                  type="button"
                  onClick={handleClearFilter}
                  className="rounded px-1.5 py-0.5 text-xs text-[var(--color-error)] hover:bg-[var(--color-bg-hover)]"
                >
                  解除
                </button>
              </div>
            )}

            {/* Responses — virtual scrolling */}
            <div ref={scrollRef} className="relative flex-1 overflow-y-auto" onWheel={handleThreadWheel}>
              <div
                style={{
                  height: `${String(virtualizer.getTotalSize())}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const res = displayResponses[virtualRow.index];
                  if (res === undefined) return null;

                  const resIdVal = extractId(res);
                  const resWatchoiVal = extractWatchoi(res);
                  const resKotehanVal = extractKotehan(res);

                  return (
                    <div
                      key={res.number}
                      data-index={virtualRow.index}
                      ref={virtualizer.measureElement}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${String(virtualRow.start)}px)`,
                      }}
                    >
                      {activeTab.kokomade >= 0 && res.number === activeTab.kokomade + 1 && (
                        <div className="mx-4 my-1 flex items-center gap-2 border-t-2 border-[var(--color-warning)] py-1">
                          <span className="text-xs font-semibold text-[var(--color-warning)]">--- ここまで読んだ ---</span>
                        </div>
                      )}
                      <ResItem
                        res={res}
                        boardUrl={activeTab.boardUrl}
                        threadId={activeTab.threadId}
                        ngResult={ngResults.get(res.number) ?? NgFilterResultEnum.None}
                        highlightType={getHighlightType(res.number)}
                        showRelativeTime={showRelativeTime}
                        inlineMediaEnabled={inlineMediaEnabled}
                        allThreadImageUrls={allThreadImageUrls}
                        idCount={resIdVal !== null ? (idCountMap.get(resIdVal)?.count ?? 0) : 0}
                        watchoiCount={resWatchoiVal !== null ? (watchoiCountMap.get(resWatchoiVal.label)?.count ?? 0) : 0}
                        kotehanCount={resKotehanVal !== null ? (kotehanCountMap.get(resKotehanVal)?.count ?? 0) : 0}
                        replyNumbers={replyMap.get(res.number) ?? []}
                        onAnchorHover={handleAnchorHover}
                        onAnchorLeave={handleAnchorLeave}
                        onResNumberClick={handleResNumberClick}
                        onSetKokomade={handleSetKokomade}
                        onAddNgWord={handleAddNgWord}
                        onScrollToResNumber={scrollToResNumber}
                        onFilterById={handleFilterById}
                        onFilterByWatchoi={handleFilterByWatchoi}
                        onFilterByKotehan={handleFilterByKotehan}
                        aaOverride={aaOverrides.get(res.number)}
                        onToggleAaFont={handleToggleAaFont}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* F16: Thread Analysis Panel */}
            {analysisOpen && (
              <Suspense fallback={null}>
                <ThreadAnalysis
                  responses={activeTab.responses}
                  onClose={handleToggleAnalysis}
                  onScrollToRes={handleScrollToRes}
                />
              </Suspense>
            )}

            {/* NG Editor (shared across all tabs) */}
            {ngEditorOpen && (
              <Suspense fallback={null}>
                <NgEditor />
              </Suspense>
            )}

            {/* Post editor (per tab) */}
            {postEditorOpen && (
              <Suspense fallback={null}>
                <PostEditor
                  boardUrl={activeTab.boardUrl}
                  threadId={activeTab.threadId}
                  hasExposedIps={hasExposedIps}
                  onClose={() => { closeTabPostEditor(activeTab.id); }}
                  initialMessage={postEditorInitialMessage}
                />
              </Suspense>
            )}

            {/* F26: Programmatic post editor (per tab) */}
            {progPostOpen && (
              <Suspense fallback={null}>
                <ProgrammaticPost boardUrl={activeTab.boardUrl} threadId={activeTab.threadId} onClose={handleCloseProgPost} />
              </Suspense>
            )}
          </>
        )}
        {edgeRefreshing && <RefreshOverlay />}
      </div>

      </div>{/* end main content column */}

      {/* Thread tab context menu (F12) */}
      {tabCtxMenu !== null && (
        <ContextMenuContainer
          x={tabCtxMenu.x}
          y={tabCtxMenu.y}
          className="fixed z-50 min-w-40 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] py-1 shadow-lg"
          role="menu"
        >
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
            onClick={() => { void handleRefreshTabFromMenu(); }}
            role="menuitem"
          >
            更新
          </button>
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
            onClick={handleAddTabToRound}
            role="menuitem"
          >
            巡回に追加
          </button>
          <div className="mx-2 my-0.5 border-t border-[var(--color-border-secondary)]" />
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
            onClick={handleTabCtxToggleFavorite}
            role="menuitem"
          >
            {tabCtxMenu.isFavorite ? 'お気に入りから削除' : 'お気に入りに追加'}
          </button>
        </ContextMenuContainer>
      )}

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
