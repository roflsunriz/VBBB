/**
 * Thread Analysis Panel (F16).
 *
 * Shows categorised lists: images, videos, links, popular res,
 * kotehan ranking, ID/ワッチョイ frequency, long posts.
 *
 * - Image/video entries are shown as thumbnails (grid layout).
 * - A bulk-download button saves all images to a user-selected folder.
 * - Popular-res / kotehan / desperate-post entries show a body snippet.
 */
import { useState, useMemo, useCallback } from 'react';
import { mdiClose, mdiChevronDown, mdiChevronRight, mdiDownload, mdiVideoOutline } from '@mdi/js';
import type { Res } from '@shared/domain';
import type { CountEntry, ThreadAnalysisResult } from '../../utils/thread-analysis';
import { analyzeThread } from '../../utils/thread-analysis';
import { MdiIcon } from '../common/MdiIcon';
import { TopResizeHandle } from '../common/TopResizeHandle';

/* ---------- Constants ---------- */

const SNIPPET_LENGTH = 60;
const THUMB_SIZE = 72;

/* ---------- Helpers ---------- */

/** Strip HTML tags and decode basic entities → plain text */
function toPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[^;]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Truncate text to `max` chars with ellipsis */
function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/** Extract YouTube video ID from a URL (returns null if not YouTube) */
function getYoutubeThumbnail(url: string): string | null {
  const m1 = /[?&]v=([A-Za-z0-9_-]{11})/.exec(url);
  if (m1?.[1] !== undefined) return `https://img.youtube.com/vi/${m1[1]}/default.jpg`;
  const m2 = /youtu\.be\/([A-Za-z0-9_-]{11})/.exec(url);
  if (m2?.[1] !== undefined) return `https://img.youtube.com/vi/${m2[1]}/default.jpg`;
  return null;
}

/* ---------- Sub-components ---------- */

function CollapsibleSection({
  title,
  count,
  defaultOpen,
  children,
}: {
  readonly title: string;
  readonly count: number;
  readonly defaultOpen?: boolean | undefined;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen === true);
  return (
    <div className="border-b border-[var(--color-border-secondary)]">
      <button
        type="button"
        onClick={() => { setOpen((p) => !p); }}
        className="flex w-full items-center gap-1 px-3 py-1.5 text-left text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
      >
        <MdiIcon path={open ? mdiChevronDown : mdiChevronRight} size={14} />
        {title}
        <span className="ml-auto text-[var(--color-text-muted)]">({count})</span>
      </button>
      {open && <div className="max-h-64 overflow-y-auto px-3 pb-2">{children}</div>}
    </div>
  );
}

/* ---- Image thumbnail grid ---- */

interface ImageThumbProps {
  readonly url: string;
  readonly onOpen: (url: string) => void;
}

function ImageThumb({ url, onOpen }: ImageThumbProps): React.JSX.Element {
  const [error, setError] = useState(false);
  const handleClick = useCallback(() => { onOpen(url); }, [url, onOpen]);

  if (error) {
    return (
      <span
        className="flex items-center justify-center rounded border border-[var(--color-border-secondary)] bg-[var(--color-bg-tertiary)] text-[10px] text-[var(--color-text-muted)]"
        style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
        title={url}
      >
        ERR
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="overflow-hidden rounded border border-[var(--color-border-secondary)] transition-opacity hover:opacity-75 focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
      style={{ width: THUMB_SIZE, height: THUMB_SIZE, flexShrink: 0 }}
      title={url}
      aria-label="外部ブラウザで開く"
    >
      <img
        src={url}
        alt=""
        loading="lazy"
        onError={() => { setError(true); }}
        referrerPolicy="no-referrer"
        className="h-full w-full object-cover"
      />
    </button>
  );
}

/* ---- Video thumbnail / preview ---- */

interface VideoThumbProps {
  readonly url: string;
  readonly onOpen: (url: string) => void;
}

function VideoThumb({ url, onOpen }: VideoThumbProps): React.JSX.Element {
  const handleClick = useCallback(() => { onOpen(url); }, [url, onOpen]);
  const ytThumb = getYoutubeThumbnail(url);

  if (ytThumb !== null) {
    return (
      <button
        type="button"
        onClick={handleClick}
        className="relative overflow-hidden rounded border border-[var(--color-border-secondary)] transition-opacity hover:opacity-75 focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
        style={{ width: THUMB_SIZE, height: THUMB_SIZE, flexShrink: 0 }}
        title={url}
        aria-label="外部ブラウザで開く"
      >
        <img
          src={ytThumb}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
        {/* play overlay */}
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30">
          <MdiIcon path={mdiVideoOutline} size={20} className="text-white" />
        </span>
      </button>
    );
  }

  // Direct video file — show icon button
  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex flex-col items-center justify-center gap-1 overflow-hidden rounded border border-[var(--color-border-secondary)] bg-[var(--color-bg-tertiary)] text-[10px] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-hover)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
      style={{ width: THUMB_SIZE, height: THUMB_SIZE, flexShrink: 0 }}
      title={url}
      aria-label="外部ブラウザで開く"
    >
      <MdiIcon path={mdiVideoOutline} size={24} className="text-[var(--color-text-muted)]" />
      <span className="w-full truncate px-1 text-center">動画</span>
    </button>
  );
}

