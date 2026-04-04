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
import type { SavedTab, SessionState } from '@shared/history';
import { createLogger } from './logger';

const logger = createLogger('view-manager');

const BOARD_POOL_SIZE = 2;
const THREAD_POOL_SIZE = 3;

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
  private readonly scrollPositions = new Map<string, number>();
  private readonly kokomadePositions = new Map<string, number>();

  private readonly boardTabPool: WebContentsView[] = [];
  private readonly threadTabPool: WebContentsView[] = [];

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
  // Pre-warmed View Pool
  // ---------------------------------------------------------------------------

  /**
   * Batch-create pre-warmed views at startup so tab creation is near-instant.
   * Each view loads its HTML and mounts React in the background.
   * When a pool view calls view:board-tab-ready / view:thread-tab-ready,
   * it receives null (not yet assigned), entering a waiting state.
   */
  warmPool(): void {
    const boardCount = Math.max(0, BOARD_POOL_SIZE - this.boardTabPool.length);
    const threadCount = Math.max(0, THREAD_POOL_SIZE - this.threadTabPool.length);

    for (let i = 0; i < boardCount; i++) {
      const view = this.createTabView();
      this.loadPage(view, 'board-tab.html');
      this.boardTabPool.push(view);
    }
    for (let i = 0; i < threadCount; i++) {
      const view = this.createTabView();
      this.loadPage(view, 'thread-tab.html');
      this.threadTabPool.push(view);
    }

    this.updatePoolBounds();

    logger.info(`Pool warmed: ${String(boardCount)} board + ${String(threadCount)} thread views`);
  }

  private takeBoardPoolView(): WebContentsView | null {
    const view = this.boardTabPool.shift() ?? null;
    if (view !== null) {
      this.replenishPool('board');
    }
    return view;
  }

  private takeThreadPoolView(): WebContentsView | null {
    const view = this.threadTabPool.shift() ?? null;
    if (view !== null) {
      this.replenishPool('thread');
    }
    return view;
  }

  private replenishPool(type: 'board' | 'thread'): void {
    const pool = type === 'board' ? this.boardTabPool : this.threadTabPool;
    const maxSize = type === 'board' ? BOARD_POOL_SIZE : THREAD_POOL_SIZE;
    const page = type === 'board' ? 'board-tab.html' : 'thread-tab.html';

    if (pool.length >= maxSize) return;
    const view = this.createTabView();
    this.loadPage(view, page);
    pool.push(view);

    if (this.layoutBounds !== null) {
      const bounds =
        type === 'board' ? this.layoutBounds.boardTabArea : this.layoutBounds.threadTabArea;
      view.setBounds({
        x: Math.round(bounds.x),
        y: ViewManager.OFFSCREEN_Y,
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
      });
    }
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

    const poolView = this.takeBoardPoolView();
    if (poolView !== null) {
      this.webContentsToTabId.set(poolView.webContents.id, tabId);
      this.webContentsToTabType.set(poolView.webContents.id, 'board');
      this.boardTabs.set(tabId, { meta, board, view: poolView });

      const initData: BoardTabInitData = { tabId, board };
      poolView.webContents.send('view:board-tab-init', initData);

      this.switchBoardTab(tabId);
      return tabId;
    }

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

    const prevTabId = this.activeBoardTabId;
    this.activeBoardTabId = tabId;

    const entry = this.boardTabs.get(tabId);
    if (entry?.view !== undefined && entry.view !== null) {
      this.window.contentView.addChildView(entry.view);
    }
    this.positionActiveBoardTab();
    if (prevTabId !== null && prevTabId !== tabId) {
      this.hideBoardTab(prevTabId);
    }
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

    const poolView = this.takeThreadPoolView();
    if (poolView !== null) {
      this.webContentsToTabId.set(poolView.webContents.id, tabId);
      this.webContentsToTabType.set(poolView.webContents.id, 'thread');
      this.threadTabs.set(tabId, { meta, view: poolView });

      const scrollTop = this.scrollPositions.get(tabId) ?? 0;
      const kokomade = this.kokomadePositions.get(tabId);
      const initData: ThreadTabInitData = {
        tabId,
        boardUrl,
        threadId,
        title,
        ...(scrollTop > 0 ? { scrollTop } : {}),
        ...(kokomade !== undefined && kokomade >= 0 ? { kokomade } : {}),
      };
      poolView.webContents.send('view:thread-tab-init', initData);

      this.switchThreadTab(tabId);
      return tabId;
    }

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

    const prevTabId = this.activeThreadTabId;
    this.activeThreadTabId = tabId;

    const entry = this.threadTabs.get(tabId);
    if (entry?.view !== undefined && entry.view !== null) {
      this.window.contentView.addChildView(entry.view);
    }
    this.positionActiveThreadTab();
    if (prevTabId !== null && prevTabId !== tabId) {
      this.hideThreadTab(prevTabId);
    }
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
    const scrollTop = this.scrollPositions.get(tabId) ?? 0;
    const kokomade = this.kokomadePositions.get(tabId);
    return {
      tabId,
      boardUrl: entry.meta.boardUrl,
      threadId: entry.meta.threadId,
      title: entry.meta.title,
      ...(scrollTop > 0 ? { scrollTop } : {}),
      ...(kokomade !== undefined && kokomade >= 0 ? { kokomade } : {}),
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
    this.updateAllTabBounds();
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

  sendToBoardTab(tabId: string, channel: string, ...args: unknown[]): void {
    const entry = this.boardTabs.get(tabId);
    entry?.view?.webContents.send(channel, ...args);
  }

  sendToThreadTab(tabId: string, channel: string, ...args: unknown[]): void {
    const entry = this.threadTabs.get(tabId);
    entry?.view?.webContents.send(channel, ...args);
  }

  updateKokomadePosition(tabId: string, kokomade: number): void {
    this.kokomadePositions.set(tabId, kokomade);
  }

  /**
   * Populate kokomade from thread index entries during session restore.
   */
  setKokomadeFromIndex(boardUrl: string, threadId: string, kokomade: number): void {
    const tabId = `${boardUrl}:${threadId}`;
    if (kokomade >= 0) {
      this.kokomadePositions.set(tabId, kokomade);
    }
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  destroyAll(): void {
    for (const view of this.boardTabPool) {
      this.destroyTabView(view);
    }
    this.boardTabPool.length = 0;

    for (const view of this.threadTabPool) {
      this.destroyTabView(view);
    }
    this.threadTabPool.length = 0;

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
      scrollTop: this.scrollPositions.get(e.meta.id) ?? 0,
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

  updateScrollPosition(webContentsId: number, scrollTop: number): void {
    const tabId = this.webContentsToTabId.get(webContentsId);
    if (tabId === undefined) return;
    this.scrollPositions.set(tabId, scrollTop);
  }

  restoreTabs(
    savedTabs: readonly SavedTab[],
    session: SessionState,
    lookupBoard: (url: string) => Board,
    lookupKokomade?: (boardUrl: string, threadId: string) => number,
  ): void {
    const boardUrls = session.boardTabUrls ?? [];
    for (const url of boardUrls) {
      const board = lookupBoard(url);
      this.createBoardTab(board);
    }

    for (const tab of savedTabs) {
      if (lookupKokomade !== undefined) {
        const kokomade = lookupKokomade(tab.boardUrl, tab.threadId);
        if (kokomade >= 0) {
          this.setKokomadeFromIndex(tab.boardUrl, tab.threadId, kokomade);
        }
      }
      const tabId = this.createThreadTab(tab.boardUrl, tab.threadId, tab.title);
      if (tab.scrollTop !== undefined && tab.scrollTop > 0) {
        this.scrollPositions.set(tabId, tab.scrollTop);
      }
    }

    if (session.activeBoardTabId !== undefined) {
      this.switchBoardTab(session.activeBoardTabId);
    }
    if (session.activeThreadTabId !== undefined) {
      this.switchThreadTab(session.activeThreadTabId);
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Offscreen Y offset — keeps the view at correct size but out of sight */
  private static readonly OFFSCREEN_Y = -20000;

  private createTabView(): WebContentsView {
    const view = new WebContentsView({
      webPreferences: {
        preload: PRELOAD_PATH,
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    view.setBackgroundColor('#171717');
    this.window.contentView.addChildView(view);
    view.setBounds({ x: 0, y: ViewManager.OFFSCREEN_Y, width: 0, height: 0 });
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

  private tabViewsHidden = false;

  hideAllTabViews(): void {
    this.tabViewsHidden = true;
    this.moveAllTabsOffscreen();
  }

  showAllTabViews(): void {
    this.tabViewsHidden = false;
    this.positionActiveBoardTab();
    this.positionActiveThreadTab();
  }

  private moveAllTabsOffscreen(): void {
    for (const entry of this.boardTabs.values()) {
      if (entry.view !== null) {
        this.moveOffscreen(entry.view);
      }
    }
    for (const entry of this.threadTabs.values()) {
      if (entry.view !== null) {
        this.moveOffscreen(entry.view);
      }
    }
  }

  private hideBoardTab(tabId: string): void {
    const entry = this.boardTabs.get(tabId);
    if (entry?.view !== undefined && entry.view !== null) {
      this.moveOffscreen(entry.view);
    }
  }

  private hideThreadTab(tabId: string): void {
    const entry = this.threadTabs.get(tabId);
    if (entry?.view !== undefined && entry.view !== null) {
      this.moveOffscreen(entry.view);
    }
  }

  /**
   * Move a view offscreen while preserving its width/height.
   * The view continues to render at the correct size in the background,
   * eliminating first-paint flash when it becomes visible again.
   */
  private moveOffscreen(view: WebContentsView): void {
    const current = view.getBounds();
    if (current.y === ViewManager.OFFSCREEN_Y) return;
    view.setBounds({
      x: current.x,
      y: ViewManager.OFFSCREEN_Y,
      width: current.width,
      height: current.height,
    });
  }

  /**
   * Update bounds for ALL tab views (active + inactive) so they pre-render
   * at the correct size. Inactive tabs are kept offscreen.
   */
  private updateAllTabBounds(): void {
    if (this.layoutBounds === null) return;

    const boardBounds = this.layoutBounds.boardTabArea;
    for (const [id, entry] of this.boardTabs) {
      if (entry.view === null) continue;
      const isActive = id === this.activeBoardTabId && !this.tabViewsHidden;
      entry.view.setBounds({
        x: Math.round(boardBounds.x),
        y: isActive ? Math.round(boardBounds.y) : ViewManager.OFFSCREEN_Y,
        width: Math.round(boardBounds.width),
        height: Math.round(boardBounds.height),
      });
    }

    const threadBounds = this.layoutBounds.threadTabArea;
    for (const [id, entry] of this.threadTabs) {
      if (entry.view === null) continue;
      const isActive = id === this.activeThreadTabId && !this.tabViewsHidden;
      entry.view.setBounds({
        x: Math.round(threadBounds.x),
        y: isActive ? Math.round(threadBounds.y) : ViewManager.OFFSCREEN_Y,
        width: Math.round(threadBounds.width),
        height: Math.round(threadBounds.height),
      });
    }

    this.updatePoolBounds();
  }

  /** Keep pool views at the correct size so they pre-render before assignment. */
  private updatePoolBounds(): void {
    if (this.layoutBounds === null) return;

    const boardBounds = this.layoutBounds.boardTabArea;
    for (const view of this.boardTabPool) {
      view.setBounds({
        x: Math.round(boardBounds.x),
        y: ViewManager.OFFSCREEN_Y,
        width: Math.round(boardBounds.width),
        height: Math.round(boardBounds.height),
      });
    }

    const threadBounds = this.layoutBounds.threadTabArea;
    for (const view of this.threadTabPool) {
      view.setBounds({
        x: Math.round(threadBounds.x),
        y: ViewManager.OFFSCREEN_Y,
        width: Math.round(threadBounds.width),
        height: Math.round(threadBounds.height),
      });
    }
  }

  private positionActiveBoardTab(): void {
    if (this.tabViewsHidden) return;
    if (this.activeBoardTabId === null || this.layoutBounds === null) return;
    const entry = this.boardTabs.get(this.activeBoardTabId);
    if (entry?.view === undefined || entry.view === null) return;
    this.applyBounds(entry.view, this.layoutBounds.boardTabArea);
  }

  private positionActiveThreadTab(): void {
    if (this.tabViewsHidden) return;
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
