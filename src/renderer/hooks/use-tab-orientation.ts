/**
 * Custom hook for persisting tab bar orientation (horizontal / vertical)
 * in localStorage.
 */
import { useCallback, useState } from 'react';
import type { TabOrientation } from '@shared/settings';

function loadOrientation(key: string): TabOrientation {
  try {
    const raw = localStorage.getItem(key);
    if (raw === 'horizontal' || raw === 'vertical') return raw;
  } catch {
    /* localStorage unavailable */
  }
  return 'horizontal';
}

/**
 * Returns the current orientation and a toggle function that flips it
 * while persisting the choice to localStorage.
 */
export function useTabOrientation(storageKey: string): readonly [TabOrientation, () => void] {
  const [orientation, setOrientation] = useState<TabOrientation>(() => loadOrientation(storageKey));

  const toggle = useCallback(() => {
    setOrientation((prev) => {
      const next: TabOrientation = prev === 'horizontal' ? 'vertical' : 'horizontal';
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        /* localStorage unavailable */
      }
      return next;
    });
  }, [storageKey]);

  return [orientation, toggle] as const;
}
