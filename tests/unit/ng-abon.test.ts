import { describe, it, expect } from 'vitest';
import {
  parseNgLine,
  parseNgFile,
  parseLegacyNgFile,
  serializeNgRules,
  matchesNgRule,
  applyNgRules,
  matchesThreadNgRule,
  matchesBoardNgRule,
  legacyRuleToNew,
  matchStringCondition,
  matchNumericCondition,
  matchTimeCondition,
} from '../../src/main/services/ng-abon';
import {
  extractStringFields,
  parseDateTimeField,
  countAnchors,
  buildIdCountMap,
  buildRepliedCountMap,
  stripHtmlTags,
  buildNumericValuesForRes,
} from '../../src/types/ng-field-extractor';
import type { Res } from '../../src/types/domain';
import type { NgRule } from '../../src/types/ng';
import {
  AbonType,
  NgMatchMode,
  NgFilterResult,
  NgTarget,
  NgStringField,
  NgStringMatchMode,
  NgNumericTarget,
  NgNumericOp,
  NgTimeTarget,
} from '../../src/types/ng';

const makeRes = (overrides: Partial<Res> = {}): Res => ({
  number: 1,
  name: '名無しさん',
  mail: 'sage',
  dateTime: '2024/01/15(月) 12:34:56.78 ID:AbCdEfGh0',
  body: 'テスト本文',
  title: '',
  ...overrides,
});

/** Overrides for makeRule: supports shorthand condition fields (tokens, matchMode, fields, negate) */
interface MakeRuleOverrides {
  id?: string;
  condition?: {
    tokens?: readonly string[];
    matchMode?: 'plain' | 'regexp' | 'regexp_nocase';
    fields?: readonly NgStringField[];
    negate?: boolean;
  };
  target?: NgTarget;
  abonType?: AbonType;
  boardId?: string;
  threadId?: string;
  enabled?: boolean;
}

const makeRule = (overrides: MakeRuleOverrides = {}): NgRule => {
  const cond = overrides.condition;
  const matchMode =
    cond?.matchMode === 'regexp'
      ? NgStringMatchMode.Regexp
      : cond?.matchMode === 'regexp_nocase'
        ? NgStringMatchMode.RegexpNoCase
        : NgStringMatchMode.Plain;
  const condition = {
    type: 'string' as const,
    matchMode,
    fields: (cond?.fields ?? [NgStringField.All]) as readonly NgStringField[],
    tokens: cond?.tokens ?? ['荒らし'],
    negate: cond?.negate ?? false,
  };
  return {
    id: overrides.id ?? 'test-rule',
    condition,
    target: overrides.target ?? NgTarget.Response,
    abonType: overrides.abonType ?? AbonType.Normal,
    boardId: overrides.boardId,
    threadId: overrides.threadId,
    enabled: overrides.enabled ?? true,
  };
};

describe('legacyRuleToNew', () => {
  it('converts legacy plain rule to new format', () => {
    const legacy = {
      id: 'leg-1',
      target: undefined as NgTarget | undefined,
      abonType: AbonType.Normal,
      matchMode: NgMatchMode.Plain,
      tokens: ['test', 'word'],
      enabled: true,
    };
    const rule = legacyRuleToNew(legacy);
    expect(rule.id).toBe('leg-1');
    expect(rule.target).toBe(NgTarget.Response);
    if (rule.condition.type === 'string') {
      expect(rule.condition.matchMode).toBe(NgStringMatchMode.Plain);
      expect(rule.condition.tokens).toEqual(['test', 'word']);
      expect(rule.condition.fields).toEqual([NgStringField.All]);
      expect(rule.condition.negate).toBe(false);
    }
  });

  it('converts legacy regex rule to new format', () => {
    const legacy = {
      id: 'leg-2',
      target: NgTarget.Thread,
      abonType: AbonType.Transparent,
      matchMode: NgMatchMode.Regexp,
      tokens: ['[Ss]pam'],
      boardId: 'news',
      enabled: true,
    };
    const rule = legacyRuleToNew(legacy);
    expect(rule.target).toBe(NgTarget.Thread);
    if (rule.condition.type === 'string') {
      expect(rule.condition.matchMode).toBe(NgStringMatchMode.Regexp);
    }
    expect(rule.abonType).toBe(AbonType.Transparent);
    expect(rule.boardId).toBe('news');
  });
});

