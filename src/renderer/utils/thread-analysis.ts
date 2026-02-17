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

/**
 * Extract ワッチョイ-family from name field.
 * Hash parts are alphanumeric (not limited to hex).
 * Optional trailing content like [IP] is allowed before closing paren.
 * Examples:
 *   (ﾜｯﾁｮｲ 1778-VJ5d)
 *   (ﾜｯﾁｮｲ 1778-VJ5d [2400:4153:2b21:e400:*])
 *   (ｽｯｯﾌﾟ Sd12-Ab3c)
 */
const WATCHOI_PATTERN = /\(([^\s)]+)\s+([A-Za-z0-9]{4})-([A-Za-z0-9]{4})(?:\s+\[[^\]]*\])?\)/;

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
  /** IP address hash — first 4 hex chars (same IP = same hash within the day) */
  readonly ipHash: string;
  /** User-Agent hash — last 4 hex chars (same browser = same hash within the day) */
  readonly uaHash: string;
}

/** Extract ワッチョイ info from a response's name field */
export function extractWatchoi(res: Res): WatchoiInfo | null {
  const m = WATCHOI_PATTERN.exec(res.name);
  if (m === null || m[1] === undefined || m[2] === undefined || m[3] === undefined) return null;
  const fullM = WATCHOI_FULL_PATTERN.exec(res.name);
  return {
    label: fullM?.[1] ?? `${m[1]} ${m[2]}-${m[3]}`,
    prefix: m[1],
    ipHash: m[2],
    uaHash: m[3],
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
 * Entries are sorted by specificity (longer prefixes first in lookup).
 */
const CONNECTION_TYPE_MAP: ReadonlyMap<string, string> = new Map([
  // 固定回線
  ['ワッチョイWW', 'モバイルWiFi / テザリング'],
  ['ワッチョイW', 'WiFi'],
  ['ワッチョイ-', '固定回線'],
  ['ワッチョイ', '固定回線 (ISP)'],
  // docomo
  ['スプッッ', 'SPモード (docomo)'],
  ['スップ', 'SPモード (docomo)'],
  ['スプー', 'SPモード (docomo)'],
  ['スフッ', 'SPモード (docomo)'],
  ['ドコグロ', 'docomo グローバルIP'],
  // au / KDDI
  ['アウアウウー', 'au (4G LTE)'],
  ['アウアウエー', 'au (4G LTE)'],
  ['アウアウカー', 'au (4G LTE)'],
  ['アウアウクー', 'au (4G LTE)'],
  ['アウアウアー', 'au (4G LTE)'],
  ['アウウィフ', 'au WiFi SPOT'],
  // SoftBank
  ['ササクッテロラ', 'SoftBank (4G LTE)'],
  ['ササクッテロレ', 'SoftBank (4G LTE)'],
  ['ササクッテロロ', 'SoftBank (4G LTE)'],
  ['ササクッテロル', 'SoftBank (4G LTE)'],
  ['ササクッテロリ', 'SoftBank (4G LTE)'],
  ['ササクッテロ', 'SoftBank (4G LTE)'],
  // MVNO / その他モバイル
  ['オッペケ', 'OCN モバイル ONE'],
  ['オイコラミネオ', 'mineo'],
  ['ラクッペペ', '楽天モバイル'],
  ['ラクッペ', '楽天モバイル'],
  ['ブーイモ', 'UQ mobile / WiMAX'],
  ['アークセー', 'UQ mobile'],
  ['エムゾネ', 'MVNO (IIJmio系)'],
  ['ワントンキン', 'MVNO'],
  ['JP', 'MVNO (日本通信系)'],
  // ISP
  ['テテンテンテン', 'So-net'],
  ['ニャフニャ', 'NifMo'],
  ['ベクトル', 'ベクトル'],
  ['ペラペラ', 'BIGLOBE'],
  ['アメ', 'アメリカ'],
  // ガラケー
  ['ガラプー', 'ガラケー (フィーチャーフォン)'],
]);

/**
 * Known UA hash → browser/client mapping.
 *
 * ワッチョイ後半4文字は CRC32(User-Agent + daily_salt) の下位16bit。
 * 同一日・同一UA文字列なら同じ値になるため、よく見かけるハッシュと
 * 対応するUA文字列の関係がコミュニティで蓄積されている。
 * ※ ハッシュ衝突の可能性があるため推定は参考程度。
 */
const UA_HASH_MAP: ReadonlyMap<string, string> = new Map([
  // 5chブラウザ系
  ['JaneDoeStyle', 'Jane Style'],
  ['ChMate', 'ChMate (Android)'],
  ['twinkle', 'twinkle (iOS)'],
  ['BB2C', 'BB2C (iOS)'],
  ['Ciisaa', 'Ciisaa (Android)'],
  ['Siki', 'Siki (Android)'],
]);

/**
 * Heuristic UA category estimation from hash prefix patterns.
 * These are approximate and based on community observations.
 */
function estimateUaCategory(hash: string): string | null {
  const h = hash.toLowerCase();
  // 特徴的なパターン（コミュニティ観測に基づく近似）
  // NOTE: ハッシュは日替わり salt で変化するため、
  // ここでは「同一ハッシュ = 同一UA」の性質を説明にとどめる
  if (/^[0-9a-f]{4}$/.test(h)) {
    return null; // ハッシュだけでは特定不可
  }
  return null;
}

export interface WatchoiEstimation {
  readonly connectionType: string;
  readonly uaHint: string;
}

/**
 * Estimate connection type and provide UA hint from ワッチョイ info.
 *
 * ワッチョイ形式: (プレフィックス XXXX-YYYY)
 *   XXXX = CRC32(IPアドレス + daily_salt) の下位16bit
 *   YYYY = CRC32(User-Agent + daily_salt) の下位16bit
 */
export function estimateFromWatchoi(info: WatchoiInfo): WatchoiEstimation {
  // Normalize half-width katakana (ﾜｯﾁｮｲ) → full-width (ワッチョイ) for lookup.
  // 5ch encodes ワッチョイ prefixes in half-width katakana in the name field.
  const normalizedPrefix = info.prefix.normalize('NFKC');

  // Match prefix (try longest match first)
  let connectionType = '不明';
  let bestLen = 0;
  for (const [prefix, connType] of CONNECTION_TYPE_MAP) {
    if (normalizedPrefix.startsWith(prefix) && prefix.length > bestLen) {
      connectionType = connType;
      bestLen = prefix.length;
    }
  }

  // UA estimation from the second hash (YYYY part)
  const uaUpper = info.uaHash.toUpperCase();
  const knownUa = UA_HASH_MAP.get(info.uaHash);
  let uaHint: string;
  if (knownUa !== undefined) {
    uaHint = knownUa;
  } else {
    const category = estimateUaCategory(info.uaHash);
    uaHint = category ?? `ハッシュ ${uaUpper} (同一日・同一UAなら一致)`;
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
