/**
 * Post (投稿) service.
 * Handles bbs.cgi POST, response type detection, cookie/check retry flow.
 */
import type { EncodingType } from '@shared/api';
import { type Board, BoardType, type PostParams, type PostResult, PostResultType } from '@shared/domain';
import { MAX_POST_RETRIES } from '@shared/file-format';
import { createLogger } from '../logger';
import { buildCookieHeader, getCookiesForUrl, parseSetCookieHeaders, removeCookie, setCookie } from './cookie-store';
import { handleDonguriPostResult } from './donguri';
import { decodeBuffer, httpEncode } from './encoding';
import { httpFetch } from './http-client';
import { getUpliftSid } from './uplift-auth';

const logger = createLogger('post');

/** Max chars of response HTML to log for grtError diagnostics. */
const DIAGNOSTIC_HTML_LIMIT = 2000;

/** Max chars of response HTML to log for grtCookie/grtCheck diagnostics. */
const CONFIRMATION_HTML_LIMIT = 4000;

/**
 * Extract POST body parameter keys for diagnostic logging.
 * Does NOT log values (may contain user input).
 */
function extractBodyParamKeys(body: string): string {
  return body.split('&').map((pair) => pair.split('=')[0] ?? '').join(', ');
}

/**
 * Format response headers as a single diagnostic string.
 * Cookie values are omitted for security.
 */
function formatHeadersDiag(headers: Readonly<Record<string, string>>): string {
  return Object.entries(headers)
    .map(([key, value]) => {
      if (key.toLowerCase() === 'set-cookie') {
        return `${key}: (present, ${value.split('\n').length} cookie(s))`;
      }
      return `${key}: ${value}`;
    })
    .join(' | ');
}

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
 * Extract cookie name/value pairs from `<pre>Cookie:NAME = VALUE</pre>` tags
 * in the confirmation HTML.
 *
 * 5ch's confirmation page embeds the cookie the client must set in a `<pre>`
 * tag. This value is DIFFERENT from the hidden field of the same name — the
 * cookie goes in the Cookie header, while the hidden field goes in the POST
 * body. Both are validated server-side as a matching pair.
 */
function extractPreCookies(html: string): ReadonlyArray<{ name: string; value: string }> {
  const results: Array<{ name: string; value: string }> = [];

  // 5ch's confirmation page embeds cookies in a <pre> block.  The format
  // changed over time and varies per board — we must handle all variants:
  //
  //   Single cookie (some boards):
  //     <pre>Cookie:feature = confirmed:XXXX</pre>
  //     <pre>Cookie:feature=confirmed:XXXX</pre>
  //
  //   Multiple cookies (5ch with acorn):
  //     <pre>Cookie:acorn = LONG_RANDOM_STRING
  //     feature = confirmed:XXXX</pre>
  //
  // Strategy: extract the full <pre>Cookie:...</pre> block, then parse
  // each NAME = VALUE pair line-by-line.

  const preRegex = /<pre>\s*Cookie:\s*([\s\S]*?)<\/pre>/gi;
  let preMatch: RegExpExecArray | null;

  while ((preMatch = preRegex.exec(html)) !== null) {
    const block = preMatch[1];
    if (block === undefined) continue;

    // The first line starts after "Cookie:" so the first name=value is
    // already captured.  Subsequent lines are just "NAME = VALUE".
    // Split on newlines and also handle the first entry which might be
    // directly after "Cookie:" without a preceding newline.
    const lineRegex = /([^=\s]+)\s*=\s*(\S+)/g;
    let lineMatch: RegExpExecArray | null;
    while ((lineMatch = lineRegex.exec(block)) !== null) {
      const name = lineMatch[1];
      const value = lineMatch[2];
      if (name !== undefined && value !== undefined) {
        results.push({ name: htmlDecode(name), value: htmlDecode(value) });
      }
    }
  }

  return results;
}

/**
 * Resolve the confirmation form's action URL against the original POST URL.
 *
 * 5ch's confirmation page typically returns a relative action like
 * `../test/bbs.cgi?guid=ON`. The `?guid=ON` query parameter is required
 * for the retry to be accepted by the server.
 *
 * If the form action is absent or invalid, falls back to the original URL.
 */
