/**
 * Thread analysis utilities.
 *
 * Extracts IDs, ワッチョイ (Watchoi), コテハン (Kotehan),
 * counts occurrences, and estimates connection type / UA from ワッチョイ hashes.
 */
import type { Res } from '@shared/domain';

/* ---------- Regex patterns ---------- */

/** Extract ID from dateTime field (e.g. "ID:AbCdEfGh") */
const ID_PATTERN = /ID:([^\s]+)/;

/** Extract ワッチョイ-family from name field (e.g. "(ワッチョイW ABCD-1234)") */
const WATCHOI_PATTERN = /\(([^\s)]+)\s+([A-Fa-f0-9]{4})-([A-Fa-f0-9]{4})\)/;

/** Extract full ワッチョイ label (prefix + hash) for display */
const WATCHOI_FULL_PATTERN = /\(([^)]+)\)/;

/** Default anonymous names that do NOT count as コテハン */
const DEFAULT_NAMES = new Set([
  '名無しさん＠お腹いっぱい。',
  '名無しさん@お腹いっぱい。',
  '名無し',
  '名無しさん',
  '名無しさん＠おーぷん',
  '名無しさん@おーぷん',
  '名無しに変わりましてVIPがお送りします',
  '以下、5ちゃんねるからVIPがお送りします',
  '以下、無断転載禁止でVIPがお送りします',
  '風吹けば名無し',
  '番組の途中ですがアフィサイトへの転載は禁止です',
  '名無しさん＠恐縮です',
  '名無しさん@恐縮です',
]);

/* ---------- Extraction helpers ---------- */

/** Extract poster ID from a response's dateTime field */
export function extractId(res: Res): string | null {
  if (res.id !== undefined && res.id.length > 0) return res.id;
  const m = ID_PATTERN.exec(res.dateTime);
  return m?.[1] ?? null;
}

export interface WatchoiInfo {
  /** Full label (e.g. "ワッチョイW ABCD-1234") */
  readonly label: string;
  /** Connection-type prefix (e.g. "ワッチョイW") */
  readonly prefix: string;
  /** UA hash (first 4 hex chars) */
  readonly uaHash: string;
  /** IP hash (last 4 hex chars) */
  readonly ipHash: string;
}

/** Extract ワッチョイ info from a response's name field */
export function extractWatchoi(res: Res): WatchoiInfo | null {
  const m = WATCHOI_PATTERN.exec(res.name);
  if (m === null || m[1] === undefined || m[2] === undefined || m[3] === undefined) return null;
  const fullM = WATCHOI_FULL_PATTERN.exec(res.name);
  return {
    label: fullM?.[1] ?? `${m[1]} ${m[2]}-${m[3]}`,
    prefix: m[1],
    uaHash: m[2],
    ipHash: m[3],
  };
}

/** Extract コテハン (non-default name) from a response */
export function extractKotehan(res: Res): string | null {
  const plainName = res.name.replace(/<[^>]+>/g, '').replace(/\([^)]*\)/g, '').trim();
  if (plainName.length === 0) return null;
  if (DEFAULT_NAMES.has(plainName)) return null;
  return plainName;
}

/* ---------- Count maps ---------- */

export interface CountEntry {
  readonly key: string;
  readonly count: number;
  readonly resNumbers: readonly number[];
}

/** Build a frequency map keyed by extractor result */
export function buildCountMap(
  responses: readonly Res[],
  extractor: (res: Res) => string | null,
): Map<string, { count: number; resNumbers: number[] }> {
  const map = new Map<string, { count: number; resNumbers: number[] }>();
  for (const res of responses) {
    const key = extractor(res);
    if (key === null) continue;
    const entry = map.get(key);
    if (entry !== undefined) {
      entry.count += 1;
      entry.resNumbers.push(res.number);
    } else {
      map.set(key, { count: 1, resNumbers: [res.number] });
    }
  }
  return map;
}

