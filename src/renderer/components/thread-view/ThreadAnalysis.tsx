/**
 * Thread Analysis Panel (F16).
 *
 * Shows categorised lists: images, videos, links, popular res,
 * kotehan ranking, ID/ワッチョイ frequency, long posts.
 */
import { useState, useMemo, useCallback } from 'react';
import { mdiClose, mdiChevronDown, mdiChevronRight } from '@mdi/js';
import type { Res } from '@shared/domain';
import type { CountEntry, ThreadAnalysisResult } from '../../utils/thread-analysis';
import { analyzeThread } from '../../utils/thread-analysis';
import { MdiIcon } from '../common/MdiIcon';
import { TopResizeHandle } from '../common/TopResizeHandle';

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
      {open && <div className="max-h-48 overflow-y-auto px-3 pb-2">{children}</div>}
    </div>
  );
}

function CountList({
  entries,
  onClickEntry,
}: {
  readonly entries: readonly CountEntry[];
  readonly onClickEntry: (resNumbers: readonly number[]) => void;
}): React.JSX.Element {
  return (
    <div className="space-y-0.5">
      {entries.map((e) => (
        <button
          key={e.key}
          type="button"
          onClick={() => { onClickEntry(e.resNumbers); }}
          className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
        >
          <span className="min-w-0 flex-1 truncate">{e.key}</span>
          <span className="shrink-0 rounded bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-text-muted)]">
            {e.count}
          </span>
        </button>
      ))}
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
          <div className="space-y-0.5">
            {analysis.imageUrls.map((url) => (
              <button
                key={url}
                type="button"
                onClick={() => { handleOpenExternal(url); }}
                className="block w-full truncate text-left text-xs text-[var(--color-link)] hover:underline"
              >
                {url}
              </button>
            ))}
            {analysis.imageUrls.length === 0 && (
              <p className="text-xs text-[var(--color-text-muted)]">画像なし</p>
            )}
          </div>
        </CollapsibleSection>

        {/* Videos */}
        <CollapsibleSection title="動画一覧" count={analysis.videoUrls.length}>
          <div className="space-y-0.5">
            {analysis.videoUrls.map((url) => (
              <button
                key={url}
                type="button"
                onClick={() => { handleOpenExternal(url); }}
                className="block w-full truncate text-left text-xs text-[var(--color-link)] hover:underline"
              >
                {url}
              </button>
            ))}
            {analysis.videoUrls.length === 0 && (
              <p className="text-xs text-[var(--color-text-muted)]">動画なし</p>
            )}
          </div>
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
          <CountList entries={analysis.popularRes} onClickEntry={handleClickEntry} />
        </CollapsibleSection>

        {/* コテハン */}
        <CollapsibleSection title="コテハン一覧" count={analysis.kotehanRanking.length}>
          <CountList entries={analysis.kotehanRanking} onClickEntry={handleClickEntry} />
        </CollapsibleSection>

        {/* Long posts */}
        <CollapsibleSection title="必死レス（長文）" count={analysis.longPosts.length}>
          <div className="space-y-0.5">
            {analysis.longPosts.map((lp) => (
              <button
                key={lp.resNumber}
                type="button"
                onClick={() => { onScrollToRes(lp.resNumber); }}
                className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
              >
                <span>&gt;&gt;{lp.resNumber}</span>
                <span className="ml-auto shrink-0 rounded bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-text-muted)]">
                  {lp.length}文字
                </span>
              </button>
            ))}
          </div>
        </CollapsibleSection>

        {/* ID Ranking */}
        <CollapsibleSection title="必死レス（ID回数）" count={analysis.idRanking.length}>
          <CountList entries={analysis.idRanking} onClickEntry={handleClickEntry} />
        </CollapsibleSection>

        {/* ワッチョイ Ranking */}
        <CollapsibleSection title="必死レス（ワッチョイ別）" count={analysis.watchoiRanking.length}>
          <CountList entries={analysis.watchoiRanking} onClickEntry={handleClickEntry} />
        </CollapsibleSection>
      </div>
    </div>
    </>
  );
}
