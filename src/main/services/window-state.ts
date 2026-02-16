/**
 * Window state persistence service.
 * Saves/restores window position, size, and maximized state.
 */
import { join } from 'node:path';
import { screen } from 'electron';
import { createLogger } from '../logger';
import { atomicWriteFile, readFileSafe } from './file-io';

const logger = createLogger('window-state');

const WINDOW_STATE_FILE = 'window-state.json';

/** Persisted window state */
export interface WindowState {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly isMaximized: boolean;
}

/** Default window state */
const DEFAULT_STATE: WindowState = {
  x: -1,
  y: -1,
  width: 1280,
  height: 800,
  isMaximized: false,
};

/**
 * Validate that the window position is visible on at least one display.
 */
function validateBounds(state: WindowState): WindowState {
  try {
    const displays = screen.getAllDisplays();
    const visible = displays.some((d) => {
      const { x, y, width, height } = d.workArea;
      return (
        state.x + state.width > x &&
        state.x < x + width &&
        state.y + state.height > y &&
        state.y < y + height
      );
    });
    if (visible) return state;
  } catch {
    // Fall through to reset position
  }
  logger.info('Window position out of screen bounds, resetting');
  return { ...state, x: -1, y: -1 };
}

/**
 * Load saved window state from disk.
 */
export function loadWindowState(dataDir: string): WindowState {
  const filePath = join(dataDir, WINDOW_STATE_FILE);
  const content = readFileSafe(filePath);
  if (content === null) return DEFAULT_STATE;

  try {
    const parsed: unknown = JSON.parse(content.toString('utf-8'));
    if (
      typeof parsed !== 'object' ||
      parsed === null
    ) {
      return DEFAULT_STATE;
    }

    const obj = parsed as Record<string, unknown>;
    const x = typeof obj['x'] === 'number' ? obj['x'] : DEFAULT_STATE.x;
    const y = typeof obj['y'] === 'number' ? obj['y'] : DEFAULT_STATE.y;
    const width = typeof obj['width'] === 'number' && obj['width'] > 0 ? obj['width'] : DEFAULT_STATE.width;
    const height = typeof obj['height'] === 'number' && obj['height'] > 0 ? obj['height'] : DEFAULT_STATE.height;
    const isMaximized = typeof obj['isMaximized'] === 'boolean' ? obj['isMaximized'] : DEFAULT_STATE.isMaximized;

    return validateBounds({ x, y, width, height, isMaximized });
  } catch {
    logger.warn('Failed to parse window state, using defaults');
    return DEFAULT_STATE;
  }
}

/**
 * Save window state to disk.
 */
export async function saveWindowState(dataDir: string, state: WindowState): Promise<void> {
  const filePath = join(dataDir, WINDOW_STATE_FILE);
  await atomicWriteFile(filePath, JSON.stringify(state, null, 2));
}
