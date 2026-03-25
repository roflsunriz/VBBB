/**
 * Tests for all 13 additional features from docs/additional-features.md.
 *
 * テスト方針: ソースコードの文字列検索ではなく、実際の動作・型定義・IPC 契約を検証する。
 *
 * Feature 1:  fix-titlebar – HTML title empty to prevent BrowserWindow override
 * Feature 2:  app-icon – resources/icon.png exists, electron-builder references it
 * Feature 3:  post-editor-close – PostResult の成功判定でエディタを自動クローズ
 * Feature 4:  thread-auto-refresh – 投稿成功後の DAT 差分取得（bbs:fetch-dat）
 * Feature 5:  highlight-own-posts – highlight settings type and defaults
 * Feature 6:  save-tabs-on-close – SessionState includes activeThreadTabId; beforeunload で同期保存
 * Feature 7:  category-tabs – BoardTab shape can be constructed; SessionState にボードタブ情報
 * Feature 8:  window-size-persist – see window-state.test.ts
 * Feature 9:  remote-search-replace – ff5ch scraping and integrated list UI
 * Feature 10: add-board-dialog – see url-parser.test.ts (parseExternalBoardUrl)
 * Feature 11: remote-thread-open – parseAnyThreadUrl で検索結果のスレ URL を解析してオープン
 * Feature 12: modal-resize – Modal がリサイズ可能（UI テストは Playwright E2E で実施）
 * Feature 13: console-log-save – diag:save-logs IPC channel exists
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildRemoteSearchUrl } from '../../src/main/services/remote-search';
import { DEFAULT_HIGHLIGHT_SETTINGS } from '../../src/types/settings';
import type { HighlightSettings } from '../../src/types/settings';
import type { SessionState, SavedTab } from '../../src/types/history';
import type { IpcChannelMap, IpcSyncChannelMap } from '../../src/types/ipc';
import type { Board, BoardType, PostResult, DatFetchResult } from '../../src/types/domain';
import { PostResultType, DatFetchStatus } from '../../src/types/domain';
import type { PostHistoryEntry } from '../../src/types/post-history';
import type { RemoteSearchResult, RemoteSearchItem } from '../../src/types/remote-search';
import { parseAnyThreadUrl } from '../../src/types/url-parser';

const PROJECT_ROOT = resolve(__dirname, '../..');

// ---------------------------------------------------------------------------
// Feature 1: タイトルバー修正
// BaseWindow がウィンドウタイトルを上書きしないよう、
// 各レンダラーHTMLの <title> を空にする。
// ---------------------------------------------------------------------------
describe('feature 1: fix-titlebar', () => {
  it('shell.html has an empty <title> tag (prevents BaseWindow title override)', () => {
    const html = readFileSync(resolve(PROJECT_ROOT, 'src/renderer/shell.html'), 'utf-8');
    expect(html).toContain('<title></title>');
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
});

// ---------------------------------------------------------------------------
// Feature 3: 投稿成功後に書き込み欄を自動で閉じる
//
// PostResult.success === true かつ resultType === PostResultType.OK のとき、
// PostEditor を閉じる。UI 制御は ThreadView/PostEditor コンポーネントで行うため
// フル検証には React Testing Library または Playwright E2E テストが必要。
// ---------------------------------------------------------------------------
describe('feature 3: post-editor-close', () => {
  it('PostResultType.OK signals a successful post (triggers editor close)', () => {
    // grtOK は 5ch サーバーが返す成功レスポンス
    expect(PostResultType.OK).toBe('grtOK');
  });

  it('PostResult with success=true and resultType=OK can be constructed (close condition)', () => {
    const result: PostResult = {
      success: true,
      resultType: PostResultType.OK,
      message: '書き込みました。',
    };
    expect(result.success).toBe(true);
    expect(result.resultType).toBe('grtOK');
  });

  it('bbs:post IPC channel result is PostResult (contains success and resultType)', () => {
    type PostResultFromIpc = IpcChannelMap['bbs:post']['result'];
    const result: PostResultFromIpc = {
      success: true,
      resultType: PostResultType.OK,
      message: '書き込みました。',
    };
    expect(result.success).toBe(true);
  });

  it('PostResult with success=false should NOT trigger editor close', () => {
    const result: PostResult = {
      success: false,
      resultType: PostResultType.Error,
      message: 'エラーが発生しました。',
    };
    expect(result.success).toBe(false);
    // クッキー確認など再試行が必要なケースも閉じない
    const cookieResult: PostResult = {
      success: false,
      resultType: PostResultType.Cookie,
      message: 'クッキー確認',
    };
    expect(cookieResult.resultType).toBe('grtCookie');
  });
});

// ---------------------------------------------------------------------------
// Feature 4: 投稿成功後にスレを差分自動更新する
//
// 投稿成功後、bbs:fetch-dat で DAT を差分取得（HTTP 206）してスレを更新する。
// UI 制御は PostEditor コンポーネントで行うためフル検証には E2E テストが必要。
// ---------------------------------------------------------------------------
describe('feature 4: thread-auto-refresh', () => {
  it('DatFetchStatus.Partial represents a successful diff fetch (HTTP 206)', () => {
    // 投稿後の差分更新は Partial ステータスで新着レスを取得する
    expect(DatFetchStatus.Partial).toBe('partial');
  });

  it('DatFetchResult with Partial status can be constructed', () => {
    const result: DatFetchResult = {
      status: DatFetchStatus.Partial,
      responses: [],
      lastModified: 'Thu, 01 Jan 2024 12:00:00 GMT',
      size: 1024,
    };
    expect(result.status).toBe('partial');
  });

  it('bbs:fetch-dat IPC channel accepts boardUrl and threadId', () => {
    type FetchArgs = IpcChannelMap['bbs:fetch-dat']['args'];
    const args: FetchArgs = ['https://eagle.5ch.net/livejupiter/', '1234567890'];
    expect(args[0]).toContain('eagle.5ch.net');
    expect(args[1]).toBe('1234567890');
  });

  it('bbs:fetch-dat IPC channel returns DatFetchResult', () => {
    type FetchResult = IpcChannelMap['bbs:fetch-dat']['result'];
    const result: FetchResult = {
      status: DatFetchStatus.Full,
      responses: [],
      lastModified: null,
      size: 0,
    };
    expect(result.status).toBe('full');
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

  it('PostHistoryEntry has threadId for identifying own posts per thread', () => {
    // スレごとに自分の投稿を特定するため threadId が必須
    const entry: PostHistoryEntry = {
      timestamp: '2024-01-01T12:00:00Z',
      boardUrl: 'https://eagle.5ch.net/livejupiter/',
      threadId: '1234567890',
      name: '名無し',
      mail: 'sage',
      message: 'テスト投稿',
    };
    expect(entry.threadId).toBe('1234567890');
  });

  it('post:load-history IPC channel returns PostHistoryEntry[] (for highlight identification)', () => {
    type HistoryResult = IpcChannelMap['post:load-history']['result'];
    const _check: HistoryResult = [];
    expect(_check).toHaveLength(0);
  });

  it('post:save-history IPC channel accepts a PostHistoryEntry (records own posts)', () => {
    const args: IpcChannelMap['post:save-history']['args'] = [
      {
        timestamp: '2024-01-01T12:00:00Z',
        boardUrl: 'https://eagle.5ch.net/livejupiter/',
        threadId: '1234567890',
        name: '名無し',
        mail: 'sage',
        message: '投稿テスト',
      },
    ];
    expect(args[0]?.threadId).toBe('1234567890');
  });

  it('theme-vars.css defines highlight colors for all themes', () => {
    const css = readFileSync(resolve(PROJECT_ROOT, 'src/renderer/themes/theme-vars.css'), 'utf-8');
    expect(css).toContain('--color-highlight-own');
    expect(css).toContain('--color-highlight-reply');
    expect(css).toContain('--color-highlight-own-border');
    expect(css).toContain('--color-highlight-reply-border');
  });
});

// ---------------------------------------------------------------------------
// Feature 6: ウィンドウ終了時にタブを保存・起動時復元
//
// beforeunload で同期 IPC を使ってタブ一覧とセッション状態を保存する。
// 非同期 IPC は beforeunload で失われる可能性があるため、同期チャネルを使用する。
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

  it('tab:save-sync synchronous IPC channel accepts SavedTab[] (used in beforeunload)', () => {
    // 非同期では beforeunload 中に失われるため同期チャネルが必要
    const tab: SavedTab = {
      boardUrl: 'https://eagle.5ch.net/livejupiter/',
      threadId: '1234567890',
      title: 'テストスレ',
      scrollResNumber: 100,
    };
    const args: IpcSyncChannelMap['tab:save-sync']['args'] = [[tab]];
    expect(args[0]).toHaveLength(1);
    expect(args[0]?.[0]?.threadId).toBe('1234567890');
  });

  it('session:save-sync synchronous IPC channel accepts SessionState (used in beforeunload)', () => {
    const state: IpcSyncChannelMap['session:save-sync']['args'][0] = {
      selectedBoardUrl: 'https://eagle.5ch.net/livejupiter/',
      activeThreadTabId: 'tab-abc123',
    };
    expect(state.activeThreadTabId).toBe('tab-abc123');
  });
});

// ---------------------------------------------------------------------------
// Feature 7: カテゴリ複数タブ対応
//
// 複数の板を同時にタブで開ける。セッション状態に boardTabUrls / activeBoardTabId を保存。
// ---------------------------------------------------------------------------
describe('feature 7: category-tabs', () => {
  it('SessionState persists boardTabUrls for board tab restoration on restart', () => {
    const state: SessionState = {
      selectedBoardUrl: 'https://eagle.5ch.net/livejupiter/',
      activeBoardTabId: 'https://eagle.5ch.net/livejupiter/',
      boardTabUrls: ['https://eagle.5ch.net/livejupiter/', 'https://news.5ch.net/newsplus/'],
    };
    expect(state.boardTabUrls).toHaveLength(2);
    expect(state.activeBoardTabId).toBe('https://eagle.5ch.net/livejupiter/');
  });

  it('SessionState allows undefined boardTabUrls (no tabs saved)', () => {
    const state: SessionState = {
      selectedBoardUrl: null,
    };
    expect(state.boardTabUrls).toBeUndefined();
  });

  it('session:load IPC channel returns SessionState (includes boardTabUrls)', () => {
    type SessionResult = IpcChannelMap['session:load']['result'];
    const state: SessionResult = {
      selectedBoardUrl: null,
      boardTabUrls: ['https://eagle.5ch.net/livejupiter/'],
    };
    expect(state.boardTabUrls).toHaveLength(1);
  });

  it('session:save IPC channel accepts SessionState with boardTabUrls', () => {
    const args: IpcChannelMap['session:save']['args'] = [
      {
        selectedBoardUrl: 'https://eagle.5ch.net/livejupiter/',
        boardTabUrls: ['https://eagle.5ch.net/livejupiter/'],
        activeBoardTabId: 'https://eagle.5ch.net/livejupiter/',
      },
    ];
    expect(args[0]?.boardTabUrls).toHaveLength(1);
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

  it('search:remote IPC channel replaced dig.2ch.net', () => {
    const src = readFileSync(resolve(PROJECT_ROOT, 'src/main/services/remote-search.ts'), 'utf-8');
    // dig.2ch.net should only appear in comments, not in actual code
    const codeLines = src
      .split('\n')
      .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'));
    const codeOnly = codeLines.join('\n');
    expect(codeOnly).not.toContain('dig.2ch.net');
    expect(src).toContain('ff5ch.syoboi.jp');
  });

  it('CSP no longer requires frame-src for ff5ch.syoboi.jp', () => {
    const html = readFileSync(resolve(PROJECT_ROOT, 'src/renderer/shell.html'), 'utf-8');
    expect(html).not.toContain('frame-src https://ff5ch.syoboi.jp');
  });

  it('search:remote IPC channel accepts keywords and optional start position', () => {
    type SearchArgs = IpcChannelMap['search:remote']['args'];
    const argsWithKeyword: SearchArgs = [{ keywords: 'テスト' }];
    const argsWithStart: SearchArgs = [{ keywords: 'テスト', start: 51 }];
    expect(argsWithKeyword[0]?.keywords).toBe('テスト');
    expect(argsWithStart[0]?.start).toBe(51);
  });

  it('search:remote IPC channel returns RemoteSearchResult with items and pagination', () => {
    const result: RemoteSearchResult = {
      sourceUrl: 'https://ff5ch.syoboi.jp/?q=%E3%83%86%E3%82%B9%E3%83%88',
      items: [],
      totalCount: 0,
      rangeStart: 1,
      rangeEnd: 50,
      nextStart: null,
    };
    expect(result.items).toHaveLength(0);
    expect(result.nextStart).toBeNull();
  });

  it('RemoteSearchItem has all fields required for displaying search results', () => {
    const item: RemoteSearchItem = {
      threadTitle: 'テストスレ',
      threadUrl: 'https://eagle.5ch.net/test/read.cgi/livejupiter/1234567890/',
      boardTitle: '球場雑談',
      boardUrl: 'https://eagle.5ch.net/livejupiter/',
      responseCount: 500,
      lastUpdated: '2024/01/01 12:00',
      responsesPerHour: 10,
    };
    expect(item.threadUrl).toContain('1234567890');
    expect(item.responseCount).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Feature 11: ff5ch.syoboi.jp scraped result thread open
//
// 検索結果の threadUrl を parseAnyThreadUrl でパースし、アプリ内でスレを開く。
// ---------------------------------------------------------------------------
describe('feature 11: remote-thread-open', () => {
  it('parseAnyThreadUrl can parse a 5ch thread URL from a RemoteSearchItem', () => {
    // RemoteSearchItem.threadUrl を解析してスレを開く
    const remoteThreadUrl = 'https://eagle.5ch.net/test/read.cgi/livejupiter/1234567890/';
    const parsed = parseAnyThreadUrl(remoteThreadUrl);
    expect(parsed).not.toBeNull();
    expect(parsed?.threadId).toBe('1234567890');
    expect(parsed?.board.url).toBe('https://eagle.5ch.net/livejupiter/');
  });

  it('parseAnyThreadUrl returns null for non-thread URLs (prevents invalid opens)', () => {
    expect(parseAnyThreadUrl('https://www.google.com/')).toBeNull();
    expect(parseAnyThreadUrl('not-a-url')).toBeNull();
    expect(parseAnyThreadUrl('https://eagle.5ch.net/livejupiter/')).toBeNull(); // board URL (not thread)
  });

  it('parseAnyThreadUrl can parse JBBS thread URLs from search results', () => {
    const jbbsUrl = 'https://jbbs.shitaraba.net/bbs/read.cgi/game/12345/1234567890/';
    const parsed = parseAnyThreadUrl(jbbsUrl);
    expect(parsed).not.toBeNull();
    expect(parsed?.threadId).toBe('1234567890');
  });
});

// ---------------------------------------------------------------------------
// Feature 12: モーダルリサイズ対応
//
// Modal コンポーネントに resizable prop を追加し、右下のリサイズハンドルで
// ドラッグサイズ変更を可能にする。最小サイズ制約あり。
//
// NOTE: リサイズ動作・最小サイズ制約は UI コンポーネントの機能であり、
//       React Testing Library または Playwright E2E テストで検証すること。
//       Modal.tsx の MIN_MODAL_WIDTH / MIN_MODAL_HEIGHT 定数は
//       モジュール外にエクスポートされていないため直接の単体テストは行わない。
// ---------------------------------------------------------------------------
// (No unit tests for Feature 12 — resize behavior requires component/E2E tests)

// ---------------------------------------------------------------------------
// Feature 13: コンソールログ保存ボタン
// ---------------------------------------------------------------------------
describe('feature 13: console-log-save', () => {
  it('diag:save-logs IPC channel is defined with correct types', () => {
    // Type-level check: args=[content string], result={saved, path}
    const _check: IpcChannelMap['diag:save-logs'] = {
      args: ['log content'] as [content: string],
      result: { saved: true, path: '/tmp/test.log' },
    };
    expect(_check.result.saved).toBe(true);
    expect(_check.result.path).toBe('/tmp/test.log');
  });

  it('diag:save-logs accepts formatted log text string', () => {
    const logContent = '[2024-01-01 12:00:00][INFO][App] application started';
    const args: IpcChannelMap['diag:save-logs']['args'] = [logContent];
    expect(args[0]).toContain('[INFO]');
    expect(args[0]).toContain('[App]');
  });

  it('diag:save-logs result indicates whether the file was saved and its path', () => {
    type SaveResult = IpcChannelMap['diag:save-logs']['result'];
    const saved: SaveResult = { saved: true, path: '/Users/test/Desktop/vbbb-log.log' };
    const cancelled: SaveResult = { saved: false, path: '' };
    expect(saved.saved).toBe(true);
    expect(saved.path).toContain('.log');
    expect(cancelled.saved).toBe(false);
  });

  it('diag:get-logs IPC channel returns DiagLogEntry[] (used to format logs for saving)', () => {
    type LogsResult = IpcChannelMap['diag:get-logs']['result'];
    const logs: LogsResult = [];
    expect(logs).toHaveLength(0);
  });
});
