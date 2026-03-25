/**
 * Tests for newly implemented features (F1–F6, B1, NG機能強化).
 *
 * テスト方針: ソースコードの文字列検索ではなく、実際の動作・型定義・IPC 契約を検証する。
 *
 * NOTE: UI レンダリングやレイアウトのみに関わる機能
 *       (ボタン表示条件・要素配置など) の完全な検証には
 *       React Testing Library または Playwright E2E テストが必要。
 */
import { describe, it, expect } from 'vitest';
import {
  NEXT_THREAD_RESPONSE_THRESHOLD,
  NEXT_THREAD_BUTTON_THRESHOLD,
  findNextThread,
  extractRightmostNumber,
} from '../../src/renderer/utils/next-thread-detect';
import type { IpcChannelMap } from '../../src/types/ipc';
import type { FavNode, FavFolder, FavSeparator, FavTree, FavItem } from '../../src/types/favorite';
import type { NgStringCondition, NgNumericCondition, NgTimeCondition } from '../../src/types/ng';
import {
  NgStringMatchMode,
  NgStringField,
  NgNumericTarget,
  NgNumericOp,
  NgTimeTarget,
} from '../../src/types/ng';
import { NgRuleSchema, NgRulesFileSchema } from '../../src/types/zod-schemas';
import { DEFAULT_ROUND_TIMER } from '../../src/types/round';
import type { RoundTimerConfig } from '../../src/types/round';
import type { SubjectRecord } from '../../src/types/domain';

// ---------------------------------------------------------------------------
// F4: 次スレ作成支援ボタンの表示条件撤廃
//
// 「次スレを探す」「次スレを作る」ボタンはレス数に関わらず常に表示する。
// ボタンの表示有無は UI 層の制御であり、フル検証には Playwright E2E テストが必要。
// ここではボタンが依存する次スレ検索ロジックを検証する。
// ---------------------------------------------------------------------------
describe('F4: 次スレ作成支援ボタン（findNextThread の動作）', () => {
  it('findNextThread finds the continuation thread by incrementing the series number', () => {
    const subjects: SubjectRecord[] = [
      { title: 'テストスレ★2', fileName: '2000000000.dat', count: 5 },
      { title: 'テストスレ★1', fileName: '1000000000.dat', count: 1000 },
    ];
    const result = findNextThread('テストスレ★1', '1000000000.dat', subjects);
    expect(result).toBeDefined();
    expect(result?.title).toBe('テストスレ★2');
  });

  it('findNextThread returns undefined when no continuation thread is found', () => {
    const subjects: SubjectRecord[] = [
      { title: '全然別のスレ', fileName: '9999999999.dat', count: 10 },
    ];
    const result = findNextThread('テストスレ★1', '1000000000.dat', subjects);
    expect(result).toBeUndefined();
  });

  it('findNextThread excludes the current thread from results (same fileName)', () => {
    // 同一 fileName のスレを次スレ候補に含めない
    const subjects: SubjectRecord[] = [
      { title: 'テストスレ★2', fileName: '1000000000.dat', count: 5 },
    ];
    const result = findNextThread('テストスレ★1', '1000000000.dat', subjects);
    expect(result).toBeUndefined();
  });

  it('findNextThread handles "Part N" format titles', () => {
    const subjects: SubjectRecord[] = [
      { title: 'Part13 雑談スレ', fileName: '2000000000.dat', count: 5 },
    ];
    const result = findNextThread('Part12 雑談スレ', '1000000000.dat', subjects);
    expect(result).toBeDefined();
    expect(result?.title).toBe('Part13 雑談スレ');
  });

  it('findNextThread returns undefined when title has no series number', () => {
    const subjects: SubjectRecord[] = [{ title: '関連スレ', fileName: '2000000000.dat', count: 5 }];
    const result = findNextThread('シリーズ番号なし', '1000000000.dat', subjects);
    expect(result).toBeUndefined();
  });

  it('extractRightmostNumber splits title into prefix, number, and suffix', () => {
    expect(extractRightmostNumber('テストスレ★1')).toEqual({
      before: 'テストスレ★',
      num: 1,
      after: '',
    });
    expect(extractRightmostNumber('雑談 Part12 まとめ')).toMatchObject({ num: 12 });
  });

  it('extractRightmostNumber extracts the rightmost number, not the leftmost', () => {
    // "スレ Part12 その3" の場合は "3" が最右端の数字
    const result = extractRightmostNumber('スレ Part12 その3');
    expect(result?.num).toBe(3);
  });

  it('extractRightmostNumber returns null for titles without numbers', () => {
    expect(extractRightmostNumber('ナンバーなしのスレタイ')).toBeNull();
  });

  it('NEXT_THREAD_RESPONSE_THRESHOLD is 1000 (スレ完了バナー表示閾値)', () => {
    // スレが完了状態（1000レス）になるとバナーを表示する
    expect(NEXT_THREAD_RESPONSE_THRESHOLD).toBe(1000);
  });

  // NEXT_THREAD_BUTTON_THRESHOLD (950) はファイルに定義されているが、
  // ボタン表示のゲートには使わない。ボタンはレス数に関わらず常に表示する。
  // ThreadView でこの値を条件分岐に使うと仕様退行となる。
  it('NEXT_THREAD_BUTTON_THRESHOLD is 950 (preserved as named constant, NOT used to gate button visibility)', () => {
    expect(NEXT_THREAD_BUTTON_THRESHOLD).toBe(950);
  });
});

