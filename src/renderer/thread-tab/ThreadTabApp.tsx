/**
 * Thread Tab application — thread response viewer for one thread.
 * Runs in its own WebContentsView / renderer process.
 * No virtual scrolling — renders all responses directly.
 */
import {
  Fragment,
  useCallback,
  useRef,
  useEffect,
  useState,
  useMemo,
  useDeferredValue,
  lazy,
  Suspense,
} from 'react';
import {
  mdiClose,
  mdiMagnify,
  mdiPencil,
  mdiShieldOff,
  mdiFormatColorHighlight,
  mdiClockOutline,
  mdiChartBar,
  mdiRobot,
  mdiRefresh,
  mdiLoading,
  mdiImage,
  mdiEye,
  mdiVolumeHigh,
  mdiChevronRight,
  mdiArrowRightBold,
} from '@mdi/js';
import { createPortal } from 'react-dom';
import type { Res, SubjectRecord } from '@shared/domain';
import {
  type NgRule,
  type NgFilterResult,
  type NgMatchContext,
  type NgStringField,
  AbonType,
  NgStringField as NgStringFieldEnum,
  NgStringMatchMode,
  NgTarget,
  NgFilterResult as NgFilterResultEnum,
} from '@shared/ng';
import {
  extractStringFields,
  parseDateTimeField,
  buildIdCountMap,
  buildRepliedCountMap,
  buildNumericValuesForRes,
} from '@shared/ng-field-extractor';
import { matchNgCondition } from '@shared/ng-matcher';
import { useThreadTabStore } from './stores/thread-tab-store';
import { MdiIcon } from '../components/common/MdiIcon';
import { sanitizeHtml, stripHtml } from '../hooks/use-sanitize';
import { convertAnchorsToLinks, parseAnchors } from '../utils/anchor-parser';
import { detectAudioUrls, detectImageUrls, detectVideoUrls } from '../utils/image-detect';
import { linkifyUrls } from '../utils/url-linkify';
import { RefreshOverlay } from '../components/common/RefreshOverlay';
import { ResPopup } from '../components/thread-view/ResPopup';
import { ImageThumbnail } from '../components/thread-view/ImageThumbnail';
import { InlineVideo } from '../components/thread-view/InlineVideo';
import { InlineAudio } from '../components/thread-view/InlineAudio';
import { isAsciiArt } from '../utils/aa-detect';
import {
  extractId,
  extractWatchoi,
  extractKotehan,
  type WatchoiInfo,
} from '../utils/thread-analysis';
import { extractIps } from '../utils/ip-detect';
import { findNextThread, NEXT_THREAD_RESPONSE_THRESHOLD } from '../utils/next-thread-detect';
import { generateNextThreadTemplate } from '../utils/next-thread-template';
import { useScrollKeyboard } from '../hooks/use-scroll-keyboard';
import { ContextMenuContainer } from '../components/common/ContextMenuContainer';
import { buildResPermalink } from '@shared/url-parser';
import type { ThreadTabInitData } from '@shared/view-ipc';
import type { IpLookupResult } from '@shared/ipc';

const ThreadAnalysis = lazy(() =>
  import('../components/thread-view/ThreadAnalysis').then((m) => ({
    default: m.ThreadAnalysis,
  })),
);

type SearchField = 'all' | 'name' | 'id' | 'body' | 'watchoi';

const DATE_PATTERN = /(\d{4})\/(\d{1,2})\/(\d{1,2})\([^)]*\)\s*(\d{1,2}):(\d{2}):(\d{2})/;
const BE_PATTERN = /BE:(\d+)-(\d+)/;
const INLINE_VIDEO_INITIAL_VOLUME_PERCENT_KEY = 'vbbb-inline-video-initial-volume-percent';
const DEFAULT_INLINE_VIDEO_INITIAL_VOLUME_PERCENT = 10;
const HEADER_REFRESH_INTERVAL_KEY = 'vbbb-header-refresh-interval-min';
const DEFAULT_HEADER_REFRESH_INTERVAL_MIN = 30;
const VALID_HEADER_REFRESH_INTERVALS = [5, 15, 30, 60] as const;

interface PopupState {
  readonly resNumbers: readonly number[];
  readonly x: number;
  readonly y: number;
  readonly expandReplies: boolean;
}

function parseResDateTime(dateTime: string): Date | null {
  const m = DATE_PATTERN.exec(dateTime);
  if (m === null) return null;
  return new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6]),
  );
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

function formatDateCompact(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${String(y)}/${mo}/${d} ${h}:${mi}`;
}

function formatRelativeDay(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return '未来';
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return '今日';
  if (diffDays === 1) return '昨日';
  if (diffDays < 365) return `${String(diffDays)}日前`;
  return `${String(Math.floor(diffDays / 365))}年前`;
}

function computeIkioiFromFileName(fileName: string, count: number): number {
  const threadTs = parseInt(fileName.replace('.dat', ''), 10);
  if (Number.isNaN(threadTs) || threadTs <= 0) return 0;
  const elapsedDays = (Date.now() / 1000 - threadTs) / 86400;
  if (elapsedDays <= 0) return 0;
  return count / elapsedDays;
}

function renderDateTimeWithBe(dateTime: string, showRelative: boolean): React.ReactNode {
  const relativeNode = showRelative
    ? (() => {
        const parsed = parseResDateTime(dateTime);
        if (parsed === null) return null;
        return (
          <span className="ml-1 text-[var(--color-text-muted)] opacity-70">
            ({formatRelativeTime(parsed)})
          </span>
        );
      })()
    : null;

  const match = BE_PATTERN.exec(dateTime);
  if (match?.[1] === undefined || match[2] === undefined) {
    return (
      <>
        {dateTime}
        {relativeNode}
      </>
    );
  }

  const beId = match[1];
  const dateOnly = dateTime.replace(BE_PATTERN, '').trim();
  return (
    <>
      {dateOnly}
      <span className="ml-1 text-[var(--color-accent)]">BE:{beId}</span>
      {relativeNode}
    </>
  );
}

function FilterLink({
  children,
  count,
  resNumbers,
  onFilter,
  onHover,
  onLeave,
  className,
}: {
  readonly children: React.ReactNode;
  readonly count: number;
  readonly resNumbers: readonly number[];
  readonly onFilter: () => void;
  readonly onHover: (nums: readonly number[], x: number, y: number) => void;
  readonly onLeave: () => void;
  readonly className?: string;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`cursor-pointer border-none bg-transparent p-0 hover:underline ${className ?? ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onFilter();
      }}
      onMouseEnter={(e) => {
        onHover(resNumbers, e.clientX, e.clientY);
      }}
      onMouseLeave={onLeave}
      title={`${String(count)}件 — クリックで絞り込み`}
    >
      {children}
      {count > 1 && <span className="ml-0.5 text-[10px] opacity-60">({count})</span>}
    </button>
  );
}

/**
 * Render the name field decomposed into clickable FilterLink segments.
 *
 * Input `res.name` is HTML like:
 *   `ゴンザレス (ﾜｯﾁｮｲW eb80-pWbN [240f:7e:9d00:1:*])`
 *
 * Each extracted part (kotehan, watchoi, IP) becomes a FilterLink;
 * non-linkable punctuation is rendered as plain text.
 */
