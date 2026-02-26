/**
 * Client-side media URL detection for inline thumbnails and video players.
 */
import type { DetectedAudio, DetectedImage, DetectedVideo } from '@shared/preview';

const IMAGE_EXTENSIONS =
  /\.(jpe?g|gif|png|webp|bmp|avif)(?::(?:large|orig|small|thumb|medium))?(?:\?[^\s"'<>]*)?$/i;
const IMAGE_QUERY_FORMAT = /[?&]format=(jpe?g|gif|png|webp)(?:&|$)/i;
const URL_PATTERN = /https?:\/\/[^\s"'<>\]]+/gi;

/** Patterns for rich media sites (F9/F10) */
const IMGUR_SINGLE_PATTERN = /^https?:\/\/imgur\.com\/([A-Za-z0-9]+)$/;
const GYAZO_PATTERN = /^https?:\/\/gyazo\.com\/([A-Fa-f0-9]+)$/;
const YOUTUBE_PATTERN =
  /^https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/;
const NICONICO_PATTERN = /^https?:\/\/(?:www\.)?nicovideo\.jp\/watch\/([a-z]{2}\d+)/;

/**
 * Twitter/X image patterns.
 * pbs.twimg.com/media without extension: fallback to ?format=jpg&name=small.
 */
const TWIMG_PBS_MEDIA_PATTERN = /^https?:\/\/pbs\.twimg\.com\/media\/([A-Za-z0-9_-]+)$/;

/** Video file extension pattern */
const VIDEO_EXTENSIONS = /\.(mp4|webm|mov)(?:\?[^\s"'<>]*)?$/i;
/** video.twimg.com host pattern */
const VIDEO_TWIMG_HOST = /^https?:\/\/video\.twimg\.com\//;
/** Audio file extension pattern */
const AUDIO_EXTENSIONS = /\.(mp3|m4a|aac|wav|ogg|flac|opus)(?:\?[^\s"'<>]*)?$/i;

function isVideoUrl(url: string): boolean {
  if (VIDEO_TWIMG_HOST.test(url)) return true;
  try {
    const urlObj = new URL(url);
    return VIDEO_EXTENSIONS.test(urlObj.pathname);
  } catch {
    return false;
  }
}

function isImageUrl(url: string): boolean {
  if (isVideoUrl(url)) return false;
  try {
    const urlObj = new URL(url);
    if (IMAGE_EXTENSIONS.test(urlObj.pathname)) return true;
    if (IMAGE_QUERY_FORMAT.test(urlObj.search)) return true;
    return false;
  } catch {
    return false;
  }
}

function isAudioUrl(url: string): boolean {
  if (isVideoUrl(url)) return false;
  try {
    const urlObj = new URL(url);
    return AUDIO_EXTENSIONS.test(urlObj.pathname);
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
  // pbs.twimg.com/media without extension — treat as image
  const pbsMedia = TWIMG_PBS_MEDIA_PATTERN.exec(url);
  if (pbsMedia?.[1] !== undefined) {
    return `https://pbs.twimg.com/media/${pbsMedia[1]}?format=jpg&name=small`;
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
 * Video URLs are excluded — use detectVideoUrls() for those.
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
      // url = original page URL ("Original URL as found in the text")
      // displayUrl = thumbnail image URL ("Display-ready URL" for <img src>)
      results.push({ url: cleaned, displayUrl: thumb });
    }
  }
  return results;
}

/**
 * Detect video URLs in body HTML string.
 * Matches direct video files (.mp4, .webm, .mov) and video.twimg.com URLs.
 */
export function detectVideoUrls(bodyHtml: string): DetectedVideo[] {
  const results: DetectedVideo[] = [];
  const seen = new Set<string>();

  URL_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_PATTERN.exec(bodyHtml)) !== null) {
    const url = match[0];
    if (url === undefined) continue;
    const cleaned = url.replace(/[.,;:!?)]+$/, '');
    if (seen.has(cleaned)) continue;

    if (isVideoUrl(cleaned)) {
      seen.add(cleaned);
      results.push({ url: cleaned, originalUrl: cleaned });
    }
  }
  return results;
}

/**
 * Detect audio URLs in body HTML string.
 * Matches direct audio files (.mp3, .m4a, .aac, .wav, .ogg, .flac, .opus).
 */
export function detectAudioUrls(bodyHtml: string): DetectedAudio[] {
  const results: DetectedAudio[] = [];
  const seen = new Set<string>();

  URL_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_PATTERN.exec(bodyHtml)) !== null) {
    const url = match[0];
    if (url === undefined) continue;
    const cleaned = url.replace(/[.,;:!?)]+$/, '');
    if (seen.has(cleaned)) continue;

    if (isAudioUrl(cleaned)) {
      seen.add(cleaned);
      results.push({ url: cleaned, originalUrl: cleaned });
    }
  }
  return results;
}