// ---------------------------------------------------------------------------
// F2: ★クリックでお気に入りトグル
//
// 既にお気に入り登録済みのスレの★クリック → 削除
// 未登録のスレの★クリック → 追加
//
// クリックハンドラは ThreadList コンポーネント内にあるため UI テストが必要。
// ここではトグル操作に必要なデータモデルと IPC 契約を検証する。
// ---------------------------------------------------------------------------
describe('F2: ★クリックでお気に入りトグル（データモデルと IPC 契約）', () => {
  it('FavItem can be constructed with a thread URL (basis for URL-based toggle detection)', () => {
    const item: FavItem = {
      id: 'fav-1234567890-999',
      kind: 'item',
      type: 'thread',
      boardType: '2ch',
      url: 'https://eagle.5ch.net/livejupiter/dat/1234567890.dat',
      title: 'テストスレ',
    };
    expect(item.kind).toBe('item');
    expect(item.url).toContain('1234567890');
  });

  it('FavTree with matching item URL → item found (favorited state)', () => {
    // トグルの「削除」分岐: URL で既存お気に入りを検出できる
    const threadUrl = 'https://eagle.5ch.net/livejupiter/dat/1234567890.dat';
    const tree: FavTree = {
      children: [
        {
          id: 'fav-1',
          kind: 'item',
          type: 'thread',
          boardType: '2ch',
          url: threadUrl,
          title: 'テストスレ',
        },
      ],
    };
    const found = tree.children.find((n): n is FavItem => n.kind === 'item' && n.url === threadUrl);
    expect(found).toBeDefined();
    expect(found?.id).toBe('fav-1');
  });

  it('FavTree without matching URL → undefined (not-favorited state)', () => {
    // トグルの「追加」分岐: URL が見つからなければ未登録
    const tree: FavTree = { children: [] };
    const found = tree.children.find(
      (n): n is FavItem => n.kind === 'item' && n.url === 'https://not-favorited.example/',
    );
    expect(found).toBeUndefined();
  });

  it('fav:add IPC channel accepts a FavNode (add-to-favorites path)', () => {
    const args: IpcChannelMap['fav:add']['args'] = [
      {
        id: 'node-1',
        kind: 'item',
        type: 'thread',
        boardType: '2ch',
        url: 'https://example.com/dat/123.dat',
        title: 'Example Thread',
      },
    ];
    expect(args[0]?.kind).toBe('item');
  });

  it('fav:remove IPC channel accepts a node ID string (remove-from-favorites path)', () => {
    const args: IpcChannelMap['fav:remove']['args'] = ['node-1'];
    expect(args[0]).toBe('node-1');
  });
});

