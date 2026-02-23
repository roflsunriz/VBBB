/**
 * JBBS post service.
 * Handles posting to したらば/JBBS boards using write.cgi with EUC-JP encoding.
 */
import type { Board, PostParams, PostResult } from '@shared/domain';
import { PostResultType } from '@shared/domain';
import { createLogger } from '../../logger';
import { buildCookieHeader, parseSetCookieHeaders } from '../cookie-store';
import { decodeBuffer, httpEncode, replaceWithNCR } from '../encoding';
import { httpFetch } from '../http-client';

const logger = createLogger('jbbs-post');

/**
 * Build the write.cgi URL for a JBBS board.
 */
function getPostUrl(board: Board, threadId: string): string {
  const dir = board.jbbsDir ?? '';
  return `${board.serverUrl}bbs/write.cgi/${dir}/${board.bbsId}/${threadId}/`;
}

function getReadReferer(board: Board, threadId: string): string {
  const dir = board.jbbsDir ?? '';
  return `${board.serverUrl}bbs/read.cgi/${dir}/${board.bbsId}/${threadId}/`;
}

/**
 * Build the POST body for a JBBS write.cgi request.
 * All string fields are EUC-JP encoded.
 */
function buildJBBSPostBody(params: PostParams, board: Board): string {
  const dir = board.jbbsDir ?? '';
  const encoding = 'EUC-JP' as const;

  const fields: Array<[string, string]> = [
    ['NAME', replaceWithNCR(params.name, encoding)],
    ['MAIL', replaceWithNCR(params.mail, encoding)],
    ['MESSAGE', replaceWithNCR(params.message, encoding)],
    ['BBS', board.bbsId],
    ['KEY', params.threadId],
    ['DIR', dir],
    ['TIME', String(Math.floor(Date.now() / 1000))],
    ['submit', '\u66F8\u304D\u8FBC\u3080'], // 書き込む
  ];

  return fields.map(([key, value]) => `${key}=${httpEncode(value, encoding)}`).join('&');
}

/** Max chars of response HTML to log for diagnostics. */
const DIAG_HTML_LIMIT = 2000;

/**
 * Detect the result type from a JBBS response.
 * JBBS has different response patterns than 5ch.
 *
 * Detection order: success first, then error, then cookie, with unknown
 * defaulting to Error. Success patterns are checked broadly to handle
 * server-side text variations.
 */
function detectJBBSResultType(html: string): PostResultType {
  // Success patterns — match broadly to cover wording/encoding variations.
  // したらば write.cgi returns an HTML page with one of these phrases on success.
  // The server uses several variations:
  //   - 書きこみが終わりました (終わり with わ)
  //   - 書き込みが終わりました (同上)
  //   - 書きこみが終りました  (終り without わ — actual server response)
  //   - <title>書きこみました</title>
  if (
    html.includes('\u66F8\u304D\u3053\u307F\u304C\u7D42\u308F\u308A\u307E\u3057\u305F') || // 書きこみが終わりました
    html.includes('\u66F8\u304D\u8FBC\u307F\u304C\u7D42\u308F\u308A\u307E\u3057\u305F') || // 書き込みが終わりました
    html.includes('\u66F8\u304D\u3053\u307F\u304C\u7D42\u308A\u307E\u3057\u305F') || // 書きこみが終りました (without わ)
    html.includes('\u66F8\u304D\u8FBC\u307F\u304C\u7D42\u308A\u307E\u3057\u305F') || // 書き込みが終りました (without わ)
    html.includes('\u7D42\u308F\u308A\u307E\u3057\u305F') || // 終わりました (broader)
    html.includes('\u7D42\u308A\u307E\u3057\u305F') // 終りました (broader, without わ)
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
export async function postJBBSResponse(params: PostParams, board: Board): Promise<PostResult> {
  const postUrl = getPostUrl(board, params.threadId);
  const referer = getReadReferer(board, params.threadId);
  const body = buildJBBSPostBody(params, board);
  const cookieHeader = buildCookieHeader(postUrl);

  logger.info(`[DIAG] JBBS posting to ${postUrl}`);
  logger.info(`[DIAG] JBBS Referer: ${referer}`);
  logger.info(
    `[DIAG] JBBS body param keys: ${body
      .split('&')
      .map((p) => p.split('=')[0] ?? '')
      .join(', ')}`,
  );
  logger.info(`[DIAG] JBBS body size: ${String(Buffer.byteLength(body, 'utf-8'))} bytes`);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: referer,
    };
    if (cookieHeader.length > 0) {
      headers['Cookie'] = cookieHeader;
    }

    logger.info(
      `[DIAG] JBBS request headers: ${Object.entries(headers)
        .map(([k, v]) => (k === 'Cookie' ? `${k}=(present)` : `${k}: ${v}`))
        .join(', ')}`,
    );

    const response = await httpFetch({
      url: postUrl,
      method: 'POST',
      headers,
      body,
    });

    parseSetCookieHeaders(response.headers, postUrl);

    // JBBS responses are EUC-JP encoded
    const html = decodeBuffer(response.body, 'EUC-JP');

    logger.info(
      `[DIAG] JBBS response HTTP ${String(response.status)}, body ${String(response.body.length)} bytes`,
    );
    const htmlPreview =
      html.length > DIAG_HTML_LIMIT
        ? html.substring(0, DIAG_HTML_LIMIT) + `... (truncated, total ${String(html.length)} chars)`
        : html;
    logger.info(`[DIAG] JBBS response HTML:\n${htmlPreview}`);

    // 302 with empty body is a success redirect
    const resultType =
      response.status === 302 && html.trim().length === 0
        ? PostResultType.OK
        : detectJBBSResultType(html);

    logger.info(`[DIAG] JBBS detected resultType: ${resultType}`);

    return {
      success: resultType === PostResultType.OK,
      resultType,
      message: html,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`[DIAG] JBBS post exception: ${errMsg}`);
    return {
      success: false,
      resultType: PostResultType.Error,
      message: `JBBS post error: ${errMsg}`,
    };
  }
}
