/**
 * Generator for the VBBB DSL (.vbbs) source text from form data.
 * This is the inverse of `parseDslScript` — it takes structured form data
 * and produces a valid DSL script string.
 */

import type { DslFormData } from '../../types/dsl';

/**
 * Generate DSL source text from form data.
 * The output is guaranteed to be parseable by `parseDslScript`.
 */
export function generateDslSource(data: DslFormData): string {
  const lines: string[] = [];

  if (data.scheduleAt.length > 0) {
    lines.push(`SCHEDULE ${data.scheduleAt}`);
  }

  if (data.countdownSec !== undefined && data.countdownSec > 0) {
    lines.push(`COUNTDOWN ${String(data.countdownSec)}`);
  }

  if (lines.length > 0) {
    lines.push('');
  }

  for (let i = 0; i < data.posts.length; i++) {
    const post = data.posts[i];
    if (post === undefined) continue;

    lines.push('POST');

    if (post.name.length > 0) {
      lines.push(`NAME ${post.name}`);
    }

    if (post.mail.length > 0) {
      lines.push(`MAIL ${post.mail}`);
    }

    if (post.repeat > 1) {
      lines.push(`REPEAT ${String(post.repeat)}`);
    }

    if (post.intervalSec !== undefined && post.intervalSec > 0) {
      lines.push(`INTERVAL ${String(post.intervalSec)}`);
    }

    const messageText = post.message.trim();
    if (messageText.includes('\n')) {
      lines.push('MESSAGE');
      lines.push(messageText);
    } else {
      lines.push(`MESSAGE ${messageText}`);
    }

    lines.push('END');

    if (i < data.posts.length - 1) {
      lines.push('');
    }
  }

  return lines.join('\n') + '\n';
}