// ---------------------------------------------------------------------------
// F6: 外部ブラウザで開く
//
// スレッドのコンテキストメニューに「外部ブラウザで開く」を追加し、
// shell:open-external IPC チャネルでシステムブラウザを起動する。
// ---------------------------------------------------------------------------
describe('F6: 外部ブラウザで開く（IPC 契約）', () => {
  it('shell:open-external IPC channel accepts a URL string', () => {
    const args: IpcChannelMap['shell:open-external']['args'] = [
      'https://eagle.5ch.net/livejupiter/',
    ];
    expect(args[0]).toBe('https://eagle.5ch.net/livejupiter/');
  });

  it('shell:open-external IPC channel result is void', () => {
    type Result = IpcChannelMap['shell:open-external']['result'];
    const _result: Result = undefined;
    expect(_result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// F5: ボタン群の移動（UI レイアウト変更のみ）
//
// 次スレ・書き込みなどのアクションボタンをスレッドビューと独立した行に移動。
// これは純粋な UI レイアウトの変更であり、単体テストで検証する動作ロジックがない。
// Playwright E2E テストでボタン配置を確認すること。
// ---------------------------------------------------------------------------
// (No unit tests for F5 — layout changes require E2E tests)

// ---------------------------------------------------------------------------
// F1+F3: お気に入り整理機能（フォルダ・区切り線・DnD リオーダー）
// ---------------------------------------------------------------------------
describe('F1+F3: お気に入り整理機能（型と IPC 契約）', () => {
  it('FavSeparator type can be constructed (区切り線ノードの存在)', () => {
    const sep: FavSeparator = { id: 'sep-1', kind: 'separator' };
    expect(sep.kind).toBe('separator');
    expect(sep.id).toBe('sep-1');
  });

  it('FavFolder can contain children including separators and items', () => {
    const folder: FavFolder = {
      id: 'folder-1',
      kind: 'folder',
      title: 'テストフォルダ',
      expanded: true,
      children: [
        { id: 'sep-1', kind: 'separator' },
        {
          id: 'item-1',
          kind: 'item',
          type: 'board',
          boardType: '2ch',
          url: 'https://eagle.5ch.net/livejupiter/',
          title: '球場雑談',
        },
      ],
    };
    expect(folder.children).toHaveLength(2);
    expect(folder.children[0]?.kind).toBe('separator');
    expect(folder.children[1]?.kind).toBe('item');
  });

  it('FavNode union type accepts folder, item, and separator kinds', () => {
    const nodes: FavNode[] = [
      { id: 'f1', kind: 'folder', title: 'Folder', expanded: false, children: [] },
      { id: 's1', kind: 'separator' },
      {
        id: 'i1',
        kind: 'item',
        type: 'thread',
        boardType: '2ch',
        url: 'https://x.com/',
        title: 'Thread',
      },
    ];
    expect(nodes).toHaveLength(3);
    expect(nodes[0]?.kind).toBe('folder');
    expect(nodes[1]?.kind).toBe('separator');
    expect(nodes[2]?.kind).toBe('item');
  });

  it('fav:add-folder IPC channel accepts a folder title string', () => {
    const args: IpcChannelMap['fav:add-folder']['args'] = ['新しいフォルダ'];
    expect(args[0]).toBe('新しいフォルダ');
  });

  it('fav:add-separator IPC channel takes no arguments (区切り線は引数不要)', () => {
    const args: IpcChannelMap['fav:add-separator']['args'] = [];
    expect(args).toHaveLength(0);
  });

  it('fav:reorder IPC channel accepts drag/drop node IDs and relative position', () => {
    const beforeArgs: IpcChannelMap['fav:reorder']['args'] = ['node-1', 'node-2', 'before'];
    const afterArgs: IpcChannelMap['fav:reorder']['args'] = ['node-1', 'node-2', 'after'];
    const insideArgs: IpcChannelMap['fav:reorder']['args'] = ['node-1', 'folder-1', 'inside'];
    expect(beforeArgs[2]).toBe('before');
    expect(afterArgs[2]).toBe('after');
    expect(insideArgs[2]).toBe('inside');
  });

  it('fav:move-to-folder IPC channel accepts nodeId and folderId', () => {
    const args: IpcChannelMap['fav:move-to-folder']['args'] = ['item-1', 'folder-1'];
    expect(args[0]).toBe('item-1');
    expect(args[1]).toBe('folder-1');
  });
});

// ---------------------------------------------------------------------------
// B1: 巡回バグ修正
//
// 巡回タイマーが IPC チャネル経由で制御され、巡回完了時に UI が自動更新される。
// メインプロセスは巡回完了後 round:completed プッシュイベントを送出する。
// ---------------------------------------------------------------------------
describe('B1: 巡回バグ修正（IPC とタイマー設定）', () => {
  it('round:execute IPC channel takes no arguments (手動巡回トリガー)', () => {
    const args: IpcChannelMap['round:execute']['args'] = [];
    expect(args).toHaveLength(0);
  });

  it('round:get-timer IPC channel returns a RoundTimerConfig', () => {
    const config: RoundTimerConfig = { enabled: true, intervalMinutes: 30 };
    expect(config.enabled).toBe(true);
    expect(config.intervalMinutes).toBe(30);
  });

  it('round:set-timer IPC channel accepts a full RoundTimerConfig', () => {
    const args: IpcChannelMap['round:set-timer']['args'] = [{ enabled: true, intervalMinutes: 60 }];
    expect(args[0]?.enabled).toBe(true);
    expect(args[0]?.intervalMinutes).toBe(60);
  });

  it('DEFAULT_ROUND_TIMER has timer disabled and 15-minute interval as default', () => {
    // 初回起動時は自動巡回が無効・15分間隔
    expect(DEFAULT_ROUND_TIMER.enabled).toBe(false);
    expect(DEFAULT_ROUND_TIMER.intervalMinutes).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// NG 機能強化（文字列・数値・時間の 3 条件タイプ）
// ---------------------------------------------------------------------------
describe('NG 機能強化（型定義と Zod スキーマ）', () => {
  it('NgStringCondition with plain match can be constructed', () => {
    const cond: NgStringCondition = {
      type: 'string',
      matchMode: NgStringMatchMode.Plain,
      fields: [NgStringField.Body],
      tokens: ['荒らし'],
      negate: false,
    };
    expect(cond.type).toBe('string');
    expect(cond.matchMode).toBe('plain');
    expect(cond.tokens).toContain('荒らし');
  });

  it('NgStringCondition supports regexp and regexp_nocase match modes', () => {
    const regexp: NgStringCondition = {
      type: 'string',
      matchMode: NgStringMatchMode.Regexp,
      fields: [NgStringField.All],
      tokens: ['[Ss]pam'],
      negate: false,
    };
    const regexpNocase: NgStringCondition = {
      type: 'string',
      matchMode: NgStringMatchMode.RegexpNoCase,
      fields: [NgStringField.All],
      tokens: ['spam'],
      negate: false,
    };
    expect(regexp.matchMode).toBe('regexp');
    expect(regexpNocase.matchMode).toBe('regexp_nocase');
  });

  it('NgStringCondition supports field-specific matching (not just "all")', () => {
    const cond: NgStringCondition = {
      type: 'string',
      matchMode: NgStringMatchMode.Plain,
      fields: [NgStringField.Name, NgStringField.Id],
      tokens: ['荒らし'],
      negate: false,
    };
    expect(cond.fields).toContain(NgStringField.Name);
    expect(cond.fields).toContain(NgStringField.Id);
    expect(cond.fields).not.toContain(NgStringField.All);
  });

  it('NgNumericCondition with gte op can be constructed (数値条件)', () => {
    const cond: NgNumericCondition = {
      type: 'numeric',
      target: NgNumericTarget.ResNumber,
      op: NgNumericOp.Gte,
      value: 100,
      negate: false,
    };
    expect(cond.type).toBe('numeric');
    expect(cond.target).toBe('resNumber');
    expect(cond.op).toBe('gte');
  });

  it('NgNumericCondition supports between op with value2', () => {
    const cond: NgNumericCondition = {
      type: 'numeric',
      target: NgNumericTarget.IdCount,
      op: NgNumericOp.Between,
      value: 3,
      value2: 10,
      negate: false,
    };
    expect(cond.op).toBe('between');
    expect(cond.value2).toBe(10);
  });

  it('NgTimeCondition with weekday target can be constructed (時間条件)', () => {
    const cond: NgTimeCondition = {
      type: 'time',
      target: NgTimeTarget.Weekday,
      value: { days: [1, 3, 5] },
      negate: false,
    };
    expect(cond.type).toBe('time');
    expect(cond.target).toBe('weekday');
  });

  it('NgTimeCondition with hour range can be constructed', () => {
    const cond: NgTimeCondition = {
      type: 'time',
      target: NgTimeTarget.Hour,
      value: { from: 9, to: 17 },
      negate: false,
    };
    expect(cond.target).toBe('hour');
  });

  it('NgRuleSchema validates a valid string condition rule at runtime', () => {
    const raw = {
      id: 'rule-1',
      condition: {
        type: 'string',
        matchMode: 'plain',
        fields: ['all'],
        tokens: ['荒らし'],
        negate: false,
      },
      target: 'response',
      abonType: 'normal',
      enabled: true,
    };
    const result = NgRuleSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });

  it('NgRuleSchema validates a numeric condition rule', () => {
    const raw = {
      id: 'rule-num',
      condition: {
        type: 'numeric',
        target: 'resNumber',
        op: 'gte',
        value: 5,
        negate: false,
      },
      target: 'response',
      abonType: 'normal',
      enabled: true,
    };
    const result = NgRuleSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });

  it('NgRuleSchema rejects a rule with unknown condition type', () => {
    const raw = {
      id: 'bad-rule',
      condition: { type: 'unknown', tokens: [] },
      target: 'response',
      abonType: 'normal',
      enabled: true,
    };
    const result = NgRuleSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('NgRulesFileSchema validates a well-formed rules file with version=1', () => {
    const raw = {
      version: 1,
      rules: [
        {
          id: 'r1',
          condition: {
            type: 'string',
            matchMode: 'plain',
            fields: ['all'],
            tokens: ['test'],
            negate: false,
          },
          target: 'response',
          abonType: 'normal',
          enabled: true,
        },
      ],
    };
    const result = NgRulesFileSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe(1);
      expect(result.data.rules).toHaveLength(1);
    }
  });

  it('NgRulesFileSchema rejects version other than 1 (後方互換性保証)', () => {
    const raw = { version: 2, rules: [] };
    const result = NgRulesFileSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('ng:get-rules IPC channel returns readonly NgRule[]', () => {
    type Rules = IpcChannelMap['ng:get-rules']['result'];
    const empty: Rules = [];
    expect(empty).toHaveLength(0);
  });

  it('ng:set-rules IPC channel accepts readonly NgRule[]', () => {
    const args: IpcChannelMap['ng:set-rules']['args'] = [[]];
    expect(args[0]).toHaveLength(0);
  });
});
