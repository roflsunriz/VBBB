/**
 * JBBS post result detection and postJBBSResponse tests.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('../../src/main/services/http-client', () => ({
  httpFetch: vi.fn(),
}));

import { detectJBBSResultType, postJBBSResponse } from '../../src/main/services/plugins/jbbs-post';
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
  title: 'テスト板',
  url: 'https://jbbs.shitaraba.net/anime/12345/',
  bbsId: '12345',
  serverUrl: 'https://jbbs.shitaraba.net/',
  boardType: BoardType.Shitaraba,
  jbbsDir: 'anime',
};

const TEST_PARAMS: PostParams = {
  boardUrl: TEST_BOARD.url,
  threadId: '1234567890',
  name: '名無しさん',
  mail: 'sage',
  message: 'テスト投稿です',
};

beforeEach(() => {
  vi.clearAllMocks();
  clearAllCookies();
});

describe('detectJBBSResultType', () => {
  it('detects 書きこみが終わりました as OK', () => {
    expect(detectJBBSResultType('書きこみが終わりました')).toBe(PostResultType.OK);
  });

  it('detects 書き込みが終わりました as OK', () => {
    expect(detectJBBSResultType('書き込みが終わりました')).toBe(PostResultType.OK);
  });

  it('detects 書きこみが終りました (without わ) as OK', () => {
    expect(detectJBBSResultType('書きこみが終りました')).toBe(PostResultType.OK);
  });

  it('detects 書き込みが終りました (without わ) as OK', () => {
    expect(detectJBBSResultType('書き込みが終りました')).toBe(PostResultType.OK);
  });

  it('detects ERROR as Error', () => {
    expect(detectJBBSResultType('ERROR: Something went wrong')).toBe(PostResultType.Error);
  });

  it('detects エラー as Error', () => {
    expect(detectJBBSResultType('<html><body>エラーが発生しました</body></html>')).toBe(
      PostResultType.Error,
    );
  });

  it('detects クッキー as Cookie', () => {
    expect(detectJBBSResultType('<html>クッキーを確認してください</html>')).toBe(
      PostResultType.Cookie,
    );
  });

  it('returns Error for unknown HTML', () => {
    expect(detectJBBSResultType('<html><body>Unknown response</body></html>')).toBe(
      PostResultType.Error,
    );
  });

  it('returns Error for empty string', () => {
    expect(detectJBBSResultType('')).toBe(PostResultType.Error);
  });
});

describe('postJBBSResponse', () => {
  it('returns success on 書きこみが終わりました response (EUC-JP encoded)', async () => {
    // JBBS responses are EUC-JP encoded — encode the success HTML accordingly
    const successHtml = '<html><body>書きこみが終わりました</body></html>';
    mockHttpFetch.mockResolvedValueOnce(
      makeResponse({ status: 200, body: encodeString(successHtml, 'EUC-JP') }),
    );

    const result = await postJBBSResponse(TEST_PARAMS, TEST_BOARD);
    expect(result.success).toBe(true);
    expect(result.resultType).toBe(PostResultType.OK);
  });

  it('returns success on HTTP 302 with empty body (redirect success)', async () => {
    mockHttpFetch.mockResolvedValueOnce(makeResponse({ status: 302, body: Buffer.from('') }));

    const result = await postJBBSResponse(TEST_PARAMS, TEST_BOARD);
    expect(result.success).toBe(true);
    expect(result.resultType).toBe(PostResultType.OK);
  });

  it('returns failure on error response', async () => {
    const errorHtml = '<html><body>ERROR: posting not allowed</body></html>';
    mockHttpFetch.mockResolvedValueOnce(
      makeResponse({ status: 200, body: encodeString(errorHtml, 'EUC-JP') }),
    );

    const result = await postJBBSResponse(TEST_PARAMS, TEST_BOARD);
    expect(result.success).toBe(false);
    expect(result.resultType).toBe(PostResultType.Error);
  });

  it('returns failure on network error', async () => {
    mockHttpFetch.mockRejectedValueOnce(new Error('Network unavailable'));

    const result = await postJBBSResponse(TEST_PARAMS, TEST_BOARD);
    expect(result.success).toBe(false);
    expect(result.resultType).toBe(PostResultType.Error);
  });

  it('POSTs to the correct write.cgi URL', async () => {
    mockHttpFetch.mockResolvedValueOnce(makeResponse());

    await postJBBSResponse(TEST_PARAMS, TEST_BOARD);

    expect(mockHttpFetch).toHaveBeenCalledOnce();
    const callArgs = mockHttpFetch.mock.calls[0]?.[0];
    expect(callArgs?.url).toContain('write.cgi');
    expect(callArgs?.url).toContain('anime');
    expect(callArgs?.url).toContain('12345');
    expect(callArgs?.method).toBe('POST');
    expect(callArgs?.body).toContain('BBS=12345');
    expect(callArgs?.body).toContain('KEY=1234567890');
  });
});
