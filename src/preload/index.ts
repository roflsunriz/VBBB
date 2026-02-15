import { contextBridge, ipcRenderer } from 'electron';
import type { IpcChannelMap } from '@shared/ipc';

type ChannelKey = keyof IpcChannelMap;

const api = {
  invoke: <K extends ChannelKey>(
    channel: K,
    ...args: IpcChannelMap[K]['args']
  ): Promise<IpcChannelMap[K]['result']> => {
    return ipcRenderer.invoke(channel, ...args) as Promise<IpcChannelMap[K]['result']>;
  },
  on: (channel: string, callback: (...args: unknown[]) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void => {
      callback(...args);
    };
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  },
} as const;

export type ElectronApi = typeof api;

contextBridge.exposeInMainWorld('electronApi', api);
