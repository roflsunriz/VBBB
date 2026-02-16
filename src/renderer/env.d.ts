/// <reference types="vite/client" />

import type { ElectronApi } from '../preload/index';

declare global {
  /** App version injected by Vite define */
  const __APP_VERSION__: string;

  interface Window {
    electronApi: ElectronApi;
  }
}
