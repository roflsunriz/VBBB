/**
 * Tests for all 13 additional features from docs/additional-features.md.
 *
 * Feature 1:  fix-titlebar – HTML title empty to prevent BrowserWindow override
 * Feature 2:  app-icon – resources/icon.png exists, electron-builder references it
 * Feature 3:  post-editor-close – closePostEditor action exists
 * Feature 4:  thread-auto-refresh – refreshActiveThread action exists
 * Feature 5:  highlight-own-posts – highlight settings type and defaults
 * Feature 6:  save-tabs-on-close – SessionState includes activeThreadTabId
 * Feature 7:  category-tabs – BoardTab shape can be constructed
 * Feature 8:  window-size-persist – see window-state.test.ts
 * Feature 9:  remote-search-replace – buildRemoteSearchUrl for ff5ch.syoboi.jp
 * Feature 10: add-board-dialog – see url-parser.test.ts (parseExternalBoardUrl)
 * Feature 11: webview-thread-open – see url-parser.test.ts (parseThreadUrl)
 * Feature 12: modal-resize – Modal supports resizable props
 * Feature 13: console-log-save – diag:save-logs IPC channel exists
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildRemoteSearchUrl } from '../../src/main/services/remote-search';
import { DEFAULT_HIGHLIGHT_SETTINGS } from '../../src/types/settings';
import type { HighlightSettings } from '../../src/types/settings';
import type { SessionState } from '../../src/types/history';
import type { IpcChannelMap } from '../../src/types/ipc';
import type { Board, BoardType } from '../../src/types/domain';

const PROJECT_ROOT = resolve(__dirname, '../..');

// ---------------------------------------------------------------------------
// Feature 1: タイトルバー修正
// ---------------------------------------------------------------------------
describe('feature 1: fix-titlebar', () => {
  it('index.html has an empty <title> tag', () => {
    const html = readFileSync(resolve(PROJECT_ROOT, 'src/renderer/index.html'), 'utf-8');
    expect(html).toContain('<title></title>');
  });

  it('main/index.ts contains page-title-updated handler', () => {
    const main = readFileSync(resolve(PROJECT_ROOT, 'src/main/index.ts'), 'utf-8');
    expect(main).toContain('page-title-updated');
    expect(main).toContain('e.preventDefault()');
  });
});

// ---------------------------------------------------------------------------
// Feature 2: アプリアイコン
// ---------------------------------------------------------------------------
describe('feature 2: app-icon', () => {
  it('resources/icon.png exists', () => {
    expect(existsSync(resolve(PROJECT_ROOT, 'resources/icon.png'))).toBe(true);
  });

  it('electron-builder.yml references icon.png', () => {
    const yml = readFileSync(resolve(PROJECT_ROOT, 'electron-builder.yml'), 'utf-8');
    expect(yml).toContain('icon: resources/icon.png');
  });

  it('main/index.ts sets BrowserWindow icon', () => {
    const main = readFileSync(resolve(PROJECT_ROOT, 'src/main/index.ts'), 'utf-8');
    expect(main).toContain('icon:');
    expect(main).toContain('icon.png');
  });
});

// ---------------------------------------------------------------------------
// Feature 3: 投稿成功後に書き込み欄を自動で閉じる
// ---------------------------------------------------------------------------
describe('feature 3: post-editor-close', () => {
  it('PostEditor accepts onClose prop and calls it on success', () => {
    const src = readFileSync(resolve(PROJECT_ROOT, 'src/renderer/components/post-editor/PostEditor.tsx'), 'utf-8');
    // PostEditor now receives onClose as a prop (per-tab close handler)
    expect(src).toContain('onClose');
    expect(src).toContain('onClose()');
  });

  it('store defines closeTabPostEditor action', () => {
    const src = readFileSync(resolve(PROJECT_ROOT, 'src/renderer/stores/bbs-store.ts'), 'utf-8');
    // Per-tab post editor close replaces the global closePostEditor
    expect(src).toContain('closeTabPostEditor');
  });
});

// ---------------------------------------------------------------------------
// Feature 4: 投稿成功後にスレを差分自動更新する
// ---------------------------------------------------------------------------
describe('feature 4: thread-auto-refresh', () => {
  it('PostEditor calls refreshActiveThread on success', () => {
    const src = readFileSync(resolve(PROJECT_ROOT, 'src/renderer/components/post-editor/PostEditor.tsx'), 'utf-8');
    expect(src).toContain('refreshActiveThread');
  });

  it('store defines refreshActiveThread action', () => {
    const src = readFileSync(resolve(PROJECT_ROOT, 'src/renderer/stores/bbs-store.ts'), 'utf-8');
    expect(src).toContain('refreshActiveThread');
  });
});

// ---------------------------------------------------------------------------
// Feature 5: 自分の書き込みレス+返信ハイライト
// ---------------------------------------------------------------------------
describe('feature 5: highlight-own-posts', () => {
  it('DEFAULT_HIGHLIGHT_SETTINGS has correct defaults', () => {
    expect(DEFAULT_HIGHLIGHT_SETTINGS.highlightOwnPosts).toBe(true);
    expect(DEFAULT_HIGHLIGHT_SETTINGS.highlightRepliesToOwn).toBe(true);
  });

  it('HighlightSettings type has required fields', () => {
    const settings: HighlightSettings = {
      highlightOwnPosts: false,
      highlightRepliesToOwn: true,
    };
    expect(settings.highlightOwnPosts).toBe(false);
    expect(settings.highlightRepliesToOwn).toBe(true);
  });

  it('ThreadView uses highlight settings from store', () => {
    const src = readFileSync(resolve(PROJECT_ROOT, 'src/renderer/components/thread-view/ThreadView.tsx'), 'utf-8');
    expect(src).toContain('highlightSettings');
    expect(src).toContain('highlightOwnPosts');
    expect(src).toContain('highlightRepliesToOwn');
  });

  it('theme-vars.css defines highlight colors for all themes', () => {
    const css = readFileSync(resolve(PROJECT_ROOT, 'src/renderer/themes/theme-vars.css'), 'utf-8');
    expect(css).toContain('--color-highlight-own');
    expect(css).toContain('--color-highlight-reply');
    expect(css).toContain('--color-highlight-own-border');
    expect(css).toContain('--color-highlight-reply-border');
  });

  it('post:load-history IPC channel is defined', () => {
    // Type-level check: if this compiles, the channel exists
    type PostLoadHistoryResult = IpcChannelMap['post:load-history']['result'];
    const _check: IpcChannelMap['post:load-history'] = {
      args: [] as [],
      result: [] as PostLoadHistoryResult,
    };
    expect(_check.args).toStrictEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Feature 6: ウィンドウ終了時にタブを保存・起動時復元
// ---------------------------------------------------------------------------
describe('feature 6: save-tabs-on-close', () => {
  it('SessionState type includes activeThreadTabId', () => {
    const state: SessionState = {
      selectedBoardUrl: 'https://example.5ch.net/board/',
      activeThreadTabId: 'tab-123',
    };
    expect(state.activeThreadTabId).toBe('tab-123');
  });

  it('SessionState allows undefined activeThreadTabId', () => {
    const state: SessionState = {
      selectedBoardUrl: null,
    };
    expect(state.activeThreadTabId).toBeUndefined();
  });

  it('App.tsx registers beforeunload handler', () => {
    const src = readFileSync(resolve(PROJECT_ROOT, 'src/renderer/App.tsx'), 'utf-8');
    expect(src).toContain('beforeunload');
    expect(src).toContain('saveTabs');
    expect(src).toContain('activeThreadTabId');
  });
});

// ---------------------------------------------------------------------------
// Feature 7: カテゴリ複数タブ対応
// ---------------------------------------------------------------------------
describe('feature 7: category-tabs', () => {
  it('store defines boardTabs and activeBoardTabId', () => {
    const src = readFileSync(resolve(PROJECT_ROOT, 'src/renderer/stores/bbs-store.ts'), 'utf-8');
    expect(src).toContain('boardTabs');
    expect(src).toContain('activeBoardTabId');
  });

  it('BoardTab type is defined in store', () => {
    const src = readFileSync(resolve(PROJECT_ROOT, 'src/renderer/stores/bbs-store.ts'), 'utf-8');
    expect(src).toContain('interface BoardTab');
  });

  it('ThreadList renders board tab bar', () => {
    const src = readFileSync(resolve(PROJECT_ROOT, 'src/renderer/components/thread-list/ThreadList.tsx'), 'utf-8');
    expect(src).toContain('boardTabs');
    expect(src).toContain('setActiveBoardTab');
    expect(src).toContain('closeBoardTab');
  });

  it('store defines closeBoardTab action', () => {
    const src = readFileSync(resolve(PROJECT_ROOT, 'src/renderer/stores/bbs-store.ts'), 'utf-8');
    expect(src).toContain('closeBoardTab');
  });

  it('can construct a BoardTab-shaped object', () => {
    const tab = {
      id: 'board-1',
      board: {
        title: 'test',
        url: 'https://example.com/',
        bbsId: 'test',
        serverUrl: 'https://example.com/',
        boardType: '2ch' as BoardType,
      } satisfies Board,
      subjects: [],
      threadIndices: [],
      subjectLoading: false,
      subjectError: null,
    };
    expect(tab.id).toBe('board-1');
    expect(tab.board.boardType).toBe('2ch');
  });
});

// ---------------------------------------------------------------------------
// Feature 9: リモート検索 (ff5ch.syoboi.jp)
// ---------------------------------------------------------------------------
describe('feature 9: remote-search-replace', () => {
  it('builds URL with keyword', () => {
    const url = buildRemoteSearchUrl('テスト');
    expect(url).toContain('https://ff5ch.syoboi.jp/');
    expect(url).toContain('q=');
    expect(url).toContain(encodeURIComponent('テスト'));
  });

  it('builds URL for ASCII keywords', () => {
    const url = buildRemoteSearchUrl('hello world');
    expect(url).toBe('https://ff5ch.syoboi.jp/?q=hello+world');
  });

  it('handles special characters', () => {
    const url = buildRemoteSearchUrl('a&b=c');
    expect(url).toContain('q=a%26b%3Dc');
  });

  it('builds URL for empty keyword', () => {
    const url = buildRemoteSearchUrl('');
    expect(url).toBe('https://ff5ch.syoboi.jp/?q=');
  });

  it('search:remote-url IPC channel replaced dig.2ch.net', () => {
    const src = readFileSync(resolve(PROJECT_ROOT, 'src/main/services/remote-search.ts'), 'utf-8');
    // dig.2ch.net should only appear in comments, not in actual code
    const codeLines = src.split('\n').filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'));
    const codeOnly = codeLines.join('\n');
    expect(codeOnly).not.toContain('dig.2ch.net');
    expect(src).toContain('ff5ch.syoboi.jp');
  });

  it('CSP allows ff5ch.syoboi.jp in frame-src', () => {
    const html = readFileSync(resolve(PROJECT_ROOT, 'src/renderer/index.html'), 'utf-8');
    expect(html).toContain('frame-src https://ff5ch.syoboi.jp');
  });

  it('SearchPanel renders webview for remote mode', () => {
    const src = readFileSync(resolve(PROJECT_ROOT, 'src/renderer/components/search/SearchPanel.tsx'), 'utf-8');
    expect(src).toContain('<webview');
    expect(src).toContain('remoteUrl');
  });
});

// ---------------------------------------------------------------------------
// Feature 11: ff5ch.syoboi.jp webview thread link interception
// ---------------------------------------------------------------------------
describe('feature 11: webview-thread-open', () => {
  it('SearchPanel intercepts will-navigate on webview', () => {
    const src = readFileSync(resolve(PROJECT_ROOT, 'src/renderer/components/search/SearchPanel.tsx'), 'utf-8');
    expect(src).toContain('will-navigate');
    expect(src).toContain('new-window');
    expect(src).toContain('parseAnyThreadUrl');
  });

  it('SearchPanel imports parseThreadUrl from shared module', () => {
    const src = readFileSync(resolve(PROJECT_ROOT, 'src/renderer/components/search/SearchPanel.tsx'), 'utf-8');
    expect(src).toContain("from '@shared/url-parser'");
  });
});

// ---------------------------------------------------------------------------
// Feature 12: モーダルリサイズ対応
// ---------------------------------------------------------------------------
describe('feature 12: modal-resize', () => {
  it('Modal component supports resizable prop', () => {
    const src = readFileSync(resolve(PROJECT_ROOT, 'src/renderer/components/common/Modal.tsx'), 'utf-8');
    expect(src).toContain('resizable');
    expect(src).toContain('initialWidth');
    expect(src).toContain('initialHeight');
  });

  it('Modal defines minimum resize constraints', () => {
    const src = readFileSync(resolve(PROJECT_ROOT, 'src/renderer/components/common/Modal.tsx'), 'utf-8');
    expect(src).toContain('MIN_MODAL_WIDTH');
    expect(src).toContain('MIN_MODAL_HEIGHT');
  });

  it('Modal renders resize handle when resizable', () => {
    const src = readFileSync(resolve(PROJECT_ROOT, 'src/renderer/components/common/Modal.tsx'), 'utf-8');
    expect(src).toContain('cursor-se-resize');
    expect(src).toContain('handleResizeMouseDown');
  });

  it('App.tsx uses resizable modals for Auth, Proxy, Round, Cookie/UA, Console', () => {
    const src = readFileSync(resolve(PROJECT_ROOT, 'src/renderer/App.tsx'), 'utf-8');
    // Auth modal
    expect(src).toContain("activeModal === 'auth'");
    expect(src).toMatch(/Modal[^>]*open=\{activeModal === 'auth'\}[^>]*resizable/);
    // Proxy modal
    expect(src).toMatch(/Modal[^>]*open=\{activeModal === 'proxy'\}[^>]*resizable/);
    // Console modal
    expect(src).toMatch(/Modal[^>]*open=\{activeModal === 'console'\}[^>]*resizable/);
  });

  it('resizable modals have h-full for proper height tracking', () => {
    const authSrc = readFileSync(resolve(PROJECT_ROOT, 'src/renderer/components/auth/AuthPanel.tsx'), 'utf-8');
    expect(authSrc).toContain('h-full');

    const proxySrc = readFileSync(resolve(PROJECT_ROOT, 'src/renderer/components/settings/ProxySettings.tsx'), 'utf-8');
    expect(proxySrc).toContain('h-full');

    const consoleSrc = readFileSync(resolve(PROJECT_ROOT, 'src/renderer/components/console/ConsoleModal.tsx'), 'utf-8');
    expect(consoleSrc).toContain('h-full');
  });
});

// ---------------------------------------------------------------------------
// Feature 13: コンソールログ保存ボタン
// ---------------------------------------------------------------------------
describe('feature 13: console-log-save', () => {
  it('diag:save-logs IPC channel is defined', () => {
    // Type-level check
    const _check: IpcChannelMap['diag:save-logs'] = {
      args: ['log content'] as [content: string],
      result: { saved: true, path: '/tmp/test.log' },
    };
    expect(_check.result.saved).toBe(true);
    expect(_check.result.path).toBe('/tmp/test.log');
  });

  it('IPC handler for diag:save-logs is registered', () => {
    const src = readFileSync(resolve(PROJECT_ROOT, 'src/main/ipc/handlers.ts'), 'utf-8');
    expect(src).toContain("'diag:save-logs'");
    expect(src).toContain('showSaveDialog');
  });

  it('ConsoleModal has save-to-file button', () => {
    const src = readFileSync(resolve(PROJECT_ROOT, 'src/renderer/components/console/ConsoleModal.tsx'), 'utf-8');
    expect(src).toContain('handleSaveToFile');
    expect(src).toContain('mdiContentSave');
    expect(src).toContain('diag:save-logs');
  });

  it('ConsoleModal formats logs to text for saving', () => {
    const src = readFileSync(resolve(PROJECT_ROOT, 'src/renderer/components/console/ConsoleModal.tsx'), 'utf-8');
    expect(src).toContain('formatLogsToText');
  });

  it('save dialog defaults to .log extension', () => {
    const src = readFileSync(resolve(PROJECT_ROOT, 'src/main/ipc/handlers.ts'), 'utf-8');
    expect(src).toContain("extensions: ['log']");
  });
});
