import { describe, it, expect } from 'vitest';
import { parseKotehanFromIni, serializeKotehanToIni } from '../../src/main/services/kotehan';

describe('parseKotehanFromIni', () => {
  it('parses name and mail from [Kotehan] section', () => {
    const ini = `[Status]
RoundDate=12345

[Kotehan]
Name=テスト名
Mail=sage

[Cookie]
SPID=abc`;

    const result = parseKotehanFromIni(ini);
    expect(result.name).toBe('テスト名');
    expect(result.mail).toBe('sage');
  });

  it('returns empty strings when no [Kotehan] section exists', () => {
    const ini = `[Status]
RoundDate=12345`;

    const result = parseKotehanFromIni(ini);
    expect(result.name).toBe('');
    expect(result.mail).toBe('');
  });

  it('returns empty strings for empty file', () => {
    const result = parseKotehanFromIni('');
    expect(result.name).toBe('');
    expect(result.mail).toBe('');
  });

  it('handles [Kotehan] section with only Name', () => {
    const ini = `[Kotehan]
Name=onlyname`;

    const result = parseKotehanFromIni(ini);
    expect(result.name).toBe('onlyname');
    expect(result.mail).toBe('');
  });

  it('handles [Kotehan] section with only Mail', () => {
    const ini = `[Kotehan]
Mail=sage`;

    const result = parseKotehanFromIni(ini);
    expect(result.name).toBe('');
    expect(result.mail).toBe('sage');
  });

  it('ignores Name/Mail outside [Kotehan] section', () => {
    const ini = `[Other]
Name=wrong
Mail=wrong

[Kotehan]
Name=correct
Mail=correct`;

    const result = parseKotehanFromIni(ini);
    expect(result.name).toBe('correct');
    expect(result.mail).toBe('correct');
  });
});

describe('serializeKotehanToIni', () => {
  it('adds [Kotehan] section to empty file', () => {
    const result = serializeKotehanToIni('', { name: 'test', mail: 'sage' });
    expect(result).toContain('[Kotehan]');
    expect(result).toContain('Name=test');
    expect(result).toContain('Mail=sage');
  });

  it('updates existing [Kotehan] section', () => {
    const existing = `[Status]
RoundDate=12345

[Kotehan]
Name=oldname
Mail=oldmail

[Cookie]
SPID=abc`;

    const result = serializeKotehanToIni(existing, { name: 'newname', mail: 'sage' });
    expect(result).toContain('Name=newname');
    expect(result).toContain('Mail=sage');
    expect(result).not.toContain('oldname');
    expect(result).not.toContain('oldmail');
    // Preserve other sections
    expect(result).toContain('[Status]');
    expect(result).toContain('RoundDate=12345');
    expect(result).toContain('[Cookie]');
    expect(result).toContain('SPID=abc');
  });

  it('appends [Kotehan] section to file without it', () => {
    const existing = `[Status]
RoundDate=12345`;

    const result = serializeKotehanToIni(existing, { name: 'test', mail: 'sage' });
    expect(result).toContain('[Status]');
    expect(result).toContain('[Kotehan]');
    expect(result).toContain('Name=test');
    expect(result).toContain('Mail=sage');
  });

  it('handles empty name and mail', () => {
    const result = serializeKotehanToIni('', { name: '', mail: '' });
    expect(result).toContain('Name=');
    expect(result).toContain('Mail=');
  });
});
