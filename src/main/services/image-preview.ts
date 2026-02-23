/**
 * Image preview service.
 * Detects image URLs in thread body text and manages extpreview.ini rules.
 */
import { join } from 'node:path';
import type { DetectedImage, ExtPreviewRule } from '@shared/preview';
import { createLogger } from '../logger';
import { readFileSafe } from './file-io';

const logger = createLogger('image-preview');

/**
 * Image URL patterns.
 * Matches common image formats including Twitter/X style suffixes.
 */
const IMAGE_EXTENSIONS =
  /\.(jpe?g|gif|png|webp|bmp|avif)(?::(?:large|orig|small|thumb|medium))?(?:\?[^\s"'<>]*)?$/i;
const IMAGE_QUERY_FORMAT = /[?&]format=(jpe?g|gif|png|webp)(?:&|$)/i;

/** URL extraction pattern from HTML content */
const URL_PATTERN = /https?:\/\/[^\s"'<>\]]+/gi;

/**
 * Check if a URL is likely an image.
 */
export function isImageUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    if (IMAGE_EXTENSIONS.test(path)) return true;
    if (IMAGE_QUERY_FORMAT.test(urlObj.search)) return true;

    // Known image hosting patterns
    const host = urlObj.hostname.toLowerCase();
    if (host.includes('imgur.com') && !path.includes('/a/') && !path.includes('/gallery/')) {
      return IMAGE_EXTENSIONS.test(path) || /^\/[a-zA-Z0-9]+$/.test(path);
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Detect image URLs in HTML body text.
 */
export function detectImageUrls(bodyHtml: string): DetectedImage[] {
  const results: DetectedImage[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  URL_PATTERN.lastIndex = 0;

  while ((match = URL_PATTERN.exec(bodyHtml)) !== null) {
    const url = match[0];
    if (url === undefined) continue;
    // Remove trailing punctuation
    const cleaned = url.replace(/[.,;:!?)]+$/, '');
    if (seen.has(cleaned)) continue;

    if (isImageUrl(cleaned)) {
      seen.add(cleaned);
      results.push({
        url: cleaned,
        displayUrl: normalizeImageUrl(cleaned),
      });
    }
  }

  return results;
}

/**
 * Normalize image URL for display (clean up Twitter suffixes etc).
 */
function normalizeImageUrl(url: string): string {
  // Twitter/X: convert :large, :orig suffixes to query param
  const twitterSuffix = /\.(jpe?g|gif|png|webp):(large|orig|small|thumb|medium)$/i;
  const twitterMatch = twitterSuffix.exec(url);
  if (twitterMatch !== null && twitterMatch[1] !== undefined && twitterMatch[2] !== undefined) {
    const base = url.substring(0, twitterMatch.index);
    return `${base}.${twitterMatch[1]}?name=${twitterMatch[2]}`;
  }
  return url;
}

/**
 * Parse extpreview.ini content.
 * Format: pattern[TAB]command[TAB]confirm_flag[TAB]continue_flag
 */
export function parseExtPreviewIni(content: string): ExtPreviewRule[] {
  const rules: ExtPreviewRule[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith(';')) continue;

    const fields = trimmed.split('\t');
    const pattern = fields[0] ?? '';
    const command = fields[1] ?? 'nop';
    const confirmStr = fields[2] ?? '0';
    const continueStr = fields[3] ?? '0';

    if (pattern.length === 0) continue;

    rules.push({
      pattern,
      command,
      confirm: confirmStr === '1',
      continueProcessing: continueStr === '1',
    });
  }
  return rules;
}

/** Cached ext preview rules */
let cachedExtRules: readonly ExtPreviewRule[] | null = null;

/**
 * Load extpreview.ini rules.
 */
export function loadExtPreviewRules(dataDir: string): readonly ExtPreviewRule[] {
  if (cachedExtRules !== null) return cachedExtRules;

  const filePath = join(dataDir, 'extpreview.ini');
  const content = readFileSafe(filePath);
  if (content === null) {
    cachedExtRules = [];
    return cachedExtRules;
  }

  cachedExtRules = parseExtPreviewIni(content.toString('utf-8'));
  logger.info(`Loaded ${String(cachedExtRules.length)} extpreview rules`);
  return cachedExtRules;
}

/**
 * Clear cached extpreview rules.
 */
export function clearExtPreviewCache(): void {
  cachedExtRules = null;
}
