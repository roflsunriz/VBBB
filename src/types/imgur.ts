const IMGUR_ALBUM_PATH_PATTERN = /^\/a\/([A-Za-z0-9]{5,16})\/?$/;
const IMGUR_DIRECT_IMAGE_PATTERN = /https:\/\/i\.imgur\.com\/[A-Za-z0-9]+\.(?:jpe?g|gif|png|webp)/i;

/** Return the album id only for a public imgur.com /a/ URL. */
export function getImgurAlbumId(value: string): string | null {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (hostname !== 'imgur.com' && hostname !== 'www.imgur.com') return null;
    return IMGUR_ALBUM_PATH_PATTERN.exec(url.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Extract the first direct image from an Imgur album page.
 * chMate 0.8.10.241/243 uses the same first-match strategy.
 */
export function extractImgurAlbumThumbnail(html: string): string | null {
  const normalized = html.replaceAll('\\/', '/');
  return IMGUR_DIRECT_IMAGE_PATTERN.exec(normalized)?.[0] ?? null;
}
