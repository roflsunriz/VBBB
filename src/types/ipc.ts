/**
 * IPC channel definitions.
 * Maps channel names to their argument/result types.
 * Used by both main process and preload to ensure type safety.
 */
import type { BBSMenu, DatFetchResult, PostParams, PostResult, SubjectFetchResult, ThreadIndex } from './domain';

export interface IpcChannelMap {
  /** Fetch BBS menu (板一覧) */
  'bbs:fetch-menu': {
    args: [];
    result: BBSMenu;
  };
  /** Fetch subject.txt (スレ一覧) */
  'bbs:fetch-subject': {
    args: [boardUrl: string];
    result: SubjectFetchResult;
  };
  /** Fetch DAT (スレ本文) */
  'bbs:fetch-dat': {
    args: [boardUrl: string, threadId: string];
    result: DatFetchResult;
  };
  /** Post a response (投稿) */
  'bbs:post': {
    args: [params: PostParams];
    result: PostResult;
  };
  /** Get local thread index (Folder.idx) */
  'bbs:get-thread-index': {
    args: [boardUrl: string];
    result: readonly ThreadIndex[];
  };
  /** Get app data directory */
  'app:get-data-dir': {
    args: [];
    result: string;
  };
}

/** All IPC channel names */
export type IpcChannel = keyof IpcChannelMap;