describe('parseNgLine', () => {
  it('parses simple NG word (normal abon)', () => {
    const rule = parseNgLine('荒らし\tスパム');
    expect(rule).not.toBeNull();
    expect(rule?.abonType).toBe(AbonType.Normal);
    if (rule?.condition.type === 'string') {
      expect(rule.condition.matchMode).toBe(NgStringMatchMode.Plain);
      expect(rule.condition.tokens).toEqual(['荒らし', 'スパム']);
    }
  });

  it('parses transparent abon (leading tab)', () => {
    const rule = parseNgLine('\t荒らし');
    expect(rule).not.toBeNull();
    expect(rule?.abonType).toBe(AbonType.Transparent);
    if (rule?.condition.type === 'string') expect(rule.condition.tokens).toEqual(['荒らし']);
  });

  it('parses regex rule', () => {
    const rule = parseNgLine('\t{{REGEXP}}\t[Ss]pam.*bot');
    expect(rule).not.toBeNull();
    expect(rule?.abonType).toBe(AbonType.Transparent);
    if (rule?.condition.type === 'string') {
      expect(rule.condition.matchMode).toBe(NgStringMatchMode.Regexp);
      expect(rule.condition.tokens).toEqual(['[Ss]pam.*bot']);
    }
  });

  it('parses board scope', () => {
    const rule = parseNgLine('{{BOARD:newsplus}}\t政治');
    expect(rule).not.toBeNull();
    expect(rule?.boardId).toBe('newsplus');
    if (rule?.condition.type === 'string') expect(rule.condition.tokens).toEqual(['政治']);
  });

  it('parses thread scope', () => {
    const rule = parseNgLine('\t{{THREAD:newsplus/1234567890}}\t特定ワード');
    expect(rule).not.toBeNull();
    expect(rule?.boardId).toBe('newsplus');
    expect(rule?.threadId).toBe('1234567890');
    if (rule?.condition.type === 'string') expect(rule.condition.tokens).toEqual(['特定ワード']);
  });

  it('returns null for empty line', () => {
    expect(parseNgLine('')).toBeNull();
    expect(parseNgLine('   ')).toBeNull();
  });
});

describe('parseNgFile', () => {
  it('parses multiple lines', () => {
    const content = `荒らし\tスパム
\t{{REGEXP}}\t[Ss]pam
{{BOARD:newsplus}}\t政治`;

    const rules = parseNgFile(content);
    expect(rules).toHaveLength(3);
    expect(rules[0]?.abonType).toBe(AbonType.Normal);
    expect(rules[1]?.abonType).toBe(AbonType.Transparent);
    expect(rules[2]?.boardId).toBe('newsplus');
  });

  it('skips empty lines', () => {
    const content = `荒らし

スパム`;
    const rules = parseNgFile(content);
    expect(rules).toHaveLength(2);
  });
});

describe('serializeNgRules', () => {
  it('serializes normal abon rule', () => {
    const rules: NgRule[] = [makeRule({ condition: { tokens: ['荒らし', 'スパム'] } })];
    const result = serializeNgRules(rules);
    expect(result).toBe('荒らし\tスパム');
  });

  it('serializes transparent abon with leading tab', () => {
    const rules: NgRule[] = [
      makeRule({ abonType: AbonType.Transparent, condition: { tokens: ['テスト'] } }),
    ];
    const result = serializeNgRules(rules);
    expect(result).toBe('\tテスト');
  });

  it('serializes regex rule', () => {
    const rules: NgRule[] = [makeRule({ condition: { matchMode: 'regexp', tokens: ['[Ss]pam'] } })];
    const result = serializeNgRules(rules);
    expect(result).toContain('{{REGEXP}}');
    expect(result).toContain('[Ss]pam');
  });

  it('serializes board scope', () => {
    const rules: NgRule[] = [makeRule({ boardId: 'newsplus', condition: { tokens: ['政治'] } })];
    const result = serializeNgRules(rules);
    expect(result).toContain('{{BOARD:newsplus}}');
  });

  it('serializes thread scope', () => {
    const rules: NgRule[] = [
      makeRule({
        boardId: 'newsplus',
        threadId: '1234567890',
        condition: { tokens: ['特定'] },
      }),
    ];
    const result = serializeNgRules(rules);
    expect(result).toContain('{{THREAD:newsplus/1234567890}}');
  });

  it('skips disabled rules', () => {
    const rules: NgRule[] = [makeRule({ enabled: false, condition: { tokens: ['hidden'] } })];
    expect(serializeNgRules(rules)).toBe('');
  });
});

describe('matchesNgRule', () => {
  it('matches plain text in body', () => {
    const rule = makeRule({ condition: { tokens: ['テスト'] } });
    const res = makeRes({ body: 'テスト本文' });
    expect(matchesNgRule(rule, res, 'board', 'thread')).toBe(true);
  });

  it('matches AND condition (all tokens required)', () => {
    const rule = makeRule({ condition: { tokens: ['名無し', 'sage'] } });
    const res = makeRes();
    expect(matchesNgRule(rule, res, 'board', 'thread')).toBe(true);
  });

  it('fails AND condition when not all tokens match', () => {
    const rule = makeRule({ condition: { tokens: ['名無し', 'nonexistent'] } });
    const res = makeRes();
    expect(matchesNgRule(rule, res, 'board', 'thread')).toBe(false);
  });

  it('matches regex pattern', () => {
    const rule = makeRule({
      condition: { matchMode: 'regexp', tokens: ['ID:[A-Z]{4}'] },
    });
    const res = makeRes({ dateTime: '2024/01/15 12:34:56 ID:ABCD1234' });
    expect(matchesNgRule(rule, res, 'board', 'thread')).toBe(true);
  });

  it('handles invalid regex gracefully', () => {
    const rule = makeRule({ condition: { matchMode: 'regexp', tokens: ['[invalid'] } });
    const res = makeRes();
    expect(matchesNgRule(rule, res, 'board', 'thread')).toBe(false);
  });

  it('respects board scope', () => {
    const rule = makeRule({ boardId: 'newsplus', condition: { tokens: ['テスト'] } });
    const res = makeRes({ body: 'テスト' });
    expect(matchesNgRule(rule, res, 'newsplus', 'thread')).toBe(true);
    expect(matchesNgRule(rule, res, 'otherboard', 'thread')).toBe(false);
  });

  it('respects thread scope', () => {
    const rule = makeRule({
      boardId: 'newsplus',
      threadId: '123',
      condition: { tokens: ['テスト'] },
    });
    const res = makeRes({ body: 'テスト' });
    expect(matchesNgRule(rule, res, 'newsplus', '123')).toBe(true);
    expect(matchesNgRule(rule, res, 'newsplus', '456')).toBe(false);
  });

  it('skips thread-level NG rules', () => {
    const rule = makeRule({ target: NgTarget.Thread, condition: { tokens: ['名無し'] } });
    const res = makeRes();
    expect(matchesNgRule(rule, res, 'board', 'thread')).toBe(false);
  });

  it('skips board-level NG rules', () => {
    const rule = makeRule({ target: NgTarget.Board, condition: { tokens: ['名無し'] } });
    const res = makeRes();
    expect(matchesNgRule(rule, res, 'board', 'thread')).toBe(false);
  });
});