/** Convert count map to sorted array (descending by count) */
export function sortedCounts(
  map: Map<string, { count: number; resNumbers: number[] }>,
): readonly CountEntry[] {
  return [...map.entries()]
    .map(([key, v]) => ({ key, count: v.count, resNumbers: v.resNumbers }))
    .sort((a, b) => b.count - a.count);
}

/* ---------- Connection type estimation (F29) ---------- */

/**
 * Known ワッチョイ prefix → connection type mapping.
 * Sources: publicly documented on 5ch/2ch wikis.
 */
const CONNECTION_TYPE_MAP: ReadonlyMap<string, string> = new Map([
  ['ワッチョイ', '固定回線 (ISP)'],
  ['ワッチョイW', 'WiFi'],
  ['ワッチョイWW', 'モバイルWiFi / テザリング'],
  ['ワッチョイ-', '固定回線'],
  ['スプッッ', 'SPモード (docomo)'],
  ['スップ', 'SPモード (docomo)'],
  ['スプー', 'SPモード (docomo)'],
  ['スフッ', 'SPモード (docomo)'],
  ['オッペケ', 'OCN モバイル'],
  ['オイコラミネオ', 'mineo'],
  ['アウアウウー', 'au モバイル'],
  ['アウアウエー', 'au モバイル'],
  ['アウアウカー', 'au モバイル'],
  ['アウアウクー', 'au モバイル'],
  ['アウウィフ', 'au WiFi'],
  ['ガラプー', 'ガラケー'],
  ['ラクッペ', '楽天モバイル'],
  ['ラクッペペ', '楽天モバイル'],
  ['ササクッテロ', 'SoftBank モバイル'],
  ['ササクッテロラ', 'SoftBank モバイル'],
  ['ササクッテロレ', 'SoftBank モバイル'],
  ['ササクッテロロ', 'SoftBank モバイル'],
  ['ササクッテロル', 'SoftBank モバイル'],
  ['ササクッテロリ', 'SoftBank モバイル'],
  ['ブーイモ', 'UQ mobile / WiMAX'],
  ['ドコグロ', 'docomo グローバル'],
  ['アークセー', 'UQ mobile'],
  ['テテンテンテン', 'So-net'],
  ['ニャフニャ', 'NifMo'],
  ['ベクトル', 'ベクトル'],
  ['JP', 'MVNO'],
]);

export interface WatchoiEstimation {
  readonly connectionType: string;
  readonly uaHint: string;
}

/**
 * Estimate connection type and provide UA hint from ワッチョイ info.
 */
export function estimateFromWatchoi(info: WatchoiInfo): WatchoiEstimation {
  // Match prefix (try longest match first)
  let connectionType = '不明';
  let bestLen = 0;
  for (const [prefix, connType] of CONNECTION_TYPE_MAP) {
    if (info.prefix.startsWith(prefix) && prefix.length > bestLen) {
      connectionType = connType;
      bestLen = prefix.length;
    }
  }

  // UA hash heuristics: first 4 hex chars from UA string hash
  const ua = info.uaHash.toUpperCase();
  let uaHint = `UAハッシュ: ${ua}`;
  if (/^[0-9A-F]{4}$/.test(ua)) {
    // Common known UA hash prefixes (approximations from public data)
    if (ua.startsWith('SA') || ua.startsWith('53')) {
      uaHint = `Safari系 (${ua})`;
    } else if (ua.startsWith('CH') || ua.startsWith('43')) {
      uaHint = `Chrome系 (${ua})`;
    } else {
      uaHint = `UAハッシュ: ${ua}`;
    }
  }

  return { connectionType, uaHint };
}

/* ---------- Thread-level analysis (F16) ---------- */

