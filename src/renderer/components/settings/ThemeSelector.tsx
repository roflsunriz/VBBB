/**
 * Theme selector component.
 * Allows switching between Dark, Light, and Classic themes.
 * Persists selection to localStorage.
 */
import { useCallback } from 'react';
import { mdiPalette } from '@mdi/js';
import { MdiIcon } from '../common/MdiIcon';

export type ThemeName = 'dark' | 'light' | 'classic';

const THEMES: readonly { readonly name: ThemeName; readonly label: string }[] = [
  { name: 'dark', label: 'ダーク' },
  { name: 'light', label: 'ライト' },
  { name: 'classic', label: 'クラシック' },
] as const;

const STORAGE_KEY = 'vbbb-theme';

/**
 * Get the currently active theme from localStorage.
 */
export function getStoredTheme(): ThemeName {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light' || stored === 'classic') {
      return stored;
    }
  } catch {
    // localStorage not available
  }
  return 'dark';
}

/**
 * Apply a theme by setting the data-theme attribute on the document root.
 */
export function applyTheme(theme: ThemeName): void {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // localStorage not available
  }
}

interface ThemeSelectorProps {
  readonly currentTheme: ThemeName;
  readonly onThemeChange: (theme: ThemeName) => void;
}

export function ThemeSelector({ currentTheme, onThemeChange }: ThemeSelectorProps): React.JSX.Element {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      if (value === 'dark' || value === 'light' || value === 'classic') {
        onThemeChange(value);
      }
    },
    [onThemeChange],
  );

  return (
    <div className="flex items-center gap-1">
      <MdiIcon path={mdiPalette} size={12} className="text-[var(--color-text-muted)]" />
      <select
        value={currentTheme}
        onChange={handleChange}
        className="rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-1.5 py-0.5 text-xs text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
      >
        {THEMES.map((t) => (
          <option key={t.name} value={t.name}>
            {t.label}
          </option>
        ))}
      </select>
    </div>
  );
}
