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
 * Known ワッチョイ nickname → connection type mapping.
 *
 * Source: 5ch official wiki (info.5ch.net/index.php/BBS_SLIP)
 *         https://headline.mtfj.net/2ch_watchoi.php
 *
 * Keys are full-width katakana. Input is NFKC-normalized before lookup
 * because 5ch name fields use half-width katakana (e.g. ﾜｯﾁｮｲ).
 *
 * Suffix letters (W = WiFi, T = tethering, WW = mobile WiFi) are
 * stripped before lookup and shown separately.
 */
const CONNECTION_TYPE_MAP: ReadonlyMap<string, string> = new Map([
  /* ── 固定回線 ───────────────────────────────── */
  ['ワッチョイ', '固定回線 (ISP)'],
  ['オッシ', 'OCN 固定回線 (逆引き不可)'],

  /* ── docomo スマホ ──────────────────────────── */
  ['スプー', 'docomo スマホ'],
  ['スプッ', 'docomo スマホ'],
  ['スプッッ', 'docomo スマホ'],
  ['スップ', 'docomo スマホ'],
  ['スッップ', 'docomo スマホ'],
  ['スッッップ', 'docomo スマホ'],
  ['スプププ', 'docomo スマホ'],
  ['スプフ', 'docomo スマホ'],
  ['スフッ', 'docomo スマホ'],
  ['ペラペラ', 'docomo mopera'],
  ['エアペラ', 'docomo air mopera'],

  /* ── au スマホ / WiMAX2+ ────────────────────── */
  ['アウアウ', 'au スマホ / WiMAX2+'],
  ['アウアウアー', 'au スマホ / WiMAX2+'],
  ['アウアウイー', 'au スマホ / WiMAX2+'],
  ['アウアウウー', 'au スマホ / WiMAX2+'],
  ['アウアウエー', 'au スマホ / WiMAX2+'],
  ['アウアウオー', 'au スマホ / WiMAX2+'],
  ['アウアウカー', 'au スマホ / WiMAX2+'],

  /* ── SoftBank iPhone ────────────────────────── */
  ['ササクッテロ', 'SoftBank iPhone'],
  ['ササクッテロラ', 'SoftBank iPhone'],
  ['ササクッテロリ', 'SoftBank iPhone'],
  ['ササクッテロル', 'SoftBank iPhone'],
  ['ササクッテロレ', 'SoftBank iPhone'],
  ['ササクッテロロ', 'SoftBank iPhone'],

  /* ── SoftBank Android / その他 ──────────────── */
  ['オッペケ', 'SoftBank Android'],
  ['アークセー', 'SoftBank アクセスインターネット'],

  /* ── Y!mobile ───────────────────────────────── */
  ['イモイモ', 'Y!mobile emb'],
  ['エーイモ', 'Y!mobile EMNet'],

  /* ── 公衆 Wi-Fi ──────────────────────────────── */
  ['エムゾネ', 'docomo Wi-Fi'],
  ['アウウィフ', 'au Wi-Fi SPOT'],
  ['ワイーワ2', 'wi2 300 / at_STARBUCKS_Wi2'],
  ['ワイワイ', 'wi2 300 / at_STARBUCKS_Wi2'],
  ['フォンフォン', 'FON Wi-Fi'],
  ['マクド', 'マクドナルド FREE Wi-Fi (SoftBank)'],
  ['エフシーツー', 'FC2WiFi'],
  ['フリスポ', 'FREESPOT'],
  ['セブン', '7SPOT'],
  ['ファミマ', 'Famima Wi-Fi'],
  ['ファミワイ', 'FAMILY-WIFI'],
  ['ロソーン', 'LAWSON Free Wi-Fi'],
  ['フリモバ', 'FreeMobile'],
  ['プラウィフィ', "FLET'S SPOT"],
  ['ミカカウィ', 'NTT-BP (都営バスWi-Fi / Metro Wi-Fi等)'],
  ['ミカカウィフィ', 'NTT-BP (都営バスWi-Fi / Metro Wi-Fi等)'],
  ['アナファイー', 'NTT-BP (ANAラウンジWi-Fi / 京成Wi-Fi等)'],
  ['アナファーイ', 'Panasonic Avionics (機内Wi-Fi)'],
  ['スカファーイ', 'スカパー衛星回線'],
  ['アポスー', 'Apple Store Japan'],
  ['タニック', 'SafeComNet (船舶用衛星通信)'],
  ['ムムー', 'VyprVPN'],

  /* ── MVNO ────────────────────────────────────── */
  ['ブーイモ', 'IIJmio等 (vmobile)'],
  ['ベーイモ', '日本通信等 (bmobile)'],
  ['オイコラミネオ', 'mineo'],
  ['ワントンキン', 'OCN モバイル ONE'],
  ['ワンミングク', 'OCN モバイル ONE'],
  ['バットンキン', 'OCN回線の他社MVNO'],
  ['バッミングク', 'OCN回線の他社MVNO'],
  ['アウアウクー', 'UQ mobile'],
  ['ドコグロ', 'BIGLOBE LTE・3G'],
  ['ホカグロ', 'BIGLOBE LTE・3G'],
  ['アウグロ', 'BIGLOBE光'],
  ['ドナドナー', 'donedone (BIGLOBE)'],
  ['ラクラッペ', 'NTTPC InfoSphere (楽天モバイル等)'],
  ['ラクッペ', '楽天コミュニケーションズ (SANNET等)'],
  ['ラクペッ', '楽天モバイル'],
  ['ラクッペペ', '楽天モバイル MVNO'],
  ['テテンテンテン', '楽天モバイル MNO'],
  ['フォーッ', '@nifty FOMAデータ通信'],
  ['フォホーッ', 'hi-ho FOMAデータ通信'],
  ['フォオーッ', 'OCN モバイル d (FOMA回線)'],
  ['ワーダリィ', '富士通回線MVNO (Wonderlink等)'],
  ['パニャパー', 'パナソニック PANA-MVNO'],
  ['ワイエディ', 'EDION-NET WiMAX2+'],
  ['ワキゲー', 'ワイヤレスゲート'],
  ['バックシ', 'So-net モバイル LTE'],
  ['プッーモ', 'ぷららモバイル'],
  ['ブモー', 'LIBMO (TOKAIコミュニケーションズ)'],
  ['ニャフニャ', 'NifMo'],
  ['フニャモ', 'NifMo'],
  ['フリッテル', 'freetel mobile'],
  ['トンモー', 'トーンモバイル'],
  ['ソラノイロ', 'SORACOM / AWS'],
  ['イルクン', '@モバイルくん。(ジェネス)'],
  ['アメ', 'mvno.net (BEKKOAME)'],
  ['クスマテ', 'LinksMate'],
  ['ワイマゲー', 'WiMAX (一部)'],
  ['ワイモマー', 'WiMAX1 (一部)'],

  /* ── ガラケー / レガシー ──────────────────────── */
  ['ガラプー', 'ガラケー (従来式携帯)'],
  ['ジグー', 'ガラケー フルブラウザ'],
  ['アジポン', '旧WILLCOM 一部機種'],

  /* ── 特殊 / 環境判定 ─────────────────────────── */
  ['アンタダレ', '逆引き不可'],
  ['コンニチワ', 'VPN'],
  ['ガックシ', '大学'],
  ['ボンボン', '大学以外の学校'],
  ['セーフ', '外国の役所'],
  ['コムイーン', '役所'],
  ['シャチーク', '会社'],
  ['グングン', 'アメリカ軍関係'],
  ['グググレカス', 'Android Chrome プロキシ'],
  ['ウラウラ', '身代わりの術 (びんたん)'],
  ['ゲロゲロ', 'ネカフェ「ゲラゲラ」等'],

  /* ── 国コード（逆引きで国名のみ特定） ─────────── */
  ['JP', '日本 (国名のみ特定)'],
  ['US', 'アメリカ (国名のみ特定)'],
  ['CN', '中国 (国名のみ特定)'],
]);

