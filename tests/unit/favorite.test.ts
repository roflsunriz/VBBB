import { describe, it, expect } from 'vitest';
import { parseFavoriteXml, serializeFavoriteXml } from '../../src/main/services/favorite';

describe('parseFavoriteXml', () => {
  it('parses empty favorite root', () => {
    const xml = '<?xml version="1.0" encoding="UTF-8"?><favorite/>';
    const tree = parseFavoriteXml(xml);
    expect(tree.children).toHaveLength(0);
  });

  it('parses favorite items', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<favorite>
  <favitem type="2ch" favtype="board" url="https://news.5ch.net/newsplus/" title="ニュース速報+"/>
  <favitem type="2ch" favtype="thread" url="https://news.5ch.net/test/read.cgi/newsplus/123/" title="テストスレ"/>
</favorite>`;

    const tree = parseFavoriteXml(xml);
    expect(tree.children).toHaveLength(2);

    const first = tree.children[0];
    expect(first).toBeDefined();
    expect(first?.kind).toBe('item');
    if (first?.kind === 'item') {
      expect(first.type).toBe('board');
      expect(first.title).toBe('ニュース速報+');
      expect(first.url).toBe('https://news.5ch.net/newsplus/');
    }

    const second = tree.children[1];
    expect(second).toBeDefined();
    expect(second?.kind).toBe('item');
    if (second?.kind === 'item') {
      expect(second.type).toBe('thread');
      expect(second.title).toBe('テストスレ');
    }
  });

  it('parses nested folders', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<favorite>
  <folder title="ニュース" expanded="true">
    <favitem type="2ch" favtype="board" url="https://news.5ch.net/newsplus/" title="ニュース+"/>
    <folder title="サブフォルダ" expanded="false">
      <favitem type="2ch" favtype="thread" url="https://example.com/" title="サブスレ"/>
    </folder>
  </folder>
</favorite>`;

    const tree = parseFavoriteXml(xml);
    expect(tree.children).toHaveLength(1);

    const folder = tree.children[0];
    expect(folder).toBeDefined();
    expect(folder?.kind).toBe('folder');
    if (folder?.kind === 'folder') {
      expect(folder.title).toBe('ニュース');
      expect(folder.expanded).toBe(true);
      expect(folder.children).toHaveLength(2);

      const subfolder = folder.children[1];
      expect(subfolder?.kind).toBe('folder');
      if (subfolder?.kind === 'folder') {
        expect(subfolder.title).toBe('サブフォルダ');
        expect(subfolder.expanded).toBe(false);
        expect(subfolder.children).toHaveLength(1);
      }
    }
  });
});

describe('serializeFavoriteXml', () => {
  it('serializes empty tree', () => {
    const xml = serializeFavoriteXml({ children: [] });
    expect(xml).toContain('<?xml');
    expect(xml).toContain('<favorite');
  });

  it('serializes items', () => {
    const xml = serializeFavoriteXml({
      children: [
        {
          id: 'test1',
          kind: 'item',
          type: 'board',
          boardType: '2ch',
          url: 'https://news.5ch.net/newsplus/',
          title: 'ニュース+',
        },
      ],
    });
    expect(xml).toContain('favtype="board"');
    expect(xml).toContain('title="ニュース+"');
    expect(xml).toContain('url="https://news.5ch.net/newsplus/"');
  });

  it('serializes folders with children', () => {
    const xml = serializeFavoriteXml({
      children: [
        {
          id: 'folder1',
          kind: 'folder',
          title: 'テスト',
          expanded: true,
          children: [
            {
              id: 'item1',
              kind: 'item',
              type: 'thread',
              boardType: '2ch',
              url: 'https://example.com/',
              title: 'スレッド',
            },
          ],
        },
      ],
    });
    expect(xml).toContain('<folder');
    expect(xml).toContain('title="テスト"');
    expect(xml).toContain('expanded="true"');
    expect(xml).toContain('<favitem');
  });

  it('roundtrips parse -> serialize -> parse', () => {
    const original = `<?xml version="1.0" encoding="UTF-8"?>
<favorite>
  <folder title="Test" expanded="true">
    <favitem type="2ch" favtype="board" url="https://example.com/" title="Board"/>
  </folder>
  <favitem type="2ch" favtype="thread" url="https://example.com/t" title="Thread"/>
</favorite>`;

    const parsed = parseFavoriteXml(original);
    const serialized = serializeFavoriteXml(parsed);
    const reparsed = parseFavoriteXml(serialized);

    expect(reparsed.children).toHaveLength(2);
    expect(reparsed.children[0]?.kind).toBe('folder');
    expect(reparsed.children[1]?.kind).toBe('item');

    if (reparsed.children[0]?.kind === 'folder') {
      expect(reparsed.children[0].title).toBe('Test');
      expect(reparsed.children[0].children).toHaveLength(1);
    }
  });
});
