/**
 * JBBS post service.
 * Handles posting to したらば/JBBS boards using write.cgi with EUC-JP encoding.
 */
import type { Board, PostParams, PostResult } from '@shared/domain';
import { PostResultType } from '@shared/domain';
import { createLogger } from '../../logger';
import { decodeBuffer, httpEncode } from '../encoding';
import { httpFetch } from '../http-client';

const logger = createLogger('jbbs-post');

/**
 * Build the write.cgi URL for a JBBS board.
 */
function getPostUrl(board: Board, threadId: string): string {
  const dir = board.jbbsDir ?? '';
  return `${board.serverUrl}bbs/write.cgi/${dir}/${board.bbsId}/${threadId}/`;
}

/**
 * Build the POST body for a JBBS write.cgi request.
 * All string fields are EUC-JP encoded.
 */
function buildJBBSPostBody(params: PostParams, board: Board): string {
  const dir = board.jbbsDir ?? '';
  const encoding = 'EUC-JP' as const;

  const fields: Array<[string, string]> = [
    ['NAME', params.name],
    ['MAIL', params.mail],
    ['MESSAGE', params.message],
    ['BBS', board.bbsId],
    ['KEY', params.threadId],
    ['DIR', dir],
    ['TIME', String(Math.floor(Date.now() / 1000))],
    ['submit', '\u66F8\u304D\u8FBC\u3080'], // 書き込む
  ];

  return fields
    .map(([key, value]) => `${key}=${httpEncode(value, encoding)}`)
    .join('&');
}

/**
 * Detect the result type from a JBBS response.
 * JBBS has different response patterns than 5ch.
 */
function detectJBBSResultType(html: string): PostResultType {
  // Success patterns
  if (
    html.includes('\u66F8\u304D\u3053\u307F\u304C\u7D42\u308F\u308A\u307E\u3057\u305F') || // 書きこみが終わりました
    html.includes('\u66F8\u304D\u8FBC\u307F\u304C\u7D42\u308F\u308A\u307E\u3057\u305F')    // 書き込みが終わりました
  ) {
    return PostResultType.OK;
  }

  // Error patterns
  if (
    html.includes('ERROR') ||
    html.includes('\u30A8\u30E9\u30FC') // エラー
  ) {
    return PostResultType.Error;
  }

  // Check/cookie patterns (less common for JBBS)
  if (
    html.includes('\u30AF\u30C3\u30AD\u30FC') // クッキー
  ) {
    return PostResultType.Cookie;
  }

  return PostResultType.Error;
}

/**
 * Post a response to a JBBS thread.
 */
export async function postJBBSResponse(
  params: PostParams,
  board: Board,
): Promise<PostResult> {
  const postUrl = getPostUrl(board, params.threadId);
  const body = buildJBBSPostBody(params, board);

  logger.info(`JBBS posting to ${postUrl}`);

  try {
    const response = await httpFetch({
      url: postUrl,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: postUrl,
      },
      body,
    });

    // JBBS responses are EUC-JP encoded
    const html = decodeBuffer(response.body, 'EUC-JP');
    const resultType = detectJBBSResultType(html);

    return {
      success: resultType === PostResultType.OK,
      resultType,
      message: html,
    };
  } catch (err) {
    return {
      success: false,
      resultType: PostResultType.Error,
      message: `JBBS post error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
