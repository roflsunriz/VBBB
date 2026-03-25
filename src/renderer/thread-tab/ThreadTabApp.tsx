/**
 * Thread Tab application — thread response viewer for one thread.
 * Runs in its own WebContentsView / renderer process.
 * No virtual scrolling — renders all responses directly.
 */
import {
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
} from '@mdi/js';
import type { Res } from '@shared/domain';
import {
  type NgRule,
  type NgFilterResult,
  type NgMatchContext,
  AbonType,
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
import { useScrollKeyboard } from '../hooks/use-scroll-keyboard';
import type { ThreadTabInitData } from '@shared/view-ipc';

const PostEditor = lazy(() =>
  import('../components/post-editor/PostEditor').then((m) => ({ default: m.PostEditor })),
);
const ProgrammaticPost = lazy(() =>
  import('../components/post-editor/ProgrammaticPost').then((m) => ({
    default: m.ProgrammaticPost,
  })),
);
const ThreadAnalysis = lazy(() =>
  import('../components/thread-view/ThreadAnalysis').then((m) => ({
    default: m.ThreadAnalysis,
  })),
);
const NgEditor = lazy(() =>
  import('../components/ng-editor/NgEditor').then((m) => ({ default: m.NgEditor })),
);

type SearchField = 'all' | 'name' | 'id' | 'body' | 'watchoi';

const DATE_PATTERN = /(\d{4})\/(\d{1,2})\/(\d{1,2})\([^)]*\)\s*(\d{1,2}):(\d{2}):(\d{2})/;
const BE_PATTERN = /BE:(\d+)-(\d+)/;
const INLINE_VIDEO_INITIAL_VOLUME_PERCENT_KEY = 'vbbb-inline-video-initial-volume-percent';
const DEFAULT_INLINE_VIDEO_INITIAL_VOLUME_PERCENT = 10;

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