describe('applyNgRules', () => {
  it('returns None when no rules match', () => {
    const rules = [makeRule({ condition: { tokens: ['nonexistent'] } })];
    const res = makeRes();
    expect(applyNgRules(rules, res, 'board', 'thread')).toBe(NgFilterResult.None);
  });

  it('returns NormalAbon for normal abon match', () => {
    const rules = [makeRule({ condition: { tokens: ['名無し'] } })];
    const res = makeRes();
    expect(applyNgRules(rules, res, 'board', 'thread')).toBe(NgFilterResult.NormalAbon);
  });

  it('returns TransparentAbon for transparent abon match', () => {
    const rules = [
      makeRule({
        abonType: AbonType.Transparent,
        condition: { tokens: ['名無し'] },
      }),
    ];
    const res = makeRes();
    expect(applyNgRules(rules, res, 'board', 'thread')).toBe(NgFilterResult.TransparentAbon);
  });

  it('first matching rule wins', () => {
    const rules = [
      makeRule({ id: 'r1', abonType: AbonType.Normal, condition: { tokens: ['名無し'] } }),
      makeRule({
        id: 'r2',
        abonType: AbonType.Transparent,
        condition: { tokens: ['名無し'] },
      }),
    ];
    const res = makeRes();
    // First rule should match
    expect(applyNgRules(rules, res, 'board', 'thread')).toBe(NgFilterResult.NormalAbon);
  });

  it('skips disabled rules', () => {
    const rules = [makeRule({ enabled: false, condition: { tokens: ['名無し'] } })];
    const res = makeRes();
    expect(applyNgRules(rules, res, 'board', 'thread')).toBe(NgFilterResult.None);
  });

  it('skips thread-level rules when applying to responses', () => {
    const rules = [makeRule({ target: NgTarget.Thread, condition: { tokens: ['名無し'] } })];
    const res = makeRes();
    expect(applyNgRules(rules, res, 'board', 'thread')).toBe(NgFilterResult.None);
  });

  it('skips board-level rules when applying to responses', () => {
    const rules = [makeRule({ target: NgTarget.Board, condition: { tokens: ['名無し'] } })];
    const res = makeRes();
    expect(applyNgRules(rules, res, 'board', 'thread')).toBe(NgFilterResult.None);
  });
});

// ───────────── NgTarget: thread-level NG ─────────────

describe('parseNgLine with target', () => {
  it('parses thread target marker', () => {
    const rule = parseNgLine('{{TARGET:thread}}\t荒らしスレ');
    expect(rule).not.toBeNull();
    expect(rule?.target).toBe(NgTarget.Thread);
    if (rule?.condition.type === 'string') expect(rule.condition.tokens).toEqual(['荒らしスレ']);
  });

  it('parses board target marker', () => {
    const rule = parseNgLine('{{TARGET:board}}\t{{BOARD:news}}\tNG板');
    expect(rule).not.toBeNull();
    expect(rule?.target).toBe(NgTarget.Board);
    expect(rule?.boardId).toBe('news');
    if (rule?.condition.type === 'string') expect(rule.condition.tokens).toEqual(['NG板']);
  });

  it('defaults to response target for response-level rules', () => {
    const rule = parseNgLine('荒らし');
    expect(rule).not.toBeNull();
    expect(rule?.target).toBe(NgTarget.Response);
  });
});

