/**
 * Remote search URL builder for ff5ch.syoboi.jp.
 * dig.2ch.net has been removed (server down / always timeout).
 * The search is rendered in a webview on the renderer side.
 */

const FF5CH_BASE = 'https://ff5ch.syoboi.jp/';

/**
 * Build the search URL for ff5ch.syoboi.jp.
 */
export function buildRemoteSearchUrl(keywords: string): string {
  const params = new URLSearchParams({ q: keywords });
  return `${FF5CH_BASE}?${params.toString()}`;
}
