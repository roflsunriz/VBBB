/**
 * Tests for window state persistence (feature 8: window size persist).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock electron before importing the module
vi.mock('electron', () => ({
  screen: {
    getAllDisplays: () => [
      {
        workArea: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    ],
  },
}));

// Import after mock setup
const { loadWindowState, saveWindowState } = await import('../../src/main/services/window-state');

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vbbb-ws-test-'));
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('loadWindowState', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns default state when no file exists', () => {
    const dir = createTempDir();
    const state = loadWindowState(dir);
    expect(state).toStrictEqual({
      x: -1,
      y: -1,
      width: 1280,
      height: 800,
      isMaximized: false,
    });
  });

  it('loads saved state from JSON file', () => {
    const dir = createTempDir();
    const saved = { x: 100, y: 200, width: 1024, height: 768, isMaximized: false };
    writeFileSync(join(dir, 'window-state.json'), JSON.stringify(saved));

    const state = loadWindowState(dir);
    expect(state.x).toBe(100);
    expect(state.y).toBe(200);
    expect(state.width).toBe(1024);
    expect(state.height).toBe(768);
    expect(state.isMaximized).toBe(false);
  });

  it('loads maximized state', () => {
    const dir = createTempDir();
    const saved = { x: 0, y: 0, width: 1920, height: 1080, isMaximized: true };
    writeFileSync(join(dir, 'window-state.json'), JSON.stringify(saved));

    const state = loadWindowState(dir);
    expect(state.isMaximized).toBe(true);
  });

  it('returns default for invalid JSON', () => {
    const dir = createTempDir();
    writeFileSync(join(dir, 'window-state.json'), 'not-json');

    const state = loadWindowState(dir);
    expect(state.width).toBe(1280);
    expect(state.height).toBe(800);
  });

  it('returns default for non-object JSON', () => {
    const dir = createTempDir();
    writeFileSync(join(dir, 'window-state.json'), '"string"');

    const state = loadWindowState(dir);
    expect(state.width).toBe(1280);
  });

  it('uses defaults for missing numeric fields', () => {
    const dir = createTempDir();
    writeFileSync(join(dir, 'window-state.json'), JSON.stringify({ x: 10, y: 20 }));

    const state = loadWindowState(dir);
    expect(state.x).toBe(10);
    expect(state.y).toBe(20);
    expect(state.width).toBe(1280);
    expect(state.height).toBe(800);
    expect(state.isMaximized).toBe(false);
  });

  it('rejects negative width/height', () => {
    const dir = createTempDir();
    writeFileSync(
      join(dir, 'window-state.json'),
      JSON.stringify({ x: 0, y: 0, width: -100, height: -50 }),
    );

    const state = loadWindowState(dir);
    expect(state.width).toBe(1280);
    expect(state.height).toBe(800);
  });

  it('resets position when window is outside all displays', () => {
    const dir = createTempDir();
    // Position completely outside the mocked 1920x1080 display
    writeFileSync(
      join(dir, 'window-state.json'),
      JSON.stringify({
        x: 5000,
        y: 5000,
        width: 800,
        height: 600,
        isMaximized: false,
      }),
    );

    const state = loadWindowState(dir);
    expect(state.x).toBe(-1);
    expect(state.y).toBe(-1);
    expect(state.width).toBe(800);
    expect(state.height).toBe(600);
  });

  it('keeps position when window is partially visible', () => {
    const dir = createTempDir();
    // Partially visible (overlaps with 1920x1080 display)
    writeFileSync(
      join(dir, 'window-state.json'),
      JSON.stringify({
        x: 1800,
        y: 900,
        width: 800,
        height: 600,
        isMaximized: false,
      }),
    );

    const state = loadWindowState(dir);
    expect(state.x).toBe(1800);
    expect(state.y).toBe(900);
  });
});

describe('saveWindowState', () => {
  it('saves state to JSON file', async () => {
    const dir = createTempDir();
    await saveWindowState(dir, {
      x: 50,
      y: 100,
      width: 1000,
      height: 700,
      isMaximized: false,
    });

    const content = readFileSync(join(dir, 'window-state.json'), 'utf-8');
    const parsed = JSON.parse(content) as Record<string, unknown>;
    expect(parsed['x']).toBe(50);
    expect(parsed['y']).toBe(100);
    expect(parsed['width']).toBe(1000);
    expect(parsed['height']).toBe(700);
    expect(parsed['isMaximized']).toBe(false);
  });

  it('round-trips correctly', async () => {
    const dir = createTempDir();
    const original = { x: 200, y: 300, width: 1400, height: 900, isMaximized: true };
    await saveWindowState(dir, original);
    const loaded = loadWindowState(dir);
    expect(loaded).toStrictEqual(original);
  });
});
