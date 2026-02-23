import { describe, it, expect } from 'vitest';
import { parseAnchors, convertAnchorsToLinks } from '../../src/renderer/utils/anchor-parser';

describe('parseAnchors', () => {
  it('parses single anchor >>N', () => {
    const result = parseAnchors('test &gt;&gt;123 text');
    expect(result).toHaveLength(1);
    expect(result[0]?.numbers).toEqual([123]);
    expect(result[0]?.raw).toBe('&gt;&gt;123');
  });

  it('parses single anchor >N (one arrow)', () => {
    const result = parseAnchors('&gt;55 text');
    expect(result).toHaveLength(1);
    expect(result[0]?.numbers).toEqual([55]);
  });

  it('parses range anchor >>N-M', () => {
    const result = parseAnchors('&gt;&gt;100-105');
    expect(result).toHaveLength(1);
    expect(result[0]?.numbers).toEqual([100, 101, 102, 103, 104, 105]);
  });

  it('parses comma-separated anchor >>N,M,O', () => {
    const result = parseAnchors('&gt;&gt;1,3,5');
    expect(result).toHaveLength(1);
    expect(result[0]?.numbers).toEqual([1, 3, 5]);
  });

  it('parses full-width arrows ＞＞N', () => {
    const result = parseAnchors('＞＞42');
    expect(result).toHaveLength(1);
    expect(result[0]?.numbers).toEqual([42]);
  });

  it('parses full-width digits ＞＞１２３', () => {
    const result = parseAnchors('＞＞１２３');
    expect(result).toHaveLength(1);
    expect(result[0]?.numbers).toEqual([123]);
  });

  it('parses mixed full/half width digits', () => {
    const result = parseAnchors('&gt;&gt;１0３');
    expect(result).toHaveLength(1);
    expect(result[0]?.numbers).toEqual([103]);
  });

  it('parses multiple anchors in one string', () => {
    const result = parseAnchors('&gt;&gt;1 text &gt;&gt;2 more &gt;&gt;3');
    expect(result).toHaveLength(3);
    expect(result[0]?.numbers).toEqual([1]);
    expect(result[1]?.numbers).toEqual([2]);
    expect(result[2]?.numbers).toEqual([3]);
  });

  it('limits range to 100 items', () => {
    const result = parseAnchors('&gt;&gt;1-200');
    // Range too large, falls back to start only
    expect(result).toHaveLength(1);
    expect(result[0]?.numbers).toEqual([1]);
  });

  it('returns empty for non-numeric content', () => {
    const result = parseAnchors('&gt;&gt;abc');
    expect(result).toHaveLength(0);
  });

  it('returns empty for zero', () => {
    const result = parseAnchors('&gt;&gt;0');
    expect(result).toHaveLength(0);
  });

  it('deduplicates comma list', () => {
    const result = parseAnchors('&gt;&gt;1,1,2');
    expect(result).toHaveLength(1);
    expect(result[0]?.numbers).toEqual([1, 2]);
  });

  it('handles full-width range ＞＞１００ー１０５', () => {
    const result = parseAnchors('＞＞１００ー１０５');
    expect(result).toHaveLength(1);
    expect(result[0]?.numbers).toEqual([100, 101, 102, 103, 104, 105]);
  });
});

describe('convertAnchorsToLinks', () => {
  it('converts single anchor to link', () => {
    const result = convertAnchorsToLinks('&gt;&gt;123');
    expect(result).toBe(
      '<a href="#res-123" class="anchor-link" data-anchor-nums="123">&gt;&gt;123</a>',
    );
  });

  it('converts range anchor preserving all numbers in data attribute', () => {
    const result = convertAnchorsToLinks('&gt;&gt;1-3');
    expect(result).toContain('data-anchor-nums="1,2,3"');
    expect(result).toContain('href="#res-1"');
  });

  it('preserves surrounding text', () => {
    const result = convertAnchorsToLinks('before &gt;&gt;5 after');
    expect(result).toBe(
      'before <a href="#res-5" class="anchor-link" data-anchor-nums="5">&gt;&gt;5</a> after',
    );
  });

  it('does not convert non-anchor content', () => {
    const result = convertAnchorsToLinks('plain text without anchors');
    expect(result).toBe('plain text without anchors');
  });

  it('converts multiple anchors in one string', () => {
    const result = convertAnchorsToLinks('&gt;&gt;1 and &gt;&gt;2');
    expect(result).toContain('data-anchor-nums="1"');
    expect(result).toContain('data-anchor-nums="2"');
  });
});