export interface ThreadAnalysisResult {
  /** All image URLs found */
  readonly imageUrls: readonly string[];
  /** All video URLs found */
  readonly videoUrls: readonly string[];
  /** All non-image/non-video URLs */
  readonly linkUrls: readonly string[];
  /** Top responded-to res numbers (popular) */
  readonly popularRes: readonly CountEntry[];
  /** コテハン frequency */
  readonly kotehanRanking: readonly CountEntry[];
  /** ID frequency (必死 by ID) */
  readonly idRanking: readonly CountEntry[];
  /** ワッチョイ frequency (必死 by ワッチョイ) */
  readonly watchoiRanking: readonly CountEntry[];
  /** Long posts (必死 by body length) */
  readonly longPosts: readonly { readonly resNumber: number; readonly length: number }[];
}

const URL_PATTERN = /https?:\/\/[^\s"'<>\]]+/gi;
const IMAGE_EXT = /\.(jpe?g|gif|png|webp|bmp|avif|svg)(\?[^\s]*)?$/i;
const VIDEO_PATTERN = /\.(mp4|webm|mov|avi)(\?[^\s]*)?$/i;
const VIDEO_SITE = /^https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be|nicovideo\.jp|streamable\.com|vimeo\.com)/i;
const ANCHOR_COUNT_PATTERN = />>(\d+)/g;

export function analyzeThread(responses: readonly Res[]): ThreadAnalysisResult {
  const imageSet = new Set<string>();
  const videoSet = new Set<string>();
  const linkSet = new Set<string>();
  const anchorCounts = new Map<number, number>();

  for (const res of responses) {
    // Extract URLs
    URL_PATTERN.lastIndex = 0;
    let urlMatch: RegExpExecArray | null;
    while ((urlMatch = URL_PATTERN.exec(res.body)) !== null) {
      const url = urlMatch[0];
      if (url === undefined) continue;
      const cleaned = url.replace(/[.,;:!?)]+$/, '');

      if (IMAGE_EXT.test(cleaned)) {
        imageSet.add(cleaned);
      } else if (VIDEO_PATTERN.test(cleaned) || VIDEO_SITE.test(cleaned)) {
        videoSet.add(cleaned);
      } else {
        linkSet.add(cleaned);
      }
    }

    // Count anchor references for popularity
    ANCHOR_COUNT_PATTERN.lastIndex = 0;
    let anchorMatch: RegExpExecArray | null;
    const seenInRes = new Set<number>();
    while ((anchorMatch = ANCHOR_COUNT_PATTERN.exec(res.body)) !== null) {
      const refNum = Number(anchorMatch[1]);
      if (!seenInRes.has(refNum)) {
        seenInRes.add(refNum);
        anchorCounts.set(refNum, (anchorCounts.get(refNum) ?? 0) + 1);
      }
    }
  }

  // Popular res (most referenced)
  const popularRes: CountEntry[] = [...anchorCounts.entries()]
    .map(([num, count]) => ({ key: `>>${String(num)}`, count, resNumbers: [num] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // コテハン ranking
  const kotehanMap = buildCountMap(responses, extractKotehan);
  const kotehanRanking = sortedCounts(kotehanMap);

  // ID ranking
  const idMap = buildCountMap(responses, extractId);
  const idRanking = sortedCounts(idMap);

  // ワッチョイ ranking
  const watchoiMap = buildCountMap(responses, (res) => {
    const info = extractWatchoi(res);
    return info !== null ? info.label : null;
  });
  const watchoiRanking = sortedCounts(watchoiMap);

  // Long posts (body length excluding HTML)
  const longPosts = responses
    .map((res) => ({
      resNumber: res.number,
      length: res.body.replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, ' ').length,
    }))
    .sort((a, b) => b.length - a.length)
    .slice(0, 20);

  return {
    imageUrls: [...imageSet],
    videoUrls: [...videoSet],
    linkUrls: [...linkSet],
    popularRes,
    kotehanRanking,
    idRanking,
    watchoiRanking,
    longPosts,
  };
}
