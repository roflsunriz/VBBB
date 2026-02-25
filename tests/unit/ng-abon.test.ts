import { describe, it, expect } from 'vitest';
import {
  parseNgLine,
  parseNgFile,
  serializeNgRules,
  matchesNgRule,
  applyNgRules,
  matchesThreadNgRule,
  matchesBoardNgRule,
  legacyRuleToNew,
} from '../../src/main/services/ng-abon';
import type { Res } from '../../src/types/domain';
import type { NgRule } from '../../src/types/ng';
import {
  AbonType,
  NgMatchMode,
  NgFilterResult,
  NgTarget,
  NgStringField,
  NgStringMatchMode,
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

/** Overrides for makeRule: supports shorthand condition fields (tokens, matchMode) */
interface MakeRuleOverrides {
  id?: string;
  condition?: { tokens?: readonly string[]; matchMode?: 'plain' | 'regexp' };
  target?: NgTarget;
  abonType?: AbonType;
  boardId?: string;
  threadId?: string;
  enabled?: boolean;
}

const makeRule = (overrides: MakeRuleOverrides = {}): NgRule => {
  const cond = overrides.condition;
  const condition = {
    type: 'string' as const,
    matchMode: cond?.matchMode === 'regexp' ? NgStringMatchMode.Regexp : NgStringMatchMode.Plain,
    fields: [NgStringField.All] as const,
    tokens: cond?.tokens ?? ['荒らし'],
    negate: false,
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