/* ---- CountList with body snippet ---- */

function CountList({
  entries,
  resMap,
  onClickEntry,
}: {
  readonly entries: readonly CountEntry[];
  readonly resMap: ReadonlyMap<number, Res>;
  readonly onClickEntry: (resNumbers: readonly number[]) => void;
}): React.JSX.Element {
  return (
    <div className="space-y-0.5">
      {entries.map((e) => {
        const firstRes = e.resNumbers[0] !== undefined ? resMap.get(e.resNumbers[0]) : undefined;
        const snippet = firstRes !== undefined ? truncate(toPlainText(firstRes.body), SNIPPET_LENGTH) : '';
        return (
          <button
            key={e.key}
            type="button"
            onClick={() => { onClickEntry(e.resNumbers); }}
            className="flex w-full flex-col rounded px-1 py-1 text-left text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
          >
            <div className="flex w-full items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-medium">{e.key}</span>
              <span className="shrink-0 rounded bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-text-muted)]">
                {e.count}
              </span>
            </div>
            {snippet.length > 0 && (
              <span className="mt-0.5 line-clamp-2 text-[10px] leading-tight text-[var(--color-text-muted)]">
                {snippet}
              </span>
            )}
          </button>
        );
      })}
      {entries.length === 0 && (
        <p className="text-xs text-[var(--color-text-muted)]">データなし</p>
      )}
    </div>
  );
}

/* ---------- Main component ---------- */

interface ThreadAnalysisProps {
  readonly responses: readonly Res[];
  readonly onClose: () => void;
  readonly onScrollToRes: (resNumber: number) => void;
}

