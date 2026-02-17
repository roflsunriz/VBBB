/**
 * Custom hook for IntersectionObserver-based lazy loading.
 * Returns a ref to attach to the container and a boolean indicating
 * whether the element has entered the viewport (with optional margin).
 *
 * Once the element becomes visible, it stays visible (no unloading).
 */
import { useRef, useState, useEffect, useCallback } from 'react';

interface UseLazyLoadOptions {
  /** Extra margin around the root to trigger loading before entering the viewport (default: '200px') */
  readonly rootMargin?: string;
  /** Visibility threshold (default: 0) */
  readonly threshold?: number;
}

interface UseLazyLoadResult<T extends HTMLElement> {
  /** Ref to attach to the target element */
  readonly ref: React.RefCallback<T>;
  /** Whether the element has entered the viewport at least once */
  readonly isVisible: boolean;
}

export function useLazyLoad<T extends HTMLElement>(
  options?: UseLazyLoadOptions,
): UseLazyLoadResult<T> {
  const rootMargin = options?.rootMargin ?? '200px';
  const threshold = options?.threshold ?? 0;

  const [isVisible, setIsVisible] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const elementRef = useRef<T | null>(null);

  // Clean up observer on unmount
  useEffect(() => {
    return () => {
      if (observerRef.current !== null) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, []);

  const ref = useCallback(
    (node: T | null) => {
      // Disconnect previous observer
      if (observerRef.current !== null) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }

      elementRef.current = node;

      // Already visible — no need to observe
      if (isVisible) return;

      if (node === null) return;

      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              setIsVisible(true);
              observer.disconnect();
              observerRef.current = null;
              return;
            }
          }
        },
        { rootMargin, threshold },
      );

      observer.observe(node);
      observerRef.current = observer;
    },
    [isVisible, rootMargin, threshold],
  );

  return { ref, isVisible };
}
