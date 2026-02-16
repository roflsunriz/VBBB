/**
 * Convert plain-text URLs in HTML content to clickable links.
 * Carefully avoids linkifying URLs that are already inside <a> tags.
 */

/**
 * Linkify plain URLs in HTML string, skipping content inside existing anchor tags.
 */
export function linkifyUrls(html: string): string {
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
      return part.replace(
        /(https?:\/\/[^\s<>"'\u3000\uff01-\uff5e]+)/g,
        (url) => {
          const safeUrl = url
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;');
          return `<a href="#" class="external-url text-[var(--color-link)] hover:underline break-all" data-url="${safeUrl}" title="${safeUrl}">${safeUrl}</a>`;
        },
      );
    })
    .join('');
}