function renderNameField(
  res: Res,
  kotehan: string | null,
  kotehanNums: readonly number[],
  watchoi: WatchoiInfo | null,
  watchoiNums: readonly number[],
  ips: readonly string[],
  ipNumsMap: ReadonlyMap<string, readonly number[]>,
  setFilterKey: (key: { type: 'kotehan' | 'watchoi' | 'ip'; value: string }) => void,
  onHover: (nums: readonly number[], x: number, y: number) => void,
  onLeave: () => void,
  onIpLookup: (ip: string) => void,
): React.JSX.Element {
  const plain = res.name.replace(/<[^>]+>/g, '');
  const namePart = plain.replace(/\([^)]*\)/g, '').trim();

  return (
    <span className="inline-flex flex-wrap items-baseline gap-0.5 text-xs">
      {kotehan !== null ? (
        <FilterLink
          count={kotehanNums.length}
          resNumbers={kotehanNums}
          onFilter={() => {
            setFilterKey({ type: 'kotehan', value: kotehan });
          }}
          onHover={onHover}
          onLeave={onLeave}
          className="text-[var(--color-res-name)]"
        >
          {namePart}
        </FilterLink>
      ) : (
        <span className="text-[var(--color-res-name)]">{namePart}</span>
      )}
      {watchoi !== null && (
        <>
          <span className="text-[var(--color-text-muted)]">(</span>
          <FilterLink
            count={watchoiNums.length}
            resNumbers={watchoiNums}
            onFilter={() => {
              setFilterKey({ type: 'watchoi', value: watchoi.label });
            }}
            onHover={onHover}
            onLeave={onLeave}
            className="text-[var(--color-link)]"
          >
            {watchoi.prefix} {watchoi.ipHash}-{watchoi.uaHash}
          </FilterLink>
          {ips.length > 0 && (
            <>
              <span className="text-[var(--color-text-muted)]"> [</span>
              {ips.map((ip, idx) => {
                const nums = ipNumsMap.get(ip) ?? [];
                return (
                  <span key={ip} className="inline-flex items-baseline">
                    {idx > 0 && <span className="text-[var(--color-text-muted)]">, </span>}
                    <FilterLink
                      count={nums.length}
                      resNumbers={nums}
                      onFilter={() => {
                        setFilterKey({ type: 'ip', value: ip });
                      }}
                      onHover={onHover}
                      onLeave={onLeave}
                      className="text-[var(--color-warning)]"
                    >
                      {ip}
                    </FilterLink>
                    <button
                      type="button"
                      className="ml-0.5 cursor-pointer border-none bg-transparent p-0 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onIpLookup(ip);
                      }}
                      title={`${ip} の逆引き`}
                    >
                      🔍
                    </button>
                  </span>
                );
              })}
              <span className="text-[var(--color-text-muted)]">]</span>
            </>
          )}
          <span className="text-[var(--color-text-muted)]">)</span>
        </>
      )}
      {watchoi === null && ips.length > 0 && (
        <>
          <span className="text-[var(--color-text-muted)]">[</span>
          {ips.map((ip, idx) => {
            const nums = ipNumsMap.get(ip) ?? [];
            return (
              <span key={ip} className="inline-flex items-baseline">
                {idx > 0 && <span className="text-[var(--color-text-muted)]">, </span>}
                <FilterLink
                  count={nums.length}
                  resNumbers={nums}
                  onFilter={() => {
                    setFilterKey({ type: 'ip', value: ip });
                  }}
                  onHover={onHover}
                  onLeave={onLeave}
                  className="text-[var(--color-warning)]"
                >
                  {ip}
                </FilterLink>
                <button
                  type="button"
                  className="ml-0.5 cursor-pointer border-none bg-transparent p-0 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    onIpLookup(ip);
                  }}
                  title={`${ip} の逆引き`}
                >
                  🔍
                </button>
              </span>
            );
          })}
          <span className="text-[var(--color-text-muted)]">]</span>
        </>
      )}
    </span>
  );
}

