/**
 * Post result type detection tests.
 * Covers all grt* result types from server response HTML.
 */
import { describe, it, expect } from 'vitest';
import { detectResultType, extractHiddenFields } from '../../src/main/services/post';
import { PostResultType } from '../../src/types/domain';

describe('detectResultType', () => {
  it('detects grtOK', () => {
    expect(detectResultType('書きこみが終わりました')).toBe(PostResultType.OK);
    expect(detectResultType('<html><body>書きこみが終わりました</body></html>')).toBe(PostResultType.OK);
  });

  it('detects grtCookie', () => {
    expect(detectResultType('クッキーがないか期限切れです')).toBe(PostResultType.Cookie);
    expect(detectResultType('クッキー確認！')).toBe(PostResultType.Cookie);
  });

  it('detects grtCheck', () => {
    expect(detectResultType('書き込み確認します')).toBe(PostResultType.Check);
    expect(detectResultType('内容確認')).toBe(PostResultType.Check);
    expect(detectResultType('書き込みチェック！')).toBe(PostResultType.Check);
  });

  it('detects grtDonguri', () => {
    expect(detectResultType('どんぐりを埋めました')).toBe(PostResultType.Donguri);
  });

  it('detects grtDngBroken', () => {
    expect(detectResultType('broken_acorn')).toBe(PostResultType.DonguriError);
    expect(detectResultType('[1044]')).toBe(PostResultType.DonguriError);
    expect(detectResultType('[1045]')).toBe(PostResultType.DonguriError);
  });

  it('detects grtNinpou', () => {
    expect(detectResultType('忍法の認法を新規作成します')).toBe(PostResultType.Ninpou);
  });

  it('detects grtSuiton', () => {
    expect(detectResultType('Lv=0')).toBe(PostResultType.Suiton);
    expect(detectResultType('殺されました')).toBe(PostResultType.Suiton);
  });

  it('returns grtError for unknown responses', () => {
    expect(detectResultType('Something unknown happened')).toBe(PostResultType.Error);
    expect(detectResultType('')).toBe(PostResultType.Error);
  });
});

describe('extractHiddenFields', () => {
  it('extracts hidden input fields', () => {
    const html = `
      <form>
        <input type="hidden" name="hap" value="abc123">
        <input type="hidden" name="time" value="1700000000">
        <input type="submit" value="送信">
      </form>
    `;
    const fields = extractHiddenFields(html);
    expect(fields['hap']).toBe('abc123');
    expect(fields['time']).toBe('1700000000');
  });

  it('handles quoted attribute values', () => {
    const html = '<input type="hidden" name="key" value="value with spaces">';
    const fields = extractHiddenFields(html);
    expect(fields['key']).toBe('value with spaces');
  });

  it('returns empty object for no hidden fields', () => {
    const html = '<form><input type="text" name="foo" value="bar"></form>';
    const fields = extractHiddenFields(html);
    expect(Object.keys(fields)).toHaveLength(0);
  });
});
