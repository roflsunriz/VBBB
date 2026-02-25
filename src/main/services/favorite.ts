/**
 * Favorite (お気に入り) service.
 * Manages the favorites tree, persisted as XML (Favorite.xml).
 * Uses @xmldom/xmldom for XML parsing/serialization.
 */
import { join } from 'node:path';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import type { FavFolder, FavItem, FavNode, FavSeparator, FavTree } from '@shared/favorite';
import { FavItemType } from '@shared/favorite';
import type { BoardType } from '@shared/domain';
import { readFileSafe, atomicWriteFile, ensureDir } from './file-io';
import { createLogger } from '../logger';

const logger = createLogger('favorite');

const FAV_FILE = 'Favorite.xml';

let idCounter = 0;
function generateId(): string {
  idCounter++;
  return `fav-${Date.now().toString(36)}-${String(idCounter)}`;
}

// ---------------------------------------------------------------------------
// XML -> FavTree
// ---------------------------------------------------------------------------

function parseXmlNode(element: Element): FavNode | null {
  const tagName = element.tagName;

  if (tagName === 'folder') {
    const title = element.getAttribute('title') ?? '';
    const expanded = element.getAttribute('expanded') === 'true';
    const children: FavNode[] = [];

    for (let i = 0; i < element.childNodes.length; i++) {
      const child = element.childNodes.item(i);
      if (child !== null && child.nodeType === 1) {
        const parsed = parseXmlNode(child as Element);
        if (parsed !== null) {
          children.push(parsed);
        }
      }
    }

    return {
      id: generateId(),
      kind: 'folder',
      title,
      expanded,
      children,
    } satisfies FavFolder;
  }

  if (tagName === 'separator') {
    return {
      id: generateId(),
      kind: 'separator',
    } satisfies FavSeparator;
  }

  if (tagName === 'favitem') {
    const favtype = element.getAttribute('favtype');
    const boardTypeAttr = element.getAttribute('type') ?? '2ch';
    const url = element.getAttribute('url') ?? '';
    const title = element.getAttribute('title') ?? '';

    if (favtype !== 'board' && favtype !== 'thread') return null;

    return {
      id: generateId(),
      kind: 'item',
      type: favtype === 'board' ? FavItemType.Board : FavItemType.Thread,
      boardType: boardTypeAttr as BoardType,
      url,
      title,
    } satisfies FavItem;
  }

  return null;
}

/**
 * Parse Favorite.xml content into a FavTree.
 */
export function parseFavoriteXml(xmlContent: string): FavTree {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlContent, 'text/xml');
  const root = doc.documentElement;

  if (root === null) {
    return { children: [] };
  }

  const children: FavNode[] = [];
  for (let i = 0; i < root.childNodes.length; i++) {
    const child = root.childNodes.item(i);
    if (child !== null && child.nodeType === 1) {
      const parsed = parseXmlNode(child as Element);
      if (parsed !== null) {
        children.push(parsed);
      }
    }
  }

  return { children };
}

// ---------------------------------------------------------------------------
// FavTree -> XML
// ---------------------------------------------------------------------------

function serializeFavNode(doc: Document, node: FavNode): Element {
  if (node.kind === 'folder') {
    const el = doc.createElement('folder');
    el.setAttribute('title', node.title);
    el.setAttribute('expanded', String(node.expanded));
    for (const child of node.children) {
      el.appendChild(serializeFavNode(doc, child));
    }
    return el;
  }

  if (node.kind === 'separator') {
    return doc.createElement('separator');
  }

  const el = doc.createElement('favitem');
  el.setAttribute('type', node.boardType);
  el.setAttribute('favtype', node.type);
  el.setAttribute('url', node.url);
  el.setAttribute('title', node.title);
  return el;
}

/**
 * Serialize a FavTree into XML string.
 */
