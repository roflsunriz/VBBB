import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatFetchStatus, type DatFetchResult } from '../../src/types/domain';
import { useBBSStore } from '../../src/renderer/stores/bbs-store';
import { useStatusLogStore } from '../../src/renderer/stores/status-log-store';

describe('useBBSStore openThread', () => {
  beforeEach(() => {
    localStorage.clear();
    useBBSStore.setState({
      menu: null,
      menuLoading: false,
      menuError: null,
      boardTabs: [],
      activeBoardTabId: null,
      selectedBoard: null,
      subjects: [],
      threadIndices: [],
      subjectLoading: false,
      subjectError: null,
      tabs: [],
      activeTabId: null,
      kotehan: { name: '', mail: '' },
      sambaInfo: { interval: 0, lastPostTime: null },
      ngRules: [],
      ngEditorOpen: false,
      ngEditorInitialToken: '',
      ngEditorInitialBoardId: '',
      ngEditorInitialThreadId: '',
      favorites: { children: [] },
      favoritesOpen: false,
      externalBoards: [],
      browsingHistory: [],
      postHistory: [],
      highlightSettings: { highlightOwnPosts: true, highlightRepliesToOwn: true },
      statusMessage: 'Ready',
      relatedThreadSimilarity: 80,
      newThreadEditorOpen: false,
      nextThreadDraft: null,
    });
    useStatusLogStore.setState({ entries: [] });
  });

  it('opens a thread with cached responses when fetch returns Error with cache', async () => {
    const invoke = vi.fn((channel: string): Promise<unknown> => {
      if (channel === 'bbs:fetch-dat') {
        const result: DatFetchResult = {
          status: DatFetchStatus.Error,
          responses: [
            {
              number: 1,
              name: '名無し',
              mail: 'sage',
              dateTime: '2024/01/01 00:00:00',
              body: 'cached body',
              title: 'キャッシュ済みスレ',
            },
          ],
          lastModified: null,
          size: 123,
          errorMessage: 'HTTP 503',
        };
        return Promise.resolve(result);
      }
      if (channel === 'bbs:get-thread-index') {
        return Promise.resolve([]);
      }
      if (channel === 'history:add') {
        return Promise.resolve(undefined);
      }
      if (channel === 'tab:save') {
        return Promise.resolve(undefined);
      }
      return Promise.reject(new Error(`unexpected invoke: ${channel}`));
    });

    Object.defineProperty(window, 'electronApi', {
      value: { invoke },
      configurable: true,
      writable: true,
    });

    await useBBSStore
      .getState()
      .openThread('https://jbbs.shitaraba.net/game/12345/', '1234567890', '1234567890');

    const state = useBBSStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]?.responses).toHaveLength(1);
    expect(state.tabs[0]?.title).toBe('キャッシュ済みスレ');
    expect(state.statusMessage).toContain('キャッシュを表示中');
  });
});
