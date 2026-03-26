import type { ModalWindowManager } from './modal-window-manager';

let instance: ModalWindowManager | null = null;

export function setModalWindowManager(mgr: ModalWindowManager | null): void {
  instance = mgr;
}

export function getModalWindowManager(): ModalWindowManager {
  if (instance === null) {
    throw new Error('ModalWindowManager not initialized');
  }
  return instance;
}

export function getModalWindowManagerOrNull(): ModalWindowManager | null {
  return instance;
}
