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

const logger = createLogger('machi-post');

/** Max chars of response HTML to log for diagnostics. */
const DIAG_HTML_LIMIT = 2000;

function getPostUrl(board: Board): string {
  return `${board.serverUrl}bbs/write.cgi`;
}

function getReferer(board: Board, threadId: string): string {
  return `${board.serverUrl}bbs/read.cgi/${board.bbsId}/${threadId}/`;
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
 * Detect the result type from a Machi BBS response.
 * Machi BBS has its own success/error patterns distinct from 5ch.
 */
function detectMachiResultType(html: string): PostResultType {
  // Success patterns
  if (
    html.includes('\u66F8\u304D\u3053\u307F\u304C\u7D42\u308F\u308A\u307E\u3057\u305F') || // 書きこみが終わりました
    html.includes('\u66F8\u304D\u8FBC\u307F\u304C\u7D42\u308F\u308A\u307E\u3057\u305F') || // 書き込みが終わりました
    html.includes('\u7D42\u308F\u308A\u307E\u3057\u305F')                                   // 終わりました (broader match)
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

  // Cookie/check patterns
  if (
    html.includes('\u30AF\u30C3\u30AD\u30FC') // クッキー
  ) {
    return PostResultType.Cookie;
  }

  return PostResultType.Error;
}

/**
 * Post a response to Machi BBS.
 */
export async function postMachiResponse(
  params: PostParams,
  board: Board,
): Promise<PostResult> {
  logger.info(`[DIAG] postMachiResponse called — boardUrl=${board.url}, boardType=${board.boardType}, bbsId=${board.bbsId}, threadId=${params.threadId}`);

  const postUrl = getPostUrl(board);
  const referer = getReferer(board, params.threadId);
  const body = buildMachiPostBody(params, board);
  const cookieHeader = buildCookieHeader(postUrl);

  logger.info(`[DIAG] Machi posting to ${postUrl}`);
  logger.info(`[DIAG] Machi Referer: ${referer}`);
  logger.info(`[DIAG] Machi body param keys: ${body.split('&').map((p) => p.split('=')[0] ?? '').join(', ')}`);
  logger.info(`[DIAG] Machi body size: ${String(Buffer.byteLength(body, 'utf-8'))} bytes`);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: referer,
    };
    if (cookieHeader.length > 0) {
      headers['Cookie'] = cookieHeader;
    }

    logger.info(`[DIAG] Machi request headers: ${Object.entries(headers).map(([k, v]) => k === 'Cookie' ? `${k}=(present)` : `${k}: ${v}`).join(', ')}`);

    const response = await httpFetch({
      url: postUrl,
      method: 'POST',
      headers,
      body,
    });

    parseSetCookieHeaders(response.headers, postUrl);

    const html = decodeBuffer(response.body, 'Shift_JIS');

    logger.info(`[DIAG] Machi response HTTP ${String(response.status)}, body ${String(response.body.length)} bytes`);
    const htmlPreview = html.length > DIAG_HTML_LIMIT
      ? html.substring(0, DIAG_HTML_LIMIT) + `... (truncated, total ${String(html.length)} chars)`
      : html;
    logger.info(`[DIAG] Machi response HTML:\n${htmlPreview}`);

    // Log response headers for diagnostics
    const respHeaderSummary = Object.entries(response.headers)
      .map(([k, v]) => k.toLowerCase() === 'set-cookie' ? `${k}: (present)` : `${k}: ${v}`)
      .join(' | ');
    logger.info(`[DIAG] Machi response headers: ${respHeaderSummary}`);

    // Machi BBS write.cgi returns HTTP 302 with a Location header on success.
    // The redirect target is typically the board page (e.g. "../tokyo/").
    // Cloudflare may inject a non-empty HTML body (302 Found page), so we
    // must NOT require an empty body — any 302 with a Location header is success.
    if (response.status === 302 && response.headers['location'] !== undefined) {
      logger.info(`[DIAG] Machi result: OK (302 redirect to ${response.headers['location']})`);
      return {
        success: true,
        resultType: PostResultType.OK,
        message: '',
      };
    }

    const resultType = detectMachiResultType(html);
    logger.info(`[DIAG] Machi detected resultType: ${resultType}`);

    return {
      success: resultType === PostResultType.OK,
      resultType,
      message: html,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`[DIAG] Machi post exception: ${errMsg}`);
    return {
      success: false,
      resultType: PostResultType.Error,
      message: `Machi post error: ${errMsg}`,
    };
  }
}
