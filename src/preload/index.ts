import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronApi, IpcChannelMap, IpcSyncChannelMap } from '@shared/ipc';

type ChannelKey = keyof IpcChannelMap;
type SyncChannelKey = keyof IpcSyncChannelMap;

const api: ElectronApi = {
  invoke: <K extends ChannelKey>(
    channel: K,
    ...args: IpcChannelMap[K]['args']
  ): Promise<IpcChannelMap[K]['result']> => {
    return ipcRenderer.invoke(channel, ...args) as Promise<IpcChannelMap[K]['result']>;
  },
  /**
   * Synchronous IPC call — blocks until the main process handler returns.
   * Only use for critical saves during beforeunload where async calls may be lost.
   */
  sendSync: <K extends SyncChannelKey>(
    channel: K,
    ...args: IpcSyncChannelMap[K]['args']
  ): IpcSyncChannelMap[K]['result'] => {
    return ipcRenderer.sendSync(channel, ...args) as IpcSyncChannelMap[K]['result'];
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
};

contextBridge.exposeInMainWorld('electronApi', api);