export function serializeFavoriteXml(tree: FavTree): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString('<favorite/>', 'text/xml');
  const root = doc.documentElement;

  if (root === null) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<favorite/>';
  }

  for (const child of tree.children) {
    root.appendChild(serializeFavNode(doc, child));
  }

  const serializer = new XMLSerializer();
  const xmlStr = serializer.serializeToString(doc);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${xmlStr}`;
}

// ---------------------------------------------------------------------------
// Tree operations
// ---------------------------------------------------------------------------

function removeNodeById(nodes: readonly FavNode[], nodeId: string): readonly FavNode[] {
  const result: FavNode[] = [];
  for (const node of nodes) {
    if (node.id === nodeId) continue;
    if (node.kind === 'folder') {
      result.push({
        ...node,
        children: removeNodeById(node.children, nodeId),
      });
    } else {
      result.push(node);
    }
  }
  return result;
}

function findNodeById(nodes: readonly FavNode[], nodeId: string): FavNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    if (node.kind === 'folder') {
      const found = findNodeById(node.children, nodeId);
      if (found !== null) return found;
    }
  }
  return null;
}

function insertNode(
  nodes: readonly FavNode[],
  targetId: string,
  newNode: FavNode,
  position: 'before' | 'after' | 'inside',
): readonly FavNode[] {
  if (position === 'inside') {
    return nodes.map((node) => {
      if (node.id === targetId && node.kind === 'folder') {
        return { ...node, children: [...node.children, newNode] };
      }
      if (node.kind === 'folder') {
        return { ...node, children: insertNode(node.children, targetId, newNode, position) };
      }
      return node;
    });
  }

  const result: FavNode[] = [];
  for (const node of nodes) {
    if (node.id === targetId && position === 'before') {
      result.push(newNode);
    }
    if (node.kind === 'folder') {
      result.push({
        ...node,
        children: insertNode(node.children, targetId, newNode, position),
      });
    } else {
      result.push(node);
    }
    if (node.id === targetId && position === 'after') {
      result.push(newNode);
    }
  }
  return result;
}

/**
 * Move a node relative to another node.
 */
export function reorderNode(
  children: readonly FavNode[],
  dragNodeId: string,
  dropNodeId: string,
  position: 'before' | 'after' | 'inside',
): readonly FavNode[] {
  const dragNode = findNodeById(children, dragNodeId);
  if (dragNode === null) return children;
  const removed = removeNodeById(children, dragNodeId);
  return insertNode(removed, dropNodeId, dragNode, position);
}

/**
 * Move a node into a folder (append to children).
 */
export function moveNodeToFolder(
  children: readonly FavNode[],
  nodeId: string,
  folderId: string,
): readonly FavNode[] {
  return reorderNode(children, nodeId, folderId, 'inside');
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

function getFavFilePath(dataDir: string): string {
  return join(dataDir, FAV_FILE);
}

/** In-memory cache */
let cachedTree: FavTree | null = null;

/**
 * Load favorites from file.
 */
export function loadFavorites(dataDir: string): FavTree {
  if (cachedTree !== null) return cachedTree;

  const content = readFileSafe(getFavFilePath(dataDir));
  if (content === null) {
    cachedTree = { children: [] };
    return cachedTree;
  }

  // File is UTF-8 (we write it in UTF-8)
  const xmlStr = content.toString('utf-8');
  cachedTree = parseFavoriteXml(xmlStr);
  return cachedTree;
}

/**
 * Save favorites to file.
 */
export async function saveFavorites(dataDir: string, tree: FavTree): Promise<void> {
  ensureDir(dataDir);
  const xmlStr = serializeFavoriteXml(tree);
  await atomicWriteFile(getFavFilePath(dataDir), xmlStr);
  cachedTree = tree;
  logger.info(`Saved favorites (${String(tree.children.length)} top-level nodes)`);
}

/**
 * Add a node to the root of favorites.
 */
export async function addFavorite(dataDir: string, node: FavNode): Promise<void> {
  const tree = loadFavorites(dataDir);
  const updated: FavTree = {
    children: [...tree.children, node],
  };
  await saveFavorites(dataDir, updated);
}

/**
 * Remove a node from favorites by id.
 */
export async function removeFavorite(dataDir: string, nodeId: string): Promise<void> {
  const tree = loadFavorites(dataDir);
  const updated: FavTree = {
    children: removeNodeById(tree.children, nodeId),
  };
  await saveFavorites(dataDir, updated);
}

/**
 * Add a new folder to the root of favorites.
 */
export async function addFavFolder(dataDir: string, title: string): Promise<void> {
  const tree = loadFavorites(dataDir);
  const folder: FavFolder = {
    id: generateId(),
    kind: 'folder',
    title,
    expanded: true,
    children: [],
  };
  await saveFavorites(dataDir, { children: [...tree.children, folder] });
}

/**
 * Add a separator to the root of favorites.
 */
export async function addFavSeparator(dataDir: string): Promise<void> {
  const tree = loadFavorites(dataDir);
  const sep: FavSeparator = { id: generateId(), kind: 'separator' };
  await saveFavorites(dataDir, { children: [...tree.children, sep] });
}

/**
 * Move a node into a target folder.
 */
export async function moveFavNodeToFolder(
  dataDir: string,
  nodeId: string,
  folderId: string,
): Promise<void> {
  const tree = loadFavorites(dataDir);
  const updated = moveNodeToFolder(tree.children, nodeId, folderId);
  await saveFavorites(dataDir, { children: updated });
}

/**
 * Reorder a node relative to another node.
 */
export async function reorderFavNode(
  dataDir: string,
  dragNodeId: string,
  dropNodeId: string,
  position: 'before' | 'after' | 'inside',
): Promise<void> {
  const tree = loadFavorites(dataDir);
  const updated = reorderNode(tree.children, dragNodeId, dropNodeId, position);
  await saveFavorites(dataDir, { children: updated });
}

/**
 * Clear in-memory cache (for testing).
 */
export function clearFavCache(): void {
  cachedTree = null;
}
