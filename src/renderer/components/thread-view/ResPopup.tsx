/**
 * Popup component for displaying referenced responses on anchor hover.
 * Supports auto-expanded reply trees (BFS) and recursive anchor popups.
 */
import { useRef, useLayoutEffect, useCallback, useState, useEffect, useMemo } from 'react';
import type { Res } from '@shared/domain';
import { MAX_POPUP_RES } from '@shared/file-format';
import { sanitizeHtml } from '../../hooks/use-sanitize';
import { isAsciiArt } from '../../utils/aa-detect';
import { convertAnchorsToLinks } from '../../utils/anchor-parser';
import { linkifyUrls } from '../../utils/url-linkify';

interface ResPopupProps {
  /** Response numbers to display */
  readonly resNumbers: readonly number[];
  /** All responses in the current thread */
  readonly responses: readonly Res[];
  /** Map of resNumber → list of resNumbers that reference it */
  readonly replyMap: ReadonlyMap<number, readonly number[]>;
  /** Mouse position for positioning */
  readonly position: { readonly x: number; readonly y: number };
  /** Close handler */
  readonly onClose: () => void;
  /** Called when the mouse enters this popup (for parent hover coordination) */
  readonly onMouseEnter?: (() => void) | undefined;
  /** When true, recursively expand reply tree from resNumbers via BFS */
  readonly expandReplies?: boolean | undefined;
  /** Current nesting depth (0 = top-level) */
  readonly depth?: number | undefined;
}

/** Popup offset from cursor */
const OFFSET_X = 12;
const OFFSET_Y = 12;
/** Margin from viewport edge */
const VIEWPORT_MARGIN = 8;
/** Maximum nesting depth for recursive popups */
const MAX_POPUP_DEPTH = 10;
/** Delay before closing this popup when the mouse leaves */
const POPUP_LEAVE_DELAY_MS = 300;
/** Delay before closing child popup when leaving a trigger element */
const TRIGGER_LEAVE_DELAY_MS = 400;

interface ChildPopupState {
  readonly resNumbers: readonly number[];
  readonly x: number;
  readonly y: number;
}

/**
 * Collect all response numbers reachable via the reply graph (BFS).
 * Returns up to `limit` numbers in ascending order and whether the tree was truncated.
 */
function collectReplyTree(
  startNumbers: readonly number[],
  replyMap: ReadonlyMap<number, readonly number[]>,
  limit: number,
): { readonly numbers: readonly number[]; readonly hasMore: boolean } {
  const collected = new Set<number>();
  const queue: number[] = [...startNumbers];

  while (queue.length > 0 && collected.size < limit) {
    const num = queue.shift();
    if (num === undefined) break;
    if (collected.has(num)) continue;
    collected.add(num);
    const replies = replyMap.get(num);
    if (replies !== undefined) {
      for (const r of replies) {
        if (!collected.has(r)) {
          queue.push(r);
        }
      }
    }
  }

  const hasMore = queue.some((n) => !collected.has(n));
  return {
    numbers: [...collected].sort((a, b) => a - b),
    hasMore,
  };
}

