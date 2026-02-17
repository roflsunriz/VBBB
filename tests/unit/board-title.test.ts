import { describe, expect, it } from 'vitest';
import {
  extractBoardTitleFromBoardInfoHtml,
  extractBoardTitleFromBoardTopHtml,
  extractBoardTitleFromMachiMenuHtml,
} from '../../src/main/services/board-title';

describe('extractBoardTitleFromBoardInfoHtml', () => {
  it('extracts title from board_info title tag', () => {
    const html = `
      <html>
        <head><title>掲示板情報 - したらばVALORANT 2代目 - したらば掲示板</title></head>
        <body><h1>掲示板情報（β版） したらばVALORANT 2代目</h1></body>
      </html>
    `;
    expect(extractBoardTitleFromBoardInfoHtml(html)).toBe('したらばVALORANT 2代目');
  });

  it('falls back to h1 when title tag is missing', () => {
    const html = `
      <html>
        <body><h1>掲示板情報（β版） まちBBS会議室</h1></body>
      </html>
    `;
    expect(extractBoardTitleFromBoardInfoHtml(html)).toBe('まちBBS会議室');
  });
});

describe('extractBoardTitleFromMachiMenuHtml', () => {
  it('finds board name by slug from bbsmenu anchors', () => {
    const html = `
      <html><body>
        <a href="https://machi.to/kanto/">関東</a>
        <a href="https://machi.to/tokyo/">東京</a>
        <a href="https://machi.to/tama/">多摩</a>
      </body></html>
    `;
    expect(extractBoardTitleFromMachiMenuHtml(html, 'tokyo')).toBe('東京');
  });

  it('returns null when slug is not found', () => {
    const html = '<html><body><a href="https://machi.to/tokyo/">東京</a></body></html>';
    expect(extractBoardTitleFromMachiMenuHtml(html, 'hokkaidou')).toBeNull();
  });
});

describe('extractBoardTitleFromBoardTopHtml', () => {
  it('strips known suffixes from title', () => {
    const html = `
      <html>
        <head><title>東京 - まちBBS</title></head>
        <body></body>
      </html>
    `;
    expect(extractBoardTitleFromBoardTopHtml(html)).toBe('東京');
  });

  it('falls back to h1 when title is missing', () => {
    const html = '<html><body><h1>したらば総合</h1></body></html>';
    expect(extractBoardTitleFromBoardTopHtml(html)).toBe('したらば総合');
  });
});
