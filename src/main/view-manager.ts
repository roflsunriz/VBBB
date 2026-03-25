/**
 * ViewManager — manages WebContentsView lifecycle for the multi-process tab architecture.
 *
 * Responsibilities:
 * - Create/destroy/show/hide WebContentsViews for shell, board tabs, and thread tabs
 * - Maintain tab registry (which tabs exist, which is active)
 * - Position active tab views using setBounds based on layout reported by shell
 * - Route push events between views
 */
import { join } from 'node:path';
import { type BaseWindow, WebContentsView } from 'electron';
import { is } from '@electron-toolkit/utils';
import type {
  BoardTabMeta,
  ThreadTabMeta,
  TabRegistryState,
  ContentBounds,
  BoardTabInitData,
  ThreadTabInitData,
  RectBounds,
} from '@shared/view-ipc';
import type { Board } from '@shared/domain';

interface BoardTabEntry {
  readonly meta: BoardTabMeta;
  readonly board: Board;
  view: WebContentsView | null;
}

interface ThreadTabEntry {
  readonly meta: ThreadTabMeta;
  view: WebContentsView | null;
}

const PRELOAD_PATH = join(__dirname, '../preload/index.mjs');

function rendererUrl(page: string): string {
  if (is.dev && process.env['ELECTRON_RENDERER_URL'] !== undefined) {
    return `${process.env['ELECTRON_RENDERER_URL']}/${page}`;
  }
  return '';
}

function rendererFilePath(page: string): string {
  return join(__dirname, `../renderer/${page}`);
}

export class ViewManager {
  private readonly window: BaseWindow;
  private shellView: WebContentsView | null = null;

  private readonly boardTabs = new Map<string, BoardTabEntry>();
  private activeBoardTabId: string | null = null;

  private readonly threadTabs = new Map<string, ThreadTabEntry>();
  private activeThreadTabId: string | null = null;

  private layoutBounds: ContentBounds | null = null;

  private readonly webContentsToTabId = new Map<number, string>();
  private readonly webContentsToTabType = new Map<number, 'board' | 'thread'>();

  constructor(window: BaseWindow) {
    this.window = window;
  }

  // ---------------------------------------------------------------------------
  // Shell
  // ---------------------------------------------------------------------------

