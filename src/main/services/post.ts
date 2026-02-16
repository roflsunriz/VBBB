/**
 * Post (投稿) service.
 * Handles bbs.cgi POST, response type detection, cookie/check retry flow.
 */
import type { EncodingType } from '@shared/api';
import { type Board, BoardType, type PostParams, type PostResult, PostResultType } from '@shared/domain';
import { MAX_POST_RETRIES } from '@shared/file-format';
import { createLogger } from '../logger';
import { buildCookieHeader, parseSetCookieHeaders, setCookie } from './cookie-store';
import { handleDonguriPostResult } from './donguri';
import { decodeBuffer, httpEncode } from './encoding';
import { httpFetch } from './http-client';
import { getUpliftSid } from './uplift-auth';

const logger = createLogger('post');

/** Max chars of response HTML to log for diagnostics. */
const DIAGNOSTIC_HTML_LIMIT = 500;

/**
 * Determine POST encoding for a board type.
 * Type2ch (5ch) and Shitaraba use Shift_JIS, JBBS uses EUC-JP.
 * Note: 5ch bbs.cgi historically expects Shift_JIS for both request and response.
 */
function getPostEncoding(boardType: BoardType): EncodingType {
  switch (boardType) {
    case BoardType.Type2ch:
    case BoardType.Shitaraba:
      return 'Shift_JIS';
    case BoardType.JBBS:
      return 'EUC-JP';
    default: {
      const _exhaustive: never = boardType;
      return _exhaustive;
    }
  }
}

/**
 * Normalize a charset string to an EncodingType, or undefined if unrecognized.
 */
function normalizeCharset(raw: string): EncodingType | undefined {
  const charset = raw.toUpperCase().replace(/[-_]/g, '');
  if (charset === 'UTF8') return 'UTF-8';
  if (charset === 'SHIFTJIS' || charset === 'SJIS' || charset === 'XSJIS') return 'Shift_JIS';
  if (charset === 'EUCJP') return 'EUC-JP';
  return undefined;
}

/**
 * Detect encoding from a Content-Type HTTP header value.
 * Returns undefined if no charset is found.
 */
function detectEncodingFromHeader(headers: Readonly<Record<string, string>>): EncodingType | undefined {
  const contentType = headers['content-type'];
  if (contentType === undefined) return undefined;

  const charsetMatch = /charset=([^\s;]+)/i.exec(contentType);
  if (charsetMatch === null || charsetMatch[1] === undefined) return undefined;

  return normalizeCharset(charsetMatch[1]);
}

/**
 * Detect encoding from HTML meta charset in the raw response body.
 * Scans the first 1024 bytes as ASCII (safe because charset names are ASCII).
 */
function detectEncodingFromHtmlMeta(body: Buffer): EncodingType | undefined {
  const head = body.subarray(0, 1024).toString('ascii');
  const match = /charset=([^\s"';>]+)/i.exec(head);
  if (match === null || match[1] === undefined) return undefined;

  return normalizeCharset(match[1]);
}

/**
 * Build POST URL for a board.
 */
function getPostUrl(board: Board): string {
  return `${board.serverUrl}test/bbs.cgi`;
}

/**
 * Decode common HTML entities found in hidden field values.
 */
function htmlDecode(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_match, dec: string) =>
      String.fromCharCode(parseInt(dec, 10)),
    );
}

/**
 * Extracted submit button metadata.
 */
interface SubmitButton {
  /** Button name attribute (undefined if absent) */
  readonly name: string | undefined;
  /** Button value (display text) */
  readonly value: string;
}

/**
 * Extract the submit button name and value from HTML.
 * Returns undefined if no submit input is found.
 */