export function ThreadTabApp(): React.JSX.Element {
  const boardUrl = useThreadTabStore((s) => s.boardUrl);
  const threadId = useThreadTabStore((s) => s.threadId);
  const title = useThreadTabStore((s) => s.title);
  const responses = useThreadTabStore((s) => s.responses);
  const loading = useThreadTabStore((s) => s.loading);
  const isDatFallen = useThreadTabStore((s) => s.isDatFallen);
  const postEditorInitialMessage = useThreadTabStore((s) => s.postEditorInitialMessage);
  const analysisOpen = useThreadTabStore((s) => s.analysisOpen);
  const ngRules = useThreadTabStore((s) => s.ngRules);
  const highlightSettings = useThreadTabStore((s) => s.highlightSettings);
  const postHistory = useThreadTabStore((s) => s.postHistory);
  const initialScrollTop = useThreadTabStore((s) => s.initialScrollTop);
  const kokomade = useThreadTabStore((s) => s.kokomade);
  const updateKokomade = useThreadTabStore((s) => s.updateKokomade);
  const initialize = useThreadTabStore((s) => s.initialize);
  const refreshThread = useThreadTabStore((s) => s.refreshThread);
  const toggleAnalysis = useThreadTabStore((s) => s.toggleAnalysis);
  const setHighlightSettings = useThreadTabStore((s) => s.setHighlightSettings);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchField, setSearchField] = useState<SearchField>('all');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [revealAbon, setRevealAbon] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showRelativeTime, setShowRelativeTime] = useState(false);
  const [inlineMediaEnabled, setInlineMediaEnabled] = useState(true);
  const [popup, setPopup] = useState<PopupState | null>(null);
  const popupCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popupEnteredRef = useRef(false);
  const [filterKey, setFilterKey] = useState<{
    type: 'id' | 'watchoi' | 'kotehan' | 'ip';
    value: string;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    resNumber: number;
    x: number;
    y: number;
  } | null>(null);
  const [openContextSubMenu, setOpenContextSubMenu] = useState<string | null>(null);
  const [contextSelectedText, setContextSelectedText] = useState('');
  const [aaOverrides, setAaOverrides] = useState(() => new Map<number, boolean>());
  const [ipLookupPopup, setIpLookupPopup] = useState<{
    ip: string;
    result: IpLookupResult | null;
    loading: boolean;
  } | null>(null);
  const [nextThreadCandidate, setNextThreadCandidate] = useState<SubjectRecord | null | undefined>(
    undefined,
  );
  const lastVisibleResRef = useRef(-1);
  const [ikioiRank, setIkioiRank] = useState<{ rank: number; total: number } | null>(null);
  const [headerRefreshIntervalMin, setHeaderRefreshIntervalMin] = useState(() => {
    try {
      const raw = localStorage.getItem(HEADER_REFRESH_INTERVAL_KEY);
      if (raw !== null) {
        const n = Number(raw);
        if ((VALID_HEADER_REFRESH_INTERVALS as readonly number[]).includes(n)) return n;
      }
    } catch {
      /* ignore */
    }
    return DEFAULT_HEADER_REFRESH_INTERVAL_MIN;
  });
  const [headerRefreshTick, setHeaderRefreshTick] = useState(0);

  const handleIpLookup = useCallback((ip: string) => {
    setIpLookupPopup({ ip, result: null, loading: true });
    void window.electronApi.invoke('ip:lookup', ip).then((result) => {
      setIpLookupPopup({ ip, result, loading: false });
    });
  }, []);

  const [inlineVideoInitialVolumePercent, setInlineVideoInitialVolumePercent] = useState(() => {
    try {
      const raw = localStorage.getItem(INLINE_VIDEO_INITIAL_VOLUME_PERCENT_KEY);
      if (raw !== null) {
        const n = Number(raw);
        if (Number.isFinite(n) && n >= 0 && n <= 100) return n;
      }
    } catch {
      /* ignore */
    }
    return DEFAULT_INLINE_VIDEO_INITIAL_VOLUME_PERCENT;
  });
  const [inlineVideoInitialVolumeInput, setInlineVideoInitialVolumeInput] = useState(
    String(inlineVideoInitialVolumePercent),
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const handleScrollKeyboard = useScrollKeyboard(scrollRef);
  const edgeRefreshUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const edgeRefreshLockedRef = useRef(false);
  const scrollReportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRestoredRef = useRef(false);

  // Initialize on mount (pull model) or via push event from pool
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    void (async () => {
      const initData = await window.electronApi.invoke('view:thread-tab-ready');
      if (initData !== null) {
        await initialize(initData);
      }
    })();
  }, [initialize]);

  // Restore scroll position after responses load
  useEffect(() => {
    if (scrollRestoredRef.current) return;
    if (initialScrollTop <= 0 || responses.length === 0) return;
    scrollRestoredRef.current = true;
    requestAnimationFrame(() => {
      if (scrollRef.current !== null) {
        scrollRef.current.scrollTop = initialScrollTop;
      }
    });
  }, [initialScrollTop, responses.length]);

  // Listen for push events
  useEffect(() => {
    const unsubInit = window.electronApi.on('view:thread-tab-init', (...args: unknown[]) => {
      const initData = args[0] as ThreadTabInitData;
      void useThreadTabStore.getState().initialize(initData);
    });
    const unsubNg = window.electronApi.on('view:ng-rules-updated', (...args: unknown[]) => {
      const rules = args[0] as readonly NgRule[];
      useThreadTabStore.getState().setNgRules(rules);
    });
    const unsubRefresh = window.electronApi.on('view:refresh-thread', () => {
      void useThreadTabStore.getState().refreshThread();
    });
    const unsubHighlight = window.electronApi.on(
      'view:highlight-settings-updated',
      (...args: unknown[]) => {
        const settings = args[0] as { highlightOwnPosts: boolean; highlightRepliesToOwn: boolean };
        useThreadTabStore.getState().setHighlightSettings(settings);
      },
    );
    return () => {
      unsubInit();
      unsubNg();
      unsubRefresh();
      unsubHighlight();
    };
  }, []);

  // Cleanup + kokomade auto-save on unmount
  useEffect(() => {
    return () => {
      if (edgeRefreshUnlockTimerRef.current !== null) {
        clearTimeout(edgeRefreshUnlockTimerRef.current);
      }
      if (scrollReportTimerRef.current !== null) {
        clearTimeout(scrollReportTimerRef.current);
      }
      if (lastVisibleResRef.current >= 1) {
        const state = useThreadTabStore.getState();
        if (state.boardUrl.length > 0 && state.threadId.length > 0) {
          void window.electronApi.invoke(
            'bbs:update-thread-index',
            state.boardUrl,
            state.threadId,
            {
              kokomade: lastVisibleResRef.current,
            },
          );
        }
      }
    };
  }, []);

  // Auto-detect next thread when response count reaches threshold
  const responseCount = responses.length;
  useEffect(() => {
    if (responseCount < NEXT_THREAD_RESPONSE_THRESHOLD) return;
    void (async () => {
      try {
        const result = await window.electronApi.invoke('bbs:fetch-subject', boardUrl);
        const found = findNextThread(title, `${threadId}.dat`, result.threads);
        setNextThreadCandidate(found ?? null);
      } catch {
        setNextThreadCandidate(null);
      }
    })();
  }, [boardUrl, threadId, title, responseCount]);

  // Close context menu on click outside
  useEffect(() => {
    if (contextMenu === null) return;
    const handler = (): void => {
      setContextMenu(null);
      setOpenContextSubMenu(null);
    };
    document.addEventListener('click', handler);
    return () => {
      document.removeEventListener('click', handler);
    };
  }, [contextMenu]);

  // Build reply map for popup navigation
  const replyMap = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const res of responses) {
      const anchors = parseAnchors(res.body);
      for (const anchorRef of anchors) {
        for (const num of anchorRef.numbers) {
          const existing = map.get(num);
          if (existing !== undefined) {
            existing.push(res.number);
          } else {
            map.set(num, [res.number]);
          }
        }
      }
    }
    return map;
  }, [responses]);

  // Build ID count map
  const idCountMap = useMemo(() => buildIdCountMap(responses), [responses]);

  const idResMap = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const res of responses) {
      const id = extractId(res);
      if (id !== null) {
        const arr = map.get(id);
        if (arr !== undefined) arr.push(res.number);
        else map.set(id, [res.number]);
      }
    }
    return map;
  }, [responses]);

  const watchoiResMap = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const res of responses) {
      const w = extractWatchoi(res);
      if (w !== null) {
        const key = w.label;
        const arr = map.get(key);
        if (arr !== undefined) arr.push(res.number);
        else map.set(key, [res.number]);
      }
    }
    return map;
  }, [responses]);

  const kotehanResMap = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const res of responses) {
      const k = extractKotehan(res);
      if (k !== null) {
        const arr = map.get(k);
        if (arr !== undefined) arr.push(res.number);
        else map.set(k, [res.number]);
      }
    }
    return map;
  }, [responses]);

  const ipResMap = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const res of responses) {
      for (const ip of extractIps(res)) {
        const arr = map.get(ip);
        if (arr !== undefined) arr.push(res.number);
        else map.set(ip, [res.number]);
      }
    }
    return map;
  }, [responses]);

  const postedResNumbers = useMemo(() => {
    const matched = new Set<number>();
    if (!highlightSettings.highlightOwnPosts || postHistory.length === 0) return matched;
    const ownMessages = new Set<string>();
    for (const entry of postHistory) {
      if (entry.boardUrl === boardUrl && entry.threadId === threadId) {
        ownMessages.add(entry.message.trim());
      }
    }
    if (ownMessages.size === 0) return matched;
    for (const res of responses) {
      const bodyText = stripHtml(res.body).trim();
      if (ownMessages.has(bodyText)) {
        matched.add(res.number);
      }
    }
    return matched;
  }, [postHistory, boardUrl, threadId, highlightSettings.highlightOwnPosts, responses]);

  const ngFilterResults = useMemo((): ReadonlyMap<number, NgFilterResult> => {
    const results = new Map<number, NgFilterResult>();
    const resNgRules = ngRules.filter((r) => r.target === NgTarget.Response && r.enabled);
    if (resNgRules.length === 0) return results;

    const repliedCountMap = buildRepliedCountMap(responses);

    const firstRes = responses[0];
    const firstDate = firstRes !== undefined ? parseResDateTime(firstRes.dateTime) : null;
    const threadAgeMs = firstDate !== null ? Date.now() - firstDate.getTime() : 0;
    const threadAgeDays = Math.max(threadAgeMs / (1000 * 60 * 60 * 24), 1);
    const threadMomentum = responses.length / threadAgeDays;

    for (const res of responses) {
      const extractedFields = extractStringFields(res, title);
      const parsedDate = parseDateTimeField(res.dateTime);
      const numericValues = buildNumericValuesForRes(
        res,
        idCountMap,
        repliedCountMap,
        responses.length,
        threadMomentum,
      );
      const context: NgMatchContext = {
        extractedFields,
        numericValues,
        parsedDate,
      };

      for (const rule of resNgRules) {
        if (rule.boardId !== undefined) {
          try {
            const boardId =
              new URL(boardUrl).pathname
                .split('/')
                .filter((s) => s.length > 0)
                .pop() ?? '';
            if (rule.boardId !== boardId) continue;
          } catch {
            continue;
          }
        }
        if (rule.threadId !== undefined && rule.threadId !== threadId) continue;

        if (matchNgCondition(rule.condition, context)) {
          const current = results.get(res.number);
          if (
            current === undefined ||
            (rule.abonType === AbonType.Transparent &&
              current !== NgFilterResultEnum.TransparentAbon)
          ) {
            results.set(
              res.number,
              rule.abonType === AbonType.Transparent
                ? NgFilterResultEnum.TransparentAbon
                : NgFilterResultEnum.NormalAbon,
            );
          }
        }
      }
    }
    return results;
  }, [responses, ngRules, boardUrl, threadId, idCountMap, title]);

  const threadStats = useMemo(() => {
    const firstRes = responses[0];
    const lastRes = responses[responses.length - 1];
    const firstDate = firstRes !== undefined ? parseResDateTime(firstRes.dateTime) : null;
    const lastDate = lastRes !== undefined ? parseResDateTime(lastRes.dateTime) : null;
    const threadAgeMs = firstDate !== null ? Date.now() - firstDate.getTime() : 0;
    const threadAgeDays = Math.max(threadAgeMs / (1000 * 60 * 60 * 24), 1);
    const momentum = responses.length / threadAgeDays;
    return { firstDate, lastDate, momentum };
  }, [responses, headerRefreshTick]);

  // Periodic header refresh timer
  useEffect(() => {
    if (headerRefreshIntervalMin <= 0) return;
    const id = setInterval(
      () => {
        setHeaderRefreshTick((prev) => prev + 1);
      },
      headerRefreshIntervalMin * 60 * 1000,
    );
    return () => {
      clearInterval(id);
    };
  }, [headerRefreshIntervalMin]);

  // Fetch ikioi rank from board subject list
  useEffect(() => {
    if (boardUrl.length === 0 || threadId.length === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await window.electronApi.invoke('bbs:fetch-subject', boardUrl);
        if (cancelled) return;
        const datFileName = `${threadId}.dat`;
        const ranked = result.threads
          .map((s) => ({
            fileName: s.fileName,
            ikioi: computeIkioiFromFileName(s.fileName, s.count),
          }))
          .sort((a, b) => b.ikioi - a.ikioi);
        const idx = ranked.findIndex((s) => s.fileName === datFileName);
        if (idx >= 0) {
          setIkioiRank({ rank: idx + 1, total: ranked.length });
        } else {
          setIkioiRank(null);
        }
      } catch {
        if (!cancelled) setIkioiRank(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boardUrl, threadId, headerRefreshTick]);

  // Search filtering
  const searchFilteredResNumbers = useMemo(() => {
    if (deferredSearchQuery.trim().length === 0) return null;
    const lower = deferredSearchQuery.toLowerCase();
    const matched = new Set<number>();
    for (const res of responses) {
      const stripped = stripHtml(res.body).toLowerCase();
      const nameStripped = stripHtml(res.name).toLowerCase();
      let match = false;
      switch (searchField) {
        case 'all':
          match =
            stripped.includes(lower) ||
            nameStripped.includes(lower) ||
            res.dateTime.toLowerCase().includes(lower);
          break;
        case 'name':
          match = nameStripped.includes(lower);
          break;
        case 'id':
          match = res.dateTime.toLowerCase().includes(lower);
          break;
        case 'body':
          match = stripped.includes(lower);
          break;
        case 'watchoi':
          match = res.name.toLowerCase().includes(lower);
          break;
      }
      if (match) matched.add(res.number);
    }
    return matched;
  }, [deferredSearchQuery, responses, searchField]);

  // Display responses (apply NG filter + search filter + filterKey)
  const displayResponses = useMemo(() => {
    let result = [...responses];
    if (searchFilteredResNumbers !== null) {
      result = result.filter((r) => searchFilteredResNumbers.has(r.number));
    }
    if (filterKey !== null) {
      const filterNums = new Set(
        filterKey.type === 'id'
          ? (idResMap.get(filterKey.value) ?? [])
          : filterKey.type === 'watchoi'
            ? (watchoiResMap.get(filterKey.value) ?? [])
            : filterKey.type === 'ip'
              ? (ipResMap.get(filterKey.value) ?? [])
              : (kotehanResMap.get(filterKey.value) ?? []),
      );
      result = result.filter((r) => filterNums.has(r.number));
    }
    return result;
  }, [
    responses,
    searchFilteredResNumbers,
    filterKey,
    idResMap,
    watchoiResMap,
    kotehanResMap,
    ipResMap,
  ]);

  const allThreadImageUrls = useMemo(() => {
    const urls: string[] = [];
    for (const res of responses) {
      for (const img of detectImageUrls(res.body)) {
        urls.push(img.url);
      }
    }
    return urls;
  }, [responses]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshThread();
    } finally {
      setRefreshing(false);
    }
  }, [refreshThread]);

  const handleScroll = useCallback(() => {
    if (scrollReportTimerRef.current !== null) {
      clearTimeout(scrollReportTimerRef.current);
    }
    scrollReportTimerRef.current = setTimeout(() => {
      if (scrollRef.current !== null) {
        void window.electronApi.invoke('view:report-scroll-position', scrollRef.current.scrollTop);

        const container = scrollRef.current;
        const containerBottom = container.getBoundingClientRect().bottom;
        let lastVisible = -1;
        for (const child of container.children) {
          const rect = child.getBoundingClientRect();
          if (rect.top < containerBottom && child.id.startsWith('res-')) {
            const num = Number(child.id.slice(4));
            if (!Number.isNaN(num) && num > lastVisible) {
              lastVisible = num;
            }
          }
        }
        if (lastVisible >= 1) {
          lastVisibleResRef.current = lastVisible;
        }
      }
    }, 500);
  }, []);

  const handleThreadWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      const container = scrollRef.current;
      if (container === null) return;
      if (edgeRefreshLockedRef.current || loading) return;

      const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 5;
      const scrollingDown = e.deltaY > 0;

      if (atBottom && scrollingDown) {
        edgeRefreshLockedRef.current = true;
        void handleRefresh().finally(() => {
          if (edgeRefreshUnlockTimerRef.current !== null) {
            clearTimeout(edgeRefreshUnlockTimerRef.current);
          }
          edgeRefreshUnlockTimerRef.current = setTimeout(() => {
            edgeRefreshLockedRef.current = false;
          }, 1200);
        });
      }
    },
    [loading, handleRefresh],
  );

  // Anchor popup handling
  const handleAnchorClick = useCallback((e: React.MouseEvent, resNumbers: readonly number[]) => {
    e.preventDefault();
    e.stopPropagation();
    setPopup({ resNumbers, x: e.clientX, y: e.clientY, expandReplies: false });
  }, []);

  const handlePopupClose = useCallback(() => {
    setPopup(null);
    popupEnteredRef.current = false;
  }, []);

  const handlePopupMouseEnter = useCallback(() => {
    popupEnteredRef.current = true;
    if (popupCloseTimerRef.current !== null) {
      clearTimeout(popupCloseTimerRef.current);
      popupCloseTimerRef.current = null;
    }
  }, []);

  const handleScrollToRes = useCallback((resNumber: number) => {
    const el = document.getElementById(`res-${String(resNumber)}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  const handleToggleHighlight = useCallback(() => {
    const current = useThreadTabStore.getState().highlightSettings;
    setHighlightSettings({
      ...current,
      highlightOwnPosts: !current.highlightOwnPosts,
    });
  }, [setHighlightSettings]);

  const commitInlineVideoInitialVolumeInput = useCallback(() => {
    const n = Number(inlineVideoInitialVolumeInput);
    if (Number.isFinite(n) && n >= 0 && n <= 100) {
      setInlineVideoInitialVolumePercent(n);
      try {
        localStorage.setItem(INLINE_VIDEO_INITIAL_VOLUME_PERCENT_KEY, String(n));
      } catch {
        /* ignore */
      }
    } else {
      setInlineVideoInitialVolumeInput(String(inlineVideoInitialVolumePercent));
    }
  }, [inlineVideoInitialVolumeInput, inlineVideoInitialVolumePercent]);

  const handleBodyMouseOver = useCallback((e: React.MouseEvent) => {
    const target = e.target;
    if (!(target instanceof HTMLAnchorElement)) return;
    const numsAttr = target.dataset['anchorNums'];
    if (numsAttr === undefined) return;
    const nums = numsAttr
      .split(',')
      .map(Number)
      .filter((n) => !Number.isNaN(n));
    if (nums.length === 0) return;
    if (popupCloseTimerRef.current !== null) {
      clearTimeout(popupCloseTimerRef.current);
      popupCloseTimerRef.current = null;
    }
    popupEnteredRef.current = false;
    setPopup({ resNumbers: nums, x: e.clientX, y: e.clientY, expandReplies: false });
  }, []);

  const handleBodyMouseOut = useCallback(() => {
    if (popupEnteredRef.current) return;
    if (popupCloseTimerRef.current !== null) {
      clearTimeout(popupCloseTimerRef.current);
    }
    popupCloseTimerRef.current = setTimeout(() => {
      if (!popupEnteredRef.current) {
        setPopup(null);
      }
      popupCloseTimerRef.current = null;
    }, 300);
  }, []);

  const handleAnchorHover = useCallback((nums: readonly number[], x: number, y: number) => {
    if (popupCloseTimerRef.current !== null) {
      clearTimeout(popupCloseTimerRef.current);
      popupCloseTimerRef.current = null;
    }
    popupEnteredRef.current = false;
    setPopup({ resNumbers: nums, x, y, expandReplies: false });
  }, []);

  const handleContextMenuAction = useCallback((resNumber: number, x: number, y: number) => {
    const selection = window.getSelection();
    setContextSelectedText(selection !== null ? selection.toString().trim() : '');
    setOpenContextSubMenu(null);
    setContextMenu({ resNumber, x, y });
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
    setOpenContextSubMenu(null);
  }, []);

  const handleAddNgFromRes = useCallback(
    (field: NgStringField, token: string) => {
      const normalizedToken = token.trim();
      if (normalizedToken.length === 0) return;
      let boardId = '';
      try {
        boardId =
          new URL(boardUrl).pathname
            .split('/')
            .filter((s) => s.length > 0)
            .pop() ?? '';
      } catch {
        /* ignore */
      }
      const rule: NgRule = {
        id: crypto.randomUUID(),
        condition: {
          type: 'string',
          matchMode: NgStringMatchMode.Plain,
          fields: [field],
          tokens: [normalizedToken],
          negate: false,
        },
        target: NgTarget.Response,
        abonType: AbonType.Normal,
        boardId: boardId.length > 0 ? boardId : undefined,
        threadId,
        enabled: true,
      };
      void window.electronApi.invoke('ng:add-rule', rule);
      setContextMenu(null);
      setOpenContextSubMenu(null);
    },
    [boardUrl, threadId],
  );

  const getFirstVisibleResNumber = useCallback((): number | null => {
    const container = scrollRef.current;
    if (container === null) return null;
    const containerTop = container.getBoundingClientRect().top;
    for (const child of container.children) {
      const rect = child.getBoundingClientRect();
      if (rect.bottom > containerTop) {
        const id = child.id;
        if (id.startsWith('res-')) {
          return Number(id.slice(4));
        }
      }
    }
    return null;
  }, []);

  const clearFilterWithScrollRestore = useCallback(() => {
    const targetResNumber = getFirstVisibleResNumber();
    setFilterKey(null);
    if (targetResNumber !== null) {
      requestAnimationFrame(() => {
        const el = document.getElementById(`res-${String(targetResNumber)}`);
        el?.scrollIntoView({ block: 'start' });
      });
    }
  }, [getFirstVisibleResNumber]);

  const clearSearchWithScrollRestore = useCallback(() => {
    const targetResNumber = getFirstVisibleResNumber();
    setSearchQuery('');
    searchInputRef.current?.focus();
    if (targetResNumber !== null) {
      requestAnimationFrame(() => {
        const el = document.getElementById(`res-${String(targetResNumber)}`);
        el?.scrollIntoView({ block: 'start' });
      });
    }
  }, [getFirstVisibleResNumber]);

  const handleSearchNextThread = useCallback(() => {
    void (async () => {
      try {
        const result = await window.electronApi.invoke('bbs:fetch-subject', boardUrl);
        const found = findNextThread(title, `${threadId}.dat`, result.threads);
        setNextThreadCandidate(found ?? null);
      } catch {
        setNextThreadCandidate(null);
      }
    })();
  }, [boardUrl, threadId, title]);

  const handleOpenNextThread = useCallback(() => {
    if (nextThreadCandidate === undefined || nextThreadCandidate === null) return;
    const nextId = nextThreadCandidate.fileName.replace('.dat', '');
    void window.electronApi.invoke(
      'view:open-thread-request',
      boardUrl,
      nextId,
      nextThreadCandidate.title,
    );
  }, [nextThreadCandidate, boardUrl]);

  const handleCreateNextThread = useCallback(() => {
    const firstPost = responses[0];
    if (firstPost === undefined) return;
    const template = generateNextThreadTemplate({
      firstPostBody: firstPost.body,
      currentTitle: title,
      boardUrl,
      threadId,
    });
    void window.electronApi.invoke(
      'view:open-board-new-thread-editor',
      boardUrl,
      template.subject,
      template.message,
    );
  }, [responses, title, boardUrl, threadId]);

  const handleToggleAaFont = useCallback((resNumber: number, forceAa: boolean) => {
    setAaOverrides((prev) => {
      const next = new Map(prev);
      next.set(resNumber, forceAa);
      return next;
    });
  }, []);

  // Render a single response
  const renderResponse = useCallback(
    (res: Res) => {
      const ngResult = ngFilterResults.get(res.number);
      if (ngResult === NgFilterResultEnum.TransparentAbon && !revealAbon) return null;

      const isNormalAbon = ngResult === NgFilterResultEnum.NormalAbon && !revealAbon;
      const isOwnPost = postedResNumbers.has(res.number);
      const replies = replyMap.get(res.number);
      const replyCount = replies?.length ?? 0;

      const sanitized = sanitizeHtml(res.body);
      const withAnchors = convertAnchorsToLinks(sanitized);
      const withUrls = linkifyUrls(withAnchors);
      const isAutoAa = isAsciiArt(res.body);
      const isAA = aaOverrides.get(res.number) ?? isAutoAa;

      const imageUrls = inlineMediaEnabled ? detectImageUrls(res.body) : [];
      const videoUrls = inlineMediaEnabled ? detectVideoUrls(res.body) : [];
      const audioUrls = inlineMediaEnabled ? detectAudioUrls(res.body) : [];

      const resId = extractId(res);
      const resWatchoi = extractWatchoi(res);
      const resKotehan = extractKotehan(res);
      const resIps = extractIps(res);
      const idNums = resId !== null ? (idResMap.get(resId) ?? []) : [];
      const watchoiNums = resWatchoi !== null ? (watchoiResMap.get(resWatchoi.label) ?? []) : [];
      const kotehanNums = resKotehan !== null ? (kotehanResMap.get(resKotehan) ?? []) : [];
      const ipNumsMap = new Map(resIps.map((ip) => [ip, ipResMap.get(ip) ?? []] as const));

      if (isNormalAbon) {
        return (
          <div
            key={res.number}
            className="border-b border-[var(--color-border-secondary)] px-4 py-2 text-xs opacity-40"
          >
            <span className="text-[var(--color-text-muted)]">{res.number}: あぼーん</span>
          </div>
        );
      }

      return (
        <div
          key={res.number}
          id={`res-${String(res.number)}`}
          className={`border-b border-[var(--color-border-secondary)] px-4 py-2 ${
            isOwnPost ? 'bg-[var(--color-own-post-bg)]' : ''
          } ${ngResult !== undefined && revealAbon ? 'opacity-50' : ''}`}
          onContextMenu={(e) => {
            e.preventDefault();
            handleContextMenuAction(res.number, e.clientX, e.clientY);
          }}
        >
          {/* Response header */}
          <div className="mb-1 flex flex-wrap items-baseline gap-2 text-xs">
            {replyCount > 0 && (
              <button
                type="button"
                className="cursor-pointer rounded border-none bg-transparent p-0 text-[10px] font-semibold text-[var(--color-link)] hover:underline"
                onMouseEnter={(e) => {
                  if (replies !== undefined) {
                    if (popupCloseTimerRef.current !== null) {
                      clearTimeout(popupCloseTimerRef.current);
                      popupCloseTimerRef.current = null;
                    }
                    popupEnteredRef.current = false;
                    setPopup({
                      resNumbers: replies,
                      x: e.clientX,
                      y: e.clientY,
                      expandReplies: true,
                    });
                  }
                }}
                onMouseLeave={handleBodyMouseOut}
                onClick={(e) => {
                  e.stopPropagation();
                  if (replies !== undefined) {
                    handleAnchorClick(e, replies);
                  }
                }}
                title={`${String(replyCount)}件の返信`}
              >
                +{replyCount}
              </button>
            )}
            <button
              type="button"
              className="cursor-pointer border-none bg-transparent p-0 font-bold text-[var(--color-res-number)] hover:underline"
              onClick={() => {
                void window.electronApi.invoke(
                  'panel:open',
                  'post-editor',
                  boardUrl,
                  threadId,
                  title,
                  `>>${String(res.number)}\n`,
                );
              }}
              title={`>>${String(res.number)} を引用`}
            >
              {res.number}
            </button>
            {renderNameField(
              res,
              resKotehan,
              kotehanNums,
              resWatchoi,
              watchoiNums,
              resIps,
              ipNumsMap,
              setFilterKey,
              handleAnchorHover,
              handleBodyMouseOut,
              handleIpLookup,
            )}
            <span className="inline-flex items-baseline gap-0.5 text-[var(--color-text-muted)]">
              {renderDateTimeWithBe(res.dateTime, showRelativeTime)}
              {resId !== null && (
                <FilterLink
                  count={idNums.length}
                  resNumbers={idNums}
                  onFilter={() => {
                    setFilterKey({ type: 'id', value: resId });
                  }}
                  onHover={handleAnchorHover}
                  onLeave={handleBodyMouseOut}
                  className="ml-0.5 text-[var(--color-text-muted)]"
                >
                  ID:{resId}
                </FilterLink>
              )}
            </span>
          </div>

          {/* Response body */}
          <div
            className={`text-sm leading-relaxed text-[var(--color-text-primary)] ${isAA ? 'aa-font' : ''}`}
            dangerouslySetInnerHTML={{ __html: withUrls }}
            onMouseOver={handleBodyMouseOver}
            onMouseOut={handleBodyMouseOut}
            onClick={(e) => {
              const target = e.target;
              if (target instanceof HTMLAnchorElement) {
                const externalUrl = target.dataset['url'];
                if (externalUrl !== undefined && externalUrl.length > 0) {
                  e.preventDefault();
                  void window.electronApi.invoke('shell:open-external', externalUrl);
                  return;
                }
                if (target.dataset['anchorNums'] !== undefined) {
                  e.preventDefault();
                  const nums = target.dataset['anchorNums']
                    .split(',')
                    .map(Number)
                    .filter((n) => !Number.isNaN(n));
                  if (nums.length > 0) {
                    handleAnchorClick(e, nums);
                  }
                }
              }
            }}
          />

          {/* Inline media */}
          {imageUrls.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {imageUrls.map((img) => (
                <ImageThumbnail
                  key={img.url}
                  url={img.url}
                  displayUrl={img.displayUrl}
                  allImageUrls={allThreadImageUrls}
                />
              ))}
            </div>
          )}
          {videoUrls.length > 0 && (
            <div className="mt-2 flex flex-col gap-2">
              {videoUrls.map((vid) => (
                <InlineVideo
                  key={vid.url}
                  url={vid.url}
                  originalUrl={vid.originalUrl}
                  initialVolume={inlineVideoInitialVolumePercent / 100}
                />
              ))}
            </div>
          )}
          {audioUrls.length > 0 && (
            <div className="mt-2 flex flex-col gap-1">
              {audioUrls.map((aud) => (
                <InlineAudio
                  key={aud.url}
                  url={aud.url}
                  originalUrl={aud.originalUrl}
                  initialVolume={inlineVideoInitialVolumePercent / 100}
                />
              ))}
            </div>
          )}
        </div>
      );
    },
    [
      ngFilterResults,
      revealAbon,
      postedResNumbers,
      replyMap,
      showRelativeTime,
      inlineMediaEnabled,
      inlineVideoInitialVolumePercent,
      allThreadImageUrls,
      handleAnchorClick,
      handleAnchorHover,
      handleBodyMouseOver,
      handleBodyMouseOut,
      handleContextMenuAction,
      handleIpLookup,
      idResMap,
      watchoiResMap,
      kotehanResMap,
      ipResMap,
      boardUrl,
      threadId,
      title,
      aaOverrides,
    ],
  );

  return (
    <section className="flex h-full flex-col" onKeyDown={handleScrollKeyboard}>
      {/* Action bar */}
      <div className="flex h-8 items-center gap-0.5 border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-2">
        <button
          type="button"
          onClick={() => {
            void handleRefresh();
          }}
          className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          title="スレッドを更新"
        >
          <MdiIcon
            path={loading ? mdiLoading : mdiRefresh}
            size={14}
            className={loading ? 'animate-spin' : ''}
          />
        </button>
        <button
          type="button"
          onClick={() => {
            setInlineMediaEnabled((prev) => !prev);
          }}
          className={`rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] ${
            inlineMediaEnabled ? 'bg-[var(--color-bg-active)] text-[var(--color-accent)]' : ''
          }`}
          title={inlineMediaEnabled ? 'インライン画像/動画: ON' : 'インライン画像/動画: OFF'}
        >
          <MdiIcon path={mdiImage} size={14} />
        </button>
        <label
          className="ml-0.5 flex items-center gap-1 rounded px-1 py-0.5 text-[10px] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]"
          title="インライン動画の初期音量"
        >
          <MdiIcon path={mdiVolumeHigh} size={13} />
          <input
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={inlineVideoInitialVolumeInput}
            onChange={(e) => {
              setInlineVideoInitialVolumeInput(e.target.value);
            }}
            onBlur={commitInlineVideoInitialVolumeInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitInlineVideoInitialVolumeInput();
                e.currentTarget.blur();
              }
              if (e.key === 'Escape') {
                setInlineVideoInitialVolumeInput(String(inlineVideoInitialVolumePercent));
                e.currentTarget.blur();
              }
            }}
            className="w-11 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-1 py-0 text-right text-[10px] text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
          />
          <span>%</span>
        </label>
        <button
          type="button"
          onClick={() => {
            setShowRelativeTime((prev) => !prev);
          }}
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
          className={`rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] ${highlightSettings.highlightOwnPosts ? 'bg-[var(--color-bg-active)] text-[var(--color-warning)]' : ''}`}
          title={highlightSettings.highlightOwnPosts ? 'ハイライト: ON' : 'ハイライト: OFF'}
        >
          <MdiIcon path={mdiFormatColorHighlight} size={14} />
        </button>
        <button
          type="button"
          onClick={toggleAnalysis}
          className={`rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] ${analysisOpen ? 'bg-[var(--color-bg-active)] text-[var(--color-accent)]' : ''}`}
          title="スレッド分析"
        >
          <MdiIcon path={mdiChartBar} size={14} />
        </button>
        <button
          type="button"
          onClick={() => {
            void window.electronApi.invoke('panel:open', 'ng-editor', boardUrl, threadId, title);
          }}
          className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          title="NG管理"
        >
          <MdiIcon path={mdiShieldOff} size={14} />
        </button>
        <button
          type="button"
          onClick={() => {
            setRevealAbon((prev) => !prev);
          }}
          className={`rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] ${revealAbon ? 'bg-[var(--color-bg-active)] text-[var(--color-error)]' : ''}`}
          title={revealAbon ? 'あぼーんリヴィール: ON' : 'あぼーんリヴィール: OFF'}
        >
          <MdiIcon path={mdiEye} size={14} />
        </button>
        <button
          type="button"
          onClick={() => {
            void window.electronApi.invoke(
              'panel:open',
              'post-editor',
              boardUrl,
              threadId,
              title,
              postEditorInitialMessage,
            );
          }}
          className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          title="書き込み"
        >
          <MdiIcon path={mdiPencil} size={14} />
        </button>
        <button
          type="button"
          onClick={() => {
            void window.electronApi.invoke(
              'panel:open',
              'programmatic-post',
              boardUrl,
              threadId,
              title,
            );
          }}
          className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          title="プログラマティック書き込み"
        >
          <MdiIcon path={mdiRobot} size={14} />
        </button>
        <div className="mx-0.5 h-4 w-px bg-[var(--color-border-primary)]" />
        <button
          type="button"
          onClick={handleSearchNextThread}
          className={`flex items-center gap-0.5 rounded px-1.5 py-1 text-xs font-medium hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] ${
            nextThreadCandidate !== undefined && nextThreadCandidate !== null
              ? 'bg-[var(--color-success)]/20 text-[var(--color-success)]'
              : nextThreadCandidate === null
                ? 'text-[var(--color-text-muted)]'
                : 'text-[var(--color-warning)]'
          }`}
          title="次スレを検索"
        >
          <MdiIcon path={mdiArrowRightBold} size={12} />
          次スレ
        </button>
        <button
          type="button"
          onClick={handleCreateNextThread}
          className="flex items-center gap-0.5 rounded px-1.5 py-1 text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-bg-hover)]"
          title="現スレの>>1をベースに次スレを立てる"
        >
          <MdiIcon path={mdiPencil} size={12} />
          次スレを立てる
        </button>
      </div>

      {/* Thread title */}
      <div className="border-b border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)]/30 px-4 py-1.5">
        <h2 className="text-sm font-medium text-[var(--color-text-primary)]">
          {isDatFallen && (
            <span className="mr-1 font-bold text-[var(--color-error)]">【DAT落ち】</span>
          )}
          {title}
        </h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--color-text-muted)]">
          <span>
            {responses.length - ngFilterResults.size}/{ngFilterResults.size}/{responses.length} レス
          </span>
          <span>勢い: {threadStats.momentum.toFixed(1)}</span>
          {ikioiRank !== null && (
            <span>
              ランク: {ikioiRank.rank}/{ikioiRank.total}
            </span>
          )}
          {threadStats.firstDate !== null && (
            <span>
              {'>>'}1: {formatDateCompact(threadStats.firstDate)} (
              {formatRelativeDay(threadStats.firstDate)})
            </span>
          )}
          {threadStats.lastDate !== null && (
            <span>
              最新: {formatDateCompact(threadStats.lastDate)} (
              {formatRelativeDay(threadStats.lastDate)})
            </span>
          )}
          <select
            className="ml-auto cursor-pointer bg-transparent text-[10px] text-[var(--color-text-muted)] outline-none"
            value={headerRefreshIntervalMin}
            onChange={(e) => {
              const val = Number(e.target.value);
              setHeaderRefreshIntervalMin(val);
              try {
                localStorage.setItem(HEADER_REFRESH_INTERVAL_KEY, String(val));
              } catch {
                /* ignore */
              }
            }}
            title="ヘッダー自動更新間隔"
          >
            <option value={5}>5分</option>
            <option value={15}>15分</option>
            <option value={30}>30分</option>
            <option value={60}>60分</option>
          </select>
        </div>
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-1.5 border-b border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)]/20 px-3 py-1">
        <MdiIcon path={mdiMagnify} size={13} className="shrink-0 text-[var(--color-text-muted)]" />
        <div className="relative flex-1">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
            }}
            placeholder="スレッド内検索…"
            className="w-full rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-2 py-0.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
          />
          {searchQuery !== '' && (
            <button
              type="button"
              onClick={clearSearchWithScrollRestore}
              className="absolute top-1/2 right-1 -translate-y-1/2 rounded p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            >
              <MdiIcon path={mdiClose} size={10} />
            </button>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {(
            [
              ['all', '全て'],
              ['name', '名前'],
              ['id', 'ID'],
              ['body', '本文'],
              ['watchoi', 'ﾜｯﾁｮｲ'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setSearchField(value);
                searchInputRef.current?.focus();
              }}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                searchField === value
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {searchQuery.trim() !== '' && searchFilteredResNumbers !== null && (
          <span className="shrink-0 text-[10px] text-[var(--color-text-muted)]">
            {searchFilteredResNumbers.size}件
          </span>
        )}
      </div>

      {/* Filter banner */}
      {filterKey !== null && (
        <div className="flex items-center gap-2 border-b border-[var(--color-border-secondary)] bg-[var(--color-bg-tertiary)] px-3 py-1 text-xs">
          <span className="text-[var(--color-text-muted)]">
            フィルタ:{' '}
            {filterKey.type === 'id'
              ? 'ID'
              : filterKey.type === 'watchoi'
                ? 'ワッチョイ'
                : filterKey.type === 'ip'
                  ? 'IP'
                  : 'コテハン'}{' '}
            = {filterKey.value}
          </span>
          <button
            type="button"
            onClick={clearFilterWithScrollRestore}
            className="rounded px-1.5 py-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          >
            <MdiIcon path={mdiClose} size={12} />
          </button>
        </div>
      )}

      {/* DAT fallen banner */}
      {isDatFallen && responseCount < NEXT_THREAD_RESPONSE_THRESHOLD && (
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-error)]/30 bg-[var(--color-error)]/10 px-3 py-1.5 text-xs">
          <span className="flex-1 font-semibold text-[var(--color-text-muted)]">
            このスレッドはDAT落ちしています
          </span>
          <button
            type="button"
            onClick={handleCreateNextThread}
            className="shrink-0 rounded bg-[var(--color-accent)] px-2 py-0.5 text-white hover:opacity-90"
          >
            次スレを立てる
          </button>
        </div>
      )}

      {/* Next thread banner */}
      {responseCount >= NEXT_THREAD_RESPONSE_THRESHOLD && nextThreadCandidate !== undefined && (
        <div
          className={`flex shrink-0 items-center gap-2 border-b px-3 py-1.5 text-xs ${
            nextThreadCandidate !== null
              ? 'border-[var(--color-success)]/30 bg-[var(--color-success)]/10'
              : 'border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)]/60'
          }`}
        >
          <span className="shrink-0 font-semibold text-[var(--color-text-muted)]">
            このスレッドは1000を超えました
          </span>
          {nextThreadCandidate !== null ? (
            <>
              <span
                className="min-w-0 flex-1 truncate text-[var(--color-success)]"
                title={nextThreadCandidate.title}
              >
                次スレ: {nextThreadCandidate.title}
              </span>
              <button
                type="button"
                onClick={handleOpenNextThread}
                className="shrink-0 rounded bg-[var(--color-success)] px-2 py-0.5 text-white hover:opacity-90"
              >
                開く
              </button>
            </>
          ) : (
            <>
              <span className="flex-1 text-[var(--color-text-muted)]">
                次スレは見つかりませんでした
              </span>
              <button
                type="button"
                onClick={handleSearchNextThread}
                className="shrink-0 rounded border border-[var(--color-border-primary)] px-2 py-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
              >
                再検索
              </button>
              <button
                type="button"
                onClick={handleCreateNextThread}
                className="shrink-0 rounded bg-[var(--color-accent)] px-2 py-0.5 text-white hover:opacity-90"
              >
                次スレを立てる
              </button>
            </>
          )}
        </div>
      )}

      {/* Responses — no virtual scrolling */}
      <div
        ref={scrollRef}
        className="relative flex-1 overflow-y-auto"
        onWheel={handleThreadWheel}
        onScroll={handleScroll}
      >
        {displayResponses.map((res) => (
          <Fragment key={res.number}>
            {kokomade >= 0 && res.number === kokomade + 1 && (
              <div className="mx-4 my-1 flex items-center gap-2 border-t-2 border-[var(--color-warning)] py-1">
                <span className="text-xs font-semibold text-[var(--color-warning)]">
                  --- ここまで読んだ ---
                </span>
              </div>
            )}
            {renderResponse(res)}
          </Fragment>
        ))}
      </div>

      {/* Edge refresh overlay */}
      {refreshing && <RefreshOverlay />}

      {/* Thread analysis (still inline — read-only viewer) */}
      {analysisOpen && (
        <div className="border-t border-[var(--color-border-primary)]">
          <Suspense fallback={null}>
            <ThreadAnalysis
              responses={responses}
              onClose={toggleAnalysis}
              onScrollToRes={handleScrollToRes}
            />
          </Suspense>
        </div>
      )}

      {/* Anchor popup */}
      {popup !== null && (
        <ResPopup
          resNumbers={popup.resNumbers}
          responses={responses}
          replyMap={replyMap}
          position={{ x: popup.x, y: popup.y }}
          expandReplies={popup.expandReplies}
          onClose={handlePopupClose}
          onMouseEnter={handlePopupMouseEnter}
          inlineMediaEnabled={inlineMediaEnabled}
          allThreadImageUrls={allThreadImageUrls}
        />
      )}

      {/* Context menu */}
      {contextMenu !== null &&
        (() => {
          const ctxRes = responses.find((r) => r.number === contextMenu.resNumber);
          if (ctxRes === undefined) return null;
          const ctxId = extractId(ctxRes);
          const ctxWatchoi = extractWatchoi(ctxRes);
          const ctxPlainName = stripHtml(ctxRes.name);
          const ctxPlainBody = stripHtml(ctxRes.body.replace(/<br\s*\/?>/gi, '\n'));
          const ctxPermalink = buildResPermalink(boardUrl, threadId, ctxRes.number);
          const ctxHeader = `${String(ctxRes.number)} ${ctxPlainName}${ctxRes.mail.length > 0 ? ` [${ctxRes.mail}]` : ''} ${ctxRes.dateTime}`;
          const ctxIsAaFinal = aaOverrides.get(ctxRes.number) ?? isAsciiArt(ctxRes.body);

          const fields = extractStringFields(ctxRes, '');
          const ctxIps = extractIps(ctxRes);

          const copyOptions = [
            { label: '名前をコピー', value: ctxHeader },
            { label: '本文をコピー', value: ctxPlainBody },
            { label: 'URLをコピー', value: ctxPermalink },
            { label: '名前+本文+URL', value: `${ctxHeader}\n${ctxPlainBody}\n${ctxPermalink}` },
            { label: '本文+URL', value: `${ctxPlainBody}\n${ctxPermalink}` },
          ] as const;

          const ngOptions: Array<{
            key: string;
            label: string;
            field: NgStringField;
            token: string;
          }> = [];
          const pushNg = (
            key: string,
            label: string,
            field: NgStringField,
            token: string,
          ): void => {
            const normalized = token.trim();
            if (normalized.length === 0) return;
            ngOptions.push({ key, label, field, token: normalized });
          };
          pushNg('name', `名前: ${ctxPlainName}`, NgStringFieldEnum.Name, ctxPlainName);
          pushNg(
            'body',
            `本文: ${ctxPlainBody.length > 40 ? `${ctxPlainBody.slice(0, 40)}…` : ctxPlainBody}`,
            NgStringFieldEnum.Body,
            ctxPlainBody,
          );
          pushNg('mail', `メール: ${ctxRes.mail}`, NgStringFieldEnum.Mail, ctxRes.mail);
          if (ctxId !== null) {
            pushNg('id', `ID: ${ctxId}`, NgStringFieldEnum.Id, ctxId);
          }
          pushNg(
            'trip',
            `トリップ: ${fields[NgStringFieldEnum.Trip]}`,
            NgStringFieldEnum.Trip,
            fields[NgStringFieldEnum.Trip],
          );
          if (ctxWatchoi !== null) {
            pushNg(
              'watchoi',
              `ワッチョイ: ${ctxWatchoi.label}`,
              NgStringFieldEnum.Watchoi,
              ctxWatchoi.label,
            );
          }
          for (const [index, ip] of ctxIps.entries()) {
            pushNg(`ip-${String(index)}`, `IP: ${ip}`, NgStringFieldEnum.Ip, ip);
          }
          pushNg(
            'be',
            `BE: ${fields[NgStringFieldEnum.Be]}`,
            NgStringFieldEnum.Be,
            fields[NgStringFieldEnum.Be],
          );
          const urls = fields[NgStringFieldEnum.Url].split('\n').filter((u) => u.length > 0);
          for (const [index, url] of urls.entries()) {
            pushNg(`url-${String(index)}`, `URL: ${url}`, NgStringFieldEnum.Url, url);
          }
          if (contextSelectedText.length > 0) {
            pushNg(
              'selected-body',
              `選択テキスト（本文）: ${contextSelectedText}`,
              NgStringFieldEnum.Body,
              contextSelectedText,
            );
            pushNg(
              'selected-all',
              `選択テキスト（全項目）: ${contextSelectedText}`,
              NgStringFieldEnum.All,
              contextSelectedText,
            );
          }

          return createPortal(
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
                onClick={() => {
                  updateKokomade(ctxRes.number);
                  setContextMenu(null);
                }}
                role="menuitem"
              >
                ここまで読んだ
              </button>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
                onClick={() => {
                  void window.electronApi.invoke(
                    'panel:open',
                    'post-editor',
                    boardUrl,
                    threadId,
                    title,
                    `>>${String(ctxRes.number)}\n`,
                  );
                  setContextMenu(null);
                }}
                role="menuitem"
              >
                レスを引用 (&gt;&gt;{ctxRes.number})
              </button>
              <div className="mx-2 my-0.5 border-t border-[var(--color-border-secondary)]" />
              {/* Copy submenu */}
              <div
                className="relative"
                onMouseEnter={() => {
                  setOpenContextSubMenu('copy');
                }}
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
                  role="menuitem"
                >
                  コピー
                  <MdiIcon path={mdiChevronRight} size={12} />
                </button>
                {openContextSubMenu === 'copy' && (
                  <div
                    className="absolute top-0 left-full z-10 min-w-48 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] py-1 shadow-lg"
                    onMouseEnter={() => {
                      setOpenContextSubMenu('copy');
                    }}
                  >
                    {copyOptions.map((opt) => (
                      <button
                        key={opt.label}
                        type="button"
                        className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
                        onClick={(e) => {
                          e.stopPropagation();
                          void navigator.clipboard.writeText(opt.value.trim());
                          setContextMenu(null);
                          setOpenContextSubMenu(null);
                        }}
                        role="menuitem"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* NG submenu */}
              <div
                className="relative"
                onMouseEnter={() => {
                  setOpenContextSubMenu('ng');
                }}
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
                  role="menuitem"
                >
                  NG追加
                  <MdiIcon path={mdiChevronRight} size={12} />
                </button>
                {openContextSubMenu === 'ng' && (
                  <div
                    className="absolute top-0 left-full z-10 min-w-56 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] py-1 shadow-lg"
                    onMouseEnter={() => {
                      setOpenContextSubMenu('ng');
                    }}
                  >
                    {ngOptions.length > 0 ? (
                      ngOptions.map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          className="w-full truncate px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
                          title={opt.label}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddNgFromRes(opt.field, opt.token);
                          }}
                          role="menuitem"
                        >
                          {opt.label}
                        </button>
                      ))
                    ) : (
                      <span className="block px-3 py-1.5 text-xs text-[var(--color-text-muted)]">
                        追加可能なNG項目がありません
                      </span>
                    )}
                  </div>
                )}
              </div>
              {/* External search submenu (only shown when text is selected) */}
              {contextSelectedText.length > 0 && (
                <div
                  className="relative"
                  onMouseEnter={() => {
                    setOpenContextSubMenu('search');
                  }}
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
                    role="menuitem"
                  >
                    外部ブラウザで検索
                    <MdiIcon path={mdiChevronRight} size={12} />
                  </button>
                  {openContextSubMenu === 'search' && (
                    <div
                      className="absolute top-0 left-full z-10 min-w-48 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] py-1 shadow-lg"
                      onMouseEnter={() => {
                        setOpenContextSubMenu('search');
                      }}
                    >
                      {(
                        [
                          {
                            label: 'Google で検索',
                            url: `https://www.google.com/search?q=${encodeURIComponent(contextSelectedText)}`,
                          },
                          {
                            label: 'DuckDuckGo で検索',
                            url: `https://duckduckgo.com/?q=${encodeURIComponent(contextSelectedText)}`,
                          },
                          {
                            label: 'Yandex で検索',
                            url: `https://yandex.com/search/?text=${encodeURIComponent(contextSelectedText)}`,
                          },
                        ] as const
                      ).map((engine) => (
                        <button
                          key={engine.label}
                          type="button"
                          className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
                          onClick={(e) => {
                            e.stopPropagation();
                            void window.electronApi.invoke('shell:open-external', engine.url);
                            setContextMenu(null);
                            setOpenContextSubMenu(null);
                          }}
                          role="menuitem"
                        >
                          {engine.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="mx-2 my-0.5 border-t border-[var(--color-border-secondary)]" />
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
                onClick={() => {
                  handleToggleAaFont(ctxRes.number, !ctxIsAaFinal);
                  setContextMenu(null);
                  setOpenContextSubMenu(null);
                }}
                role="menuitem"
              >
                {ctxIsAaFinal ? '通常フォントに戻す' : 'AAフォントで表示'}
              </button>
            </ContextMenuContainer>,
            document.body,
          );
        })()}

      {/* IP lookup popup */}
      {ipLookupPopup !== null &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
            onClick={() => {
              setIpLookupPopup(null);
            }}
            role="presentation"
          >
            <div
              className="min-w-64 max-w-sm rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4 shadow-lg"
              onClick={(e) => {
                e.stopPropagation();
              }}
              role="dialog"
            >
              <h3 className="mb-2 text-sm font-semibold text-[var(--color-text-primary)]">
                IP逆引き: {ipLookupPopup.ip}
              </h3>
              {ipLookupPopup.loading ? (
                <p className="text-xs text-[var(--color-text-muted)]">読み込み中…</p>
              ) : ipLookupPopup.result !== null ? (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="font-medium text-[var(--color-text-muted)]">IP</dt>
                  <dd className="text-[var(--color-text-primary)]">{ipLookupPopup.result.ip}</dd>
                  <dt className="font-medium text-[var(--color-text-muted)]">国</dt>
                  <dd className="text-[var(--color-text-primary)]">
                    {ipLookupPopup.result.country}
                  </dd>
                  <dt className="font-medium text-[var(--color-text-muted)]">地域</dt>
                  <dd className="text-[var(--color-text-primary)]">
                    {ipLookupPopup.result.region}
                  </dd>
                  <dt className="font-medium text-[var(--color-text-muted)]">都市</dt>
                  <dd className="text-[var(--color-text-primary)]">{ipLookupPopup.result.city}</dd>
                  <dt className="font-medium text-[var(--color-text-muted)]">ISP</dt>
                  <dd className="text-[var(--color-text-primary)]">{ipLookupPopup.result.isp}</dd>
                  <dt className="font-medium text-[var(--color-text-muted)]">組織</dt>
                  <dd className="text-[var(--color-text-primary)]">{ipLookupPopup.result.org}</dd>
                  <dt className="font-medium text-[var(--color-text-muted)]">AS</dt>
                  <dd className="text-[var(--color-text-primary)]">{ipLookupPopup.result.as}</dd>
                </dl>
              ) : (
                <p className="text-xs text-[var(--color-text-muted)]">逆引きに失敗しました</p>
              )}
              <button
                type="button"
                className="mt-3 w-full rounded bg-[var(--color-bg-tertiary)] px-3 py-1.5 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
                onClick={() => {
                  setIpLookupPopup(null);
                }}
              >
                閉じる
              </button>
            </div>
          </div>,
          document.body,
        )}
    </section>
  );
}
