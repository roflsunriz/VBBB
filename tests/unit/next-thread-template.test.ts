/**
 * Tests for next-thread template generation.
 * Covers: HTML→text, VIPQ2 !extend handling, title number increment,
 * previous thread URL replacement, and the full template generator.
 */
import { describe, it, expect } from 'vitest';
import {
  htmlBodyToText,
  incrementTitleNumber,
  generateNextThreadTemplate,
} from '../../src/renderer/utils/next-thread-template';

describe('htmlBodyToText', () => {
  it('converts <br> to newline', () => {
    expect(htmlBodyToText('line1<br>line2')).toBe('line1\nline2');
  });

  it('converts <br /> (self-closing) to newline', () => {
    expect(htmlBodyToText('a<br />b<br/>c')).toBe('a\nb\nc');
  });

  it('strips HTML tags', () => {
    expect(htmlBodyToText('<b>bold</b> <a href="x">link</a>')).toBe('bold link');
  });

  it('decodes HTML entities', () => {
    expect(htmlBodyToText('&lt;test&gt; &amp; &quot;hello&quot;')).toBe('<test> & "hello"');
  });

  it('handles combined HTML', () => {
    const html = '!extend:checked:vvvvvv:1000:512<br>テスト &amp; 本文';
    expect(htmlBodyToText(html)).toBe('!extend:checked:vvvvvv:1000:512\nテスト & 本文');
  });
});

describe('incrementTitleNumber', () => {
  it('increments the rightmost number', () => {
    expect(incrementTitleNumber('ブルアカ★1')).toBe('ブルアカ★2');
  });

  it('increments Part number', () => {
    expect(incrementTitleNumber('雑談スレ Part12')).toBe('雑談スレ Part13');
  });

  it('increments "その" number', () => {
    expect(incrementTitleNumber('日常スレ その45')).toBe('日常スレ その46');
  });

  it('handles titles with multiple numbers (increments rightmost)', () => {
    expect(incrementTitleNumber('シリーズ2 Part5')).toBe('シリーズ2 Part6');
  });

  it('returns original title when no number is found', () => {
    expect(incrementTitleNumber('番号なしスレ')).toBe('番号なしスレ');
  });

  it('handles large numbers', () => {
    expect(incrementTitleNumber('スレ999')).toBe('スレ1000');
  });
});

describe('generateNextThreadTemplate', () => {
  const baseInput = {
    boardUrl: 'https://news.5ch.net/newsplus/',
    threadId: '1234567890',
  };

  it('generates subject with incremented number', () => {
    const result = generateNextThreadTemplate({
      ...baseInput,
      firstPostBody: '本文テスト',
      currentTitle: '雑談スレ Part5',
    });
    expect(result.subject).toBe('雑談スレ Part6');
  });

  it('prepends 2 additional !extend lines when body contains !extend', () => {
    const body = ['!extend:checked:vvvvvv:1000:512', 'テスト本文'].join('<br>');

    const result = generateNextThreadTemplate({
      ...baseInput,
      firstPostBody: body,
      currentTitle: 'テスト★1',
    });

    const lines = result.message.split('\n');
    expect(lines[0]).toBe('!extend:checked:vvvvvv:1000:512');
    expect(lines[1]).toBe('!extend:checked:vvvvvv:1000:512');
    expect(lines[2]).toBe('!extend:checked:vvvvvv:1000:512');
    expect(lines[3]).toBe('テスト本文');
  });

  it('removes VIPQ2_EXTDAT system lines', () => {
    const body = [
      '!extend:checked:vvvvvv:1000:512',
      'テスト本文',
      'VIPQ2_EXTDAT: checked:vvvvvv:1000:512 EXT was configured',
    ].join('<br>');

    const result = generateNextThreadTemplate({
      ...baseInput,
      firstPostBody: body,
      currentTitle: 'テスト★1',
    });

    expect(result.message).not.toContain('VIPQ2_EXTDAT');
  });

  it('replaces previous thread URL with current thread URL', () => {
    const prevUrl = 'https://news.5ch.net/test/read.cgi/newsplus/9999999999/';
    const body = `前スレ<br>${prevUrl}<br>テスト`;

    const result = generateNextThreadTemplate({
      ...baseInput,
      firstPostBody: body,
      currentTitle: 'テスト★2',
    });

    expect(result.message).not.toContain('9999999999');
    expect(result.message).toContain('https://news.5ch.net/test/read.cgi/newsplus/1234567890/');
  });

  it('handles body without !extend (no lines prepended)', () => {
    const result = generateNextThreadTemplate({
      ...baseInput,
      firstPostBody: 'シンプルな本文',
      currentTitle: 'シンプルスレ 1',
    });

    expect(result.subject).toBe('シンプルスレ 2');
    expect(result.message).toBe('シンプルな本文');
  });

  it('handles multiple !extend lines (preserves existing + adds 2)', () => {
    const body = [
      '!extend:checked:vvvvvv:1000:512',
      '!extend:checked:vvvvvv:1000:512',
      'テスト本文',
    ].join('<br>');

    const result = generateNextThreadTemplate({
      ...baseInput,
      firstPostBody: body,
      currentTitle: 'テスト★3',
    });

    const lines = result.message.split('\n');
    let extendCount = 0;
    for (const line of lines) {
      if (line.startsWith('!extend:')) extendCount++;
    }
    expect(extendCount).toBe(4);
  });

  it('handles 2ch.net URLs', () => {
    const prevUrl = 'http://rio2016.2ch.net/test/read.cgi/newsplus/9999999999/';
    const body = `前スレ<br>${prevUrl}`;

    const result = generateNextThreadTemplate({
      ...baseInput,
      firstPostBody: body,
      currentTitle: 'テスト★1',
    });

    expect(result.message).not.toContain('9999999999');
    expect(result.message).toContain('1234567890');
  });

  it('handles bbspink.com URLs', () => {
    const prevUrl = 'https://phoebe.bbspink.com/test/read.cgi/pinkplus/9999999999/';
    const body = `前スレ<br>${prevUrl}`;

    const result = generateNextThreadTemplate({
      boardUrl: 'https://phoebe.bbspink.com/pinkplus/',
      threadId: '1111111111',
      firstPostBody: body,
      currentTitle: 'テスト★1',
    });

    expect(result.message).not.toContain('9999999999');
    expect(result.message).toContain(
      'https://phoebe.bbspink.com/test/read.cgi/pinkplus/1111111111/',
    );
  });
});