describe('serializeNgRules with target', () => {
  it('serializes thread target marker', () => {
    const rules: NgRule[] = [
      makeRule({ target: NgTarget.Thread, condition: { tokens: ['荒らしスレ'] } }),
    ];
    const result = serializeNgRules(rules);
    expect(result).toContain('{{TARGET:thread}}');
    expect(result).toContain('荒らしスレ');
  });

  it('serializes board target marker', () => {
    const rules: NgRule[] = [
      makeRule({
        target: NgTarget.Board,
        boardId: 'news',
        condition: { tokens: ['NG板'] },
      }),
    ];
    const result = serializeNgRules(rules);
    expect(result).toContain('{{TARGET:board}}');
    expect(result).toContain('{{BOARD:news}}');
    expect(result).toContain('NG板');
  });

  it('omits target marker for response rules', () => {
    const rules: NgRule[] = [makeRule({ condition: { tokens: ['テスト'] } })];
    const result = serializeNgRules(rules);
    expect(result).not.toContain('{{TARGET:');
  });

  it('round-trips thread target rules', () => {
    const original: NgRule[] = [
      makeRule({
        target: NgTarget.Thread,
        abonType: AbonType.Transparent,
        boardId: 'news',
        threadId: '123',
        condition: { tokens: ['荒らし'] },
      }),
    ];
    const serialized = serializeNgRules(original);
    const parsed = parseNgFile(serialized);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.target).toBe(NgTarget.Thread);
    expect(parsed[0]?.abonType).toBe(AbonType.Transparent);
    expect(parsed[0]?.boardId).toBe('news');
    expect(parsed[0]?.threadId).toBe('123');
    const cond = parsed[0]?.condition;
    if (cond?.type === 'string') expect(cond.tokens).toEqual(['荒らし']);
  });
});

describe('matchesThreadNgRule', () => {
  it('matches thread title by token', () => {
    const rule = makeRule({ target: NgTarget.Thread, condition: { tokens: ['荒らし'] } });
    expect(matchesThreadNgRule(rule, '荒らしスレッド', 'board', 'thread')).toBe(true);
  });

  it('does not match when token is absent', () => {
    const rule = makeRule({ target: NgTarget.Thread, condition: { tokens: ['荒らし'] } });
    expect(matchesThreadNgRule(rule, '普通のスレッド', 'board', 'thread')).toBe(false);
  });

  it('matches by exact thread ID', () => {
    const rule = makeRule({
      target: NgTarget.Thread,
      condition: { tokens: ['dummy'] },
      threadId: '123',
    });
    expect(matchesThreadNgRule(rule, 'any title', 'board', '123')).toBe(true);
    expect(matchesThreadNgRule(rule, 'any title', 'board', '456')).toBe(false);
  });

  it('respects board scope', () => {
    const rule = makeRule({
      target: NgTarget.Thread,
      condition: { tokens: ['荒らし'] },
      boardId: 'news',
    });
    expect(matchesThreadNgRule(rule, '荒らしスレ', 'news', 'thread')).toBe(true);
    expect(matchesThreadNgRule(rule, '荒らしスレ', 'other', 'thread')).toBe(false);
  });

  it('ignores response-level rules', () => {
    const rule = makeRule({ condition: { tokens: ['テスト'] } });
    expect(matchesThreadNgRule(rule, 'テストスレッド', 'board', 'thread')).toBe(false);
  });

  it('supports regex matching on thread titles', () => {
    const rule = makeRule({
      target: NgTarget.Thread,
      condition: { matchMode: 'regexp', tokens: ['荒ら.*'] },
    });
    expect(matchesThreadNgRule(rule, '荒らしスレッド', 'board', 'thread')).toBe(true);
    expect(matchesThreadNgRule(rule, '普通のスレッド', 'board', 'thread')).toBe(false);
  });
});

describe('matchesBoardNgRule', () => {
  it('matches board name by token', () => {
    const rule = makeRule({ target: NgTarget.Board, condition: { tokens: ['ニュース'] } });
    expect(matchesBoardNgRule(rule, 'ニュース速報', 'news')).toBe(true);
  });

  it('does not match when token is absent', () => {
    const rule = makeRule({ target: NgTarget.Board, condition: { tokens: ['ニュース'] } });
    expect(matchesBoardNgRule(rule, 'プログラミング', 'prog')).toBe(false);
  });

  it('matches by exact board ID', () => {
    const rule = makeRule({
      target: NgTarget.Board,
      condition: { tokens: ['dummy'] },
      boardId: 'news',
    });
    expect(matchesBoardNgRule(rule, 'any name', 'news')).toBe(true);
    expect(matchesBoardNgRule(rule, 'any name', 'other')).toBe(false);
  });

  it('ignores response-level rules', () => {
    const rule = makeRule({ condition: { tokens: ['テスト'] } });
    expect(matchesBoardNgRule(rule, 'テスト板', 'test')).toBe(false);
  });

  it('ignores thread-level rules', () => {
    const rule = makeRule({
      target: NgTarget.Thread,
      condition: { tokens: ['テスト'] },
    });
    expect(matchesBoardNgRule(rule, 'テスト板', 'test')).toBe(false);
  });
});

// ───────────── Phase 2: Field extraction ─────────────

