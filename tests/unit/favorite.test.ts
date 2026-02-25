import { describe, it, expect } from 'vitest';
import {
  parseFavoriteXml,
  serializeFavoriteXml,
  reorderNode,
  moveNodeToFolder,
} from '../../src/main/services/favorite';
import type { FavItem, FavFolder, FavNode } from '../../src/types/favorite';

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

  it('parses separator and round-trips to XML', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<favorite>
  <favitem type="2ch" favtype="board" url="https://example.com/" title="Board"/>
  <separator/>
  <favitem type="2ch" favtype="thread" url="https://example.com/t" title="Thread"/>
</favorite>`;
    const tree = parseFavoriteXml(xml);
    expect(tree.children).toHaveLength(3);
    const sep = tree.children[1];
    expect(sep).toBeDefined();
    expect(sep?.kind).toBe('separator');

    const serialized = serializeFavoriteXml(tree);
    expect(serialized).toContain('<separator');
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

// ---------------------------------------------------------------------------
// reorderNode and moveNodeToFolder
// ---------------------------------------------------------------------------

const mkItem = (id: string, title: string): FavItem => ({
  id,
  kind: 'item',
  type: 'board',
  boardType: '2ch',
  url: `https://example.com/${id}`,
  title,
});

const mkFolder = (
  id: string,
  title: string,
  children: readonly FavNode[] = [] as FavNode[],
): FavFolder => ({
  id,
  kind: 'folder',
  title,
  expanded: true,
  children: [...children] as FavNode[],
});

describe('reorderNode', () => {
  it('moves node B before node A in flat list [A, B, C] → [B, A, C]', () => {
    const a = mkItem('a', 'A');
    const b = mkItem('b', 'B');
    const c = mkItem('c', 'C');
    const children = [a, b, c];
    const result = reorderNode(children, 'b', 'a', 'before');
    expect(result.map((n) => n.id)).toEqual(['b', 'a', 'c']);
  });

  it('moves node A after node C → [B, C, A]', () => {
    const a = mkItem('a', 'A');
    const b = mkItem('b', 'B');
    const c = mkItem('c', 'C');
    const children = [a, b, c];
    const result = reorderNode(children, 'a', 'c', 'after');
    expect(result.map((n) => n.id)).toEqual(['b', 'c', 'a']);
  });

  it('moves node A inside folder F', () => {
    const a = mkItem('a', 'A');
    const b = mkItem('b', 'B');
    const f = mkFolder('f', 'Folder', [b]);
    const children = [a, f];
    const result = reorderNode(children, 'a', 'f', 'inside');
    expect(result).toHaveLength(1);
    const folder = result[0];
    expect(folder?.kind).toBe('folder');
    if (folder?.kind === 'folder') {
      expect(folder.children.map((n) => n.id)).toEqual(['b', 'a']);
    }
  });

  it('moves item from inside folder to root (before another item)', () => {
    const a = mkItem('a', 'A');
    const b = mkItem('b', 'B');
    const c = mkItem('c', 'C');
    const f = mkFolder('f', 'Folder', [a]);
    const children = [b, f, c];
    const result = reorderNode(children, 'a', 'b', 'before');
    expect(result.map((n) => n.id)).toEqual(['a', 'b', 'f', 'c']);
    const folder = result[2];
    expect(folder?.kind).toBe('folder');
    if (folder?.kind === 'folder') {
      expect(folder.children).toHaveLength(0);
    }
  });

  it('dragging a node to itself does not change the tree', () => {
    const a = mkItem('a', 'A');
    const b = mkItem('b', 'B');
    const children = [a, b];
    const result = reorderNode(children, 'a', 'a', 'before');
    expect(result.map((n) => n.id)).toEqual(['a', 'b']);
  });
});

describe('moveNodeToFolder', () => {
  it('moves node to folder and removes from root', () => {
    const a = mkItem('a', 'A');
    const b = mkItem('b', 'B');
    const f = mkFolder('f', 'Folder', []);
    const children = [a, f, b];
    const result = moveNodeToFolder(children, 'a', 'f');
    expect(result.map((n) => n.id)).toEqual(['f', 'b']);
    const folder = result[0];
    expect(folder?.kind).toBe('folder');
    if (folder?.kind === 'folder') {
      expect(folder.children.map((n) => n.id)).toEqual(['a']);
    }
  });
});
