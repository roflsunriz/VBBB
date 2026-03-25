/**
 * IPC type definitions for multi-process view architecture.
 * Defines communication between Shell, BoardTab, and ThreadTab WebContentsViews.
 */
import type { Board, BoardType } from './domain';
import type { NgRule } from './ng';
import type { FavTree } from './favorite';
import type { HighlightSettings } from './settings';

// ---------------------------------------------------------------------------
// Tab metadata (lightweight, for shell tab bar rendering)
// ---------------------------------------------------------------------------

export interface BoardTabMeta {
  readonly id: string;
  readonly title: string;
  readonly boardUrl: string;
}

export interface ThreadTabMeta {
  readonly id: string;
  readonly title: string;
  readonly boardUrl: string;
  readonly threadId: string;
}

export interface TabRegistryState {
  readonly boardTabs: readonly BoardTabMeta[];
  readonly activeBoardTabId: string | null;
  readonly threadTabs: readonly ThreadTabMeta[];
  readonly activeThreadTabId: string | null;
}

// ---------------------------------------------------------------------------
// Layout bounds (shell reports content area positions to main)
// ---------------------------------------------------------------------------

export interface RectBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ContentBounds {
  readonly boardTabArea: RectBounds;
  readonly threadTabArea: RectBounds;
}

// ---------------------------------------------------------------------------
// Init data sent to tab views when they become ready
// ---------------------------------------------------------------------------

export interface BoardTabInitData {
  readonly tabId: string;
  readonly board: Board;
}

export interface ThreadTabInitData {
  readonly tabId: string;
  readonly boardUrl: string;
  readonly threadId: string;
  readonly title: string;
  readonly scrollTop?: number | undefined;
}

// ---------------------------------------------------------------------------
// Panel window init data (for BrowserWindow-based panels)
// ---------------------------------------------------------------------------

export type PanelType = 'post-editor' | 'programmatic-post' | 'ng-editor';

export interface PanelWindowInitData {
  readonly panelType: PanelType;
  readonly boardUrl: string;
  readonly threadId: string;
  readonly title: string;
  readonly initialMessage?: string | undefined;
  readonly hasExposedIps?: boolean | undefined;
}

export interface PanelWindowState {
  readonly x?: number | undefined;
  readonly y?: number | undefined;
  readonly width: number;
  readonly height: number;
}

// ---------------------------------------------------------------------------
// Push event payloads (main → renderer via webContents.send)
// ---------------------------------------------------------------------------

export interface ViewPushEventMap {
  'view:tab-registry-updated': TabRegistryState;
  'view:ng-rules-updated': readonly NgRule[];
  'view:favorites-updated': FavTree;
  'view:highlight-settings-updated': HighlightSettings;
  'view:board-tab-init': BoardTabInitData;
  'view:thread-tab-init': ThreadTabInitData;
  'view:refresh-board': undefined;
  'view:refresh-thread': undefined;
  'view:thread-tab-title-updated': { readonly tabId: string; readonly title: string };
  'panel:closed': {
    readonly panelType: PanelType;
    readonly boardUrl: string;
    readonly threadId: string;
  };
}

// ---------------------------------------------------------------------------
// Invoke-style IPC channels for view management (renderer → main)
// These are added to the main IpcChannelMap.
// ---------------------------------------------------------------------------

export interface ViewIpcChannelMap {
  'view:layout-update': {
    args: [bounds: ContentBounds];
    result: void;
  };
  'view:create-board-tab': {
    args: [boardUrl: string, boardTitle: string, boardType: BoardType];
    result: string;
  };
  'view:close-board-tab': {
    args: [tabId: string];
    result: void;
  };
  'view:switch-board-tab': {
    args: [tabId: string];
    result: void;
  };
  'view:create-thread-tab': {
    args: [boardUrl: string, threadId: string, title: string];
    result: string;
  };
  'view:close-thread-tab': {
    args: [tabId: string];
    result: void;
  };
  'view:switch-thread-tab': {
    args: [tabId: string];
    result: void;
  };
  'view:reorder-board-tabs': {
    args: [fromIndex: number, toIndex: number];
    result: void;
  };
  'view:reorder-thread-tabs': {
    args: [fromIndex: number, toIndex: number];
    result: void;
  };
  'view:get-tab-registry': {
    args: [];
    result: TabRegistryState;
  };
  'view:board-tab-ready': {
    args: [];
    result: BoardTabInitData;
  };
  'view:thread-tab-ready': {
    args: [];
    result: ThreadTabInitData;
  };
  'view:open-thread-request': {
    args: [boardUrl: string, threadId: string, title: string];
    result: void;
  };
  'view:update-thread-tab-title': {
    args: [tabId: string, title: string];
    result: void;
  };
  'view:report-scroll-position': {
    args: [scrollTop: number];
    result: void;
  };
  'view:hide-tab-views': {
    args: [];
    result: void;
  };
  'view:show-tab-views': {
    args: [];
    result: void;
  };
  'panel:open': {
    args: [
      panelType: PanelType,
      boardUrl: string,
      threadId: string,
      title: string,
      initialMessage?: string,
      hasExposedIps?: boolean,
    ];
    result: void;
  };
  'panel:close': {
    args: [panelType: PanelType, boardUrl: string, threadId: string];
    result: void;
  };
  'panel:ready': {
    args: [];
    result: PanelWindowInitData;
  };
}