describe('ng-field-extractor', () => {
  it('extracts ID from dateTime', () => {
    const res = makeRes({ dateTime: '2024/01/15(月) 12:34:56 ID:AbCdEfGh0' });
    const fields = extractStringFields(res, '');
    expect(fields.id).toBe('AbCdEfGh0');
  });

  it('extracts trip from name', () => {
    const res = makeRes({ name: '名無しさん◆abc123' });
    const fields = extractStringFields(res, '');
    expect(fields.trip).toBe('abc123');
  });

  it('extracts watchoi from name', () => {
    const res = makeRes({ name: '名無しさん (ﾜｯﾁｮｲ ABCD-1234)' });
    const fields = extractStringFields(res, '');
    expect(fields.watchoi).toContain('ﾜｯﾁｮｲ');
  });

  it('extracts IP from name or dateTime', () => {
    const res = makeRes({
      dateTime: '2024/01/15(月) 12:34:56 [192.168.1.1]',
      name: '名無し',
    });
    const fields = extractStringFields(res, '');
    expect(fields.ip).toBe('192.168.1.1');
  });

  it('extracts BE from dateTime', () => {
    const res = makeRes({ dateTime: '2024/01/15(月) 12:34:56 BE:12345-67' });
    const fields = extractStringFields(res, '');
    expect(fields.be).toBe('12345-67');
  });

  it('extracts URLs from body', () => {
    const res = makeRes({
      body: 'see https://example.com/page and http://test.co.jp/path',
    });
    const fields = extractStringFields(res, '');
    expect(fields.url).toContain('https://example.com/page');
    expect(fields.url).toContain('http://test.co.jp/path');
  });

  it('parseDateTimeField parses 5ch format', () => {
    const d = parseDateTimeField('2024/01/15(月) 12:34:56.78');
    expect(d).not.toBeNull();
    expect(d?.getFullYear()).toBe(2024);
    expect(d?.getMonth()).toBe(0);
    expect(d?.getDate()).toBe(15);
    expect(d?.getHours()).toBe(12);
    expect(d?.getMinutes()).toBe(34);
    expect(d?.getSeconds()).toBe(56);
  });

  it('countAnchors counts >>N patterns', () => {
    expect(countAnchors('>>123 >>456 >>123')).toBe(3);
    expect(countAnchors('no anchors')).toBe(0);
  });

  it('buildIdCountMap counts posts per ID', () => {
    const responses: Res[] = [
      makeRes({ number: 1, dateTime: '2024/01/15(月) 12:00:00 ID:same' }),
      makeRes({ number: 2, dateTime: '2024/01/15(月) 12:01:00 ID:same' }),
      makeRes({ number: 3, dateTime: '2024/01/15(月) 12:02:00 ID:other' }),
    ];
    const map = buildIdCountMap(responses);
    expect(map.get('same')).toBe(2);
    expect(map.get('other')).toBe(1);
  });

  it('buildRepliedCountMap counts replies per res', () => {
    const responses: Res[] = [
      makeRes({ number: 1, body: 'test' }),
      makeRes({ number: 2, body: '>>1 >>3' }),
      makeRes({ number: 3, body: '>>1' }),
    ];
    const map = buildRepliedCountMap(responses);
    expect(map.get(1)).toBe(2);
    expect(map.get(3)).toBe(1);
    expect(map.get(2)).toBeUndefined();
  });
});

// ───────────── Phase 2: Numeric matching ─────────────

describe('matchNumericCondition', () => {
  const makeNumericRule = (op: string, value: number, value2?: number, negate = false): NgRule => ({
    id: 'num-rule',
    condition: {
      type: 'numeric',
      target: NgNumericTarget.ResNumber,
      op: op as 'eq' | 'gte' | 'lte' | 'lt' | 'gt' | 'between',
      value,
      value2,
      negate,
    },
    target: NgTarget.Response,
    abonType: AbonType.Normal,
    enabled: true,
  });

  it('matches eq', () => {
    expect(
      matchNumericCondition(
        makeNumericRule('eq', 10).condition as Parameters<typeof matchNumericCondition>[0],
        { resNumber: 10 },
      ),
    ).toBe(true);
    expect(
      matchNumericCondition(
        makeNumericRule('eq', 10).condition as Parameters<typeof matchNumericCondition>[0],
        { resNumber: 9 },
      ),
    ).toBe(false);
  });

  it('matches gte, lte, lt, gt', () => {
    const vals = { resNumber: 50 };
    expect(
      matchNumericCondition(
        makeNumericRule('gte', 50).condition as Parameters<typeof matchNumericCondition>[0],
        vals,
      ),
    ).toBe(true);
    expect(
      matchNumericCondition(
        makeNumericRule('lte', 50).condition as Parameters<typeof matchNumericCondition>[0],
        vals,
      ),
    ).toBe(true);
    expect(
      matchNumericCondition(
        makeNumericRule('lt', 50).condition as Parameters<typeof matchNumericCondition>[0],
        vals,
      ),
    ).toBe(false);
    expect(
      matchNumericCondition(
        makeNumericRule('gt', 49).condition as Parameters<typeof matchNumericCondition>[0],
        vals,
      ),
    ).toBe(true);
  });

  it('matches between', () => {
    const cond = makeNumericRule('between', 10, 20).condition as Parameters<
      typeof matchNumericCondition
    >[0];
    expect(matchNumericCondition(cond, { resNumber: 15 })).toBe(true);
    expect(matchNumericCondition(cond, { resNumber: 5 })).toBe(false);
    expect(matchNumericCondition(cond, { resNumber: 25 })).toBe(false);
  });

  it('respects negate', () => {
    const cond = makeNumericRule('eq', 10, undefined, true).condition as Parameters<
      typeof matchNumericCondition
    >[0];
    expect(matchNumericCondition(cond, { resNumber: 10 })).toBe(false);
    expect(matchNumericCondition(cond, { resNumber: 9 })).toBe(true);
  });
});

