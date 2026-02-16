/**
 * Post (投稿) service.
 * Handles bbs.cgi POST, response type detection, cookie/check retry flow.
 */
import { type Board, BoardType, type PostParams, type PostResult, PostResultType } from '@shared/domain';
import { MAX_POST_RETRIES } from '@shared/file-format';
import { createLogger } from '../logger';
import { buildCookieHeader, parseSetCookieHeaders } from './cookie-store';
import { handleDonguriPostResult } from './donguri';
import { decodeBuffer, httpEncode } from './encoding';
import { httpFetch } from './http-client';
import { getUpliftSid } from './uplift-auth';

const logger = createLogger('post');

/**
 * Build POST URL for a board.
 */
function getPostUrl(board: Board): string {
  return `${board.serverUrl}test/bbs.cgi`;
}

/**
 * Build POST body parameters.
 */
function buildPostBody(
  params: PostParams,
  board: Board,
  hiddenFields?: Readonly<Record<string, string>>,
): string {
  const encoding = board.boardType === BoardType.JBBS ? 'EUC-JP' : 'Shift_JIS';

  const fields: Array<[string, string]> = [];

  // Add hidden fields from cookie/check response first
  if (hiddenFields !== undefined) {
    for (const [key, value] of Object.entries(hiddenFields)) {
      // Skip fields that we'll set explicitly
      if (!['FROM', 'mail', 'MESSAGE', 'bbs', 'time', 'key', 'subject'].includes(key)) {
        fields.push([key, value]);
      }
    }
  }

  // Add UPLIFT sid if available
  const sid = getUpliftSid();
  if (sid.length > 0) {
    fields.push(['sid', sid]);
  }

  fields.push(['FROM', params.name]);
  fields.push(['mail', params.mail]);
  fields.push(['MESSAGE', params.message]);
  fields.push(['bbs', board.bbsId]);
  fields.push(['time', String(Math.floor(Date.now() / 1000))]);
  fields.push(['key', params.threadId]);
  fields.push(['submit', '\u66F8\u304D\u8FBC\u3080']); // 書き込む

  return fields
    .map(([key, value]) => `${key}=${httpEncode(value, encoding)}`)
    .join('&');
}

/**
 * Determine the result type from the server response HTML.
 */
export function detectResultType(html: string): PostResultType {
  if (html.includes('\u66F8\u304D\u3053\u307F\u304C\u7D42\u308F\u308A\u307E\u3057\u305F')) {
    // 書きこみが終わりました
    return PostResultType.OK;
  }
  if (
    html.includes('\u30AF\u30C3\u30AD\u30FC\u304C\u306A\u3044\u304B\u671F\u9650\u5207\u308C\u3067\u3059') ||
    html.includes('\u30AF\u30C3\u30AD\u30FC\u78BA\u8A8D\uFF01')
  ) {
    // クッキーがないか期限切れです / クッキー確認！
    return PostResultType.Cookie;
  }
  if (
    html.includes('\u66F8\u304D\u8FBC\u307F\u78BA\u8A8D\u3057\u307E\u3059') ||
    html.includes('\u5185\u5BB9\u78BA\u8A8D') ||
    html.includes('\u66F8\u304D\u8FBC\u307F\u30C1\u30A7\u30C3\u30AF\uFF01')
  ) {
    // 書き込み確認します / 内容確認 / 書き込みチェック！
    return PostResultType.Check;
  }
  if (html.includes('\u3069\u3093\u3050\u308A\u3092\u57CB\u3081\u307E\u3057\u305F')) {
    // どんぐりを埋めました
    return PostResultType.Donguri;
  }
  if (html.includes('broken_acorn') || html.includes('[1044]') || html.includes('[1045]')) {
    return PostResultType.DonguriError;
  }
  if (html.includes('\u5FCD\u6CD5\u306E\u8A8D\u6CD5\u3092\u65B0\u898F\u4F5C\u6210\u3057\u307E\u3059')) {
    // 忍法の認法を新規作成します
    return PostResultType.Ninpou;
  }
  if (html.includes('Lv=0') || html.includes('\u6BBA\u3055\u308C\u307E\u3057\u305F')) {
    // Lv=0 / 殺されました
    return PostResultType.Suiton;
  }
  return PostResultType.Error;
}

/**
 * Extract hidden input fields from HTML response.
 */
export function extractHiddenFields(html: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const regex = /<input\s+type=["']?hidden["']?\s+name=["']?([^"'\s>]+)["']?\s+value=["']?([^"'>]*)["']?/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const name = match[1];
    const value = match[2];
    if (name !== undefined && value !== undefined) {
      fields[name] = value;
    }
  }
  return fields;
}

/**
 * Post a response to a thread.
 * Handles grtCookie/grtCheck with up to MAX_POST_RETRIES retries.
 */
export async function postResponse(params: PostParams, board: Board): Promise<PostResult> {
  const postUrl = getPostUrl(board);
  const encoding = board.boardType === BoardType.JBBS ? 'EUC-JP' : 'Shift_JIS';
  const charset = board.boardType === BoardType.Type2ch ? '; charset=UTF-8' : '';

  let hiddenFields: Record<string, string> | undefined;
  let lastPayloadHash = '';

  for (let attempt = 0; attempt <= MAX_POST_RETRIES; attempt++) {
    const body = buildPostBody(params, board, hiddenFields);

    // Infinite loop prevention: check if payload is identical to previous
    if (body === lastPayloadHash && attempt > 0) {
      logger.warn('Identical payload detected, stopping to prevent infinite loop');
      return {
        success: false,
        resultType: PostResultType.Error,
        message: 'Identical payload — aborting to prevent loop',
      };
    }
    lastPayloadHash = body;

    logger.info(`Posting to ${postUrl} (attempt ${String(attempt + 1)})`);

    // Build Cookie header from store (acorn, sid, DMDM, MDMD, SPID, PON, etc.)
    const cookieHeader = buildCookieHeader(postUrl);
    const postHeaders: Record<string, string> = {
      'Content-Type': `application/x-www-form-urlencoded${charset}`,
      Referer: `${board.serverUrl}test/bbs.cgi`,
      'Accept-Language': 'ja',
    };
    if (cookieHeader.length > 0) {
      postHeaders['Cookie'] = cookieHeader;
    }

    const response = await httpFetch({
      url: postUrl,
      method: 'POST',
      headers: postHeaders,
      body,
    });

    // Parse and store any cookies from the response
    parseSetCookieHeaders(response.headers, postUrl);

    const html = decodeBuffer(response.body, encoding);
    const resultType = detectResultType(html);

    // Update donguri state for donguri-related results
    if (resultType === PostResultType.Donguri || resultType === PostResultType.DonguriError) {
      handleDonguriPostResult(resultType, html);
    }

    if (resultType === PostResultType.OK) {
      return { success: true, resultType, message: html };
    }

    if (
      (resultType === PostResultType.Cookie || resultType === PostResultType.Check) &&
      attempt < MAX_POST_RETRIES
    ) {
      // Extract hidden fields and retry
      hiddenFields = extractHiddenFields(html);
      logger.info(`${resultType} response, retrying with hidden fields`);
      continue;
    }

    // Non-retryable or max retries exceeded
    return {
      success: false,
      resultType,
      message: html,
      hiddenFields,
    };
  }

  return {
    success: false,
    resultType: PostResultType.Error,
    message: 'Max retries exceeded',
  };
}
