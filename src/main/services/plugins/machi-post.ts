/**
 * Machi BBS post service.
 * Uses /bbs/write.cgi endpoint with Shift_JIS form encoding.
 */
import type { Board, PostParams, PostResult } from '@shared/domain';
import { PostResultType } from '@shared/domain';
import { createLogger } from '../../logger';
import { buildCookieHeader, parseSetCookieHeaders } from '../cookie-store';
import { decodeBuffer, httpEncode } from '../encoding';
import { httpFetch } from '../http-client';
import { detectResultType } from '../post';

const logger = createLogger('machi-post');

function getPostUrl(board: Board): string {
  return `${board.serverUrl}bbs/write.cgi`;
}

function getReferer(board: Board, threadId: string): string {
  return `${board.serverUrl}bbs/read.pl?BBS=${encodeURIComponent(board.bbsId)}&KEY=${encodeURIComponent(threadId)}`;
}

function buildMachiPostBody(params: PostParams, board: Board): string {
  const encoding = 'Shift_JIS' as const;
  const fields: Array<[string, string]> = [
    ['NAME', params.name],
    ['MAIL', params.mail],
    ['MESSAGE', params.message],
    ['BBS', board.bbsId],
    ['KEY', params.threadId],
    ['TIME', String(Math.floor(Date.now() / 1000))],
    ['submit', '\u66F8\u304D\u8FBC\u3080'], // 書き込む
  ];

  return fields
    .map(([key, value]) => `${key}=${httpEncode(value, encoding)}`)
    .join('&');
}

/**
 * Post a response to Machi BBS.
 */
export async function postMachiResponse(
  params: PostParams,
  board: Board,
): Promise<PostResult> {
  const postUrl = getPostUrl(board);
  const referer = getReferer(board, params.threadId);
  const body = buildMachiPostBody(params, board);
  const cookieHeader = buildCookieHeader(postUrl);

  logger.info(`Machi posting to ${postUrl}`);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded; charset=Shift_JIS',
      Referer: referer,
    };
    if (cookieHeader.length > 0) {
      headers['Cookie'] = cookieHeader;
    }

    const response = await httpFetch({
      url: postUrl,
      method: 'POST',
      headers,
      body,
    });

    parseSetCookieHeaders(response.headers, postUrl);
    const html = decodeBuffer(response.body, 'Shift_JIS');

    if (response.status === 302 && html.trim().length === 0) {
      return {
        success: true,
        resultType: PostResultType.OK,
        message: '',
      };
    }

    const resultType = detectResultType(html);
    return {
      success: resultType === PostResultType.OK,
      resultType,
      message: html,
    };
  } catch (err) {
    return {
      success: false,
      resultType: PostResultType.Error,
      message: `Machi post error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
