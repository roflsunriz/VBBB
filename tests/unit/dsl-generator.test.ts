import { describe, it, expect } from 'vitest';
import { generateDslSource } from '../../src/renderer/utils/dsl-generator';
import { parseDslScript } from '../../src/renderer/utils/dsl-parser';
import type { DslFormData } from '../../src/types/dsl';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePost(
  overrides: Partial<{
    name: string;
    mail: string;
    message: string;
    repeat: number;
    intervalSec: number | undefined;
  }> = {},
) {
  return {
    id: String(Date.now()),
    name: overrides.name ?? '',
    mail: overrides.mail ?? '',
    message: overrides.message ?? 'テスト投稿',
    repeat: overrides.repeat ?? 1,
    intervalSec: overrides.intervalSec,
  };
}

function roundTrip(data: DslFormData) {
  const source = generateDslSource(data);
  const result = parseDslScript(source);
  if (!result.ok) {
    throw new Error(
      `Round-trip failed — generated source:\n${source}\nParse errors:\n${result.errors.map((e) => `  line ${String(e.line)}: ${e.message}`).join('\n')}`,
    );
  }
  return result.script;
}

// ---------------------------------------------------------------------------
// Basic generation
// ---------------------------------------------------------------------------

describe('generateDslSource – basic', () => {
  it('generates a minimal single-post script', () => {
    const source = generateDslSource({
      scheduleAt: '',
      countdownSec: undefined,
      posts: [makePost({ message: 'こんにちは' })],
    });

    expect(source).toContain('POST');
    expect(source).toContain('MESSAGE こんにちは');
    expect(source).toContain('END');
    expect(source).not.toContain('SCHEDULE');
    expect(source).not.toContain('COUNTDOWN');
    expect(source).not.toContain('NAME');
    expect(source).not.toContain('MAIL');
    expect(source).not.toContain('REPEAT');
    expect(source).not.toContain('INTERVAL');
  });

  it('includes NAME and MAIL when non-empty', () => {
    const source = generateDslSource({
      scheduleAt: '',
      countdownSec: undefined,
      posts: [makePost({ name: 'テスト太郎', mail: 'sage', message: 'テスト' })],
    });

    expect(source).toContain('NAME テスト太郎');
    expect(source).toContain('MAIL sage');
  });

  it('includes REPEAT when > 1', () => {
    const source = generateDslSource({
      scheduleAt: '',
      countdownSec: undefined,
      posts: [makePost({ repeat: 5 })],
    });
    expect(source).toContain('REPEAT 5');
  });

  it('omits REPEAT when 1', () => {
    const source = generateDslSource({
      scheduleAt: '',
      countdownSec: undefined,
      posts: [makePost({ repeat: 1 })],
    });
    expect(source).not.toContain('REPEAT');
  });

  it('includes INTERVAL when defined and > 0', () => {
    const source = generateDslSource({
      scheduleAt: '',
      countdownSec: undefined,
      posts: [makePost({ intervalSec: 30 })],
    });
    expect(source).toContain('INTERVAL 30');
  });

  it('omits INTERVAL when undefined', () => {
    const source = generateDslSource({
      scheduleAt: '',
      countdownSec: undefined,
      posts: [makePost({ intervalSec: undefined })],
    });
    expect(source).not.toContain('INTERVAL');
  });

  it('includes SCHEDULE when non-empty', () => {
    const source = generateDslSource({
      scheduleAt: '2026-03-01T10:00:00',
      countdownSec: undefined,
      posts: [makePost()],
    });
    expect(source).toContain('SCHEDULE 2026-03-01T10:00:00');
  });

  it('includes COUNTDOWN when defined and > 0', () => {
    const source = generateDslSource({
      scheduleAt: '',
      countdownSec: 10,
      posts: [makePost()],
    });
    expect(source).toContain('COUNTDOWN 10');
  });

  it('uses multi-line MESSAGE for messages containing newlines', () => {
    const source = generateDslSource({
      scheduleAt: '',
      countdownSec: undefined,
      posts: [makePost({ message: '1行目\n2行目\n3行目' })],
    });

    expect(source).toContain('MESSAGE\n1行目\n2行目\n3行目\nEND');
  });

  it('generates multiple POST blocks', () => {
    const source = generateDslSource({
      scheduleAt: '',
      countdownSec: undefined,
      posts: [makePost({ message: '最初の投稿' }), makePost({ message: '次の投稿' })],
    });

    const postCount = (source.match(/^POST$/gm) ?? []).length;
    expect(postCount).toBe(2);
    expect(source).toContain('MESSAGE 最初の投稿');
    expect(source).toContain('MESSAGE 次の投稿');
  });
});