// ───────────── Phase 2: Time matching ─────────────

describe('matchTimeCondition', () => {
  it('matches weekday (0=Sun, 1=Mon, ..., 6=Sat)', () => {
    const cond = {
      type: 'time' as const,
      target: NgTimeTarget.Weekday,
      value: { days: [1, 3, 5] },
      negate: false,
    };
    const mon = new Date(2024, 0, 15); // Monday (1)
    const tue = new Date(2024, 0, 16); // Tuesday (2)
    expect(matchTimeCondition(cond, mon)).toBe(true);
    expect(matchTimeCondition(cond, tue)).toBe(false);
  });

  it('matches hour range', () => {
    const cond = {
      type: 'time' as const,
      target: NgTimeTarget.Hour,
      value: { from: 9, to: 17 },
      negate: false,
    };
    const noon = new Date(2024, 0, 15, 12, 0, 0);
    const night = new Date(2024, 0, 15, 22, 0, 0);
    expect(matchTimeCondition(cond, noon)).toBe(true);
    expect(matchTimeCondition(cond, night)).toBe(false);
  });

  it('matches relativeTime (within minutes)', () => {
    const cond = {
      type: 'time' as const,
      target: NgTimeTarget.RelativeTime,
      value: { withinMinutes: 10 },
      negate: false,
    };
    const recent = new Date(Date.now() - 5 * 60 * 1000);
    const old = new Date(Date.now() - 20 * 60 * 1000);
    expect(matchTimeCondition(cond, recent)).toBe(true);
    expect(matchTimeCondition(cond, old)).toBe(false);
  });

  it('matches datetime range', () => {
    const cond = {
      type: 'time' as const,
      target: NgTimeTarget.Datetime,
      value: { from: '2024-01-15T00:00:00Z', to: '2024-01-15T23:59:59Z' },
      negate: false,
    };
    const mid = new Date('2024-01-15T12:00:00Z');
    const out = new Date('2024-01-16T00:00:00Z');
    expect(matchTimeCondition(cond, mid)).toBe(true);
    expect(matchTimeCondition(cond, out)).toBe(false);
  });

  it('respects negate for time', () => {
    const cond = {
      type: 'time' as const,
      target: NgTimeTarget.Weekday,
      value: { days: [1] },
      negate: true,
    };
    const mon = new Date(2024, 0, 15);
    expect(matchTimeCondition(cond, mon)).toBe(false);
    const tue = new Date(2024, 0, 16);
    expect(matchTimeCondition(cond, tue)).toBe(true);
  });
});

// ───────────── Phase 2: Fuzzy matching ─────────────

describe('matchStringCondition fuzzy', () => {
  it('fuzzy matches when chars appear in order', () => {
    const cond = {
      type: 'string' as const,
      matchMode: 'fuzzy' as const,
      fields: [NgStringField.Body] as const,
      tokens: ['abc'],
      negate: false,
    };
    const fields = extractStringFields(makeRes({ body: 'a x b x c' }), '');
    expect(matchStringCondition(cond, fields)).toBe(true);
  });

  it('fuzzy fails when chars not in order', () => {
    const cond = {
      type: 'string' as const,
      matchMode: 'fuzzy' as const,
      fields: [NgStringField.Body] as const,
      tokens: ['cab'],
      negate: false,
    };
    const fields = extractStringFields(makeRes({ body: 'abc' }), '');
    expect(matchStringCondition(cond, fields)).toBe(false);
  });
});

// ───────────── Phase 2: Full matchesNgRule with numeric/time ─────────────

describe('matchesNgRule numeric and time', () => {
  it('matches numeric resNumber rule', () => {
    const rule: NgRule = {
      id: 'n1',
      condition: {
        type: 'numeric',
        target: NgNumericTarget.ResNumber,
        op: NgNumericOp.Gte,
        value: 5,
        negate: false,
      },
      target: NgTarget.Response,
      abonType: AbonType.Normal,
      enabled: true,
    };
    const res = makeRes({ number: 10 });
    expect(
      matchesNgRule(rule, res, 'board', 'thread', {
        responses: [res],
        threadTitle: '',
      }),
    ).toBe(true);
  });

  it('matches idCount with aggregation map', () => {
    const responses: Res[] = [
      makeRes({ number: 1, dateTime: '2024/01/15(月) 12:00:00 ID:spammer' }),
      makeRes({ number: 2, dateTime: '2024/01/15(月) 12:01:00 ID:spammer' }),
      makeRes({ number: 3, dateTime: '2024/01/15(月) 12:02:00 ID:spammer' }),
    ];
    const rule: NgRule = {
      id: 'idc',
      condition: {
        type: 'numeric',
        target: NgNumericTarget.IdCount,
        op: NgNumericOp.Gte,
        value: 3,
        negate: false,
      },
      target: NgTarget.Response,
      abonType: AbonType.Normal,
      enabled: true,
    };
    const res0 = responses[0];
    if (res0 === undefined) throw new Error('test setup');
    expect(
      matchesNgRule(rule, res0, 'board', 'thread', {
        responses,
        threadTitle: '',
      }),
    ).toBe(true);
  });

  it('matches repliedCount with aggregation map', () => {
    const responses: Res[] = [
      makeRes({ number: 1, body: 'first' }),
      makeRes({ number: 2, body: '>>1' }),
      makeRes({ number: 3, body: '>>1 >>1' }),
    ];
    const rule: NgRule = {
      id: 'rep',
      condition: {
        type: 'numeric',
        target: NgNumericTarget.RepliedCount,
        op: NgNumericOp.Gte,
        value: 2,
        negate: false,
      },
      target: NgTarget.Response,
      abonType: AbonType.Normal,
      enabled: true,
    };
    const res0 = responses[0];
    if (res0 === undefined) throw new Error('test setup');
    expect(
      matchesNgRule(rule, res0, 'board', 'thread', {
        responses,
        threadTitle: '',
      }),
    ).toBe(true);
  });
});

