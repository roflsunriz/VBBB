/**
 * Remote search via dig.2ch.net API.
 * Controlled by ENABLE_REMOTE_SEARCH feature flag.
 * Falls back to empty results on API failure.
 */
import type { RemoteSearchQuery, RemoteSearchResult } from '@shared/search';
import { createLogger } from '../logger';
import { httpFetch } from './http-client';

const logger = createLogger('remote-search');

/** Feature flag for remote search */
const ENABLE_REMOTE_SEARCH = true;

const DIG_API_BASE = 'http://dig.2ch.net/';

/**
 * Execute remote search against dig.2ch.net.
 * Returns empty array if feature is disabled or API fails.
 */
export async function searchRemote(query: RemoteSearchQuery): Promise<RemoteSearchResult[]> {
  if (!ENABLE_REMOTE_SEARCH) {
    logger.info('Remote search disabled by feature flag');
    return [];
  }

  const params = new URLSearchParams({
    keywords: query.keywords,
    AndOr: '0',
    maxResult: String(query.maxResults),
    Sort: '0',
    Link: '1',
    json: '1',
  });

  const url = `${DIG_API_BASE}?${params.toString()}`;

  try {
    logger.info(`Remote search: ${query.keywords}`);
    const response = await httpFetch({ url, method: 'GET' });

    if (response.status !== 200) {
      logger.warn(`dig.2ch.net returned HTTP ${String(response.status)}`);
      return [];
    }

    const text = response.body.toString('utf-8');
    const parsed: unknown = JSON.parse(text);

    if (!Array.isArray(parsed)) {
      logger.warn('dig.2ch.net returned non-array response');
      return [];
    }

    return parsed
      .filter(
        (item): item is { subject: string; ita: string; resno: number; url: string } =>
          typeof item === 'object' &&
          item !== null &&
          'subject' in item &&
          'ita' in item &&
          'resno' in item &&
          'url' in item,
      )
      .map((item) => ({
        subject: String(item.subject),
        ita: String(item.ita),
        resno: Number(item.resno),
        url: String(item.url),
      }));
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn(`Remote search failed: ${errMsg}`);
    return [];
  }
}