export function ThreadTabApp(): React.JSX.Element {
  const boardUrl = useThreadTabStore((s) => s.boardUrl);
  const threadId = useThreadTabStore((s) => s.threadId);
  const title = useThreadTabStore((s) => s.title);
  const responses = useThreadTabStore((s) => s.responses);
  const loading = useThreadTabStore((s) => s.loading);
  const isDatFallen = useThreadTabStore((s) => s.isDatFallen);
  const postEditorOpen = useThreadTabStore((s) => s.postEditorOpen);
  const postEditorInitialMessage = useThreadTabStore((s) => s.postEditorInitialMessage);
  const analysisOpen = useThreadTabStore((s) => s.analysisOpen);
  const progPostOpen = useThreadTabStore((s) => s.progPostOpen);
  const ngRules = useThreadTabStore((s) => s.ngRules);
  const highlightSettings = useThreadTabStore((s) => s.highlightSettings);
  const postHistory = useThreadTabStore((s) => s.postHistory);
  const initialize = useThreadTabStore((s) => s.initialize);
  const refreshThread = useThreadTabStore((s) => s.refreshThread);
  const togglePostEditor = useThreadTabStore((s) => s.togglePostEditor);
  const closePostEditor = useThreadTabStore((s) => s.closePostEditor);
  const openPostEditorWithQuote = useThreadTabStore((s) => s.openPostEditorWithQuote);
  const toggleAnalysis = useThreadTabStore((s) => s.toggleAnalysis);
  const toggleProgPost = useThreadTabStore((s) => s.toggleProgPost);
  const closeProgPost = useThreadTabStore((s) => s.closeProgPost);
  const setHighlightSettings = useThreadTabStore((s) => s.setHighlightSettings);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchField, setSearchField] = useState<SearchField>('all');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [revealAbon, setRevealAbon] = useState(false);
  const [ngEditorOpen, setNgEditorOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showRelativeTime, setShowRelativeTime] = useState(false);
  const [inlineMediaEnabled, setInlineMediaEnabled] = useState(true);
  const [popup, setPopup] = useState<PopupState | null>(null);
  const popupCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popupEnteredRef = useRef(false);

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

  // Initialize on mount
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    void (async () => {
      const initData: ThreadTabInitData = await window.electronApi.invoke('view:thread-tab-ready');
      await initialize(initData);
    })();
  }, [initialize]);

  // Listen for push events
  useEffect(() => {
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
      unsubNg();
      unsubRefresh();
      unsubHighlight();
    };
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (edgeRefreshUnlockTimerRef.current !== null) {
        clearTimeout(edgeRefreshUnlockTimerRef.current);
      }
    };
  }, []);

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

  // Display responses (apply NG filter + search filter)
  const displayResponses = useMemo(() => {
    let result = [...responses];
    if (searchFilteredResNumbers !== null) {
      result = result.filter((r) => searchFilteredResNumbers.has(r.number));
    }
    return result;
  }, [responses, searchFilteredResNumbers]);

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
      const isAA = isAsciiArt(res.body);

      const imageUrls = inlineMediaEnabled ? detectImageUrls(res.body) : [];
      const videoUrls = inlineMediaEnabled ? detectVideoUrls(res.body) : [];
      const audioUrls = inlineMediaEnabled ? detectAudioUrls(res.body) : [];

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
        >
          {/* Response header */}
          <div className="mb-1 flex items-baseline gap-2 text-xs">
            <span className="font-bold text-[var(--color-res-number)]">{res.number}</span>
            <span
              className="text-[var(--color-res-name)]"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(res.name) }}
            />
            <span className="text-[var(--color-text-muted)]">
              {renderDateTimeWithBe(res.dateTime, showRelativeTime)}
            </span>
            {replyCount > 0 && (
              <button
                type="button"
                className="text-[var(--color-accent)] hover:underline"
                onClick={(e) => {
                  if (replies !== undefined) {
                    handleAnchorClick(e, replies);
                  }
                }}
              >
                返信({replyCount})
              </button>
            )}
            <button
              type="button"
              className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
              onClick={() => {
                openPostEditorWithQuote(res.number);
              }}
              title="引用レス"
            >
              &gt;&gt;
            </button>
          </div>

          {/* Response body */}
          <div
            className={`text-sm leading-relaxed text-[var(--color-text-primary)] ${isAA ? 'aa-font' : ''}`}
            dangerouslySetInnerHTML={{ __html: withUrls }}
            onClick={(e) => {
              const target = e.target;
              if (target instanceof HTMLAnchorElement && target.dataset['anchor'] !== undefined) {
                e.preventDefault();
                const nums = target.dataset['anchor']
                  .split(',')
                  .map(Number)
                  .filter((n) => !Number.isNaN(n));
                if (nums.length > 0) {
                  handleAnchorClick(e, nums);
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
      openPostEditorWithQuote,
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
            setNgEditorOpen((prev) => !prev);
          }}
          className={`rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] ${ngEditorOpen ? 'bg-[var(--color-bg-active)] text-[var(--color-error)]' : ''}`}
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
          onClick={togglePostEditor}
          className={`rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] ${postEditorOpen ? 'bg-[var(--color-bg-active)] text-[var(--color-accent)]' : ''}`}
          title="書き込み"
        >
          <MdiIcon path={mdiPencil} size={14} />
        </button>
        <button
          type="button"
          onClick={toggleProgPost}
          className={`rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] ${progPostOpen ? 'bg-[var(--color-bg-active)] text-[var(--color-accent)]' : ''}`}
          title="プログラマティック書き込み"
        >
          <MdiIcon path={mdiRobot} size={14} />
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
        <p className="text-xs text-[var(--color-text-muted)]">{responses.length} レス</p>
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
              onClick={() => {
                setSearchQuery('');
                searchInputRef.current?.focus();
              }}
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

      {/* Responses — no virtual scrolling */}
      <div ref={scrollRef} className="relative flex-1 overflow-y-auto" onWheel={handleThreadWheel}>
        {displayResponses.map(renderResponse)}
      </div>

      {/* Edge refresh overlay */}
      {refreshing && <RefreshOverlay />}

      {/* Post editor */}
      {postEditorOpen && (
        <div className="border-t border-[var(--color-border-primary)]">
          <Suspense fallback={null}>
            <PostEditor
              boardUrl={boardUrl}
              threadId={threadId}
              initialMessage={postEditorInitialMessage}
              onClose={closePostEditor}
            />
          </Suspense>
        </div>
      )}

      {/* Programmatic post */}
      {progPostOpen && (
        <div className="border-t border-[var(--color-border-primary)]">
          <Suspense fallback={null}>
            <ProgrammaticPost boardUrl={boardUrl} threadId={threadId} onClose={closeProgPost} />
          </Suspense>
        </div>
      )}

      {/* Thread analysis */}
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

      {/* NG Editor */}
      {ngEditorOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="max-h-[70vh] w-full max-w-2xl overflow-hidden rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
            <Suspense fallback={null}>
              <NgEditor
                onClose={() => {
                  setNgEditorOpen(false);
                }}
              />
            </Suspense>
          </div>
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
    </section>
  );
}
