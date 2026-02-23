import { describe, it, expect } from 'vitest';
import { parseSambaIni, serializeSambaIni } from '../../src/main/services/samba';

describe('parseSambaIni', () => {
  it('parses setting and send sections', () => {
    const ini = `[Setting]
academy6=40
atlanta=5
@bgame=60

[Send]
bgame=2024-01-15T12:00:00.000Z
newsplus=2024-01-15T13:00:00.000Z`;

    const data = parseSambaIni(ini);
    expect(data.settings.get('academy6')).toBe(40);
    expect(data.settings.get('atlanta')).toBe(5);
    expect(data.settings.get('@bgame')).toBe(60);
    expect(data.sends.get('bgame')).toBe('2024-01-15T12:00:00.000Z');
    expect(data.sends.get('newsplus')).toBe('2024-01-15T13:00:00.000Z');
  });

  it('returns empty maps for empty file', () => {
    const data = parseSambaIni('');
    expect(data.settings.size).toBe(0);
    expect(data.sends.size).toBe(0);
  });

  it('ignores comments', () => {
    const ini = `[Setting]
; this is a comment
test=30`;

    const data = parseSambaIni(ini);
    expect(data.settings.get('test')).toBe(30);
    expect(data.settings.size).toBe(1);
  });

  it('ignores invalid interval values', () => {
    const ini = `[Setting]
valid=30
invalid=abc`;

    const data = parseSambaIni(ini);
    expect(data.settings.get('valid')).toBe(30);
    expect(data.settings.has('invalid')).toBe(false);
  });

  it('handles zero interval', () => {
    const ini = `[Setting]
test=0`;

    const data = parseSambaIni(ini);
    expect(data.settings.get('test')).toBe(0);
  });
});

describe('serializeSambaIni', () => {
  it('serializes settings and sends', () => {
    const data = {
      settings: new Map([
        ['test', 30],
        ['@board', 60],
      ]),
      sends: new Map([['test', '2024-01-01T00:00:00.000Z']]),
    };

    const result = serializeSambaIni(data);
    expect(result).toContain('[Setting]');
    expect(result).toContain('test=30');
    expect(result).toContain('@board=60');
    expect(result).toContain('[Send]');
    expect(result).toContain('test=2024-01-01T00:00:00.000Z');
  });

  it('handles empty data', () => {
    const data = {
      settings: new Map<string, number>(),
      sends: new Map<string, string>(),
    };

    const result = serializeSambaIni(data);
    expect(result).toContain('[Setting]');
    expect(result).toContain('[Send]');
  });

  it('roundtrips parse -> serialize', () => {
    const ini = `[Setting]
academy6=40
@bgame=60

[Send]
bgame=2024-01-15T12:00:00.000Z`;

    const parsed = parseSambaIni(ini);
    const serialized = serializeSambaIni(parsed);
    const reparsed = parseSambaIni(serialized);

    expect(reparsed.settings.get('academy6')).toBe(40);
    expect(reparsed.settings.get('@bgame')).toBe(60);
    expect(reparsed.sends.get('bgame')).toBe('2024-01-15T12:00:00.000Z');
  });
});
