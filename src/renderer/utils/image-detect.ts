/**
 * Client-side image URL detection for inline thumbnails.
 */
import type { DetectedImage } from '@shared/preview';

const IMAGE_EXTENSIONS = /\.(jpe?g|gif|png|webp|bmp|avif)(?::(?:large|orig|small|thumb|medium))?(?:\?[^\s"'<>]*)?$/i;
const IMAGE_QUERY_FORMAT = /[?&]format=(jpe?g|gif|png|webp)(?:&|$)/i;
const URL_PATTERN = /https?:\/\/[^\s"'<>\]]+/gi;

/** Patterns for rich media sites (F9/F10) */
const IMGUR_ALBUM_PATTERN = /^https?:\/\/(?:i\.)?imgur\.com\/a\/([A-Za-z0-9]+)/;
const IMGUR_SINGLE_PATTERN = /^https?:\/\/imgur\.com\/([A-Za-z0-9]+)$/;
const GYAZO_PATTERN = /^https?:\/\/gyazo\.com\/([A-Fa-f0-9]+)$/;
const YOUTUBE_PATTERN = /^https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/;
const NICONICO_PATTERN = /^https?:\/\/(?:www\.)?nicovideo\.jp\/watch\/([a-z]{2}\d+)/;

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

/**
 * Try to resolve a rich-media URL to a thumbnail image.
 * Returns the thumbnail URL or null if not a recognized pattern.
 */
function resolveRichMediaThumbnail(url: string): string | null {
  // Imgur single image (no extension)
  const imgurSingle = IMGUR_SINGLE_PATTERN.exec(url);
  if (imgurSingle?.[1] !== undefined) {
    return `https://i.imgur.com/${imgurSingle[1]}t.jpg`;
  }
  // Imgur album — use cover thumbnail
  const imgurAlbum = IMGUR_ALBUM_PATTERN.exec(url);
  if (imgurAlbum?.[1] !== undefined) {
    return `https://i.imgur.com/${imgurAlbum[1]}t.jpg`;
  }
  // Gyazo screenshot
  const gyazo = GYAZO_PATTERN.exec(url);
  if (gyazo?.[1] !== undefined) {
    return `https://i.gyazo.com/${gyazo[1]}.jpg`;
  }
  // YouTube — video thumbnail
  const yt = YOUTUBE_PATTERN.exec(url);
  if (yt?.[1] !== undefined) {
    return `https://img.youtube.com/vi/${yt[1]}/mqdefault.jpg`;
  }
  // Niconico — thumbnail API
  const nico = NICONICO_PATTERN.exec(url);
  if (nico?.[1] !== undefined) {
    return `https://nicovideo.cdn.nimg.jp/thumbnails/${nico[1].replace(/^[a-z]{2}/, '')}/${nico[1].replace(/^[a-z]{2}/, '')}.L`;
  }
  return null;
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
 * Also detects rich media (Imgur, Gyazo, YouTube, Niconico) and returns thumbnails.
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
      continue;
    }

    // Rich media sites: resolve to thumbnail
    const thumb = resolveRichMediaThumbnail(cleaned);
    if (thumb !== null) {
      seen.add(cleaned);
      results.push({ url: thumb, displayUrl: cleaned });
    }
  }
  return results;
}