  createShellView(): WebContentsView {
    const view = new WebContentsView({
      webPreferences: {
        preload: PRELOAD_PATH,
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this.window.contentView.addChildView(view);
    this.shellView = view;

    const contentSize = this.window.getContentSize();
    view.setBounds({ x: 0, y: 0, width: contentSize[0] ?? 800, height: contentSize[1] ?? 600 });

    this.loadPage(view, 'shell.html');
    return view;
  }

  getShellView(): WebContentsView | null {
    return this.shellView;
  }

  // ---------------------------------------------------------------------------
  // Board Tabs
  // ---------------------------------------------------------------------------

  createBoardTab(board: Board): string {
    const tabId = board.url;

    if (this.boardTabs.has(tabId)) {
      this.switchBoardTab(tabId);
      return tabId;
    }

    const meta: BoardTabMeta = {
      id: tabId,
      title: board.title,
      boardUrl: board.url,
    };

    const view = this.createTabView();
    this.webContentsToTabId.set(view.webContents.id, tabId);
    this.webContentsToTabType.set(view.webContents.id, 'board');

    this.boardTabs.set(tabId, { meta, board, view });
    this.loadPage(view, 'board-tab.html');

    this.switchBoardTab(tabId);
    return tabId;
  }

  closeBoardTab(tabId: string): void {
    const entry = this.boardTabs.get(tabId);
    if (entry === undefined) return;

    this.destroyTabView(entry.view);
    if (entry.view !== null) {
      this.webContentsToTabId.delete(entry.view.webContents.id);
      this.webContentsToTabType.delete(entry.view.webContents.id);
    }
    this.boardTabs.delete(tabId);

    if (this.activeBoardTabId === tabId) {
      const remaining = [...this.boardTabs.keys()];
      this.activeBoardTabId = remaining[0] ?? null;
      this.positionActiveBoardTab();
    }

    this.broadcastTabRegistry();
  }

  switchBoardTab(tabId: string): void {
    if (!this.boardTabs.has(tabId)) return;

    this.hideActiveBoardTab();
    this.activeBoardTabId = tabId;
    this.positionActiveBoardTab();
    this.broadcastTabRegistry();
  }

  reorderBoardTabs(fromIndex: number, toIndex: number): void {
    const entries = [...this.boardTabs.entries()];
    if (fromIndex < 0 || fromIndex >= entries.length) return;
    if (toIndex < 0 || toIndex >= entries.length) return;

    const [moved] = entries.splice(fromIndex, 1);
    if (moved === undefined) return;
    entries.splice(toIndex, 0, moved);

    this.boardTabs.clear();
    for (const [key, value] of entries) {
      this.boardTabs.set(key, value);
    }

    this.broadcastTabRegistry();
  }

  getBoardTabInitData(webContentsId: number): BoardTabInitData | null {
    const tabId = this.webContentsToTabId.get(webContentsId);
    if (tabId === undefined) return null;
    const entry = this.boardTabs.get(tabId);
    if (entry === undefined) return null;
    return { tabId, board: entry.board };
  }

  // ---------------------------------------------------------------------------
  // Thread Tabs
  // ---------------------------------------------------------------------------

  createThreadTab(boardUrl: string, threadId: string, title: string): string {
    const tabId = `${boardUrl}:${threadId}`;

    if (this.threadTabs.has(tabId)) {
      this.switchThreadTab(tabId);
      return tabId;
    }

    const meta: ThreadTabMeta = {
      id: tabId,
      title,
      boardUrl,
      threadId,
    };

    const view = this.createTabView();
    this.webContentsToTabId.set(view.webContents.id, tabId);
    this.webContentsToTabType.set(view.webContents.id, 'thread');

    this.threadTabs.set(tabId, { meta, view });
    this.loadPage(view, 'thread-tab.html');

    this.switchThreadTab(tabId);
    return tabId;
  }

  closeThreadTab(tabId: string): void {
    const entry = this.threadTabs.get(tabId);
    if (entry === undefined) return;

    this.destroyTabView(entry.view);
    if (entry.view !== null) {
      this.webContentsToTabId.delete(entry.view.webContents.id);
      this.webContentsToTabType.delete(entry.view.webContents.id);
    }
    this.threadTabs.delete(tabId);

    if (this.activeThreadTabId === tabId) {
      const remaining = [...this.threadTabs.keys()];
      this.activeThreadTabId = remaining[0] ?? null;
      this.positionActiveThreadTab();
    }

    this.broadcastTabRegistry();
  }

  switchThreadTab(tabId: string): void {
    if (!this.threadTabs.has(tabId)) return;

    this.hideActiveThreadTab();
    this.activeThreadTabId = tabId;
    this.positionActiveThreadTab();
    this.broadcastTabRegistry();
  }

  reorderThreadTabs(fromIndex: number, toIndex: number): void {
    const entries = [...this.threadTabs.entries()];
    if (fromIndex < 0 || fromIndex >= entries.length) return;
    if (toIndex < 0 || toIndex >= entries.length) return;

    const [moved] = entries.splice(fromIndex, 1);
    if (moved === undefined) return;
    entries.splice(toIndex, 0, moved);

    this.threadTabs.clear();
    for (const [key, value] of entries) {
      this.threadTabs.set(key, value);
    }

    this.broadcastTabRegistry();
  }

  getThreadTabInitData(webContentsId: number): ThreadTabInitData | null {
    const tabId = this.webContentsToTabId.get(webContentsId);
    if (tabId === undefined) return null;
    const entry = this.threadTabs.get(tabId);
    if (entry === undefined) return null;
    return {
      tabId,
      boardUrl: entry.meta.boardUrl,
      threadId: entry.meta.threadId,
      title: entry.meta.title,
    };
  }

  updateThreadTabTitle(tabId: string, title: string): void {
    const entry = this.threadTabs.get(tabId);
    if (entry === undefined) return;

    const updatedMeta: ThreadTabMeta = { ...entry.meta, title };
    this.threadTabs.set(tabId, { ...entry, meta: updatedMeta });
    this.broadcastTabRegistry();

    if (this.shellView !== null) {
      this.shellView.webContents.send('view:thread-tab-title-updated', { tabId, title });
    }
  }

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------

  updateLayout(bounds: ContentBounds): void {
    this.layoutBounds = bounds;
    this.positionActiveBoardTab();
    this.positionActiveThreadTab();
  }

  handleWindowResize(): void {
    if (this.shellView === null) return;
    const contentSize = this.window.getContentSize();
    this.shellView.setBounds({
      x: 0,
      y: 0,
      width: contentSize[0] ?? 800,
      height: contentSize[1] ?? 600,
    });
  }

  // ---------------------------------------------------------------------------
  // Tab Registry
  // ---------------------------------------------------------------------------

  getTabRegistry(): TabRegistryState {
    return {
      boardTabs: [...this.boardTabs.values()].map((e) => e.meta),
      activeBoardTabId: this.activeBoardTabId,
      threadTabs: [...this.threadTabs.values()].map((e) => e.meta),
      activeThreadTabId: this.activeThreadTabId,
    };
  }

  getTabType(webContentsId: number): 'board' | 'thread' | undefined {
    return this.webContentsToTabType.get(webContentsId);
  }

  // ---------------------------------------------------------------------------
  // Push broadcasts
  // ---------------------------------------------------------------------------

  broadcastToAllTabs(channel: string, ...args: unknown[]): void {
    for (const entry of this.boardTabs.values()) {
      entry.view?.webContents.send(channel, ...args);
    }
    for (const entry of this.threadTabs.values()) {
      entry.view?.webContents.send(channel, ...args);
    }
  }

  broadcastToShell(channel: string, ...args: unknown[]): void {
    this.shellView?.webContents.send(channel, ...args);
  }

  broadcastToAll(channel: string, ...args: unknown[]): void {
    this.broadcastToShell(channel, ...args);
    this.broadcastToAllTabs(channel, ...args);
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  destroyAll(): void {
    for (const entry of this.boardTabs.values()) {
      this.destroyTabView(entry.view);
    }
    this.boardTabs.clear();

    for (const entry of this.threadTabs.values()) {
      this.destroyTabView(entry.view);
    }
    this.threadTabs.clear();

    if (this.shellView !== null) {
      try {
        if (!this.shellView.webContents.isDestroyed()) {
          this.window.contentView.removeChildView(this.shellView);
          this.shellView.webContents.close();
        }
      } catch {
        // Already destroyed during window close
      }
      this.shellView = null;
    }

    this.webContentsToTabId.clear();
    this.webContentsToTabType.clear();
  }

  /** Collect SavedTab data for persistence (thread tabs) */
  getSavedThreadTabs(): ReadonlyArray<{
    boardUrl: string;
    threadId: string;
    title: string;
    scrollTop: number;
  }> {
    return [...this.threadTabs.values()].map((e) => ({
      boardUrl: e.meta.boardUrl,
      threadId: e.meta.threadId,
      title: e.meta.title,
      scrollTop: 0,
    }));
  }

  /** Collect board tab URLs for session persistence */
  getSavedBoardTabUrls(): readonly string[] {
    return [...this.boardTabs.values()].map((e) => e.meta.boardUrl);
  }

  getActiveBoardTabId(): string | null {
    return this.activeBoardTabId;
  }

  getActiveThreadTabId(): string | null {
    return this.activeThreadTabId;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private createTabView(): WebContentsView {
    const view = new WebContentsView({
      webPreferences: {
        preload: PRELOAD_PATH,
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this.window.contentView.addChildView(view);
    view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    return view;
  }

  private loadPage(view: WebContentsView, page: string): void {
    const url = rendererUrl(page);
    if (url.length > 0) {
      void view.webContents.loadURL(url);
    } else {
      void view.webContents.loadFile(rendererFilePath(page));
    }
  }

  private destroyTabView(view: WebContentsView | null): void {
    if (view === null) return;
    try {
      if (view.webContents.isDestroyed()) return;
      this.window.contentView.removeChildView(view);
      view.webContents.close();
    } catch {
      // View already destroyed by Electron during window close — safe to ignore
    }
  }

  private hideActiveBoardTab(): void {
    if (this.activeBoardTabId === null) return;
    const entry = this.boardTabs.get(this.activeBoardTabId);
    if (entry?.view !== undefined && entry.view !== null) {
      entry.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    }
  }

  private hideActiveThreadTab(): void {
    if (this.activeThreadTabId === null) return;
    const entry = this.threadTabs.get(this.activeThreadTabId);
    if (entry?.view !== undefined && entry.view !== null) {
      entry.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    }
  }

  private positionActiveBoardTab(): void {
    if (this.activeBoardTabId === null || this.layoutBounds === null) return;
    const entry = this.boardTabs.get(this.activeBoardTabId);
    if (entry?.view === undefined || entry.view === null) return;
    this.applyBounds(entry.view, this.layoutBounds.boardTabArea);
  }

  private positionActiveThreadTab(): void {
    if (this.activeThreadTabId === null || this.layoutBounds === null) return;
    const entry = this.threadTabs.get(this.activeThreadTabId);
    if (entry?.view === undefined || entry.view === null) return;
    this.applyBounds(entry.view, this.layoutBounds.threadTabArea);
  }

  private applyBounds(view: WebContentsView, bounds: RectBounds): void {
    view.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    });
  }

  private broadcastTabRegistry(): void {
    const registry = this.getTabRegistry();
    this.broadcastToShell('view:tab-registry-updated', registry);
  }
}
