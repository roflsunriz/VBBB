import type { PanelWindowManager } from './panel-window-manager';

let instance: PanelWindowManager | null = null;

export function setPanelWindowManager(mgr: PanelWindowManager | null): void {
  instance = mgr;
}

export function getPanelWindowManager(): PanelWindowManager {
  if (instance === null) {
    throw new Error('PanelWindowManager not initialized');
  }
  return instance;
}
