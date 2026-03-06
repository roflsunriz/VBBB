/**
 * Custom Playwright fixture for Electron (VBBB).
 *
 * Provides `electronApp` (ElectronApplication) and `window` (Page) fixtures.
 * Each test gets its own fresh Electron process to ensure full isolation.
 *
 * Prerequisites: run `bun run build` so that `out/main/index.js` exists.
 */
import { test as base, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { join } from 'node:path';

type ElectronFixtures = {
  electronApp: ElectronApplication;
  window: Page;
};

const MAIN_ENTRY = join(process.cwd(), 'out/main/index.js');

/** Time to wait for the initial React tree to mount after load. */
const APP_READY_TIMEOUT = 30_000;

export const test = base.extend<ElectronFixtures>({
  electronApp: async ({}, use) => {
    /**
     * Build an env map without ELECTRON_RENDERER_URL so electron-toolkit/utils
     * treats this as a production launch and loads the built renderer file
     * (out/renderer/index.html) instead of a dev server URL.
     */
    const env: Record<string, string> = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] =>
          entry[1] !== undefined && entry[0] !== 'ELECTRON_RENDERER_URL',
      ),
    );
    const app = await electron.launch({ args: [MAIN_ENTRY], env });
    await use(app);
    await app.close();
  },

  window: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    // Wait for the React app to mount — the toolbar header is rendered on the
    // first paint before any async data (BBS menu) arrives.
    await page.waitForSelector('header', { state: 'visible', timeout: APP_READY_TIMEOUT });
    await use(page);
  },
});

export { expect } from '@playwright/test';