export function ResPopup({
  resNumbers,
  responses,
  replyMap,
  position,
  onClose,
  onMouseEnter,
  expandReplies = false,
  depth = 0,
}: ResPopupProps): React.JSX.Element | null {
  const popupRef = useRef<HTMLDivElement>(null);
  const [childPopup, setChildPopup] = useState<ChildPopupState | null>(null);
  const childEnteredRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selfCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        clearTimeout(closeTimerRef.current);
      }
      if (selfCloseTimerRef.current !== null) {
        clearTimeout(selfCloseTimerRef.current);
      }
    };
  }, []);

  // Expand reply tree when requested, otherwise use resNumbers as-is
  const { numbers: displayNumbers, hasMore } = useMemo(() => {
    if (expandReplies) {
      return collectReplyTree(resNumbers, replyMap, MAX_POPUP_RES);
    }
    const limited =
      resNumbers.length > MAX_POPUP_RES ? resNumbers.slice(0, MAX_POPUP_RES) : resNumbers;
    return { numbers: limited, hasMore: resNumbers.length > MAX_POPUP_RES };
  }, [resNumbers, replyMap, expandReplies]);

  // Find matching responses (memoized to avoid recomputation on re-render)
  const matchedResponses = useMemo(() => {
    const result: Res[] = [];
    for (const num of displayNumbers) {
      const res = responses.find((r) => r.number === num);
      if (res !== undefined) {
        result.push(res);
      }
    }
    return result;
  }, [displayNumbers, responses]);

  const processedResponses = useMemo(
    () =>
      matchedResponses.map((res) => ({
        res,
        bodyIsAa: isAsciiArt(res.body),
        bodyHtml: linkifyUrls(convertAnchorsToLinks(sanitizeHtml(res.body))),
        replyCount: replyMap.get(res.number)?.length ?? 0,
      })),
    [matchedResponses, replyMap],
  );

  // Position adjustment to keep popup within viewport
  useLayoutEffect(() => {
    const el = popupRef.current;
    if (el === null) return;

    const rect = el.getBoundingClientRect();
    let left = position.x + OFFSET_X;
    let top = position.y + OFFSET_Y;

    if (left + rect.width > window.innerWidth - VIEWPORT_MARGIN) {
      left = position.x - rect.width - OFFSET_X;
    }
    if (top + rect.height > window.innerHeight - VIEWPORT_MARGIN) {
      top = position.y - rect.height - OFFSET_Y;
    }
    left = Math.max(VIEWPORT_MARGIN, left);
    top = Math.max(VIEWPORT_MARGIN, top);

    el.style.left = `${String(left)}px`;
    el.style.top = `${String(top)}px`;
  }, [position]);

  const handleMouseEnterSelf = useCallback(() => {
    if (selfCloseTimerRef.current !== null) {
      clearTimeout(selfCloseTimerRef.current);
      selfCloseTimerRef.current = null;
    }
    onMouseEnter?.();
  }, [onMouseEnter]);

  const handleMouseLeave = useCallback(() => {
    if (selfCloseTimerRef.current !== null) {
      clearTimeout(selfCloseTimerRef.current);
    }
    selfCloseTimerRef.current = setTimeout(() => {
      selfCloseTimerRef.current = null;
      onClose();
    }, POPUP_LEAVE_DELAY_MS);
  }, [onClose]);

  // ── Child popup lifecycle (for >>N anchor hovers) ──────────────────

  const canNest = depth < MAX_POPUP_DEPTH;

  const openChildPopup = useCallback(
    (nums: readonly number[], x: number, y: number) => {
      if (!canNest) return;
      if (closeTimerRef.current !== null) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      childEnteredRef.current = false;
      setChildPopup({ resNumbers: nums, x, y });
    },
    [canNest],
  );

  const scheduleTriggerLeave = useCallback(() => {
    closeTimerRef.current = setTimeout(() => {
      if (!childEnteredRef.current) {
        setChildPopup(null);
      }
      closeTimerRef.current = null;
    }, TRIGGER_LEAVE_DELAY_MS);
  }, []);

  const handleChildMouseEnter = useCallback(() => {
    childEnteredRef.current = true;
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const handleChildClose = useCallback(() => {
    childEnteredRef.current = false;
    setChildPopup(null);
  }, []);

  // ── Body event handlers ────────────────────────────────────────────

  const handleBodyMouseOver = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target;
      if (!(target instanceof HTMLAnchorElement)) return;
      if (!target.classList.contains('anchor-link')) return;

      const numsAttr = target.dataset['anchorNums'];
      if (numsAttr === undefined || numsAttr === '') return;

      const nums = numsAttr
        .split(',')
        .map(Number)
        .filter((n) => n > 0);
      if (nums.length > 0) {
        openChildPopup(nums, e.clientX, e.clientY);
      }
    },
    [openChildPopup],
  );

  const handleBodyMouseOut = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target;
      if (!(target instanceof HTMLAnchorElement)) return;
      if (!target.classList.contains('anchor-link')) return;
      scheduleTriggerLeave();
    },
    [scheduleTriggerLeave],
  );

  const handleBodyClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target;
    if (!(target instanceof HTMLAnchorElement)) return;

    if (target.classList.contains('external-url')) {
      e.preventDefault();
      const url = target.dataset['url'];
      if (url !== undefined && url.length > 0) {
        void window.electronApi.invoke('shell:open-external', url);
      }
      return;
    }

    if (target.classList.contains('anchor-link')) {
      e.preventDefault();
    }
  }, []);

  if (processedResponses.length === 0) return null;

  return (
    <div
      ref={popupRef}
      role="tooltip"
      className="fixed max-h-80 max-w-md overflow-y-auto rounded border border-[var(--color-popup-border)] bg-[var(--color-popup-bg)]"
      style={{
        left: position.x + OFFSET_X,
        top: position.y + OFFSET_Y,
        zIndex: 50 + depth,
        boxShadow: 'var(--shadow-popup)',
      }}
      onMouseLeave={handleMouseLeave}
      onMouseEnter={handleMouseEnterSelf}
    >
      {processedResponses.map(({ res, bodyIsAa, bodyHtml, replyCount }) => (
        <div
          key={res.number}
          className="border-b border-[var(--color-border-secondary)] px-3 py-1.5 last:border-b-0"
        >
          <div className="mb-0.5 flex flex-wrap items-baseline gap-1.5 text-xs">
            {replyCount > 0 && (
              <span className="text-[10px] font-semibold text-[var(--color-link)]">
                +{replyCount}
              </span>
            )}
            <span className="font-bold text-[var(--color-res-number)]">{res.number}</span>
            <span
              className="text-[var(--color-res-name)]"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(res.name) }}
            />
            {res.mail.length > 0 && (
              <span className="text-[var(--color-res-mail)]">[{res.mail}]</span>
            )}
            <span className="text-[var(--color-res-datetime)]">{res.dateTime}</span>
          </div>
          <div
            className={`${bodyIsAa ? 'aa-font' : 'text-xs leading-relaxed'} text-[var(--color-res-body)]`}
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
            onMouseOver={canNest ? handleBodyMouseOver : undefined}
            onMouseOut={canNest ? handleBodyMouseOut : undefined}
            onClick={handleBodyClick}
          />
        </div>
      ))}

      {hasMore && (
        <div className="px-3 py-1 text-center text-[10px] text-[var(--color-res-datetime)]">
          …他にも返信があります
        </div>
      )}

      {/* Child popup for >>N anchor hovers (not auto-expanded) */}
      {childPopup !== null && (
        <ResPopup
          resNumbers={childPopup.resNumbers}
          responses={responses}
          replyMap={replyMap}
          position={{ x: childPopup.x, y: childPopup.y }}
          onClose={handleChildClose}
          onMouseEnter={handleChildMouseEnter}
          depth={depth + 1}
        />
      )}
    </div>
  );
}
