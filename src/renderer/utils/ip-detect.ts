/**
 * IP address detection utilities (F28/F35).
 *
 * Detects IPv4 addresses in thread responses (name, dateTime fields)
 * and provides WhoIs/geolocation lookup via public API.
 */
import type { Res } from '@shared/domain';

/** IPv4 pattern */
const IPV4_PATTERN = /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g;

/**
 * Detect if a thread contains exposed IP addresses.
 * Returns true if any response has an IP in name or dateTime fields.
 */
export function threadHasExposedIps(responses: readonly Res[]): boolean {
  for (const res of responses) {
    IPV4_PATTERN.lastIndex = 0;
    if (IPV4_PATTERN.test(res.name) || IPV4_PATTERN.test(res.dateTime)) {
      return true;
    }
  }
  return false;
}

/**
 * Extract all IP addresses from a response's name and dateTime.
 */
export function extractIps(res: Res): readonly string[] {
  const ips: string[] = [];
  const seen = new Set<string>();
  const sources = [res.name, res.dateTime];
  for (const src of sources) {
    IPV4_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = IPV4_PATTERN.exec(src)) !== null) {
      const ip = match[1];
      if (ip !== undefined && !seen.has(ip)) {
        seen.add(ip);
        ips.push(ip);
      }
    }
  }
  return ips;
}

/** WhoIs/geolocation result from public API */
export interface IpInfo {
  readonly ip: string;
  readonly country: string;
  readonly region: string;
  readonly city: string;
  readonly isp: string;
  readonly org: string;
  readonly as: string;
}

/**
 * Fetch IP information using ip-api.com (free, no key required).
 * NOTE: Limited to 45 requests/minute. Rate limiting handled by caller.
 */
export async function fetchIpInfo(ip: string): Promise<IpInfo> {
  const response = await fetch(`http://ip-api.com/json/${ip}?lang=ja&fields=country,regionName,city,isp,org,as,query`);
  if (!response.ok) {
    throw new Error(`IP API error: ${String(response.status)}`);
  }
  const data: unknown = await response.json();
  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid API response');
  }
  const d = data as Record<string, unknown>;
  return {
    ip,
    country: typeof d['country'] === 'string' ? d['country'] : '',
    region: typeof d['regionName'] === 'string' ? d['regionName'] : '',
    city: typeof d['city'] === 'string' ? d['city'] : '',
    isp: typeof d['isp'] === 'string' ? d['isp'] : '',
    org: typeof d['org'] === 'string' ? d['org'] : '',
    as: typeof d['as'] === 'string' ? d['as'] : '',
  };
}