function resolveRetryUrl(formAction: string | undefined, originalUrl: string): string {
  if (formAction === undefined || formAction.length === 0) {
    return originalUrl;
  }
  try {
    const resolved = new URL(formAction, originalUrl);
    return resolved.href;
  } catch {
    return originalUrl;
  }
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

  // Diagnostic: log the full post context
  logger.info(
    `[DIAG] Post context: boardType=${board.boardType}, encoding=${requestEncoding}, ` +
    `bbsId=${board.bbsId}, threadId=${params.threadId}, referer=${referer}`,
  );

  let hiddenFields: Record<string, string> | undefined;
  let retrySubmitBtn: SubmitButton | undefined;
  let retryUrl: string | undefined;
  let lastPayloadHash = '';

  for (let attempt = 0; attempt <= MAX_POST_RETRIES; attempt++) {
    const isRetry = hiddenFields !== undefined && retrySubmitBtn !== undefined;

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

    // Diagnostic: log body param keys and size
    const bodyParamKeys = extractBodyParamKeys(body);
    const bodyBytes = Buffer.byteLength(body, 'utf-8');
    logger.info(
      `[DIAG] Request body (attempt ${String(attempt + 1)}, ${isRetry ? 'retry' : 'initial'}): ` +
      `params=[${bodyParamKeys}], size=${String(bodyBytes)} bytes`,
    );

    // Use the confirmation form's action URL for retries (e.g. includes ?guid=ON),
    // otherwise use the original post URL for the initial attempt.
    const targetUrl = isRetry && retryUrl !== undefined ? retryUrl : postUrl;

    // Referer: on the initial attempt, use the thread page URL (as a browser
    // would when submitting the write form).  On retries, use the post URL
    // (bbs.cgi) because the browser's current page is the confirmation page
    // served by bbs.cgi — clicking "submit" on that form makes the browser
    // send bbs.cgi as the Referer.
    const effectiveReferer = isRetry ? postUrl : referer;

    // Build Cookie header from store (acorn, sid, DMDM, MDMD, SPID, PON, etc.)
    const cookieHeader = buildCookieHeader(targetUrl);
    // Log cookie names and partial values for diagnostics
    const cookiePairs = cookieHeader.length > 0
      ? cookieHeader.split('; ').map((c) => {
          const eqIdx = c.indexOf('=');
          if (eqIdx < 0) return c;
          const name = c.substring(0, eqIdx);
          const val = c.substring(eqIdx + 1);
          // Show first 20 chars of value to verify correctness
          const preview = val.length > 20 ? val.substring(0, 20) + '...' : val;
          return `${name}=${preview}`;
        })
      : [];
    const cookieNames = cookiePairs.length > 0
      ? cookiePairs.map((p) => p.split('=')[0]).join(', ')
      : '(none)';
    logger.info(`Posting to ${targetUrl} (attempt ${String(attempt + 1)}, cookies: ${cookieNames})`);
    logger.info(`[DIAG] Cookie value previews: ${cookiePairs.length > 0 ? cookiePairs.join('; ') : '(none)'}`);
    logger.info(`[DIAG] Referer for this attempt: ${effectiveReferer}`);

    const postHeaders: Record<string, string> = {
      'Content-Type': `application/x-www-form-urlencoded${charset}`,
      Referer: effectiveReferer,
      Origin: origin,
      'Accept-Language': 'ja',
    };
    if (cookieHeader.length > 0) {
      postHeaders['Cookie'] = cookieHeader;
    }

    // Diagnostic: log all request headers (Cookie values already masked by logger)
    logger.info(
      `[DIAG] Request headers: ${Object.keys(postHeaders).join(', ')}`,
    );

    const response = await httpFetch({
      url: targetUrl,
      method: 'POST',
      headers: postHeaders,
      body,
    });

    // Diagnostic: log full response headers
    logger.info(
      `[DIAG] Response HTTP ${String(response.status)}, headers: ${formatHeadersDiag(response.headers)}`,
    );
    logger.info(
      `[DIAG] Response body size: ${String(response.body.length)} bytes`,
    );

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
      logger.info('[DIAG] Post succeeded');
      return { success: true, resultType, message: html };
    }

    if (
      (resultType === PostResultType.Cookie || resultType === PostResultType.Check) &&
      attempt < MAX_POST_RETRIES
    ) {
      // Diagnostic: log full confirmation page HTML for debugging
      const confirmSnippet = html.length > CONFIRMATION_HTML_LIMIT
        ? html.substring(0, CONFIRMATION_HTML_LIMIT) + `... (truncated, total ${String(html.length)} chars)`
        : html;
      logger.info(`[DIAG] ${resultType} full response:\n${confirmSnippet}`);

      // Extract form data from the confirmation page
      hiddenFields = extractHiddenFields(html);
      const submitBtn = extractSubmitButton(html);
      retrySubmitBtn = submitBtn ?? { name: 'submit', value: '\u66F8\u304D\u8FBC\u3080' }; // fallback

      // Resolve the confirmation form's action URL for the retry request.
      // 5ch returns relative URLs like "../test/bbs.cgi?guid=ON" — the
      // ?guid=ON parameter is required for the server to accept the retry.
      const formAction = extractFormAction(html);
      retryUrl = resolveRetryUrl(formAction, postUrl);
      logger.info(
        `${resultType} form: action=${formAction ?? '(none)'}, ` +
        `resolved retryUrl=${retryUrl}, ` +
        `submit name=${retrySubmitBtn.name ?? '(none)'} value="${retrySubmitBtn.value}"`,
      );

      // Diagnostic: log all hidden field keys and whether they are standard params
      const standardParamNames = new Set([
        'FROM', 'mail', 'MESSAGE', 'bbs', 'time', 'key', 'subject', 'submit',
      ]);
      const hiddenSummary = Object.entries(hiddenFields)
        .map(([k, v]) => {
          const isStd = standardParamNames.has(k);
          const safeVal = isStd && (k === 'MESSAGE' || k === 'FROM') ? '(user-input)' : v;
          return `${k}=${safeVal}${isStd ? '' : ' [non-std]'}`;
        })
        .join(', ');
      logger.info(`[DIAG] Hidden fields: ${hiddenSummary}`);

      // Extract cookies from <pre>Cookie:NAME = VALUE</pre> in the HTML.
      //
      // 5ch's confirmation page embeds the cookie value to set in a <pre>
      // tag. This value is INTENTIONALLY DIFFERENT from the hidden field of
      // the same name (e.g. "feature"). The server validates the pair:
      //   Cookie header  -> value from <pre> tag
      //   POST body      -> value from hidden field
      // If the client uses the hidden field value for both, the server
      // rejects the request with "9991 Banned".
      const confirmUrlObj = new URL(retryUrl);
      const preCookies = extractPreCookies(html);
      const preCookieNames = new Set<string>();

      for (const pc of preCookies) {
        preCookieNames.add(pc.name);
        // Log value preview so we can verify cookie vs hidden field differ
        const cookiePreview = pc.value.length > 30
          ? pc.value.substring(0, 30) + '...'
          : pc.value;
        logger.info(
          `[DIAG] Setting cookie from <pre> tag: ${pc.name}=${cookiePreview} for ${confirmUrlObj.hostname}`,
        );
        // Also log the hidden field value for comparison
        const hiddenVal = hiddenFields[pc.name];
        if (hiddenVal !== undefined) {
          const hiddenPreview = hiddenVal.length > 30
            ? hiddenVal.substring(0, 30) + '...'
            : hiddenVal;
          logger.info(
            `[DIAG] Corresponding hidden field: ${pc.name}=${hiddenPreview} (DIFFERENT=${String(pc.value !== htmlDecode(hiddenVal))})`,
          );
        }

        // Prevent duplicate cookies: if a cookie with the same name already
        // exists at a parent domain (e.g. acorn@.5ch.net set via Set-Cookie),
        // storing a second copy at the subdomain (acorn@rio2016.5ch.net) would
        // cause TWO cookies with the same name to be sent.  To avoid this,
        // check for an existing match and reuse its domain.
        const existingMatches = getCookiesForUrl(retryUrl).filter(
          (c) => c.name === pc.name,
        );
        let cookieDomain = confirmUrlObj.hostname;
        if (existingMatches.length > 0 && existingMatches[0] !== undefined) {
          // Reuse the domain of the existing cookie and remove the old entry
          cookieDomain = existingMatches[0].domain;
          removeCookie(pc.name, existingMatches[0].domain);
          logger.info(
            `[DIAG] Replaced existing ${pc.name}@${existingMatches[0].domain} with <pre> value`,
          );
        }
        setCookie({
          name: pc.name,
          value: pc.value,
          domain: cookieDomain,
          path: '/',
          sessionOnly: false,
          secure: confirmUrlObj.protocol === 'https:',
        });
      }

      // For any non-standard hidden fields that do NOT have a corresponding
      // <pre> cookie (e.g. SPID, PON from older 5ch versions), fall back to
      // storing them as cookies so they appear in the Cookie header.
      for (const [fieldName, fieldValue] of Object.entries(hiddenFields)) {
        if (!standardParamNames.has(fieldName) && !preCookieNames.has(fieldName)) {
          logger.info(`[DIAG] Storing hidden field as cookie (no <pre> match): ${fieldName} for ${confirmUrlObj.hostname}`);
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

      // Wait before retrying: a real browser shows the confirmation page to
      // the user, who reads and clicks the submit button after a few seconds.
      // Instant retries (< 1 second) may be flagged as bot behaviour by the
      // 5ch server, resulting in a "9991 Banned" rejection.
      const CONFIRMATION_DELAY_MS = 3000;
      logger.info(`[DIAG] Waiting ${String(CONFIRMATION_DELAY_MS)}ms before retry (anti-bot timing)`);
      await new Promise<void>((resolve) => {
        setTimeout(resolve, CONFIRMATION_DELAY_MS);
      });

      continue;
    }

    // Log diagnostic info for non-OK results to aid debugging
    if (resultType === PostResultType.Error) {
      const snippet = html.length > DIAGNOSTIC_HTML_LIMIT
        ? html.substring(0, DIAGNOSTIC_HTML_LIMIT) + `... (truncated, total ${String(html.length)} chars)`
        : html;
      logger.warn(`[DIAG] grtError response body:\n${snippet}`);
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
