import { describe, it, expect } from 'vitest';

/**
 * Local search logic tests.
 * Since searchLocal depends on file system access, we test the underlying
 * helper functions by importing the DAT parser and matching logic.
 */
import { parseDat } from '../../src/main/services/dat';

describe('local search - DAT grep logic', () => {
  const sampleDat = [
    'Test User<>sage<>2024/01/01 12:00:00 ID:abc123<>Hello world<>Thread Title',
    'Another<>age<>2024/01/02 12:00:00 ID:def456<>Second post with keyword<>',
    'Admin<><>2024/01/03 12:00:00 ID:ghi789<>Third post<>',
  ].join('\n');

  it('parses DAT correctly for search', () => {
    const responses = parseDat(sampleDat);
    expect(responses).toHaveLength(3);
    expect(responses[0]?.name).toBe('Test User');
    expect(responses[0]?.body).toBe('Hello world');
    expect(responses[1]?.body).toBe('Second post with keyword');
  });

  it('can regex match body content', () => {
    const responses = parseDat(sampleDat);
    const regex = /keyword/i;
    const matches = responses.filter((r) => regex.test(r.body));
    expect(matches).toHaveLength(1);
    expect(matches[0]?.number).toBe(2);
  });

  it('can regex match name field', () => {
    const responses = parseDat(sampleDat);
    const regex = /admin/i;
    const matches = responses.filter((r) => regex.test(r.name));
    expect(matches).toHaveLength(1);
    expect(matches[0]?.number).toBe(3);
  });

  it('can regex match ID in dateTime', () => {
    const responses = parseDat(sampleDat);
    const regex = /def456/;
    const matches = responses.filter((r) => regex.test(r.dateTime));
    expect(matches).toHaveLength(1);
    expect(matches[0]?.number).toBe(2);
  });

  it('handles case-sensitive matching', () => {
    const responses = parseDat(sampleDat);
    const regex = /hello/; // lowercase, case-sensitive
    const matches = responses.filter((r) => regex.test(r.body));
    expect(matches).toHaveLength(0);

    const regexI = /hello/i; // case-insensitive
    const matchesI = responses.filter((r) => regexI.test(r.body));
    expect(matchesI).toHaveLength(1);
  });
});
