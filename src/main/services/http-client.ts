/**
 * HTTP client with User-Agent, timeout, conditional GET, and exponential backoff.
 */
import { type IncomingHttpHeaders, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { type HttpRequestConfig, type HttpResponse, type RetryConfig } from '@shared/api';
import { DEFAULT_USER_AGENT } from '@shared/file-format';
import { createLogger } from '../logger';
import { parseSetCookieHeaders } from './cookie-store';

const logger = createLogger('http-client');

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30_000,
  retryableStatuses: [429, 503, 502, 504],
};

const DEFAULT_CONNECT_TIMEOUT = 10_000;
const DEFAULT_READ_TIMEOUT = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function headersToRecord(headers: IncomingHttpHeaders): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) {
      // RFC 7230: Set-Cookie MUST NOT be combined with comma.
      // Use newline as separator so parseSetCookieHeaders can split reliably.
      const separator = key.toLowerCase() === 'set-cookie' ? '\n' : ', ';
      result[key] = Array.isArray(value) ? value.join(separator) : value;
    }
  }
  return result;
}

function doRequest(config: HttpRequestConfig): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(config.url);
    const isHttps = url.protocol === 'https:';
    const requestFn = isHttps ? httpsRequest : httpRequest;

    const headers: Record<string, string> = {
      'User-Agent': DEFAULT_USER_AGENT,
      ...config.headers,
    };

    // Cache-busting headers are only relevant for GET/HEAD — POST responses
    // are never cached.  Slevo (OkHttp) does not send these at all; sending
    // them on POST to 5ch may trigger anti-bot detection.
    if (config.method === 'GET') {
      if (headers['Cache-Control'] === undefined) {
        headers['Cache-Control'] = 'no-cache';
      }
      if (headers['Pragma'] === undefined) {
        headers['Pragma'] = 'no-cache';
      }
    }

    if (config.ifModifiedSince !== undefined) {
      headers['If-Modified-Since'] = config.ifModifiedSince;
    }

    if (config.range !== undefined) {
      headers['Range'] = config.range;
      // MUST NOT send Accept-Encoding: gzip with Range requests
    } else if (config.acceptGzip !== false) {
      headers['Accept-Encoding'] = 'gzip';
    }

    // Set explicit Content-Length for POST bodies to avoid chunked encoding
    // (some BBS servers such as 5ch bbs.cgi may not support chunked requests)
    if (config.body !== undefined) {
      headers['Content-Length'] = String(Buffer.byteLength(config.body, 'utf-8'));
    }

    // Diagnostic: log outgoing request details
    const headerNames = Object.keys(headers).join(', ');
    const bodyInfo =
      config.body !== undefined
        ? `${String(Buffer.byteLength(config.body, 'utf-8'))} bytes`
        : 'none';
    logger.info(`[DIAG] ${config.method} ${config.url} headers=[${headerNames}] body=${bodyInfo}`);

    const requestOptions: Record<string, unknown> = {
      method: config.method,
      headers,
      timeout: config.connectTimeout ?? DEFAULT_CONNECT_TIMEOUT,
    };

    // Inject proxy agent if provided
    if (config.agent !== undefined) {
      requestOptions['agent'] = config.agent;
    }

    const req = requestFn(config.url, requestOptions, (res) => {
      const chunks: Buffer[] = [];
      const readTimeout = config.readTimeout ?? DEFAULT_READ_TIMEOUT;
      const timer = setTimeout(() => {
        req.destroy(new Error(`Read timeout after ${String(readTimeout)}ms`));
      }, readTimeout);

      res.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        clearTimeout(timer);
        let body = Buffer.concat(chunks);

        // Decompress gzip if Content-Encoding indicates it
        const contentEncoding = res.headers['content-encoding'];
        if (contentEncoding === 'gzip' && config.range === undefined) {
          try {
            body = gunzipSync(body);
          } catch {
            // If decompression fails, use raw body
          }
        }

        const responseHeaders = headersToRecord(res.headers);

        // Diagnostic: log response summary
        logger.info(
          `[DIAG] Response ${String(res.statusCode ?? 0)} from ${config.url} body=${String(body.length)} bytes`,
        );

        // Diagnostic: log raw header names when Set-Cookie is present or
        // for POST requests, to detect headers lost in processing
        const hasSetCookie = responseHeaders['set-cookie'] !== undefined;
        if (config.method === 'POST' || hasSetCookie) {
          const rawNames: string[] = [];
          for (let i = 0; i < res.rawHeaders.length; i += 2) {
            const name = res.rawHeaders[i];
            if (name !== undefined) {
              rawNames.push(name);
            }
          }
          logger.info(`[DIAG] ${config.method} rawHeaders names: ${rawNames.join(', ')}`);
        }

        // Automatically parse Set-Cookie headers from ALL responses
        // (GET, POST, etc.) to match real browser behaviour.
        // Browsers store cookies from every HTTP response; previously
        // VBBB only parsed Set-Cookie from POST responses, missing
        // cookies set during GET requests (subject.txt, dat, etc.).
        if (hasSetCookie) {
          logger.info(`[DIAG] Set-Cookie found in ${config.method} ${config.url} — parsing`);
          parseSetCookieHeaders(responseHeaders, config.url);
        }

        resolve({
          status: res.statusCode ?? 0,
          headers: responseHeaders,
          body,
          lastModified: responseHeaders['last-modified'],
        });
      });

      res.on('error', (err: Error) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('Connection timeout'));
    });

    req.on('error', (err: Error) => {
      reject(err);
    });

    if (config.body !== undefined) {
      req.write(config.body);
    }
    req.end();
  });
}

/**
 * Execute an HTTP request with retry and exponential backoff.
 */
export async function httpFetch(
  config: HttpRequestConfig,
  retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG,
): Promise<HttpResponse> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      const response = await doRequest(config);

      if (
        retryConfig.retryableStatuses.includes(response.status) &&
        attempt < retryConfig.maxRetries
      ) {
        const delay = Math.min(
          retryConfig.initialDelayMs * Math.pow(2, attempt),
          retryConfig.maxDelayMs,
        );
        logger.warn(
          `Retryable status ${String(response.status)} for ${config.url}, retrying in ${String(delay)}ms`,
        );
        await sleep(delay);
        continue;
      }

      return response;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < retryConfig.maxRetries) {
        const delay = Math.min(
          retryConfig.initialDelayMs * Math.pow(2, attempt),
          retryConfig.maxDelayMs,
        );
        logger.warn(
          `Request error for ${config.url}: ${lastError.message}, retrying in ${String(delay)}ms`,
        );
        await sleep(delay);
      }
    }
  }
  throw lastError ?? new Error('Request failed after retries');
}
