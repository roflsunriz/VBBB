import { describe, it, expect } from 'vitest';
import { buildRemoteSearchUrl, parseRemoteSearchHtml } from '../../src/main/services/remote-search';

describe('remote search scraper', () => {
  it('builds ff5ch URL with query only', () => {
    const url = buildRemoteSearchUrl('hello world');
    expect(url).toBe('https://ff5ch.syoboi.jp/?q=hello+world');
  });

  it('builds ff5ch URL with pagination', () => {
    const url = buildRemoteSearchUrl('テスト', 50);
    expect(url).toContain('q=%E3%83%86%E3%82%B9%E3%83%88');
    expect(url).toContain('start=50');
    expect(url).toContain('page=50');
  });

  it('parses list items and summary from ff5ch html', () => {
    const html = `
      <div>1,258 件のスレがあります ( 1 - 50 )</div>
      <ul class="lst-stl-none">
        <li class="bdr-b col-bdr p-tb-8 p-4-8">
          <span>
            <a rel="nofollow" class="thread" href="https://egg.5ch.net/test/read.cgi/scienceplus/1772111748/">【軍事】テスト &amp; 未来 </a><span class="fnt-small col-sec"> (1)</span>
          </span><br />
          <div class="fnt-small col-sec m-tb-4" style="margin-top: 6px">
            <a rel="nofollow" class="col-brd" href="https://egg.5ch.net/scienceplus/">科学ニュース+</a>
            <span>2026-02-26 22:15</span>
            <span class="col-warn">(41 res/h)</span>
          </div>
        </li>
      </ul>
      <section class="bottomPager">
        <a class="ui-btn" href="?q=%E3%83%86%E3%82%B9%E3%83%88&amp;start=50&amp;page=50">次へ &gt; </a>
      </section>
    `;
    const parsed = parseRemoteSearchHtml(html);
    expect(parsed.totalCount).toBe(1258);
    expect(parsed.rangeStart).toBe(1);
    expect(parsed.rangeEnd).toBe(50);
    expect(parsed.nextStart).toBe(50);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]?.threadTitle).toBe('【軍事】テスト & 未来');
    expect(parsed.items[0]?.boardTitle).toBe('科学ニュース+');
    expect(parsed.items[0]?.responseCount).toBe(1);
    expect(parsed.items[0]?.responsesPerHour).toBe(41);
  });
});
