import { describe, it, expect } from 'vitest';
import { parseDslScript } from '../../src/renderer/utils/dsl-parser';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertOk(src: string) {
  const result = parseDslScript(src);
  if (!result.ok) {
    throw new Error(
      `Expected ok but got errors:\n${result.errors.map((e) => `  line ${String(e.line)}: ${e.message}`).join('\n')}`,
    );
  }
  return result.script;
}

function assertFail(src: string) {
  const result = parseDslScript(src);
  if (result.ok) {
    throw new Error('Expected parse error but got ok');
  }
  return result.errors;
}

// ---------------------------------------------------------------------------
// Minimal valid script
// ---------------------------------------------------------------------------

describe('parseDslScript – minimal valid script', () => {
  it('parses a single POST with single-line MESSAGE', () => {
    const script = assertOk(`
POST
MESSAGE こんにちは
END
`);
    expect(script.posts).toHaveLength(1);
    expect(script.posts[0]?.message).toBe('こんにちは');
    expect(script.posts[0]?.name).toBe('');
    expect(script.posts[0]?.mail).toBe('');
    expect(script.posts[0]?.repeat).toBe(1);
    expect(script.posts[0]?.intervalSec).toBeUndefined();
    expect(script.scheduleAt).toBeUndefined();
    expect(script.countdownSec).toBeUndefined();
  });

  it('parses NAME, MAIL, REPEAT, INTERVAL', () => {
    const script = assertOk(`
POST
NAME テスト太郎
MAIL sage
REPEAT 3
INTERVAL 60
MESSAGE テスト本文
END
`);
    const post = script.posts[0];
    expect(post?.name).toBe('テスト太郎');
    expect(post?.mail).toBe('sage');
    expect(post?.repeat).toBe(3);
    expect(post?.intervalSec).toBe(60);
    expect(post?.message).toBe('テスト本文');
  });
});

// ---------------------------------------------------------------------------
// Multi-line MESSAGE
// ---------------------------------------------------------------------------

describe('parseDslScript – multi-line MESSAGE', () => {
  it('collects lines until END', () => {
    const script = assertOk(`
POST
MESSAGE
1行目
2行目
3行目
END
`);
    expect(script.posts[0]?.message).toBe('1行目\n2行目\n3行目');
  });

  it('trims leading and trailing blank lines from message body', () => {
    const script = assertOk(`
POST
MESSAGE

  本文のみ

END
`);
    expect(script.posts[0]?.message).toBe('  本文のみ');
  });

  it('preserves internal blank lines', () => {
    const script = assertOk(`
POST
MESSAGE
行A

行B
END
`);
    expect(script.posts[0]?.message).toBe('行A\n\n行B');
  });
});

// ---------------------------------------------------------------------------
// Global settings
// ---------------------------------------------------------------------------

