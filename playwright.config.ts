import { defineConfig } from '@playwright/test';

/**
 * Playwright E2E configuration for Electron (VBBB).
 *
 * Prerequisites: `bun run build` must have been executed beforehand
 * to produce `out/main/index.js` that the tests will launch.
 */
export default defineConfig({
  testDir: './tests/e2e',
  /** Electron startup + IPC init can take longer than a browser page load. */
  timeout: 60_000,
  retries: 1,
  /** Keep tests sequential — only one Electron process at a time is safe on CI. */
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'node scripts/e2e-static-server.mjs',
    url: 'http://127.0.0.1:4173/shell.html',
    reuseExistingServer: process.env['CI'] !== 'true',
    timeout: 30_000,
  },
});
