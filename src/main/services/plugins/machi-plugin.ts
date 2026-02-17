/**
 * Machi BBS board plugin.
 * Reuses subject/DAT services and provides Machi-specific posting.
 */
import type { BoardPlugin } from './board-plugin';
import { fetchDat } from '../dat';
import { postMachiResponse } from './machi-post';
import { fetchSubject } from '../subject';

/**
 * Create a Machi BBS plugin instance.
 */
export function createMachiPlugin(): BoardPlugin {
  return {
    fetchSubject,
    fetchDat,
    postResponse: postMachiResponse,
  };
}
