/**
 * Search input with persistent history dropdown.
 * Saves queries to localStorage on Enter or history item click.
 * Shows a dropdown of past queries with individual delete buttons.
 */
import { useState, useCallback, useRef } from 'react';
import { mdiClose, mdiClockOutline } from '@mdi/js';
import { useSearchHistory } from '../../hooks/use-search-history';
import { MdiIcon } from './MdiIcon';

interface SearchInputWithHistoryProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Called when user submits (Enter key or history item click). */
  readonly onSearch?: (value: string) => void;
  readonly storageKey: string;
  readonly placeholder?: string;
  readonly className?: string;
  readonly inputClassName?: string;
  readonly disabled?: boolean;
}

export function SearchInputWithHistory({
  value,
  onChange,
  onSearch,
  storageKey,
  placeholder,
  className,
  inputClassName,
  disabled = false,
}: SearchInputWithHistoryProps): React.JSX.Element {
  const { history, addToHistory, removeFromHistory } = useSearchHistory(storageKey);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleFocus = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setDropdownOpen(true);
  }, []);

  const handleBlur = useCallback(() => {
    closeTimerRef.current = setTimeout(() => {
      setDropdownOpen(false);
    }, 150);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        addToHistory(value);
        onSearch?.(value);
        setDropdownOpen(false);
      } else if (e.key === 'Escape') {
        setDropdownOpen(false);
      }
    },
    [value, addToHistory, onSearch],
  );

  const handleHistoryItemClick = useCallback(
    (item: string) => {
      onChange(item);
      addToHistory(item);
      onSearch?.(item);
      setDropdownOpen(false);
    },
    [onChange, addToHistory, onSearch],
  );

  const handleDeleteHistoryItem = useCallback(
    (e: React.MouseEvent, item: string) => {
      e.stopPropagation();
      removeFromHistory(item);
    },
    [removeFromHistory],
  );

  const showDropdown = dropdownOpen && history.length > 0;

  return (
    <div className={`relative ${className ?? 'flex-1'}`}>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={inputClassName}
      />
      {showDropdown && (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-0.5 max-h-48 overflow-y-auto rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] shadow-lg"
          role="listbox"
          aria-label="検索履歴"
        >
          {history.map((item) => (
            <div
              key={item}
              className="group flex cursor-pointer items-center gap-1 px-2 py-1 hover:bg-[var(--color-bg-hover)]"
              onClick={() => {
                handleHistoryItemClick(item);
              }}
              role="option"
              aria-selected={false}
            >
              <MdiIcon
                path={mdiClockOutline}
                size={10}
                className="shrink-0 text-[var(--color-text-muted)]"
              />
              <span className="min-w-0 flex-1 truncate text-xs text-[var(--color-text-secondary)]">
                {item}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  handleDeleteHistoryItem(e, item);
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                className="shrink-0 rounded p-0.5 opacity-0 text-[var(--color-text-muted)] hover:text-[var(--color-error)] group-hover:opacity-100"
                aria-label="履歴から削除"
              >
                <MdiIcon path={mdiClose} size={9} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
