import { describe, it, expect, beforeEach } from 'vitest';
import { parseReplaceIni, applyDatReplace, clearReplaceCache } from '../../src/main/services/dat-replace';

beforeEach(() => {
  clearReplaceCache();
});

describe('parseReplaceIni', () => {
  it('parses basic tab-separated rules', () => {
    const content = 'search\treplacement\nanother\tvalue';
    const rules = parseReplaceIni(content);
    expect(rules).toHaveLength(2);
    expect(rules[0]?.search).toBe('search');
    expect(rules[0]?.replacement).toBe('replacement');
    expect(rules[1]?.search).toBe('another');
    expect(rules[1]?.replacement).toBe('value');
  });

  it('handles search-only lines (no tab)', () => {
    const content = 'dangerous_pattern';
    const rules = parseReplaceIni(content);
    expect(rules).toHaveLength(1);
    expect(rules[0]?.search).toBe('dangerous_pattern');
    expect(rules[0]?.replacement).toBe('');
  });

  it('skips lines containing <>', () => {
    const content = 'valid_rule\tok\nhas<>delimiter\tbad\nanother\tok';
    const rules = parseReplaceIni(content);
    expect(rules).toHaveLength(2);
    expect(rules[0]?.search).toBe('valid_rule');
    expect(rules[1]?.search).toBe('another');
  });

  it('skips empty lines', () => {
    const content = '\nsearch\treplacement\n\n';
    const rules = parseReplaceIni(content);
    expect(rules).toHaveLength(1);
  });

  it('skips comment lines', () => {
    const content = '; this is a comment\nsearch\treplacement';
    const rules = parseReplaceIni(content);
    expect(rules).toHaveLength(1);
  });

  it('unescapes supported patterns', () => {
    const content = '\\.vbs\t';
    const rules = parseReplaceIni(content);
    expect(rules[0]?.search).toBe('.vbs');
  });

  it('unescapes backslash', () => {
    const content = 'path\\\\to\treplaced';
    const rules = parseReplaceIni(content);
    expect(rules[0]?.search).toBe('path\\to');
  });
});

describe('applyDatReplace', () => {
  it('replaces matching text', () => {
    const content = 'Hello .vbs world .vbs end';
    const rules = [{ search: '.vbs', replacement: '.txt' }];
    const result = applyDatReplace(content, rules);
    expect(result).toBe('Hello .txt world .txt end');
  });

  it('replaces with spaces when replacement is empty', () => {
    const content = 'danger.hta safe content';
    const rules = [{ search: '.hta', replacement: '' }];
    const result = applyDatReplace(content, rules);
    // ".hta" is 4 chars, replaced with 4 spaces
    expect(result).toContain('danger');
    expect(result).not.toContain('.hta');
    expect(result.length).toBe(content.length);
  });

  it('handles multiple rules sequentially', () => {
    const content = 'file.vbs and file.hta';
    const rules = [
      { search: '.vbs', replacement: '' },
      { search: '.hta', replacement: '' },
    ];
    const result = applyDatReplace(content, rules);
    expect(result).toBe('file     and file    ');
  });

  it('returns unchanged content with empty rules', () => {
    const content = 'Hello world';
    const result = applyDatReplace(content, []);
    expect(result).toBe('Hello world');
  });

  it('handles no matches gracefully', () => {
    const content = 'Safe content here';
    const rules = [{ search: 'dangerous', replacement: '' }];
    const result = applyDatReplace(content, rules);
    expect(result).toBe('Safe content here');
  });

  it('skips rules with empty search', () => {
    const content = 'Hello world';
    const rules = [{ search: '', replacement: 'ignored' }];
    const result = applyDatReplace(content, rules);
    expect(result).toBe('Hello world');
  });
});
