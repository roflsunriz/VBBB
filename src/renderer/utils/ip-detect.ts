/**
 * IP address detection utilities (F28/F35).
 *
 * Detects IPv4 and IPv6 addresses in thread responses (name, dateTime fields)
 * and provides WhoIs/geolocation lookup via IPC to the main process.
 */
import type { Res } from '@shared/domain';

/** IPv4 pattern — word-boundary delimited */
const IPV4_PATTERN = /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g;

/**
 * IPv6 pattern — covers common forms:
 *   Full:           2001:0db8:85a3:0000:0000:8a2e:0370:7334
 *   Abbreviated:    2001:db8::1, fe80::1, ::1
 *   Mixed (mapped): ::ffff:192.168.1.1
 *
 * Captures the matched address in group 1.
 */
const IPV6_PATTERN = new RegExp(
  '(' +
    // Full form: 8 groups of hex separated by colons
    '(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}' +
    // 1-7 groups followed by :: and remaining groups
    '|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}' +
    '|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}' +
    '|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}' +
    '|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}' +
    '|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}' +
    '|[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,6}' +
    // :: followed by 1-7 groups
    '|:(?::[0-9a-fA-F]{1,4}){1,7}' +
    // 1-7 groups followed by trailing ::
    '|(?:[0-9a-fA-F]{1,4}:){1,7}:' +
    // Just ::
    '|::' +
  ')',
  'g',
);

/**
 * BBS masked IPv6 pattern — partial address ending with :* wildcard.
 * e.g. "発信元:240b:11:442:d510:*" → captures "240b:11:442:d510:*"
 *
 * Matches 2+ hex groups followed by ":*".
 * Checked BEFORE the standard IPv6 pattern so the ":*" suffix is not missed.
 */
const IPV6_MASKED_PATTERN = /([0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4})+:\*)/g;

/** Validate that an IPv4 address has octets in 0-255 range */
function isValidIpv4(ip: string): boolean {
  const parts = ip.split('.');
  return parts.length === 4 && parts.every((p) => {
    const n = Number(p);
    return Number.isInteger(n) && n >= 0 && n <= 255;
  });
}

/**
 * Detect if a thread contains exposed IP addresses (IPv4 or IPv6).
 * Returns true if any response has an IP in name or dateTime fields.
 */
export function threadHasExposedIps(responses: readonly Res[]): boolean {
  for (const res of responses) {
    for (const src of [res.name, res.dateTime]) {
      IPV4_PATTERN.lastIndex = 0;
      if (IPV4_PATTERN.test(src)) return true;
      IPV6_MASKED_PATTERN.lastIndex = 0;
      if (IPV6_MASKED_PATTERN.test(src)) return true;
      IPV6_PATTERN.lastIndex = 0;
      if (IPV6_PATTERN.test(src)) return true;
    }
  }
  return false;
}

/**
 * Extract all IP addresses (IPv4 + IPv6) from a response's name and dateTime.
 */
export function extractIps(res: Res): readonly string[] {
  const ips: string[] = [];
  const seen = new Set<string>();
  const sources = [res.name, res.dateTime];

  for (const src of sources) {
    let match: RegExpExecArray | null;

    // IPv4
    IPV4_PATTERN.lastIndex = 0;
    while ((match = IPV4_PATTERN.exec(src)) !== null) {
      const ip = match[1];
      if (ip !== undefined && isValidIpv4(ip) && !seen.has(ip)) {
        seen.add(ip);
        ips.push(ip);
      }
    }

    // BBS masked IPv6 (e.g. 240b:11:442:d510:*) — check before standard IPv6
    IPV6_MASKED_PATTERN.lastIndex = 0;
    while ((match = IPV6_MASKED_PATTERN.exec(src)) !== null) {
      const ip = match[1];
      if (ip !== undefined && !seen.has(ip)) {
        seen.add(ip);
        ips.push(ip);
      }
    }

    // Standard IPv6
    IPV6_PATTERN.lastIndex = 0;
    while ((match = IPV6_PATTERN.exec(src)) !== null) {
      const ip = match[1];
      if (ip !== undefined && ip !== '::' && !seen.has(ip)) {
        seen.add(ip);
        ips.push(ip);
      }
    }
  }
  return ips;
}