export function extractSubmitButton(html: string): SubmitButton | undefined {
  const inputRegex = /<input\b[^>]*>/gi;
  const typeRegex = /type\s*=\s*["']?submit["']?/i;
  const nameRegex = /name\s*=\s*["']?([^"'\s>]+)["']?/i;
  const valueRegex = /value\s*=\s*["']?([^"'>]*)["']?/i;

  let match: RegExpExecArray | null;
  while ((match = inputRegex.exec(html)) !== null) {
    const tag = match[0];
    if (!typeRegex.test(tag)) continue;
    const vm = valueRegex.exec(tag);
    if (vm !== null && vm[1] !== undefined) {
      const nm = nameRegex.exec(tag);
      return {
        name: nm !== null && nm[1] !== undefined ? nm[1] : undefined,
        value: htmlDecode(vm[1]),
      };
    }
  }
  return undefined;
}

/**
 * Extract the form action URL from HTML.
 */
function extractFormAction(html: string): string | undefined {
  const match = /<form\b[^>]*action\s*=\s*["']?([^"'\s>]+)["']?/i.exec(html);
  return match !== null && match[1] !== undefined ? htmlDecode(match[1]) : undefined;
}

/**
 * Build POST body for the initial attempt.
 */
function buildPostBody(
  params: PostParams,
  board: Board,
): string {
  const encoding = getPostEncoding(board.boardType);
  const fields: Array<[string, string]> = [];

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
 * Build POST body for a confirmation retry (grtCookie / grtCheck).
 *
 * Submits the server's confirmation form directly: all hidden field values
 * are HTML-decoded and then percent-encoded, exactly as a browser would do
 * when the user clicks the confirmation button.
 *
 * This preserves the original `time` value (used as a server-side token)
 * and uses the confirmation submit button text.
 */
function buildRetryBody(
  hiddenFields: Readonly<Record<string, string>>,
  submitBtn: SubmitButton,
  encoding: EncodingType,
): string {
  const fields: Array<[string, string]> = [];

  for (const [key, value] of Object.entries(hiddenFields)) {
    fields.push([key, htmlDecode(value)]);
  }

  // Add UPLIFT sid if available and not already in hidden fields
  if (!Object.hasOwn(hiddenFields, 'sid')) {
    const sid = getUpliftSid();
    if (sid.length > 0) {
      fields.push(['sid', sid]);
    }
  }

  // Include the submit button only if it has a name attribute
  // (browsers omit nameless submit buttons from form data)
  if (submitBtn.name !== undefined) {
    fields.push([submitBtn.name, submitBtn.value]);
  }

  return fields
    .map(([key, value]) => `${key}=${httpEncode(value, encoding)}`)
    .join('&');
}

/**
 * Determine the result type from the server response HTML.
 *
 * Detection order matters: grtOK first (success fast-path), then cookie/check
 * (retryable), then donguri/ninpou/suiton (non-retryable), and finally grtError
 * as the fallback.
 *
 * Patterns use broad substring matching to handle server-side text variations.
 * For example, 5ch may return "クッキー確認" or "クッキー確認！" depending on
 * the server — matching on "クッキー確認" (without "！") covers both.
 */
export function detectResultType(html: string): PostResultType {
  // --- grtOK ---
  if (html.includes('\u66F8\u304D\u3053\u307F\u304C\u7D42\u308F\u308A\u307E\u3057\u305F')) {
    // 書きこみが終わりました
    return PostResultType.OK;
  }

  // --- grtCookie ---
  // Patterns: クッキーがないか期限切れです / クッキー確認 (covers クッキー確認！)
  //           <!-- _X:cookie --> (reliable HTML comment marker from 5ch)
  if (
    html.includes('\u30AF\u30C3\u30AD\u30FC\u304C\u306A\u3044\u304B\u671F\u9650\u5207\u308C\u3067\u3059') ||
    html.includes('\u30AF\u30C3\u30AD\u30FC\u78BA\u8A8D') ||
    html.includes('<!-- _X:cookie -->')
  ) {
    return PostResultType.Cookie;
  }

  // --- grtCheck ---
  // Patterns: 書き込み確認 (covers 書き込み確認します) / 内容確認 / 投稿確認
  //           書き込みチェック (covers 書き込みチェック！)
  if (
    html.includes('\u66F8\u304D\u8FBC\u307F\u78BA\u8A8D') ||
    html.includes('\u5185\u5BB9\u78BA\u8A8D') ||
    html.includes('\u6295\u7A3F\u78BA\u8A8D') ||
    html.includes('\u66F8\u304D\u8FBC\u307F\u30C1\u30A7\u30C3\u30AF')
  ) {
    return PostResultType.Check;
  }

  // --- grtDonguri ---
  if (html.includes('\u3069\u3093\u3050\u308A\u3092\u57CB\u3081\u307E\u3057\u305F')) {
    // どんぐりを埋めました
    return PostResultType.Donguri;
  }

  // --- grtDngBroken ---
  if (html.includes('broken_acorn') || html.includes('[1044]') || html.includes('[1045]')) {
    return PostResultType.DonguriError;
  }

  // --- grtNinpou ---
  if (html.includes('\u5FCD\u6CD5\u306E\u8A8D\u6CD5\u3092\u65B0\u898F\u4F5C\u6210\u3057\u307E\u3059')) {
    // 忍法の認法を新規作成します
    return PostResultType.Ninpou;
  }

  // --- grtSuiton ---
  if (html.includes('Lv=0') || html.includes('\u6BBA\u3055\u308C\u307E\u3057\u305F')) {
    // Lv=0 / 殺されました
    return PostResultType.Suiton;
  }

  // --- grtError (fallback) ---
  return PostResultType.Error;
}

/**
 * Extract hidden input fields from HTML response.
 * Attribute order does not matter: handles both
 *   <input type=hidden name="x" value="y">
 *   <input name="x" type="hidden" value="y">
 *   <input value="y" name="x" type=hidden>
 */
export function extractHiddenFields(html: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const inputRegex = /<input\b[^>]*>/gi;
  const typeRegex = /type\s*=\s*["']?hidden["']?/i;
  const nameRegex = /name\s*=\s*["']?([^"'\s>]+)["']?/i;
  const valueRegex = /value\s*=\s*["']?([^"'>]*)["']?/i;

  let inputMatch: RegExpExecArray | null;
  while ((inputMatch = inputRegex.exec(html)) !== null) {
    const tag = inputMatch[0];
    if (!typeRegex.test(tag)) continue;

    const nm = nameRegex.exec(tag);
    const vm = valueRegex.exec(tag);
    if (nm !== null && nm[1] !== undefined) {
      fields[nm[1]] = vm !== null && vm[1] !== undefined ? vm[1] : '';
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
  const requestEncoding = getPostEncoding(board.boardType);
  const charset = requestEncoding === 'UTF-8' ? '; charset=UTF-8' : '';

  // Referer: thread URL for replies, bbs.cgi for new threads (per protocol §5.2)
  const referer = params.threadId.length > 0
    ? `${board.serverUrl}test/read.cgi/${board.bbsId}/${params.threadId}/`
    : `${board.serverUrl}test/bbs.cgi`;

  // Origin: required by some servers for POST CSRF validation
  const postUrlObj = new URL(postUrl);
  const origin = postUrlObj.origin;

  let hiddenFields: Record<string, string> | undefined;
  let retrySubmitBtn: SubmitButton | undefined;
  let lastPayloadHash = '';

  for (let attempt = 0; attempt <= MAX_POST_RETRIES; attempt++) {
    // On retry after grtCookie/grtCheck, submit the server's confirmation
    // form directly (preserving its `time` value, submit button text, etc.)
    const body = hiddenFields !== undefined && retrySubmitBtn !== undefined
      ? buildRetryBody(hiddenFields, retrySubmitBtn, requestEncoding)
      : buildPostBody(params, board);

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

    // Build Cookie header from store (acorn, sid, DMDM, MDMD, SPID, PON, etc.)
    const cookieHeader = buildCookieHeader(postUrl);
    // Log cookie names (not values) for diagnostics
    const cookieNames = cookieHeader.length > 0
      ? cookieHeader.split('; ').map((c) => c.split('=')[0]).join(', ')
      : '(none)';
    logger.info(`Posting to ${postUrl} (attempt ${String(attempt + 1)}, cookies: ${cookieNames})`);
    const postHeaders: Record<string, string> = {
      'Content-Type': `application/x-www-form-urlencoded${charset}`,
      Referer: referer,
      Origin: origin,
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
    const hadSetCookie = response.headers['set-cookie'] !== undefined;
    parseSetCookieHeaders(response.headers, postUrl);
    if (hadSetCookie) {
      const updatedCookieHeader = buildCookieHeader(postUrl);
      const updatedNames = updatedCookieHeader.length > 0
        ? updatedCookieHeader.split('; ').map((c) => c.split('=')[0]).join(', ')
        : '(none)';
      logger.info(`Set-Cookie received; store now has: ${updatedNames}`);
    }

    // Decode response: HTTP Content-Type header → HTML meta charset → request encoding
    const responseEncoding = detectEncodingFromHeader(response.headers)
      ?? detectEncodingFromHtmlMeta(response.body)
      ?? requestEncoding;
    const html = decodeBuffer(response.body, responseEncoding);
    const resultType = detectResultType(html);

    logger.info(`Post result: ${resultType} (HTTP ${String(response.status)}, decoded as ${responseEncoding})`);

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
      // Extract form data from the confirmation page
      hiddenFields = extractHiddenFields(html);
      const submitBtn = extractSubmitButton(html);
      retrySubmitBtn = submitBtn ?? { name: 'submit', value: '\u66F8\u304D\u8FBC\u3080' }; // fallback

      // Diagnostic: log form structure to help debug server rejections
      const formAction = extractFormAction(html);
      logger.info(
        `${resultType} form: action=${formAction ?? '(none)'}, ` +
        `submit name=${retrySubmitBtn.name ?? '(none)'} value="${retrySubmitBtn.value}"`,
      );

      // Per protocol §5.7: also store confirmation tokens as cookies
      // so they appear in the Cookie header on the retry request.
      const confirmUrlObj = new URL(postUrl);
      const standardParamNames = new Set([
        'FROM', 'mail', 'MESSAGE', 'bbs', 'time', 'key', 'subject', 'submit',
      ]);
      for (const [fieldName, fieldValue] of Object.entries(hiddenFields)) {
        if (!standardParamNames.has(fieldName)) {
          setCookie({
            name: fieldName,
            value: htmlDecode(fieldValue),
            domain: confirmUrlObj.hostname,
            path: '/',
            sessionOnly: false,
            secure: confirmUrlObj.protocol === 'https:',
          });
        }
      }

      const fieldNames = Object.keys(hiddenFields);
      logger.info(
        `Retrying with form submission (fields: ${fieldNames.join(', ')})`,
      );
      continue;
    }

    // Log diagnostic info for non-OK results to aid debugging
    if (resultType === PostResultType.Error) {
      const snippet = html.length > DIAGNOSTIC_HTML_LIMIT
        ? html.substring(0, DIAGNOSTIC_HTML_LIMIT) + '...'
        : html;
      logger.warn(`grtError response body (first ${String(DIAGNOSTIC_HTML_LIMIT)} chars): ${snippet}`);
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
