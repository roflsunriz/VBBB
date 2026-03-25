/**
 * Global reference to the ViewManager singleton.
 * Separated to avoid circular imports between index.ts and handlers.ts.
 */
import type { ViewManager } from './view-manager';

let viewManager: ViewManager | null = null;

export function setViewManager(vm: ViewManager | null): void {
  viewManager = vm;
}

export function getViewManager(): ViewManager {
  if (viewManager === null) {
    throw new Error('ViewManager not initialized');
  }
  return viewManager;
}
