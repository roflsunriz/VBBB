/**
 * NG field extraction utilities.
 * Extract fields from 5ch Res for NG rule matching.
 * Shared between main and renderer (no DOM deps).
 */
import type { Res } from '@shared/domain';
import type { NgStringField } from '@shared/ng';
import { NgStringField as NgStringFieldEnum } from '@shared/ng';

/* ---------- Regex patterns ---------- */

/** Extract ID from dateTime: ID:xxx or 発信元:xxx */
const ID_PATTERN = /ID:([^\s(]+)/;
const SHINMOTSU_PATTERN = /発信元:([^\s]+)/;

/** Extract trip (◆xxx) from name */
const TRIP_PATTERN = /◆([^\s]+)/;

/**
 * Extract ﾜｯﾁｮｲ/ワッチョイ family label from name/dateTime.
 * Supports mixed name formats like:
 * - 名無しさん (ﾜｯﾁｮｲ ABCD-EFGH)
 * - 名無しさん ﾜｯﾁｮｲ ABCD-EFGH [2400:...:*]
 * - 警備員[Lv.0][新芽] ﾜｯﾁｮｲ A+/1-bC9/
 */
const WATCHOI_PATTERN =
  /(?:^|[\s(])(([^\s()[\]]+)\s+([A-Za-z0-9+/]{4})-([A-Za-z0-9+/]{4})(?:\s+\[[^\]]+\])?)(?=$|[\s)])/u;

/** IPv4 and IPv6 in name or dateTime */
const IPV4_PATTERN =
  /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/;
const IPV6_PATTERN = /\b(?:[0-9a-fA-F]{1,4}:){2,}[0-9a-fA-F:]*\b/;

/** BE:xxx from dateTime */
const BE_PATTERN = /BE:([^\s)]+)/;

/** URLs in body: http(s) */
const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/g;

/**
 * Strip HTML tags and decode entities.
 */
export function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * Extract all URLs from body text.
 */
function extractUrls(body: string): string {
  const stripped = stripHtmlTags(body);
  const matches = stripped.match(URL_PATTERN);
  if (matches === null) return '';
  return matches.join(' ');
}

/**
 * Parse 5ch datetime format: YYYY/MM/DD(曜) HH:MM:SS or HH:MM:SS.NN
 */
export function parseDateTimeField(dateTimeStr: string): Date | null {
  const m =
    /(\d{4})\/(\d{1,2})\/(\d{1,2})\([^)]*\)\s*(\d{1,2}):(\d{1,2}):(\d{1,2})(?:\.(\d+))?/.exec(
      dateTimeStr,
    );
  if (m === null) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  const s = Number(m[6]);
  const ms = m[7] !== undefined ? Math.min(Number(m[7].slice(0, 3)), 999) : 0;
  return new Date(y, mo, d, h, mi, s, ms);
}

/**
 * Extract string fields from a Res for NG matching.
 */
export function extractStringFields(res: Res, threadTitle: string): Record<NgStringField, string> {
  const idMatch =
    res.id !== undefined && res.id.length > 0 ? res.id : ID_PATTERN.exec(res.dateTime)?.[1];
  const id = idMatch ?? SHINMOTSU_PATTERN.exec(res.dateTime)?.[1] ?? '';

  const trip = TRIP_PATTERN.exec(res.name)?.[1] ?? '';

  const watchoiMatch = WATCHOI_PATTERN.exec(res.name) ?? WATCHOI_PATTERN.exec(res.dateTime);
  const watchoi = watchoiMatch?.[1] ?? '';

  let ip = IPV4_PATTERN.exec(res.name)?.[0] ?? IPV4_PATTERN.exec(res.dateTime)?.[0] ?? '';
  if (ip === '')
    ip = IPV6_PATTERN.exec(res.name)?.[0] ?? IPV6_PATTERN.exec(res.dateTime)?.[0] ?? '';

  const be = BE_PATTERN.exec(res.dateTime)?.[1] ?? '';

  const url = extractUrls(res.body);

  const all = `${res.name}\t${res.mail}\t${res.dateTime}\t${res.body}`;

  return {
    [NgStringFieldEnum.Name]: res.name,
    [NgStringFieldEnum.Body]: stripHtmlTags(res.body),
    [NgStringFieldEnum.Mail]: res.mail,
    [NgStringFieldEnum.Id]: id,
    [NgStringFieldEnum.Trip]: trip,
    [NgStringFieldEnum.Watchoi]: watchoi,
    [NgStringFieldEnum.Ip]: ip,
    [NgStringFieldEnum.Be]: be,
    [NgStringFieldEnum.Url]: url,
    [NgStringFieldEnum.ThreadTitle]: threadTitle,
    [NgStringFieldEnum.All]: all,
  };
}

/**
 * Count >>number anchor patterns in body.
 */
export function countAnchors(body: string): number {
  const matches = body.match(/>>\d+/g);
  return matches !== null ? matches.length : 0;
}

/**
 * Build ID -> post count map from responses.
 */
export function buildIdCountMap(responses: readonly Res[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const res of responses) {
    const id =
      res.id ?? ID_PATTERN.exec(res.dateTime)?.[1] ?? SHINMOTSU_PATTERN.exec(res.dateTime)?.[1];
    if (id !== undefined && id.length > 0) {
      map.set(id, (map.get(id) ?? 0) + 1);
    }
  }
  return map;
}

/**
 * Build resNumber -> replied count map (how many responses have >>resNumber).
 */
export function buildRepliedCountMap(responses: readonly Res[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const res of responses) {
    const matches = res.body.match(/>>\d+/g);
    if (matches !== null) {
      const seen = new Set<number>();
      for (const m of matches) {
        const num = parseInt(m.slice(2), 10);
        if (!Number.isNaN(num) && !seen.has(num)) {
          seen.add(num);
          map.set(num, (map.get(num) ?? 0) + 1);
        }
      }
    }
  }
  return map;
}

/**
 * Build numeric values record for a Res (for NG numeric condition matching).
 */
export function buildNumericValuesForRes(
  res: Res,
  idCountMap: ReadonlyMap<string, number>,
  repliedCountMap: ReadonlyMap<number, number>,
  threadResCount: number,
  threadMomentum: number,
): Record<string, number> {
  const bodyPlain = stripHtmlTags(res.body);
  const lineCount = bodyPlain.split('\n').length;
  const charCount = bodyPlain.replace(/\n/g, '').length;
  const id =
    res.id ?? ID_PATTERN.exec(res.dateTime)?.[1] ?? SHINMOTSU_PATTERN.exec(res.dateTime)?.[1] ?? '';
  const idCount = id.length > 0 ? (idCountMap.get(id) ?? 0) : 0;
  const replyCount = countAnchors(res.body);
  const repliedCount = repliedCountMap.get(res.number) ?? 0;

  return {
    resNumber: res.number,
    lineCount,
    charCount,
    idCount,
    replyCount,
    repliedCount,
    threadMomentum,
    threadResCount,
  };
}
