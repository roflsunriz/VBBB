/**
 * Menu action types for main → renderer communication via IPC invoke.
 */
export type MenuAction =
  | { readonly type: 'refresh-boards' }
  | { readonly type: 'switch-tab'; readonly tab: string }
  | { readonly type: 'open-modal'; readonly modal: string }
  | { readonly type: 'toggle-ng' }
  | { readonly type: 'set-related-thread-similarity'; readonly value: number };
