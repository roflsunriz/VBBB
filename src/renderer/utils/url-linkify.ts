/**
 * Convert plain-text URLs in HTML content to clickable links.
 * Carefully avoids linkifying URLs that are already inside <a> tags.
 */

/**
 * Linkify plain URLs in HTML string, skipping content inside existing anchor tags.
 */
const URL_PATTERN =
  /\b((?:[a-zA-Z][a-zA-Z0-9+.-]{0,19}:\/\/(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?:\/[^\s<>"'\u3000\uff01-\uff5e]*)?)|(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?:\/[^\s<>"'\u3000\uff01-\uff5e]*)?)/g;
const TRAILING_PUNCTUATION = /[)\]}>'"」』】》〉、。！？!?,.;:]+$/u;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeUrl(rawUrl: string): string {
  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]{0,19}):\/\//.exec(rawUrl);
  if (schemeMatch?.[1] === undefined) {
    return `https://${rawUrl}`;
  }
  const scheme = schemeMatch[1].toLowerCase();
  if (scheme === 'https' || scheme === 'http') {
    return rawUrl;
  }
  return `https://${rawUrl.slice(schemeMatch[0].length)}`;
}

function splitTrailingPunctuation(candidate: string): {
  readonly url: string;
  readonly suffix: string;
} {
  const match = candidate.match(TRAILING_PUNCTUATION);
  if (match?.[0] === undefined) {
    return { url: candidate, suffix: '' };
  }
  const suffix = match[0];
  return {
    url: candidate.slice(0, -suffix.length),
    suffix,
  };
}

export function linkifyUrls(html: string): string {
  if (!html.includes('://') && !html.includes('.')) {
    return html;
  }

  const parts = html.split(/(<[^>]+>)/);
  let insideAnchor = false;

  return parts
    .map((part) => {
      if (part.startsWith('<')) {
        const lower = part.toLowerCase();
        if (lower.startsWith('<a ') || lower.startsWith('<a>')) {
          insideAnchor = true;
        }
        if (lower === '</a>') {
          insideAnchor = false;
        }
        return part;
      }
      if (insideAnchor) return part;

      // Fast path: skip regex work for segments that cannot contain URL-like tokens.
      if (!part.includes('://') && !part.includes('.')) return part;

      return part.replace(URL_PATTERN, (matchedUrl) => {
        const { url, suffix } = splitTrailingPunctuation(matchedUrl);
        if (url.length === 0) return matchedUrl;

        const safeDisplay = escapeHtml(url);
        const normalizedUrl = normalizeUrl(url);
        const safeDataUrl = escapeHtml(normalizedUrl);
        return `<a href="#" class="external-url text-[var(--color-link)] hover:underline break-all" data-url="${safeDataUrl}" title="${safeDataUrl}">${safeDisplay}</a>${suffix}`;
      });
    })
    .join('');
}
