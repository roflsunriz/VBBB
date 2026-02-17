/**
 * Custom hook for keyboard-driven scrolling within panes.
 *
 * Returns a React keyboard event handler that scrolls the given
 * scroll container on Home / End / PageUp / PageDown.
 *
 * When the event target is an input, textarea, or contenteditable element,
 * the handler is skipped so that default text-editing behaviour is preserved.
 */
import { useCallback, type RefObject } from 'react';

export function useScrollKeyboard(
  scrollRef: RefObject<HTMLElement | null>,
): (e: React.KeyboardEvent) => void {
  return useCallback(
    (e: React.KeyboardEvent): void => {
      const target = e.target;

      // Do not interfere with text input elements
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      const scrollEl = scrollRef.current;
      if (scrollEl === null) return;

      switch (e.key) {
        case 'Home':
          e.preventDefault();
          scrollEl.scrollTo({ top: 0, behavior: 'smooth' });
          break;
        case 'End':
          e.preventDefault();
          scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: 'smooth' });
          break;
        case 'PageUp':
          e.preventDefault();
          scrollEl.scrollBy({ top: -scrollEl.clientHeight, behavior: 'smooth' });
          break;
        case 'PageDown':
          e.preventDefault();
          scrollEl.scrollBy({ top: scrollEl.clientHeight, behavior: 'smooth' });
          break;
        default:
          break;
      }
    },
    [scrollRef],
  );
}