// ───────────── String field-specific matching ─────────────

describe('matchStringCondition field-specific', () => {
  it('matches against body field only (not all)', () => {
    const rule = makeRule({
      condition: { tokens: ['secret'], fields: [NgStringField.Body] },
    });
    const res = makeRes({ body: 'secret', name: 'other', dateTime: '2024/01/15 12:00:00' });
    expect(matchesNgRule(rule, res, 'board', 'thread')).toBe(true);

    const resNoBody = makeRes({ body: 'x', name: 'secret', dateTime: '2024/01/15 12:00:00' });
    expect(matchesNgRule(rule, resNoBody, 'board', 'thread')).toBe(false);
  });

  it('matches against name field only', () => {
    const rule = makeRule({
      condition: { tokens: ['VIP'], fields: [NgStringField.Name] },
    });
    const res = makeRes({ name: 'VIP', body: 'hello' });
    expect(matchesNgRule(rule, res, 'board', 'thread')).toBe(true);

    const resNoName = makeRes({ name: 'normal', body: 'VIP user' });
    expect(matchesNgRule(rule, resNoName, 'board', 'thread')).toBe(false);
  });

  it('matches against id field extracted from dateTime', () => {
    const rule = makeRule({
      condition: { tokens: ['SpAmId123'], fields: [NgStringField.Id] },
    });
    const res = makeRes({ dateTime: '2024/01/15 12:00:00 ID:SpAmId123', body: 'x' });
    expect(matchesNgRule(rule, res, 'board', 'thread')).toBe(true);

    const resNoId = makeRes({ dateTime: '2024/01/15 12:00:00', body: 'SpAmId123' });
    expect(matchesNgRule(rule, resNoId, 'board', 'thread')).toBe(false);
  });

  it('matches against threadTitle field', () => {
    const rule = makeRule({
      condition: { tokens: ['荒らし'], fields: [NgStringField.ThreadTitle] },
    });
    const res = makeRes({ body: 'normal', title: '' });
    expect(matchesNgRule(rule, res, 'board', 'thread', { threadTitle: '荒らしスレッド' })).toBe(
      true,
    );
    expect(matchesNgRule(rule, res, 'board', 'thread', { threadTitle: '普通のスレ' })).toBe(false);
  });

  it('matches against multiple fields (name + body)', () => {
    const rule = makeRule({
      condition: { tokens: ['a', 'b'], fields: [NgStringField.Name, NgStringField.Body] },
    });
    const res = makeRes({ name: 'aaa', body: 'bbb' });
    expect(matchesNgRule(rule, res, 'board', 'thread')).toBe(true);

    const resPartial = makeRes({ name: 'aaa', body: 'xxx' });
    expect(matchesNgRule(rule, resPartial, 'board', 'thread')).toBe(false);
  });
});

// ───────────── String negate tests ─────────────

describe('matchStringCondition negate', () => {
  it('negate=true with plain: token present → false, token absent → true', () => {
    const rule = makeRule({
      condition: { tokens: ['NG'], negate: true },
    });
    const resWith = makeRes({ body: 'NG word' });
    const resWithout = makeRes({ body: 'ok' });
    expect(matchesNgRule(rule, resWith, 'board', 'thread')).toBe(false);
    expect(matchesNgRule(rule, resWithout, 'board', 'thread')).toBe(true);
  });

  it('negate=true with regexp match', () => {
    const rule = makeRule({
      condition: { tokens: ['[Ss]pam'], matchMode: 'regexp', negate: true },
    });
    const resMatch = makeRes({ body: 'spam' });
    const resNoMatch = makeRes({ body: 'legit' });
    expect(matchesNgRule(rule, resMatch, 'board', 'thread')).toBe(false);
    expect(matchesNgRule(rule, resNoMatch, 'board', 'thread')).toBe(true);
  });
});

// ───────────── regexp_nocase tests ─────────────