describe('parseDslScript – global settings', () => {
  it('parses SCHEDULE in ISO 8601 format', () => {
    const script = assertOk(`
SCHEDULE 2026-03-01T10:00:00
POST
MESSAGE テスト
END
`);
    expect(script.scheduleAt).toBeInstanceOf(Date);
    expect(script.scheduleAt?.getFullYear()).toBe(2026);
  });

  it('parses COUNTDOWN', () => {
    const script = assertOk(`
COUNTDOWN 30
POST
MESSAGE テスト
END
`);
    expect(script.countdownSec).toBe(30);
  });

  it('parses both SCHEDULE and COUNTDOWN', () => {
    const script = assertOk(`
SCHEDULE 2026-06-01T08:00:00
COUNTDOWN 5
POST
MESSAGE テスト
END
`);
    expect(script.scheduleAt).toBeInstanceOf(Date);
    expect(script.countdownSec).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Multiple POST blocks
// ---------------------------------------------------------------------------

describe('parseDslScript – multiple POST blocks', () => {
  it('parses two POST blocks in order', () => {
    const script = assertOk(`
POST
NAME Aさん
MESSAGE 1つ目
END
POST
NAME Bさん
MESSAGE 2つ目
INTERVAL 10
END
`);
    expect(script.posts).toHaveLength(2);
    expect(script.posts[0]?.name).toBe('Aさん');
    expect(script.posts[0]?.message).toBe('1つ目');
    expect(script.posts[1]?.name).toBe('Bさん');
    expect(script.posts[1]?.intervalSec).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Case-insensitivity
// ---------------------------------------------------------------------------

describe('parseDslScript – case insensitivity', () => {
  it('accepts lowercase keywords', () => {
    const script = assertOk(`
post
name foo
mail sage
repeat 2
interval 5
message hello
end
`);
    expect(script.posts[0]?.name).toBe('foo');
    expect(script.posts[0]?.mail).toBe('sage');
    expect(script.posts[0]?.repeat).toBe(2);
    expect(script.posts[0]?.intervalSec).toBe(5);
    expect(script.posts[0]?.message).toBe('hello');
  });

  it('accepts mixed-case keywords', () => {
    const script = assertOk(`
Post
Name Bar
Mail
Message mixed case test
End
`);
    expect(script.posts[0]?.name).toBe('Bar');
    expect(script.posts[0]?.mail).toBe('');
    expect(script.posts[0]?.message).toBe('mixed case test');
  });
});

// ---------------------------------------------------------------------------
// Comments and blank lines
// ---------------------------------------------------------------------------

describe('parseDslScript – comments and blank lines', () => {
  it('ignores # comment lines but preserves # in MESSAGE content', () => {
    const script = assertOk(`
# グローバルコメント

# 投稿ブロック
POST
# POST内コメント
NAME 投稿者
MESSAGE # これは本文の先頭
END
`);
    expect(script.posts[0]?.name).toBe('投稿者');
    // '#' inside a MESSAGE value is part of the message, not a comment
    expect(script.posts[0]?.message).toBe('# これは本文の先頭');
  });

  it('ignores inline # after value', () => {
    const script = assertOk(`
COUNTDOWN 15 # 15秒待つ
POST
MESSAGE テスト
END
`);
    expect(script.countdownSec).toBe(15);
  });

  it('ignores blank lines between keywords', () => {
    const script = assertOk(`
POST

NAME 名前あり

MESSAGE 本文
END
`);
    expect(script.posts[0]?.name).toBe('名前あり');
  });
});

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

describe('parseDslScript – error cases', () => {
  it('errors on empty source', () => {
    const errors = assertFail('');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('errors when no POST block exists', () => {
    const errors = assertFail('COUNTDOWN 5\n');
    expect(errors.some((e) => e.message.includes('POST'))).toBe(true);
  });

  it('errors when POST has no MESSAGE', () => {
    const errors = assertFail(`
POST
NAME foo
END
`);
    expect(errors.some((e) => e.message.includes('MESSAGE'))).toBe(true);
  });

  it('errors on invalid SCHEDULE value', () => {
    const errors = assertFail(`
SCHEDULE not-a-date
POST
MESSAGE テスト
END
`);
    expect(errors.some((e) => e.message.includes('SCHEDULE'))).toBe(true);
  });

  it('errors on invalid COUNTDOWN value', () => {
    const errors = assertFail(`
COUNTDOWN abc
POST
MESSAGE テスト
END
`);
    expect(errors.some((e) => e.message.includes('COUNTDOWN'))).toBe(true);
  });

  it('errors on invalid REPEAT value', () => {
    const errors = assertFail(`
POST
REPEAT 0
MESSAGE テスト
END
`);
    expect(errors.some((e) => e.message.includes('REPEAT'))).toBe(true);
  });

  it('errors on invalid INTERVAL value', () => {
    const errors = assertFail(`
POST
INTERVAL -1
MESSAGE テスト
END
`);
    expect(errors.some((e) => e.message.includes('INTERVAL'))).toBe(true);
  });

  it('errors on unknown top-level keyword', () => {
    const errors = assertFail(`
UNKNOWN_KW foo
POST
MESSAGE テスト
END
`);
    expect(errors.some((e) => e.message.includes('UNKNOWN_KW'))).toBe(true);
  });

  it('errors on unknown keyword inside POST', () => {
    const errors = assertFail(`
POST
BADKEY value
MESSAGE テスト
END
`);
    expect(errors.some((e) => e.message.includes('BADKEY'))).toBe(true);
  });

  it('errors when POST has no END', () => {
    const errors = assertFail(`
POST
MESSAGE テスト
`);
    expect(errors.some((e) => e.message.includes('END'))).toBe(true);
  });

  it('SCHEDULE without value is an error', () => {
    const errors = assertFail(`
SCHEDULE
POST
MESSAGE テスト
END
`);
    expect(errors.some((e) => e.message.includes('SCHEDULE'))).toBe(true);
  });

  it('COUNTDOWN without value is an error', () => {
    const errors = assertFail(`
COUNTDOWN
POST
MESSAGE テスト
END
`);
    expect(errors.some((e) => e.message.includes('COUNTDOWN'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CRLF line endings
// ---------------------------------------------------------------------------

describe('parseDslScript – CRLF line endings', () => {
  it('handles CRLF correctly', () => {
    const src = 'POST\r\nNAME foo\r\nMESSAGE bar\r\nEND\r\n';
    const script = assertOk(src);
    expect(script.posts[0]?.name).toBe('foo');
    expect(script.posts[0]?.message).toBe('bar');
  });
});

// ---------------------------------------------------------------------------
// NAME / MAIL with no value (empty string)
// ---------------------------------------------------------------------------

describe('parseDslScript – empty NAME / MAIL', () => {
  it('NAME with no value yields empty string', () => {
    const script = assertOk(`
POST
NAME
MESSAGE テスト
END
`);
    expect(script.posts[0]?.name).toBe('');
  });

  it('MAIL with no value yields empty string', () => {
    const script = assertOk(`
POST
MAIL
MESSAGE テスト
END
`);
    expect(script.posts[0]?.mail).toBe('');
  });
});
