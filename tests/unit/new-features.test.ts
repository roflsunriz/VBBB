/**
 * Tests for newly implemented features (F1–F6, B1, NG機能強化).
 * Verifies that features are correctly wired up by checking source code content and type definitions.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(__dirname, '../..');

// ---------------------------------------------------------------------------
// F4: 次スレ作成支援ボタンの表示条件撤廃
// ---------------------------------------------------------------------------
describe('F4: 次スレ作成支援ボタンの表示条件撤廃', () => {
  const threadViewPath = resolve(
    PROJECT_ROOT,
    'src/renderer/components/thread-view/ThreadView.tsx',
  );

  it('ThreadView.tsx does not contain NEXT_THREAD_BUTTON_THRESHOLD (import removed)', () => {
    const src = readFileSync(threadViewPath, 'utf-8');
    expect(src).not.toContain('NEXT_THREAD_BUTTON_THRESHOLD');
  });

  it('ThreadView.tsx contains handleSearchNextThread (button handler)', () => {
    const src = readFileSync(threadViewPath, 'utf-8');
    expect(src).toContain('handleSearchNextThread');
  });

  it('ThreadView.tsx contains handleCreateNextThread (button handler)', () => {
    const src = readFileSync(threadViewPath, 'utf-8');
    expect(src).toContain('handleCreateNextThread');
  });
});

// ---------------------------------------------------------------------------
// F2: ★クリックでお気に入りトグル
// ---------------------------------------------------------------------------
describe('F2: ★クリックでお気に入りトグル', () => {
  const threadListPath = resolve(
    PROJECT_ROOT,
    'src/renderer/components/thread-list/ThreadList.tsx',
  );

  it('ThreadList.tsx contains handleToggleFavorite (renamed handler)', () => {
    const src = readFileSync(threadListPath, 'utf-8');
    expect(src).toContain('handleToggleFavorite');
  });

  it('ThreadList.tsx does not contain handleAddFavorite as function declaration (renamed)', () => {
    const src = readFileSync(threadListPath, 'utf-8');
    expect(src).not.toMatch(/function\s+handleAddFavorite|const\s+handleAddFavorite\s*=/);
  });

  it('ThreadList.tsx contains removeFavorite (imported for toggle)', () => {
    const src = readFileSync(threadListPath, 'utf-8');
    expect(src).toContain('removeFavorite');
  });
});

// ---------------------------------------------------------------------------
// F6: 外部ブラウザで開く
// ---------------------------------------------------------------------------
describe('F6: 外部ブラウザで開く', () => {
  const threadViewPath = resolve(
    PROJECT_ROOT,
    'src/renderer/components/thread-view/ThreadView.tsx',
  );

  it('ThreadView.tsx contains threadPageUrl (in tabCtxMenu state)', () => {
    const src = readFileSync(threadViewPath, 'utf-8');
    expect(src).toContain('threadPageUrl');
  });

  it('ThreadView.tsx contains 外部ブラウザで開く (menu item text)', () => {
    const src = readFileSync(threadViewPath, 'utf-8');
    expect(src).toContain('外部ブラウザで開く');
  });

  it('ThreadView.tsx contains shell:open-external (IPC call)', () => {
    const src = readFileSync(threadViewPath, 'utf-8');
    expect(src).toContain('shell:open-external');
  });
});

// ---------------------------------------------------------------------------
// F5: ボタン群の移動
// ---------------------------------------------------------------------------
describe('F5: ボタン群の移動', () => {
  const threadViewPath = resolve(
    PROJECT_ROOT,
    'src/renderer/components/thread-view/ThreadView.tsx',
  );

  it('ThreadView.tsx contains actionButtons !== null (always shown in separate row)', () => {
    const src = readFileSync(threadViewPath, 'utf-8');
    expect(src).toContain('actionButtons !== null');
  });

  it('ThreadView.tsx renders actionButtons', () => {
    const src = readFileSync(threadViewPath, 'utf-8');
    expect(src).toContain('{actionButtons}');
  });
});

// ---------------------------------------------------------------------------
// F1+F3: お気に入り整理機能
// ---------------------------------------------------------------------------
describe('F1+F3: お気に入り整理機能', () => {
  const favoriteTreePath = resolve(
    PROJECT_ROOT,
    'src/renderer/components/favorite-tree/FavoriteTree.tsx',
  );
  const favoriteTypesPath = resolve(PROJECT_ROOT, 'src/types/favorite.ts');
  const ipcPath = resolve(PROJECT_ROOT, 'src/types/ipc.ts');
  const bbsStorePath = resolve(PROJECT_ROOT, 'src/renderer/stores/bbs-store.ts');

  it('FavoriteTree.tsx contains FavSeparatorRow (new component)', () => {
    const src = readFileSync(favoriteTreePath, 'utf-8');
    expect(src).toContain('FavSeparatorRow');
  });

  it('FavoriteTree.tsx contains handleDragStart and handleDrop (DnD handlers)', () => {
    const src = readFileSync(favoriteTreePath, 'utf-8');
    expect(src).toContain('handleDragStart');
    expect(src).toContain('handleDrop');
  });

  it('FavoriteTree.tsx contains handleAddFolder and handleAddSeparator (create actions)', () => {
    const src = readFileSync(favoriteTreePath, 'utf-8');
    expect(src).toContain('handleAddFolder');
    expect(src).toContain('handleAddSeparator');
  });

  it('FavoriteTree.tsx contains フォルダに移動 (context menu text)', () => {
    const src = readFileSync(favoriteTreePath, 'utf-8');
    expect(src).toContain('フォルダに移動');
  });

  it('FavoriteTree.tsx contains mdiFolderPlus (icon import)', () => {
    const src = readFileSync(favoriteTreePath, 'utf-8');
    expect(src).toContain('mdiFolderPlus');
  });

  it('favorite.ts (types) contains FavSeparator (new type)', () => {
    const src = readFileSync(favoriteTypesPath, 'utf-8');
    expect(src).toContain('FavSeparator');
  });

  it('ipc.ts contains fav:add-folder, fav:add-separator, fav:reorder (new IPC channels)', () => {
    const src = readFileSync(ipcPath, 'utf-8');
    expect(src).toContain('fav:add-folder');
    expect(src).toContain('fav:add-separator');
    expect(src).toContain('fav:reorder');
  });

  it('bbs-store.ts contains addFavFolder, addFavSeparator, reorderFavorite (new store actions)', () => {
    const src = readFileSync(bbsStorePath, 'utf-8');
    expect(src).toContain('addFavFolder');
    expect(src).toContain('addFavSeparator');
    expect(src).toContain('reorderFavorite');
  });
});

// ---------------------------------------------------------------------------
// B1: 巡回バグ修正
// ---------------------------------------------------------------------------
describe('B1: 巡回バグ修正', () => {
  const handlersPath = resolve(PROJECT_ROOT, 'src/main/ipc/handlers.ts');
  const appPath = resolve(PROJECT_ROOT, 'src/renderer/App.tsx');

  it('handlers.ts contains startRoundTimer (timer registration)', () => {
    const src = readFileSync(handlersPath, 'utf-8');
    expect(src).toContain('startRoundTimer');
  });

  it('handlers.ts contains round:completed (push event)', () => {
    const src = readFileSync(handlersPath, 'utf-8');
    expect(src).toContain('round:completed');
  });

  it('handlers.ts contains executeRound (extracted round function)', () => {
    const src = readFileSync(handlersPath, 'utf-8');
    expect(src).toContain('executeRound');
  });

  it('App.tsx contains round:completed (event subscription)', () => {
    const src = readFileSync(appPath, 'utf-8');
    expect(src).toContain('round:completed');
  });

  it('App.tsx contains refreshSelectedBoard (auto-refresh on round complete)', () => {
    const src = readFileSync(appPath, 'utf-8');
    expect(src).toContain('refreshSelectedBoard');
  });
});

// ---------------------------------------------------------------------------
// NG機能強化
// ---------------------------------------------------------------------------
describe('NG機能強化', () => {
  const ngPath = resolve(PROJECT_ROOT, 'src/types/ng.ts');
  const ngFieldExtractorPath = resolve(PROJECT_ROOT, 'src/types/ng-field-extractor.ts');
  const ngMatcherPath = resolve(PROJECT_ROOT, 'src/types/ng-matcher.ts');
  const zodSchemasPath = resolve(PROJECT_ROOT, 'src/types/zod-schemas.ts');
  const ngEditorPath = resolve(PROJECT_ROOT, 'src/renderer/components/ng-editor/NgEditor.tsx');
  const ngAbonPath = resolve(PROJECT_ROOT, 'src/main/services/ng-abon.ts');
  const threadViewPath = resolve(
    PROJECT_ROOT,
    'src/renderer/components/thread-view/ThreadView.tsx',
  );

  it('ng.ts contains NgStringCondition, NgNumericCondition, NgTimeCondition (new types)', () => {
    const src = readFileSync(ngPath, 'utf-8');
    expect(src).toContain('NgStringCondition');
    expect(src).toContain('NgNumericCondition');
    expect(src).toContain('NgTimeCondition');
  });

  it('ng.ts contains NgCondition (union type)', () => {
    const src = readFileSync(ngPath, 'utf-8');
    expect(src).toContain('NgCondition');
  });

  it('ng-field-extractor.ts exists and contains extractStringFields and parseDateTimeField', () => {
    expect(existsSync(ngFieldExtractorPath)).toBe(true);
    const src = readFileSync(ngFieldExtractorPath, 'utf-8');
    expect(src).toContain('extractStringFields');
    expect(src).toContain('parseDateTimeField');
  });

  it('ng-matcher.ts exists and contains matchStringCondition, matchNumericCondition, matchTimeCondition', () => {
    expect(existsSync(ngMatcherPath)).toBe(true);
    const src = readFileSync(ngMatcherPath, 'utf-8');
    expect(src).toContain('matchStringCondition');
    expect(src).toContain('matchNumericCondition');
    expect(src).toContain('matchTimeCondition');
  });

  it('zod-schemas.ts contains NgRuleSchema and NgRulesFileSchema', () => {
    const src = readFileSync(zodSchemasPath, 'utf-8');
    expect(src).toContain('NgRuleSchema');
    expect(src).toContain('NgRulesFileSchema');
  });

  it('NgEditor.tsx contains StringConditionForm, NumericConditionForm, TimeConditionForm (3 tab forms)', () => {
    const src = readFileSync(ngEditorPath, 'utf-8');
    expect(src).toContain('StringConditionForm');
    expect(src).toContain('NumericConditionForm');
    expect(src).toContain('TimeConditionForm');
  });

  it('NgEditor.tsx contains 文字列, 数値, 時間 (tab labels)', () => {
    const src = readFileSync(ngEditorPath, 'utf-8');
    expect(src).toContain('文字列');
    expect(src).toContain('数値');
    expect(src).toContain('時間');
  });

  it('ng-abon.ts contains ng-rules.json (new storage format)', () => {
    const src = readFileSync(ngAbonPath, 'utf-8');
    expect(src).toContain('ng-rules.json');
  });

  it('ng-abon.ts contains legacyRuleToNew (migration function)', () => {
    const src = readFileSync(ngAbonPath, 'utf-8');
    expect(src).toContain('legacyRuleToNew');
  });

  it('ThreadView.tsx contains idCountMap and repliedCountMap (aggregation maps)', () => {
    const src = readFileSync(threadViewPath, 'utf-8');
    expect(src).toContain('idCountMap');
    expect(src).toContain('repliedCountMap');
  });
});