/**
 * Suffix letter → description mapping for ワッチョイ.
 * 5ch appends W / T / WW to nicknames to indicate WiFi or tethering.
 */
const SUFFIX_MAP: ReadonlyMap<string, string> = new Map([
  ['WW', 'モバイルWiFi / テザリング'],
  ['W', 'WiFi'],
  ['T', 'テザリング'],
]);

export interface WatchoiEstimation {
  /** Connection / carrier type */
  readonly connectionType: string;
  /** WiFi / tethering suffix description (null if none) */
  readonly suffixHint: string | null;
  /** UA hash explanation */
  readonly uaHint: string;
}

/**
 * Estimate connection type from ワッチョイ info.
 *
 * ワッチョイ形式: (ニックネーム[サフィックス] XXXX-YYYY [IP])
 *   ニックネーム = ISP / キャリア / 接続環境
 *   サフィックス = W (WiFi), T (テザリング), WW (モバイルWiFi)
 *   XXXX = IP由来ハッシュ (週替わり・板/サーバー依存)
 *   YYYY = UA由来ハッシュ (週替わり・同一ブラウザ同一バージョンで一致)
 *
 * Source: info.5ch.net/index.php/BBS_SLIP
 */
export function estimateFromWatchoi(info: WatchoiInfo): WatchoiEstimation {
  // Normalize half-width katakana (ﾜｯﾁｮｲ) → full-width (ワッチョイ) for lookup.
  const normalizedPrefix = info.prefix.normalize('NFKC');

  // Separate trailing suffix letters (W, WW, T) from the base nickname.
  let baseName = normalizedPrefix;
  let suffixHint: string | null = null;
  // Check longest suffix first (WW before W)
  for (const [suffix, desc] of SUFFIX_MAP) {
    if (normalizedPrefix.endsWith(suffix) && normalizedPrefix.length > suffix.length) {
      baseName = normalizedPrefix.slice(0, -suffix.length);
      suffixHint = desc;
      break;
    }
  }

  // Match base nickname (try longest match first)
  let connectionType = '不明';
  let bestLen = 0;
  for (const [prefix, connType] of CONNECTION_TYPE_MAP) {
    if (baseName.startsWith(prefix) && prefix.length > bestLen) {
      connectionType = connType;
      bestLen = prefix.length;
    }
  }

  // If no match on base, try the full prefix (some entries include suffix-like chars)
  if (bestLen === 0) {
    for (const [prefix, connType] of CONNECTION_TYPE_MAP) {
      if (normalizedPrefix.startsWith(prefix) && prefix.length > bestLen) {
        connectionType = connType;
        bestLen = prefix.length;
      }
    }
  }

  // UA hash — weekly rotation means no static reverse lookup is possible.
  // Same browser + same version = same hash within the week.
  const uaUpper = info.uaHash.toUpperCase();
  const uaHint = `ハッシュ ${uaUpper} (同一週・同一ブラウザで一致)`;

  return { connectionType, suffixHint, uaHint };
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
