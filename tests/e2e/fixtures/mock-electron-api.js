(() => {
  const STORAGE_KEY = 'vbbb-e2e-state';

  const clone = (value) => JSON.parse(JSON.stringify(value));

  const createDefaultState = () => ({
    menuFetchCount: 0,
    menuVersions: [
      {
        categories: [
          {
            name: 'ニュース',
            boards: [
              {
                title: 'なんでも実況J',
                url: 'https://example.test/livejupiter/',
                bbsId: 'livejupiter',
                serverUrl: 'https://example.test/',
                boardType: '2ch',
              },
            ],
          },
        ],
      },
      {
        categories: [
          {
            name: 'ニュース',
            boards: [
              {
                title: 'なんでも実況J',
                url: 'https://example.test/livejupiter/',
                bbsId: 'livejupiter',
                serverUrl: 'https://example.test/',
                boardType: '2ch',
              },
            ],
          },
          {
            name: '新着カテゴリ',
            boards: [
              {
                title: 'ソフトウェア',
                url: 'https://example.test/software/',
                bbsId: 'software',
                serverUrl: 'https://example.test/',
                boardType: '2ch',
              },
            ],
          },
        ],
      },
    ],
    favorites: { children: [] },
    ngRules: [],
    postHistory: [],
    roundTimer: { enabled: false, intervalMinutes: 15 },
    tabRegistry: {
      boardTabs: [],
      activeBoardTabId: null,
      threadTabs: [],
      activeThreadTabId: null,
    },
    auth: {
      uplift: { loggedIn: false, sessionId: '' },
      be: { loggedIn: false },
      donguri: { status: 'none', message: '', loggedIn: false },
    },
    proxyConfig: {
      readProxy: { enabled: false, address: '', port: 0, userId: '', password: '' },
      writeProxy: { enabled: false, address: '', port: 0, userId: '', password: '' },
    },
    diagLogs: [
      {
        timestamp: '2026-04-20T10:00:00.000Z',
        level: 'info',
        tag: 'shell',
        message: 'Shell ready',
      },
      {
        timestamp: '2026-04-20T10:00:01.000Z',
        level: 'warn',
        tag: 'http',
        message: 'Proxy disabled',
      },
      {
        timestamp: '2026-04-20T10:00:02.000Z',
        level: 'error',
        tag: 'post',
        message: 'Posting failed',
      },
    ],
    savedLogText: '',
    history: [
      {
        boardUrl: 'https://example.test/livejupiter/',
        threadId: '1234567890',
        title: '実況スレ',
        lastVisited: '2026-04-20T09:59:00.000Z',
      },
    ],
    cookies: [
      {
        name: 'sid',
        value: 'cookie-value',
        domain: '.5ch.net',
        path: '/',
        expires: '2026-05-01T00:00:00.000Z',
        secure: true,
        httpOnly: false,
      },
    ],
    userAgent: 'VBBB E2E Test UA',
    bbsMenuUrls: ['https://menu.5ch.io/bbsmenu.html'],
    domain: '5ch.net',
    localSearchResults: [
      {
        kind: 'board',
        boardUrl: 'https://example.test/livejupiter/',
        boardTitle: 'なんでも実況J',
        categoryName: 'ニュース',
      },
      {
        kind: 'subject',
        boardUrl: 'https://example.test/livejupiter/',
        boardTitle: 'なんでも実況J',
        threadId: '1234567890',
        threadTitle: '実況スレ',
        count: 42,
      },
      {
        kind: 'dat',
        boardUrl: 'https://example.test/livejupiter/',
        boardTitle: 'なんでも実況J',
        threadId: '1234567890',
        threadTitle: '実況スレ',
        resNumber: 12,
        matchedLine: 'Playwright の挙動確認',
      },
    ],
    remoteSearchResult: {
      sourceUrl: 'https://ff5ch.syoboi.jp/?q=playwright',
      items: [
        {
          threadTitle: 'Playwright 総合',
          threadUrl: 'https://example.test/test/read.cgi/livejupiter/2345678901/',
          boardTitle: 'なんでも実況J',
          boardUrl: 'https://example.test/livejupiter/',
          responseCount: 128,
          lastUpdated: '2026/04/20 19:00',
          responsesPerHour: 12,
        },
      ],
      totalCount: 1,
      rangeStart: 1,
      rangeEnd: 1,
      nextStart: null,
    },
    updateInfo: {
      latestVersion: '3.6.0',
      hasUpdate: true,
    },
  });

  const readState = () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      const initial = createDefaultState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }

    try {
      return JSON.parse(raw);
    } catch {
      const fallback = createDefaultState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback));
      return fallback;
    }
  };

  const writeState = (nextState) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    return nextState;
  };

  const getState = () => readState();
  const setState = (patch) => writeState({ ...getState(), ...patch });
  const ensureArray = (value) => (Array.isArray(value) ? value : []);

  const listeners = new Map();
  const invocations = [];
  const emit = (channel, ...args) => {
    const callbacks = listeners.get(channel);
    if (!callbacks) return;
    for (const callback of callbacks) {
      callback(...args);
    }
  };

  const removeNode = (nodes, nodeId) => {
    const result = [];
    let removed = null;

    for (const node of nodes) {
      if (node.id === nodeId) {
        removed = node;
        continue;
      }

      if (node.kind === 'folder') {
        const nested = removeNode(node.children || [], nodeId);
        if (nested.removed !== null) {
          removed = nested.removed;
        }
        result.push({ ...node, children: nested.nodes });
      } else {
        result.push(node);
      }
    }

    return { nodes: result, removed };
  };

  const insertNodeRelative = (nodes, dropNodeId, position, nodeToInsert) => {
    const result = [];

    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (node.id === dropNodeId) {
        if (position === 'before') {
          result.push(nodeToInsert, node);
        } else if (position === 'after') {
          result.push(node, nodeToInsert);
        } else if (position === 'inside' && node.kind === 'folder') {
          result.push({ ...node, children: [...(node.children || []), nodeToInsert] });
        } else {
          result.push(node, nodeToInsert);
        }
        return { nodes: result.concat(nodes.slice(index + 1)), inserted: true };
      }

      if (node.kind === 'folder') {
        const nested = insertNodeRelative(node.children || [], dropNodeId, position, nodeToInsert);
        if (nested.inserted) {
          result.push({ ...node, children: nested.nodes });
          return { nodes: result.concat(nodes.slice(index + 1)), inserted: true };
        }
      }

      result.push(node);
    }

    return { nodes: result, inserted: false };
  };

  const moveNodeToFolder = (nodes, nodeId, folderId) => {
    const removed = removeNode(nodes, nodeId);
    if (removed.removed === null) {
      return nodes;
    }

    const inserted = insertNodeRelative(removed.nodes, folderId, 'inside', removed.removed);
    return inserted.inserted ? inserted.nodes : removed.nodes.concat(removed.removed);
  };

  const reorderNode = (nodes, dragNodeId, dropNodeId, position) => {
    const removed = removeNode(nodes, dragNodeId);
    if (removed.removed === null) {
      return nodes;
    }

    const inserted = insertNodeRelative(removed.nodes, dropNodeId, position, removed.removed);
    return inserted.inserted ? inserted.nodes : removed.nodes.concat(removed.removed);
  };

  const getBoardFromMenu = (boardUrl) => {
    const state = getState();
    for (const menu of ensureArray(state.menuVersions)) {
      for (const category of ensureArray(menu.categories)) {
        const board = ensureArray(category.boards).find((item) => item.url === boardUrl);
        if (board) {
          return board;
        }
      }
    }

    return {
      title: boardUrl,
      url: boardUrl,
      bbsId: 'unknown',
      serverUrl: boardUrl,
      boardType: '2ch',
    };
  };

  const updateTabRegistry = (updater) => {
    const currentState = getState();
    const nextRegistry = updater(clone(currentState.tabRegistry));
    writeState({ ...currentState, tabRegistry: nextRegistry });
    emit('view:tab-registry-updated', nextRegistry);
    return nextRegistry;
  };

  window.__VBBB_TEST__ = {
    invocations,
    getState: () => clone(getState()),
    setState: (patch) => clone(setState(clone(patch))),
    emit,
  };

  window.electronApi = {
    invoke: async (channel, ...args) => {
      invocations.push({ channel, args });
      const state = getState();

      switch (channel) {
        case 'bbs:fetch-menu': {
          const menus = ensureArray(state.menuVersions);
          const fetchCount = typeof state.menuFetchCount === 'number' ? state.menuFetchCount : 0;
          const index = Math.min(fetchCount, Math.max(0, menus.length - 1));
          writeState({ ...state, menuFetchCount: fetchCount + 1 });
          return clone(menus[index] || { categories: [] });
        }
        case 'bbs:fetch-subject':
          return {
            threads: [
              {
                title: '実況スレ',
                fileName: '1234567890.dat',
                count: 42,
                ikioi: 120,
                lastModified: '2026-04-20T10:00:00.000Z',
              },
            ],
          };
        case 'bbs:resolve-board-title':
          return 'game/12345';
        case 'bbs:get-thread-index':
          return [];
        case 'bbs:get-kotehan':
          return { name: '', mail: '' };
        case 'bbs:get-samba':
          return { interval: 0, lastPostTime: null };
        case 'fav:load':
          return clone(state.favorites);
        case 'fav:save':
          writeState({ ...state, favorites: clone(args[0]) });
          return null;
        case 'fav:add':
          writeState({
            ...state,
            favorites: {
              children: [
                ...ensureArray(state.favorites && state.favorites.children),
                clone(args[0]),
              ],
            },
          });
          return null;
        case 'fav:remove': {
          const removed = removeNode(
            ensureArray(state.favorites && state.favorites.children),
            args[0],
          );
          writeState({ ...state, favorites: { children: removed.nodes } });
          return null;
        }
        case 'fav:add-folder':
          writeState({
            ...state,
            favorites: {
              children: [
                ...ensureArray(state.favorites && state.favorites.children),
                {
                  id: `folder-${Date.now()}`,
                  kind: 'folder',
                  title: String(args[0]),
                  expanded: true,
                  children: [],
                },
              ],
            },
          });
          return null;
        case 'fav:add-separator':
          writeState({
            ...state,
            favorites: {
              children: [
                ...ensureArray(state.favorites && state.favorites.children),
                { id: `separator-${Date.now()}`, kind: 'separator' },
              ],
            },
          });
          return null;
        case 'fav:move-to-folder':
          writeState({
            ...state,
            favorites: {
              children: moveNodeToFolder(
                ensureArray(state.favorites && state.favorites.children),
                args[0],
                args[1],
              ),
            },
          });
          return null;
        case 'fav:reorder':
          writeState({
            ...state,
            favorites: {
              children: reorderNode(
                ensureArray(state.favorites && state.favorites.children),
                args[0],
                args[1],
                args[2],
              ),
            },
          });
          return null;
        case 'ng:get-rules':
          return clone(state.ngRules);
        case 'ng:add-rule':
          writeState({ ...state, ngRules: [...ensureArray(state.ngRules), clone(args[0])] });
          return null;
        case 'ng:remove-rule':
          writeState({
            ...state,
            ngRules: ensureArray(state.ngRules).filter((rule) => rule.id !== args[0]),
          });
          return null;
        case 'ng:set-rules':
          writeState({ ...state, ngRules: clone(args[0]) });
          return null;
        case 'post:load-history':
          return clone(state.postHistory);
        case 'round:get-timer':
          return clone(state.roundTimer);
        case 'round:add-board':
        case 'round:add-item':
        case 'round:remove-board':
        case 'round:remove-item':
          return null;
        case 'view:get-tab-registry':
          return clone(state.tabRegistry);
        case 'view:create-board-tab': {
          const boardUrl = String(args[0]);
          const board = getBoardFromMenu(boardUrl);
          updateTabRegistry((registry) => {
            const nextTabs = ensureArray(registry.boardTabs).filter((tab) => tab.id !== boardUrl);
            nextTabs.push({ id: boardUrl, title: board.title, boardUrl });
            return { ...registry, boardTabs: nextTabs, activeBoardTabId: boardUrl };
          });
          return boardUrl;
        }
        case 'view:create-thread-tab': {
          const boardUrl = String(args[0]);
          const threadId = String(args[1]);
          const titleArg = String(args[2] || '');
          const tabId = `${boardUrl}:${threadId}`;
          const title = titleArg.length > 0 ? titleArg : '実況スレ';
          updateTabRegistry((registry) => {
            const nextTabs = ensureArray(registry.threadTabs).filter((tab) => tab.id !== tabId);
            nextTabs.push({ id: tabId, title, boardUrl, threadId });
            return { ...registry, threadTabs: nextTabs, activeThreadTabId: tabId };
          });
          return tabId;
        }
        case 'view:close-board-tab':
          updateTabRegistry((registry) => {
            const boardTabs = ensureArray(registry.boardTabs).filter((tab) => tab.id !== args[0]);
            return {
              ...registry,
              boardTabs,
              activeBoardTabId:
                registry.activeBoardTabId === args[0]
                  ? boardTabs[0]
                    ? boardTabs[0].id
                    : null
                  : registry.activeBoardTabId,
            };
          });
          return null;
        case 'view:close-thread-tab':
          updateTabRegistry((registry) => {
            const threadTabs = ensureArray(registry.threadTabs).filter((tab) => tab.id !== args[0]);
            return {
              ...registry,
              threadTabs,
              activeThreadTabId:
                registry.activeThreadTabId === args[0]
                  ? threadTabs[0]
                    ? threadTabs[0].id
                    : null
                  : registry.activeThreadTabId,
            };
          });
          return null;
        case 'view:switch-board-tab':
          updateTabRegistry((registry) => ({ ...registry, activeBoardTabId: String(args[0]) }));
          return null;
        case 'view:switch-thread-tab':
          updateTabRegistry((registry) => ({ ...registry, activeThreadTabId: String(args[0]) }));
          return null;
        case 'view:reorder-board-tabs':
        case 'view:reorder-thread-tabs':
        case 'view:layout-update':
          return null;
        case 'history:load':
          return clone(state.history);
        case 'history:clear':
          writeState({ ...state, history: [] });
          return null;
        case 'search:local-all':
          return clone(state.localSearchResults);
        case 'search:remote':
          return clone(state.remoteSearchResult);
        case 'auth:get-state':
          return clone(state.auth);
        case 'auth:uplift-login':
          writeState({
            ...state,
            auth: {
              ...state.auth,
              uplift: { loggedIn: true, sessionId: 'uplift-session' },
            },
          });
          return { success: true, message: 'UPLIFT にログインしました' };
        case 'auth:uplift-logout':
          writeState({
            ...state,
            auth: {
              ...state.auth,
              uplift: { loggedIn: false, sessionId: '' },
            },
          });
          return null;
        case 'auth:be-login':
          writeState({
            ...state,
            auth: {
              ...state.auth,
              be: { loggedIn: true },
            },
          });
          return { success: true, message: 'Be にログインしました' };
        case 'auth:be-logout':
          writeState({
            ...state,
            auth: {
              ...state.auth,
              be: { loggedIn: false },
            },
          });
          return null;
        case 'proxy:get-config':
          return clone(state.proxyConfig);
        case 'proxy:set-config':
          writeState({ ...state, proxyConfig: clone(args[0]) });
          return null;
        case 'diag:get-logs':
          return clone(state.diagLogs);
        case 'diag:clear-logs':
          writeState({ ...state, diagLogs: [] });
          return null;
        case 'diag:save-logs':
          writeState({ ...state, savedLogText: String(args[0]) });
          return { saved: true, path: 'C:/tmp/vbbb-console.log' };
        case 'cookie:get-all':
          return clone(state.cookies);
        case 'cookie:remove':
          writeState({
            ...state,
            cookies: ensureArray(state.cookies).filter(
              (cookie) => !(cookie.name === args[0] && cookie.domain === args[1]),
            ),
          });
          return null;
        case 'config:get-user-agent':
          return state.userAgent;
        case 'config:set-user-agent':
          writeState({ ...state, userAgent: String(args[0]) });
          return null;
        case 'config:get-bbs-menu-urls':
          return clone(state.bbsMenuUrls);
        case 'config:set-bbs-menu-urls':
          writeState({ ...state, bbsMenuUrls: clone(args[0]) });
          return null;
        case 'config:get-5ch-domain':
          return state.domain;
        case 'config:set-5ch-domain':
          writeState({
            ...state,
            domain: String(args[0])
              .replace(/^https?:\/\//, '')
              .replace(/\/$/, ''),
          });
          return null;
        case 'update:check':
          return clone(state.updateInfo);
        case 'update:download-and-install':
          emit('update:progress', { percent: 25, bytesDownloaded: 25, totalBytes: 100 });
          emit('update:progress', { percent: 100, bytesDownloaded: 100, totalBytes: 100 });
          return null;
        case 'shell:open-external':
        case 'shell:popup-context-menu':
        case 'session:save':
        case 'bbs:update-thread-index':
        case 'view:open-thread-request':
          return null;
        case 'menu:wait-action':
          return new Promise(() => {});
        case 'modal:open':
          return null;
        case 'modal:host-ready':
          return {
            modalType: new URLSearchParams(window.location.search).get('modalType') || 'about',
          };
        case 'modal:close-self':
          return null;
        case 'dsl:save-file':
          return { saved: true, path: 'C:/tmp/script.vbbs' };
        default:
          return null;
      }
    },
    sendSync: () => null,
    on: (channel, callback) => {
      const callbacks = listeners.get(channel) || new Set();
      callbacks.add(callback);
      listeners.set(channel, callbacks);
      return () => {
        callbacks.delete(callback);
      };
    },
  };
})();
