/**
 * JBBS board plugin.
 * Combines JBBS-specific subject, DAT, and post services into a BoardPlugin.
 */
import type { BoardPlugin } from './board-plugin';
import { fetchJBBSDat } from './jbbs-dat';
import { postJBBSResponse } from './jbbs-post';
import { fetchJBBSSubject } from './jbbs-subject';

/**
 * Create a JBBS board plugin instance.
 */
export function createJBBSPlugin(): BoardPlugin {
  return {
    fetchSubject: fetchJBBSSubject,
    fetchDat: fetchJBBSDat,
    postResponse: postJBBSResponse,
  };
}
