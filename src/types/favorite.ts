/**
 * Favorite (お気に入り) tree type definitions.
 * Represents a hierarchical bookmark structure of boards and threads.
 */
import type { BoardType } from './domain';

/** Type of favorite item */
export const FavItemType = {
  Board: 'board',
  Thread: 'thread',
} as const;
export type FavItemType = (typeof FavItemType)[keyof typeof FavItemType];

/** A single favorite item (board or thread) */
export interface FavItem {
  readonly id: string;
  readonly kind: 'item';
  readonly type: FavItemType;
  readonly boardType: BoardType;
  readonly url: string;
  readonly title: string;
}

/** A folder containing favorite items and sub-folders */
export interface FavFolder {
  readonly id: string;
  readonly kind: 'folder';
  readonly title: string;
  readonly expanded: boolean;
  readonly children: readonly FavNode[];
}

/** A horizontal separator line in the favorite tree */
export interface FavSeparator {
  readonly id: string;
  readonly kind: 'separator';
}

/** A node in the favorite tree */
export type FavNode = FavFolder | FavItem | FavSeparator;

/** Root favorites structure */
export interface FavTree {
  readonly children: readonly FavNode[];
}
