/**
 * BBS menu parsing tests.
 */
import { describe, it, expect } from 'vitest';
import { parseBBSMenuHtml } from '../../src/main/services/bbs-menu';

describe('parseBBSMenuHtml', () => {
  it('parses categories and boards from HTML', () => {
    const html = `
      <b>ニュース</b><br>
      <a href=https://news.5ch.net/newsplus/>ニュース速報+</a><br>
      <a href=https://news.5ch.net/mnewsplus/>芸スポ速報+</a><br>
      <b>生活</b><br>
      <a href=https://cooking.5ch.net/cook/>料理</a><br>
    `;

    const menu = parseBBSMenuHtml(html);
    expect(menu.categories).toHaveLength(2);

    const news = menu.categories[0]!;
    expect(news.name).toBe('ニュース');
    expect(news.boards).toHaveLength(2);
    expect(news.boards[0]?.title).toBe('ニュース速報+');
    expect(news.boards[0]?.url).toContain('5ch.net');
    expect(news.boards[0]?.bbsId).toBe('newsplus');

    const life = menu.categories[1]!;
    expect(life.name).toBe('生活');
    expect(life.boards).toHaveLength(1);
  });

  it('normalizes .2ch.net to .5ch.net', () => {
    const html = `
      <b>テスト</b><br>
      <a href=https://test.2ch.net/board/>Board</a><br>
    `;
    const menu = parseBBSMenuHtml(html);
    expect(menu.categories[0]?.boards[0]?.url).toContain('.5ch.net');
  });

  it('skips ignored categories', () => {
    const html = `
      <b>おすすめ</b><br>
      <a href=https://rec.5ch.net/board/>Board</a><br>
      <b>実用</b><br>
      <a href=https://tools.5ch.net/board2/>Board2</a><br>
    `;
    const menu = parseBBSMenuHtml(html);
    expect(menu.categories).toHaveLength(1);
    expect(menu.categories[0]?.name).toBe('実用');
  });

  it('skips non-5ch/2ch URLs', () => {
    const html = `
      <b>外部</b><br>
      <a href=https://example.com/board/>External</a><br>
      <a href=https://news.5ch.net/test/>5ch Board</a><br>
    `;
    const menu = parseBBSMenuHtml(html);
    expect(menu.categories[0]?.boards).toHaveLength(1);
    expect(menu.categories[0]?.boards[0]?.title).toBe('5ch Board');
  });

  it('handles empty HTML', () => {
    const menu = parseBBSMenuHtml('');
    expect(menu.categories).toHaveLength(0);
  });
});