describe('matchStringCondition regexp_nocase', () => {
  it('regexp_nocase matches case-insensitively', () => {
    const rule = makeRule({
      condition: { tokens: ['SPAM'], matchMode: 'regexp_nocase' },
    });
    expect(matchesNgRule(rule, makeRes({ body: 'SPAM' }), 'board', 'thread')).toBe(true);
    expect(matchesNgRule(rule, makeRes({ body: 'spam' }), 'board', 'thread')).toBe(true);
    expect(matchesNgRule(rule, makeRes({ body: 'SpAm' }), 'board', 'thread')).toBe(true);
  });

  it('regexp (without nocase) is case-sensitive', () => {
    const rule = makeRule({
      condition: { tokens: ['SPAM'], matchMode: 'regexp' },
    });
    expect(matchesNgRule(rule, makeRes({ body: 'SPAM' }), 'board', 'thread')).toBe(true);
    expect(matchesNgRule(rule, makeRes({ body: 'spam' }), 'board', 'thread')).toBe(false);
  });
});

// ───────────── Migration tests ─────────────

describe('parseLegacyNgFile', () => {
  it('converts old NGword.txt format to NgRule[]', () => {
    const content = `荒らし\tスパム
\t{{REGEXP}}\t[Ss]pam
{{BOARD:newsplus}}\t政治`;
    const rules = parseLegacyNgFile(content);
    expect(rules).toHaveLength(3);
    expect(rules[0]?.condition.type).toBe('string');
    if (rules[0]?.condition.type === 'string') {
      expect(rules[0].condition.tokens).toEqual(['荒らし', 'スパム']);
    }
    if (rules[2]?.condition.type === 'string') {
      expect(rules[2].condition.tokens).toEqual(['政治']);
    }
    expect(rules[2]?.boardId).toBe('newsplus');
  });
});

describe('legacyRuleToNew preservation', () => {
  it('preserves boardId and threadId', () => {
    const legacy = {
      id: 'leg',
      target: NgTarget.Response,
      abonType: AbonType.Normal,
      matchMode: NgMatchMode.Plain,
      tokens: ['x'],
      boardId: 'news',
      threadId: '123456',
      enabled: true,
    };
    const rule = legacyRuleToNew(legacy);
    expect(rule.boardId).toBe('news');
    expect(rule.threadId).toBe('123456');
  });

  it('preserves disabled rules through legacy conversion', () => {
    const legacy = {
      id: 'leg-disabled',
      abonType: AbonType.Normal,
      matchMode: NgMatchMode.Plain,
      tokens: ['x'],
      enabled: false,
    };
    const rule = legacyRuleToNew(legacy);
    expect(rule.enabled).toBe(false);
  });
});

// ───────────── Additional numeric tests ─────────────

describe('buildNumericValuesForRes', () => {
  it('returns correct lineCount, charCount, replyCount', () => {
    const idCountMap = new Map<string, number>([['id1', 2]]);
    const repliedCountMap = new Map<number, number>([[1, 3]]);
    const res = makeRes({
      number: 1,
      body: 'line1\nline2\nline3',
      dateTime: '2024/01/15 12:00:00 ID:id1',
    });
    const vals = buildNumericValuesForRes(res, idCountMap, repliedCountMap, 10, 0);
    expect(vals['lineCount']).toBe(3);
    expect(vals['charCount']).toBe(15); // "line1" + "line2" + "line3" (newlines stripped)
    expect(vals['replyCount']).toBe(0);
    expect(vals['repliedCount']).toBe(3);
    expect(vals['idCount']).toBe(2);
  });

  it('lineCount counts newlines correctly', () => {
    const emptyMap = new Map<string, number>();
    const repliedMap = new Map<number, number>();
    const res = makeRes({ body: 'a\n\nb' });
    const vals = buildNumericValuesForRes(res, emptyMap, repliedMap, 0, 0);
    expect(vals['lineCount']).toBe(3);
  });

  it('charCount strips HTML tags before counting', () => {
    const emptyMap = new Map<string, number>();
    const repliedMap = new Map<number, number>();
    const res = makeRes({ body: '<br>hi</br><a href="#">link</a>' });
    const vals = buildNumericValuesForRes(res, emptyMap, repliedMap, 0, 0);
    expect(vals['charCount']).toBe(6); // "hi" + "link" = 2+4
  });
});

// ───────────── Additional field extraction tests ─────────────

describe('stripHtmlTags and extractStringFields', () => {
  it('stripHtmlTags strips <br> and <a> tags', () => {
    expect(stripHtmlTags('<br>text</br>')).toBe('text');
    expect(stripHtmlTags('<a href="x">link</a>')).toBe('link');
  });

  it('extractStringFields with empty dateTime (no ID found)', () => {
    const res = makeRes({ dateTime: '2024/01/15(月) 12:34:56', body: 'x' });
    const fields = extractStringFields(res, '');
    expect(fields.id).toBe('');
  });

  it('extractStringFields with 発信元 pattern instead of ID', () => {
    const res = makeRes({ dateTime: '2024/01/15(月) 12:34:56 発信元:abc123', body: 'x' });
    const fields = extractStringFields(res, '');
    expect(fields.id).toBe('abc123');
  });

  it('threadTitle is correctly passed through', () => {
    const res = makeRes({ body: 'x', title: '' });
    const fields = extractStringFields(res, 'スレタイトル');
    expect(fields.threadTitle).toBe('スレタイトル');
  });
});
