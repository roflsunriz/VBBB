import { fileURLToPath } from 'node:url';
import { expect, test as base, type Page } from '@playwright/test';

export type Invocation = {
  channel: string;
  args: unknown[];
};

type TestHarness = {
  readonly invocations: Invocation[];
  readonly getState: () => Record<string, unknown>;
  readonly setState: (patch: Record<string, unknown>) => Record<string, unknown>;
  readonly emit: (channel: string, ...args: unknown[]) => void;
};

type TestElectronApi = {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  sendSync: (channel: string, ...args: unknown[]) => unknown;
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
};

type RendererFixtures = {
  window: Page;
  openApp: (path: string) => Promise<Page>;
};

declare global {
  interface Window {
    electronApi: TestElectronApi;
    __VBBB_TEST__?: TestHarness;
  }
}

const APP_READY_TIMEOUT = 30_000;
const DEFAULT_BASE_URL = 'http://127.0.0.1:4173';
const MOCK_SCRIPT_PATH = fileURLToPath(new URL('./mock-electron-api.js', import.meta.url));

async function installMockElectronApi(page: Page): Promise<void> {
  await page.addInitScript({ path: MOCK_SCRIPT_PATH });
}

async function gotoApp(page: Page, baseURL: string, path: string): Promise<Page> {
  await installMockElectronApi(page);
  await page.goto(`${baseURL}/${path}`);
  await page.waitForLoadState('domcontentloaded');
  return page;
}

export const test = base.extend<RendererFixtures>({
  openApp: async ({ context, baseURL }, use) => {
    const resolvedBaseURL = baseURL ?? DEFAULT_BASE_URL;
    const openApp = async (path: string): Promise<Page> => {
      const page = await context.newPage();
      await gotoApp(page, resolvedBaseURL, path);
      return page;
    };
    await use(openApp);
  },

  window: async ({ page, baseURL }, use) => {
    const resolvedBaseURL = baseURL ?? DEFAULT_BASE_URL;
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error.stack ?? error.message);
    });

    await gotoApp(page, resolvedBaseURL, 'shell.html');

    try {
      await page.waitForSelector('header', { state: 'visible', timeout: APP_READY_TIMEOUT });
    } catch (error) {
      const bodyText = (
        await page
          .locator('body')
          .innerText()
          .catch(() => '')
      ).slice(0, 500);
      throw new Error(
        [
          error instanceof Error ? error.message : String(error),
          `url=${page.url()}`,
          `title=${await page.title().catch(() => '')}`,
          `body=${bodyText}`,
          `pageErrors=${pageErrors.join('\n---\n')}`,
        ].join('\n'),
      );
    }

    await use(page);
  },
});

export { expect };
