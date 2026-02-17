/**
 * Popup component for displaying referenced responses on anchor hover.
 * Shows up to MAX_POPUP_RES responses near the mouse cursor.
 */
import { useRef, useLayoutEffect, useCallback } from 'react';
import type { Res } from '@shared/domain';
import { MAX_POPUP_RES } from '@shared/file-format';
import { sanitizeHtml } from '../../hooks/use-sanitize';
import { isAsciiArt } from '../../utils/aa-detect';

interface ResPopupProps {
  /** Response numbers to display */
  readonly resNumbers: readonly number[];
  /** All responses in the current thread */
  readonly responses: readonly Res[];
  /** Mouse position for positioning */
  readonly position: { readonly x: number; readonly y: number };
  /** Close handler */
  readonly onClose: () => void;
}

/** Popup offset from cursor */
const OFFSET_X = 12;
const OFFSET_Y = 12;
/** Margin from viewport edge */
const VIEWPORT_MARGIN = 8;

export function ResPopup({ resNumbers, responses, position, onClose }: ResPopupProps): React.JSX.Element | null {
  const popupRef = useRef<HTMLDivElement>(null);

  // Find matching responses (limited to MAX_POPUP_RES)
  const matchedResponses: Res[] = [];
  for (const num of resNumbers) {
    if (matchedResponses.length >= MAX_POPUP_RES) break;
    const res = responses.find((r) => r.number === num);
    if (res !== undefined) {
      matchedResponses.push(res);
    }
  }

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

  const handleMouseLeave = useCallback(() => {
    onClose();
  }, [onClose]);

  if (matchedResponses.length === 0) return null;

  return (
    <div
      ref={popupRef}
      role="tooltip"
      className="fixed z-50 max-h-80 max-w-md overflow-y-auto rounded border border-[var(--color-popup-border)] bg-[var(--color-popup-bg)]"
      style={{
        left: position.x + OFFSET_X,
        top: position.y + OFFSET_Y,
        boxShadow: 'var(--shadow-popup)',
      }}
      onMouseLeave={handleMouseLeave}
    >
      {matchedResponses.map((res) => {
        const bodyIsAa = isAsciiArt(res.body);
        return (
          <div key={res.number} className="border-b border-[var(--color-border-secondary)] px-3 py-1.5 last:border-b-0">
            <div className="mb-0.5 flex flex-wrap items-baseline gap-1.5 text-xs">
              <span className="font-bold text-[var(--color-res-number)]">{res.number}</span>
              <span className="text-[var(--color-res-name)]" dangerouslySetInnerHTML={{ __html: sanitizeHtml(res.name) }} />
              {res.mail.length > 0 && (
                <span className="text-[var(--color-res-mail)]">[{res.mail}]</span>
              )}
              <span className="text-[var(--color-res-datetime)]">{res.dateTime}</span>
            </div>
            <div
              className={`${bodyIsAa ? 'aa-font' : 'text-xs leading-relaxed'} text-[var(--color-res-body)]`}
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(res.body) }}
            />
          </div>
        );
      })}
    </div>
  );
}
