import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  detectImageUrls,
  isImageUrl,
  parseExtPreviewIni,
  clearExtPreviewCache,
  clearImageThumbnailCache,
  resolveImageThumbnail,
} from '../../src/main/services/image-preview';
import { detectImageUrls as detectRendererImageUrls } from '../../src/renderer/utils/image-detect';
import { extractImgurAlbumThumbnail, getImgurAlbumId } from '../../src/types/imgur';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  clearExtPreviewCache();
  clearImageThumbnailCache();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('isImageUrl', () => {
  it('detects .jpg URLs', () => {
    expect(isImageUrl('https://example.com/image.jpg')).toBe(true);
  });

  it('detects .png URLs', () => {
    expect(isImageUrl('https://example.com/pic.png')).toBe(true);
  });

  it('detects .gif URLs', () => {
    expect(isImageUrl('https://example.com/anim.gif')).toBe(true);
  });

  it('detects .webp URLs', () => {
    expect(isImageUrl('https://example.com/img.webp')).toBe(true);
  });

  it('detects .jpg:large (Twitter style)', () => {
    expect(isImageUrl('https://pbs.twimg.com/media/abc.jpg:large')).toBe(true);
  });

  it('detects ?format=jpg', () => {
    expect(isImageUrl('https://pbs.twimg.com/media/abc?format=jpg&name=large')).toBe(true);
  });

  it('rejects non-image URLs', () => {
    expect(isImageUrl('https://example.com/page.html')).toBe(false);
  });

  it('rejects invalid URLs', () => {
    expect(isImageUrl('not-a-url')).toBe(false);
  });
});

describe('detectImageUrls', () => {
  it('detects multiple image URLs from body text', () => {
    const body = 'Check this https://example.com/a.jpg and https://example.com/b.png end';
    const images = detectImageUrls(body);
    expect(images).toHaveLength(2);
    expect(images[0]?.url).toBe('https://example.com/a.jpg');
    expect(images[1]?.url).toBe('https://example.com/b.png');
  });

  it('deduplicates same URLs', () => {
    const body = 'https://example.com/a.jpg https://example.com/a.jpg';
    const images = detectImageUrls(body);
    expect(images).toHaveLength(1);
  });

  it('ignores non-image URLs', () => {
    const body = 'See https://example.com/page.html for details';
    const images = detectImageUrls(body);
    expect(images).toHaveLength(0);
  });

  it('strips trailing punctuation', () => {
    const body = 'Image: https://example.com/pic.jpg.';
    const images = detectImageUrls(body);
    expect(images).toHaveLength(1);
    expect(images[0]?.url).toBe('https://example.com/pic.jpg');
  });

  it('normalizes Twitter-style URLs', () => {
    const body = 'https://pbs.twimg.com/media/abc.jpg:large';
    const images = detectImageUrls(body);
    expect(images).toHaveLength(1);
    expect(images[0]?.displayUrl).toBe('https://pbs.twimg.com/media/abc.jpg?name=large');
  });

  it('marks Imgur album pages for main-process thumbnail resolution', () => {
    const images = detectImageUrls('https://imgur.com/a/3Txs1fv');
    expect(images).toEqual([
      {
        url: 'https://imgur.com/a/3Txs1fv',
        displayUrl: 'https://imgur.com/a/3Txs1fv',
        requiresThumbnailResolution: true,
      },
    ]);
  });
});

describe('Imgur album thumbnail resolution', () => {
  it('recognizes /a/ links with query strings and rejects other hosts', () => {
    expect(getImgurAlbumId('https://www.imgur.com/a/3Txs1fv/?foo=bar')).toBe('3Txs1fv');
    expect(getImgurAlbumId('https://example.com/a/3Txs1fv')).toBeNull();
    expect(getImgurAlbumId('https://imgur.com/gallery/3Txs1fv')).toBeNull();
  });

  it('extracts the first direct image using the chMate rule', () => {
    const html = [
      '<meta property="og:image" content="https://i.imgur.com/ZU1CFcJh.jpg">',
      '<script>"https:\\/\\/i.imgur.com\\/idgYxxh.png"</script>',
    ].join('');
    expect(extractImgurAlbumThumbnail(html)).toBe('https://i.imgur.com/ZU1CFcJh.jpg');
  });

  it('detects Imgur albums in the renderer media path', () => {
    expect(detectRendererImageUrls('album https://imgur.com/a/3Txs1fv end')).toEqual([
      {
        url: 'https://imgur.com/a/3Txs1fv',
        displayUrl: 'https://imgur.com/a/3Txs1fv',
        requiresThumbnailResolution: true,
      },
    ]);
  });

  it('fetches the album HTML and caches the resolved thumbnail', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('<meta property="og:image" content="https://i.imgur.com/ZU1CFcJh.jpg">', {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }),
    );
    globalThis.fetch = fetchMock;

    await expect(resolveImageThumbnail('https://imgur.com/a/3Txs1fv')).resolves.toEqual({
      ok: true,
      thumbnailUrl: 'https://i.imgur.com/ZU1CFcJh.jpg',
    });
    await expect(resolveImageThumbnail('http://www.imgur.com/a/3Txs1fv/')).resolves.toEqual({
      ok: true,
      thumbnailUrl: 'https://i.imgur.com/ZU1CFcJh.jpg',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://imgur.com/a/3Txs1fv');
  });

  it('rejects unsupported URLs without making a request', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    globalThis.fetch = fetchMock;

    const result = await resolveImageThumbnail('https://example.com/a/3Txs1fv');
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('parseExtPreviewIni', () => {
  it('parses basic rules', () => {
    const content = 'https://example\\.com/.*\tnop\t0\t0';
    const rules = parseExtPreviewIni(content);
    expect(rules).toHaveLength(1);
    expect(rules[0]?.pattern).toBe('https://example\\.com/.*');
    expect(rules[0]?.command).toBe('nop');
    expect(rules[0]?.confirm).toBe(false);
    expect(rules[0]?.continueProcessing).toBe(false);
  });

  it('parses confirm and continue flags', () => {
    const content = 'https://test\\.com/.*\topen\t1\t1';
    const rules = parseExtPreviewIni(content);
    expect(rules[0]?.confirm).toBe(true);
    expect(rules[0]?.continueProcessing).toBe(true);
  });

  it('skips empty lines and comments', () => {
    const content = '; comment\n\nhttps://test\\.com/.*\tnop\t0\t0';
    const rules = parseExtPreviewIni(content);
    expect(rules).toHaveLength(1);
  });
});
