/**
 * Machi BBS post result detection and postMachiResponse tests.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('../../src/main/services/http-client', () => ({
  httpFetch: vi.fn(),
}));

import {
  detectMachiResultType,
  postMachiResponse,
} from '../../src/main/services/plugins/machi-post';
import { PostResultType, BoardType } from '../../src/types/domain';
import type { Board, PostParams } from '../../src/types/domain';
import { httpFetch } from '../../src/main/services/http-client';
import type { HttpResponse } from '../../src/types/api';
import { clearAllCookies } from '../../src/main/services/cookie-store';
import { encodeString } from '../../src/main/services/encoding';

const mockHttpFetch = httpFetch as unknown as Mock<typeof httpFetch>;

function makeResponse(overrides: Partial<HttpResponse> = {}): HttpResponse {
  return { status: 200, headers: {}, body: Buffer.from(''), ...overrides };
}

const TEST_BOARD: Board = {
  title: '東京都板',
  url: 'https://kanto.machi.to/tokyo/',
  bbsId: 'tokyo',
  serverUrl: 'https://kanto.machi.to/',
  boardType: BoardType.MachiBBS,
};

const TEST_PARAMS: PostParams = {
  boardUrl: TEST_BOARD.url,
  threadId: '1234567890',
  name: '名無しさん',
  mail: '',
  message: 'テスト投稿です',
};

beforeEach(() => {
  vi.clearAllMocks();
  clearAllCookies();
});

describe('detectMachiResultType', () => {
  it('detects 書きこみが終わりました as OK', () => {
    expect(detectMachiResultType('書きこみが終わりました')).toBe(PostResultType.OK);
  });

  it('detects 書き込みが終わりました as OK', () => {
    expect(detectMachiResultType('書き込みが終わりました')).toBe(PostResultType.OK);
  });

  it('detects broader 終わりました pattern as OK', () => {
    expect(detectMachiResultType('<html><body>終わりました</body></html>')).toBe(PostResultType.OK);
  });

  it('detects ERROR as Error', () => {
    expect(detectMachiResultType('ERROR: post rejected')).toBe(PostResultType.Error);
  });

  it('detects エラー as Error', () => {
    expect(detectMachiResultType('エラーが発生しました')).toBe(PostResultType.Error);
  });

  it('detects クッキー as Cookie', () => {
    expect(detectMachiResultType('クッキーを確認してください')).toBe(PostResultType.Cookie);
  });

  it('returns Error for unknown HTML', () => {
    expect(detectMachiResultType('<html><body>Unknown</body></html>')).toBe(PostResultType.Error);
  });

  it('returns Error for empty string', () => {
    expect(detectMachiResultType('')).toBe(PostResultType.Error);
  });
});

describe('postMachiResponse', () => {
  it('returns success on HTTP 302 with Location header', async () => {
    mockHttpFetch.mockResolvedValueOnce(
      makeResponse({
        status: 302,
        headers: { location: '../tokyo/' },
        body: Buffer.from(''),
      }),
    );

    const result = await postMachiResponse(TEST_PARAMS, TEST_BOARD);
    expect(result.success).toBe(true);
    expect(result.resultType).toBe(PostResultType.OK);
  });

  it('returns success on 302 even with non-empty body (Cloudflare injection)', async () => {
    mockHttpFetch.mockResolvedValueOnce(
      makeResponse({
        status: 302,
        headers: { location: '../tokyo/' },
        body: Buffer.from('<html>302 Found</html>'),
      }),
    );

    const result = await postMachiResponse(TEST_PARAMS, TEST_BOARD);
    expect(result.success).toBe(true);
  });

  it('returns success on 200 with success HTML body (Shift_JIS encoded)', async () => {
    // Machi BBS responses are Shift_JIS encoded — encode accordingly
    const successHtml = '<html><body>書きこみが終わりました</body></html>';
    mockHttpFetch.mockResolvedValueOnce(
      makeResponse({ status: 200, body: encodeString(successHtml, 'Shift_JIS') }),
    );

    const result = await postMachiResponse(TEST_PARAMS, TEST_BOARD);
    expect(result.success).toBe(true);
    expect(result.resultType).toBe(PostResultType.OK);
  });

  it('returns failure on error response', async () => {
    const errorHtml = '<html><body>ERROR: posting rejected</body></html>';
    mockHttpFetch.mockResolvedValueOnce(
      makeResponse({ status: 200, body: encodeString(errorHtml, 'Shift_JIS') }),
    );

    const result = await postMachiResponse(TEST_PARAMS, TEST_BOARD);
    expect(result.success).toBe(false);
    expect(result.resultType).toBe(PostResultType.Error);
  });

  it('returns failure on network error', async () => {
    mockHttpFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await postMachiResponse(TEST_PARAMS, TEST_BOARD);
    expect(result.success).toBe(false);
    expect(result.resultType).toBe(PostResultType.Error);
  });

  it('POSTs to write.cgi with correct parameters', async () => {
    mockHttpFetch.mockResolvedValueOnce(makeResponse());

    await postMachiResponse(TEST_PARAMS, TEST_BOARD);

    expect(mockHttpFetch).toHaveBeenCalledOnce();
    const callArgs = mockHttpFetch.mock.calls[0]?.[0];
    expect(callArgs?.url).toContain('write.cgi');
    expect(callArgs?.method).toBe('POST');
    expect(callArgs?.body).toContain('BBS=tokyo');
    expect(callArgs?.body).toContain('KEY=1234567890');
  });
});
