/**
 * Client-side image URL detection for inline thumbnails.
 */
import type { DetectedImage } from '@shared/preview';

const IMAGE_EXTENSIONS = /\.(jpe?g|gif|png|webp|bmp|avif)(?::(?:large|orig|small|thumb|medium))?(?:\?[^\s"'<>]*)?$/i;
const IMAGE_QUERY_FORMAT = /[?&]format=(jpe?g|gif|png|webp)(?:&|$)/i;
const URL_PATTERN = /https?:\/\/[^\s"'<>\]]+/gi;

function isImageUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    if (IMAGE_EXTENSIONS.test(urlObj.pathname)) return true;
    if (IMAGE_QUERY_FORMAT.test(urlObj.search)) return true;
    return false;
  } catch {
    return false;
  }
}

function normalizeImageUrl(url: string): string {
  const twitterSuffix = /\.(jpe?g|gif|png|webp):(large|orig|small|thumb|medium)$/i;
  const twitterMatch = twitterSuffix.exec(url);
  if (twitterMatch !== null && twitterMatch[1] !== undefined && twitterMatch[2] !== undefined) {
    const base = url.substring(0, twitterMatch.index);
    return `${base}.${twitterMatch[1]}?name=${twitterMatch[2]}`;
  }
  return url;
}

/**
 * Detect image URLs in body HTML string.
 */
export function detectImageUrls(bodyHtml: string): DetectedImage[] {
  const results: DetectedImage[] = [];
  const seen = new Set<string>();

  URL_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_PATTERN.exec(bodyHtml)) !== null) {
    const url = match[0];
    if (url === undefined) continue;
    const cleaned = url.replace(/[.,;:!?)]+$/, '');
    if (seen.has(cleaned)) continue;
    if (isImageUrl(cleaned)) {
      seen.add(cleaned);
      results.push({ url: cleaned, displayUrl: normalizeImageUrl(cleaned) });
    }
  }
  return results;
}
