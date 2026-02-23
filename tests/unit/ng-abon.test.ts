import { describe, it, expect } from 'vitest';
import {
  parseNgLine,
  parseNgFile,
  serializeNgRules,
  matchesNgRule,
  applyNgRules,
  matchesThreadNgRule,
  matchesBoardNgRule,
} from '../../src/main/services/ng-abon';
import type { Res } from '../../src/types/domain';
import type { NgRule } from '../../src/types/ng';
import { AbonType, NgMatchMode, NgFilterResult, NgTarget } from '../../src/types/ng';

const makeRes = (overrides: Partial<Res> = {}): Res => ({
  number: 1,
  name: '名無しさん',
  mail: 'sage',
  dateTime: '2024/01/15(月) 12:34:56.78 ID:AbCdEfGh0',
  body: 'テスト本文',
  title: '',
  ...overrides,
});

const makeRule = (overrides: Partial<NgRule> = {}): NgRule => ({
  id: 'test-rule',
  abonType: AbonType.Normal,
  matchMode: NgMatchMode.Plain,
  tokens: ['荒らし'],
  boardId: undefined,
  threadId: undefined,
  enabled: true,
  ...overrides,
});

describe('parseNgLine', () => {
  it('parses simple NG word (normal abon)', () => {
    const rule = parseNgLine('荒らし\tスパム');
    expect(rule).not.toBeNull();
    expect(rule?.abonType).toBe(AbonType.Normal);
    expect(rule?.matchMode).toBe(NgMatchMode.Plain);
    expect(rule?.tokens).toEqual(['荒らし', 'スパム']);
  });

  it('parses transparent abon (leading tab)', () => {
    const rule = parseNgLine('\t荒らし');
    expect(rule).not.toBeNull();
    expect(rule?.abonType).toBe(AbonType.Transparent);
    expect(rule?.tokens).toEqual(['荒らし']);
  });

  it('parses regex rule', () => {
    const rule = parseNgLine('\t{{REGEXP}}\t[Ss]pam.*bot');
    expect(rule).not.toBeNull();
    expect(rule?.abonType).toBe(AbonType.Transparent);
    expect(rule?.matchMode).toBe(NgMatchMode.Regexp);
    expect(rule?.tokens).toEqual(['[Ss]pam.*bot']);
  });

  it('parses board scope', () => {
    const rule = parseNgLine('{{BOARD:newsplus}}\t政治');
    expect(rule).not.toBeNull();
    expect(rule?.boardId).toBe('newsplus');
    expect(rule?.tokens).toEqual(['政治']);
  });

  it('parses thread scope', () => {
    const rule = parseNgLine('\t{{THREAD:newsplus/1234567890}}\t特定ワード');
    expect(rule).not.toBeNull();
    expect(rule?.boardId).toBe('newsplus');
    expect(rule?.threadId).toBe('1234567890');
    expect(rule?.tokens).toEqual(['特定ワード']);
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
    const rules: NgRule[] = [makeRule({ tokens: ['荒らし', 'スパム'] })];
    const result = serializeNgRules(rules);
    expect(result).toBe('荒らし\tスパム');
  });

  it('serializes transparent abon with leading tab', () => {
    const rules: NgRule[] = [makeRule({ abonType: AbonType.Transparent, tokens: ['テスト'] })];
    const result = serializeNgRules(rules);
    expect(result).toBe('\tテスト');
  });

  it('serializes regex rule', () => {
    const rules: NgRule[] = [makeRule({ matchMode: NgMatchMode.Regexp, tokens: ['[Ss]pam'] })];
    const result = serializeNgRules(rules);
    expect(result).toContain('{{REGEXP}}');
    expect(result).toContain('[Ss]pam');
  });

  it('serializes board scope', () => {
    const rules: NgRule[] = [makeRule({ boardId: 'newsplus', tokens: ['政治'] })];
    const result = serializeNgRules(rules);
    expect(result).toContain('{{BOARD:newsplus}}');
  });

  it('serializes thread scope', () => {
    const rules: NgRule[] = [
      makeRule({ boardId: 'newsplus', threadId: '1234567890', tokens: ['特定'] }),
    ];
    const result = serializeNgRules(rules);
    expect(result).toContain('{{THREAD:newsplus/1234567890}}');
  });

  it('skips disabled rules', () => {
    const rules: NgRule[] = [makeRule({ enabled: false, tokens: ['hidden'] })];
    expect(serializeNgRules(rules)).toBe('');
  });
});

