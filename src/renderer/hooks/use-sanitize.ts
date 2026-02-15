/**
 * HTML sanitization utilities using DOMPurify.
 * MUST be applied before rendering any DAT/subject content.
 */
import DOMPurify from 'dompurify';

/** Dangerous URL schemes to reject */
const DANGEROUS_SCHEMES = new Set([
  'javascript:',
  'vbscript:',
  'data:',
  'blob:',
]);

/**
 * Check if a URL is safe (not a dangerous scheme).
 */
export function isSafeUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  for (const scheme of DANGEROUS_SCHEMES) {
    if (trimmed.startsWith(scheme)) {
      return false;
    }
  }
  return true;
}

/** Tags that must never appear in sanitized output */
const STRIP_TAG_PATTERN = /<\/?(script|iframe|object|embed|form|input|style|applet|meta|link|base)[^>]*>/gi;

/** Dangerous URL patterns in attributes */
const DANGEROUS_HREF_PATTERN = /\s(href|src)\s*=\s*["']?\s*(javascript|vbscript|data):/gi;

/**
 * Sanitize HTML content from DAT/subject for safe rendering.
 * Removes dangerous scripts, event handlers, and URL schemes.
 */
export function sanitizeHtml(dirty: string): string {
  const purified = DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['a', 'b', 'i', 'u', 'br', 'font', 'span', 'em', 'strong', 'hr'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'color', 'class'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'style'],
    ALLOW_DATA_ATTR: false,
  });

  // Post-filter: ensure dangerous tags are stripped regardless of DOM implementation
  let result = purified.replace(STRIP_TAG_PATTERN, '');

  // Post-filter: strip dangerous URL schemes from any remaining attributes
  result = result.replace(DANGEROUS_HREF_PATTERN, '');

  return result;
}

/**
 * Strip all HTML tags and return plain text.
 */
export function stripHtml(html: string): string {
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['#text'],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
  });
  // Fallback: also strip with regex to ensure no tags remain
  return sanitized.replace(/<[^>]*>/g, '');
}