export function ThreadAnalysis({ responses, onClose, onScrollToRes }: ThreadAnalysisProps): React.JSX.Element {
  const analysis: ThreadAnalysisResult = useMemo(
    () => analyzeThread(responses),
    [responses],
  );

  /** Map from res number → Res for fast lookup */
  const resMap = useMemo(
    () => new Map(responses.map((r) => [r.number, r])),
    [responses],
  );

  const handleClickEntry = useCallback(
    (resNumbers: readonly number[]) => {
      if (resNumbers.length > 0 && resNumbers[0] !== undefined) {
        onScrollToRes(resNumbers[0]);
      }
    },
    [onScrollToRes],
  );

  const handleOpenExternal = useCallback((url: string) => {
    void window.electronApi.invoke('shell:open-external', url);
  }, []);

  const [downloadState, setDownloadState] = useState<'idle' | 'busy' | 'done'>('idle');

  const handleBulkDownload = useCallback(() => {
    if (downloadState === 'busy') return;
    setDownloadState('busy');
    void window.electronApi.invoke('image:save-bulk', analysis.imageUrls).then((result) => {
      setDownloadState(result.saved > 0 ? 'done' : 'idle');
      setTimeout(() => { setDownloadState('idle'); }, 2000);
    });
  }, [analysis.imageUrls, downloadState]);

  const [panelHeight, setPanelHeight] = useState(320);
  const handlePanelResize = useCallback((deltaY: number) => {
    setPanelHeight((prev) => Math.max(128, Math.min(window.innerHeight * 0.7, prev - deltaY)));
  }, []);

  return (
    <>
    <TopResizeHandle onResize={handlePanelResize} />
    <div className="flex flex-col overflow-hidden bg-[var(--color-bg-secondary)]" style={{ height: panelHeight }}>
      {/* Header */}
      <div className="flex items-center border-b border-[var(--color-border-secondary)] px-3 py-1">
        <span className="text-xs font-bold text-[var(--color-text-primary)]">スレッド分析</span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]"
          aria-label="閉じる"
        >
          <MdiIcon path={mdiClose} size={14} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Images */}
        <CollapsibleSection title="画像一覧" count={analysis.imageUrls.length}>
          {analysis.imageUrls.length > 0 ? (
            <div className="space-y-2">
              {/* Bulk download button */}
              <button
                type="button"
                onClick={handleBulkDownload}
                disabled={downloadState === 'busy'}
                className="flex items-center gap-1 rounded border border-[var(--color-border-secondary)] px-2 py-0.5 text-[10px] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] disabled:opacity-50"
              >
                <MdiIcon path={mdiDownload} size={12} />
                {downloadState === 'busy'
                  ? 'ダウンロード中…'
                  : downloadState === 'done'
                    ? '保存しました'
                    : `まとめてダウンロード (${String(analysis.imageUrls.length)}枚)`}
              </button>
              {/* Thumbnail grid */}
              <div className="flex flex-wrap gap-1">
                {analysis.imageUrls.map((url) => (
                  <ImageThumb key={url} url={url} onOpen={handleOpenExternal} />
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-[var(--color-text-muted)]">画像なし</p>
          )}
        </CollapsibleSection>

        {/* Videos */}
        <CollapsibleSection title="動画一覧" count={analysis.videoUrls.length}>
          {analysis.videoUrls.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {analysis.videoUrls.map((url) => (
                <VideoThumb key={url} url={url} onOpen={handleOpenExternal} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--color-text-muted)]">動画なし</p>
          )}
        </CollapsibleSection>

        {/* Links */}
        <CollapsibleSection title="リンク一覧" count={analysis.linkUrls.length}>
          <div className="space-y-0.5">
            {analysis.linkUrls.map((url) => (
              <button
                key={url}
                type="button"
                onClick={() => { handleOpenExternal(url); }}
                className="block w-full truncate text-left text-xs text-[var(--color-link)] hover:underline"
              >
                {url}
              </button>
            ))}
            {analysis.linkUrls.length === 0 && (
              <p className="text-xs text-[var(--color-text-muted)]">リンクなし</p>
            )}
          </div>
        </CollapsibleSection>

        {/* Popular Res */}
        <CollapsibleSection title="人気レス" count={analysis.popularRes.length}>
          <CountList entries={analysis.popularRes} resMap={resMap} onClickEntry={handleClickEntry} />
        </CollapsibleSection>

        {/* コテハン */}
        <CollapsibleSection title="コテハン一覧" count={analysis.kotehanRanking.length}>
          <CountList entries={analysis.kotehanRanking} resMap={resMap} onClickEntry={handleClickEntry} />
        </CollapsibleSection>

        {/* Long posts */}
        <CollapsibleSection title="必死レス（長文）" count={analysis.longPosts.length}>
          <div className="space-y-0.5">
            {analysis.longPosts.map((lp) => {
              const res = resMap.get(lp.resNumber);
              const snippet = res !== undefined ? truncate(toPlainText(res.body), SNIPPET_LENGTH) : '';
              return (
                <button
                  key={lp.resNumber}
                  type="button"
                  onClick={() => { onScrollToRes(lp.resNumber); }}
                  className="flex w-full flex-col rounded px-1 py-1 text-left text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
                >
                  <div className="flex w-full items-center gap-2">
                    <span className="font-medium">&gt;&gt;{lp.resNumber}</span>
                    <span className="ml-auto shrink-0 rounded bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-text-muted)]">
                      {lp.length}文字
                    </span>
                  </div>
                  {snippet.length > 0 && (
                    <span className="mt-0.5 line-clamp-2 text-[10px] leading-tight text-[var(--color-text-muted)]">
                      {snippet}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </CollapsibleSection>

        {/* ID Ranking */}
        <CollapsibleSection title="必死レス（ID回数）" count={analysis.idRanking.length}>
          <CountList entries={analysis.idRanking} resMap={resMap} onClickEntry={handleClickEntry} />
        </CollapsibleSection>

        {/* ワッチョイ Ranking */}
        <CollapsibleSection title="必死レス（ワッチョイ別）" count={analysis.watchoiRanking.length}>
          <CountList entries={analysis.watchoiRanking} resMap={resMap} onClickEntry={handleClickEntry} />
        </CollapsibleSection>
      </div>
    </div>
    </>
  );
}