describe('matchesNgRule', () => {
  it('matches plain text in body', () => {
    const rule = makeRule({ tokens: ['テスト'] });
    const res = makeRes({ body: 'テスト本文' });
    expect(matchesNgRule(rule, res, 'board', 'thread')).toBe(true);
  });

  it('matches AND condition (all tokens required)', () => {
    const rule = makeRule({ tokens: ['名無し', 'sage'] });
    const res = makeRes();
    expect(matchesNgRule(rule, res, 'board', 'thread')).toBe(true);
  });

  it('fails AND condition when not all tokens match', () => {
    const rule = makeRule({ tokens: ['名無し', 'nonexistent'] });
    const res = makeRes();
    expect(matchesNgRule(rule, res, 'board', 'thread')).toBe(false);
  });

  it('matches regex pattern', () => {
    const rule = makeRule({ matchMode: NgMatchMode.Regexp, tokens: ['ID:[A-Z]{4}'] });
    const res = makeRes({ dateTime: '2024/01/15 12:34:56 ID:ABCD1234' });
    expect(matchesNgRule(rule, res, 'board', 'thread')).toBe(true);
  });

  it('handles invalid regex gracefully', () => {
    const rule = makeRule({ matchMode: NgMatchMode.Regexp, tokens: ['[invalid'] });
    const res = makeRes();
    expect(matchesNgRule(rule, res, 'board', 'thread')).toBe(false);
  });

  it('respects board scope', () => {
    const rule = makeRule({ boardId: 'newsplus', tokens: ['テスト'] });
    const res = makeRes({ body: 'テスト' });
    expect(matchesNgRule(rule, res, 'newsplus', 'thread')).toBe(true);
    expect(matchesNgRule(rule, res, 'otherboard', 'thread')).toBe(false);
  });

  it('respects thread scope', () => {
    const rule = makeRule({ boardId: 'newsplus', threadId: '123', tokens: ['テスト'] });
    const res = makeRes({ body: 'テスト' });
    expect(matchesNgRule(rule, res, 'newsplus', '123')).toBe(true);
    expect(matchesNgRule(rule, res, 'newsplus', '456')).toBe(false);
  });

  it('skips thread-level NG rules', () => {
    const rule = makeRule({ target: NgTarget.Thread, tokens: ['名無し'] });
    const res = makeRes();
    expect(matchesNgRule(rule, res, 'board', 'thread')).toBe(false);
  });

  it('skips board-level NG rules', () => {
    const rule = makeRule({ target: NgTarget.Board, tokens: ['名無し'] });
    const res = makeRes();
    expect(matchesNgRule(rule, res, 'board', 'thread')).toBe(false);
  });
});

describe('applyNgRules', () => {
  it('returns None when no rules match', () => {
    const rules = [makeRule({ tokens: ['nonexistent'] })];
    const res = makeRes();
    expect(applyNgRules(rules, res, 'board', 'thread')).toBe(NgFilterResult.None);
  });

  it('returns NormalAbon for normal abon match', () => {
    const rules = [makeRule({ tokens: ['名無し'] })];
    const res = makeRes();
    expect(applyNgRules(rules, res, 'board', 'thread')).toBe(NgFilterResult.NormalAbon);
  });

  it('returns TransparentAbon for transparent abon match', () => {
    const rules = [makeRule({ abonType: AbonType.Transparent, tokens: ['名無し'] })];
    const res = makeRes();
    expect(applyNgRules(rules, res, 'board', 'thread')).toBe(NgFilterResult.TransparentAbon);
  });

  it('first matching rule wins', () => {
    const rules = [
      makeRule({ id: 'r1', abonType: AbonType.Normal, tokens: ['名無し'] }),
      makeRule({ id: 'r2', abonType: AbonType.Transparent, tokens: ['名無し'] }),
    ];
    const res = makeRes();
    // First rule should match
    expect(applyNgRules(rules, res, 'board', 'thread')).toBe(NgFilterResult.NormalAbon);
  });

  it('skips disabled rules', () => {
    const rules = [makeRule({ enabled: false, tokens: ['名無し'] })];
    const res = makeRes();
    expect(applyNgRules(rules, res, 'board', 'thread')).toBe(NgFilterResult.None);
  });

  it('skips thread-level rules when applying to responses', () => {
    const rules = [makeRule({ target: NgTarget.Thread, tokens: ['名無し'] })];
    const res = makeRes();
    expect(applyNgRules(rules, res, 'board', 'thread')).toBe(NgFilterResult.None);
  });

  it('skips board-level rules when applying to responses', () => {
    const rules = [makeRule({ target: NgTarget.Board, tokens: ['名無し'] })];
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
    expect(rule?.tokens).toEqual(['荒らしスレ']);
  });

  it('parses board target marker', () => {
    const rule = parseNgLine('{{TARGET:board}}\t{{BOARD:news}}\tNG板');
    expect(rule).not.toBeNull();
    expect(rule?.target).toBe(NgTarget.Board);
    expect(rule?.boardId).toBe('news');
    expect(rule?.tokens).toEqual(['NG板']);
  });

  it('defaults to no target for response-level rules', () => {
    const rule = parseNgLine('荒らし');
    expect(rule).not.toBeNull();
    expect(rule?.target).toBeUndefined();
  });
});

