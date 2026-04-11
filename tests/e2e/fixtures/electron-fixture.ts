import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export type Invocation = {
  channel: string;
  args: unknown[];
};

type TestElectronApi = {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  sendSync: (channel: string, ...args: unknown[]) => unknown;
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
};

type RendererFixtures = {
  window: Page;
};

declare global {
  interface Window {
    electronApi: TestElectronApi;
    __VBBB_TEST__?: {
      readonly invocations: Invocation[];
    };
  }
}

const APP_READY_TIMEOUT = 30_000;

export const test = base.extend<RendererFixtures>({
  window: async ({ page, baseURL }, use) => {
    await page.addInitScript(() => {
      const invocations: Invocation[] = [];
      const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

      document.title = 'VBBB';

      window.__VBBB_TEST__ = { invocations };
      window.electronApi = {
        invoke: (channel: string, ...args: unknown[]) => {
          const store = window.__VBBB_TEST__?.invocations ?? invocations;
          store.push({ channel, args });

          switch (channel) {
            case 'bbs:fetch-menu':
              return Promise.resolve({ categories: [] });
            case 'fav:load':
              return Promise.resolve({ children: [] });
            case 'ng:get-rules':
              return Promise.resolve([]);
            case 'post:load-history':
              return Promise.resolve([]);
            case 'round:get-timer':
              return Promise.resolve({ enabled: false });
            case 'view:get-tab-registry':
              return Promise.resolve({
                boardTabs: [],
                activeBoardTabId: null,
                threadTabs: [],
                activeThreadTabId: null,
              });
            case 'menu:wait-action':
              return new Promise(() => {
                // Keep the shell long-poll idle for the lifetime of the page.
              });
            default:
              return Promise.resolve(null);
          }
        },
        sendSync: () => null,
        on: (channel: string, callback: (...args: unknown[]) => void) => {
          const set = listeners.get(channel) ?? new Set<(...args: unknown[]) => void>();
          set.add(callback);
          listeners.set(channel, set);
          return () => {
            set.delete(callback);
          };
        },
      } satisfies TestElectronApi;
    });

    const targetUrl = `${baseURL ?? 'http://127.0.0.1:4173'}/shell.html`;
    await page.goto(targetUrl);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('header', { state: 'visible', timeout: APP_READY_TIMEOUT });
    await use(page);
  },
});

export { expect };