// ---------------------------------------------------------------------------
// Round-trip: generate → parse → verify
// ---------------------------------------------------------------------------

describe('generateDslSource – round-trip with parseDslScript', () => {
  it('round-trips a minimal script', () => {
    const data: DslFormData = {
      scheduleAt: '',
      countdownSec: undefined,
      posts: [makePost({ message: 'こんにちは' })],
    };
    const script = roundTrip(data);
    expect(script.posts).toHaveLength(1);
    expect(script.posts[0]?.message).toBe('こんにちは');
    expect(script.scheduleAt).toBeUndefined();
    expect(script.countdownSec).toBeUndefined();
  });

  it('round-trips with all fields populated', () => {
    const data: DslFormData = {
      scheduleAt: '2026-03-01T10:00:00',
      countdownSec: 5,
      posts: [
        makePost({
          name: 'テスト太郎',
          mail: 'sage',
          message: 'テスト投稿',
          repeat: 3,
          intervalSec: 60,
        }),
      ],
    };
    const script = roundTrip(data);
    expect(script.scheduleAt).toBeInstanceOf(Date);
    expect(script.countdownSec).toBe(5);
    expect(script.posts).toHaveLength(1);
    expect(script.posts[0]?.name).toBe('テスト太郎');
    expect(script.posts[0]?.mail).toBe('sage');
    expect(script.posts[0]?.message).toBe('テスト投稿');
    expect(script.posts[0]?.repeat).toBe(3);
    expect(script.posts[0]?.intervalSec).toBe(60);
  });

  it('round-trips multi-line messages', () => {
    const data: DslFormData = {
      scheduleAt: '',
      countdownSec: undefined,
      posts: [makePost({ message: '1行目\n2行目\n3行目' })],
    };
    const script = roundTrip(data);
    expect(script.posts[0]?.message).toBe('1行目\n2行目\n3行目');
  });

  it('round-trips multiple POST blocks', () => {
    const data: DslFormData = {
      scheduleAt: '',
      countdownSec: undefined,
      posts: [
        makePost({ name: 'A', mail: 'sage', message: '投稿1', repeat: 2, intervalSec: 10 }),
        makePost({ name: '', mail: '', message: '投稿2', repeat: 1, intervalSec: undefined }),
      ],
    };
    const script = roundTrip(data);
    expect(script.posts).toHaveLength(2);
    expect(script.posts[0]?.name).toBe('A');
    expect(script.posts[0]?.repeat).toBe(2);
    expect(script.posts[0]?.intervalSec).toBe(10);
    expect(script.posts[1]?.name).toBe('');
    expect(script.posts[1]?.message).toBe('投稿2');
    expect(script.posts[1]?.repeat).toBe(1);
    expect(script.posts[1]?.intervalSec).toBeUndefined();
  });

  it('round-trips with global settings only', () => {
    const data: DslFormData = {
      scheduleAt: '2026-06-15T08:30:00',
      countdownSec: 15,
      posts: [makePost({ message: 'テスト' })],
    };
    const script = roundTrip(data);
    expect(script.scheduleAt).toBeInstanceOf(Date);
    expect(script.countdownSec).toBe(15);
  });
});