describe('serializeNgRules with target', () => {
  it('serializes thread target marker', () => {
    const rules: NgRule[] = [makeRule({ target: NgTarget.Thread, tokens: ['荒らしスレ'] })];
    const result = serializeNgRules(rules);
    expect(result).toContain('{{TARGET:thread}}');
    expect(result).toContain('荒らしスレ');
  });

  it('serializes board target marker', () => {
    const rules: NgRule[] = [
      makeRule({ target: NgTarget.Board, boardId: 'news', tokens: ['NG板'] }),
    ];
    const result = serializeNgRules(rules);
    expect(result).toContain('{{TARGET:board}}');
    expect(result).toContain('{{BOARD:news}}');
    expect(result).toContain('NG板');
  });

  it('omits target marker for response rules', () => {
    const rules: NgRule[] = [makeRule({ tokens: ['テスト'] })];
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
        tokens: ['荒らし'],
      }),
    ];
    const serialized = serializeNgRules(original);
    const parsed = parseNgFile(serialized);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.target).toBe(NgTarget.Thread);
    expect(parsed[0]?.abonType).toBe(AbonType.Transparent);
    expect(parsed[0]?.boardId).toBe('news');
    expect(parsed[0]?.threadId).toBe('123');
    expect(parsed[0]?.tokens).toEqual(['荒らし']);
  });
});

describe('matchesThreadNgRule', () => {
  it('matches thread title by token', () => {
    const rule = makeRule({ target: NgTarget.Thread, tokens: ['荒らし'] });
    expect(matchesThreadNgRule(rule, '荒らしスレッド', 'board', 'thread')).toBe(true);
  });

  it('does not match when token is absent', () => {
    const rule = makeRule({ target: NgTarget.Thread, tokens: ['荒らし'] });
    expect(matchesThreadNgRule(rule, '普通のスレッド', 'board', 'thread')).toBe(false);
  });

  it('matches by exact thread ID', () => {
    const rule = makeRule({ target: NgTarget.Thread, tokens: ['dummy'], threadId: '123' });
    expect(matchesThreadNgRule(rule, 'any title', 'board', '123')).toBe(true);
    expect(matchesThreadNgRule(rule, 'any title', 'board', '456')).toBe(false);
  });

  it('respects board scope', () => {
    const rule = makeRule({ target: NgTarget.Thread, tokens: ['荒らし'], boardId: 'news' });
    expect(matchesThreadNgRule(rule, '荒らしスレ', 'news', 'thread')).toBe(true);
    expect(matchesThreadNgRule(rule, '荒らしスレ', 'other', 'thread')).toBe(false);
  });

  it('ignores response-level rules', () => {
    const rule = makeRule({ tokens: ['テスト'] });
    expect(matchesThreadNgRule(rule, 'テストスレッド', 'board', 'thread')).toBe(false);
  });

  it('supports regex matching on thread titles', () => {
    const rule = makeRule({
      target: NgTarget.Thread,
      matchMode: NgMatchMode.Regexp,
      tokens: ['荒ら.*'],
    });
    expect(matchesThreadNgRule(rule, '荒らしスレッド', 'board', 'thread')).toBe(true);
    expect(matchesThreadNgRule(rule, '普通のスレッド', 'board', 'thread')).toBe(false);
  });
});

describe('matchesBoardNgRule', () => {
  it('matches board name by token', () => {
    const rule = makeRule({ target: NgTarget.Board, tokens: ['ニュース'] });
    expect(matchesBoardNgRule(rule, 'ニュース速報', 'news')).toBe(true);
  });

  it('does not match when token is absent', () => {
    const rule = makeRule({ target: NgTarget.Board, tokens: ['ニュース'] });
    expect(matchesBoardNgRule(rule, 'プログラミング', 'prog')).toBe(false);
  });

  it('matches by exact board ID', () => {
    const rule = makeRule({ target: NgTarget.Board, tokens: ['dummy'], boardId: 'news' });
    expect(matchesBoardNgRule(rule, 'any name', 'news')).toBe(true);
    expect(matchesBoardNgRule(rule, 'any name', 'other')).toBe(false);
  });

  it('ignores response-level rules', () => {
    const rule = makeRule({ tokens: ['テスト'] });
    expect(matchesBoardNgRule(rule, 'テスト板', 'test')).toBe(false);
  });

  it('ignores thread-level rules', () => {
    const rule = makeRule({ target: NgTarget.Thread, tokens: ['テスト'] });
    expect(matchesBoardNgRule(rule, 'テスト板', 'test')).toBe(false);
  });
});
