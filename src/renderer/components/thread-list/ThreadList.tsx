/**
 * Thread list panel (中央ペイン).
 * Displays subject.txt threads in a sortable table.
 */
import { useCallback, useMemo, useState } from 'react';
import { mdiArrowUp, mdiArrowDown, mdiNewBox, mdiArchive, mdiLoading } from '@mdi/js';
import { AgeSage, type SubjectRecord } from '@shared/domain';
import { useBBSStore } from '../../stores/bbs-store';
import { MdiIcon } from '../common/MdiIcon';

type SortKey = 'index' | 'title' | 'count';
type SortDir = 'asc' | 'desc';

function ageSageBadge(ageSage: number | undefined): React.JSX.Element | null {
  switch (ageSage) {
    case AgeSage.Age:
      return <MdiIcon path={mdiArrowUp} size={12} className="text-[var(--color-age)]" />;
    case AgeSage.Sage:
      return <MdiIcon path={mdiArrowDown} size={12} className="text-[var(--color-sage)]" />;
    case AgeSage.New:
      return <MdiIcon path={mdiNewBox} size={12} className="text-[var(--color-success)]" />;
    case AgeSage.Archive:
      return <MdiIcon path={mdiArchive} size={12} className="text-[var(--color-archive)]" />;
    default:
      return null;
  }
}

export function ThreadList(): React.JSX.Element {
  const selectedBoard = useBBSStore((s) => s.selectedBoard);
  const subjects = useBBSStore((s) => s.subjects);
  const threadIndices = useBBSStore((s) => s.threadIndices);
  const subjectLoading = useBBSStore((s) => s.subjectLoading);
  const openThread = useBBSStore((s) => s.openThread);

  const [sortKey, setSortKey] = useState<SortKey>('index');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Build index map for AgeSage lookup
  const indexMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const idx of threadIndices) {
      map.set(idx.fileName, idx.ageSage);
    }
    return map;
  }, [threadIndices]);

  const sortedSubjects = useMemo(() => {
    const items = subjects.map((s, i) => ({ ...s, originalIndex: i }));
    items.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'index':
          cmp = a.originalIndex - b.originalIndex;
          break;
        case 'title':
          cmp = a.title.localeCompare(b.title);
          break;
        case 'count':
          cmp = a.count - b.count;
          break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return items;
  }, [subjects, sortKey, sortDir]);

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir('asc');
      }
    },
    [sortKey],
  );

  const handleOpenThread = useCallback(
    (subject: SubjectRecord) => {
      if (selectedBoard === null) return;
      const threadId = subject.fileName.replace('.dat', '');
      void openThread(selectedBoard.url, threadId, subject.title);
    },
    [selectedBoard, openThread],
  );

  const SortHeader = useCallback(
    ({ label, field }: { readonly label: string; readonly field: SortKey }) => (
      <button
        type="button"
        onClick={() => { handleSort(field); }}
        className="flex items-center gap-0.5 text-left text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
      >
        {label}
        {sortKey === field && (
          <span className="text-[var(--color-accent)]">{sortDir === 'asc' ? '▲' : '▼'}</span>
        )}
      </button>
    ),
    [handleSort, sortKey, sortDir],
  );

  return (
    <section className="flex min-w-0 flex-1 flex-col border-r border-[var(--color-border-primary)]">
      <div className="flex h-8 items-center gap-2 border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-3">
        <span className="text-xs text-[var(--color-text-muted)]">
          {selectedBoard !== null ? selectedBoard.title : 'スレッド一覧'}
        </span>
        {subjectLoading && <MdiIcon path={mdiLoading} size={12} className="animate-spin text-[var(--color-accent)]" />}
        {subjects.length > 0 && (
          <span className="ml-auto text-xs text-[var(--color-text-muted)]">{subjects.length} スレッド</span>
        )}
      </div>

      {/* Table header */}
      <div className="flex h-6 items-center gap-2 border-b border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)]/50 px-3">
        <div className="w-10">
          <SortHeader label="#" field="index" />
        </div>
        <div className="w-6" />
        <div className="min-w-0 flex-1">
          <SortHeader label="タイトル" field="title" />
        </div>
        <div className="w-16 text-right">
          <SortHeader label="レス" field="count" />
        </div>
      </div>

      {/* Thread rows */}
      <div className="flex-1 overflow-y-auto">
        {selectedBoard === null && (
          <p className="p-4 text-center text-xs text-[var(--color-text-muted)]">板を選択してください</p>
        )}
        {sortedSubjects.map((subject, i) => (
          <button
            key={subject.fileName}
            type="button"
            onClick={() => { handleOpenThread(subject); }}
            className="flex w-full items-center gap-2 border-b border-[var(--color-border-secondary)] px-3 py-1 text-left text-xs hover:bg-[var(--color-bg-secondary)]"
          >
            <span className="w-10 shrink-0 text-[var(--color-text-muted)]">{String(i + 1)}</span>
            <span className="w-6 shrink-0">{ageSageBadge(indexMap.get(subject.fileName))}</span>
            <span className="min-w-0 flex-1 truncate text-[var(--color-text-secondary)]">{subject.title}</span>
            <span className="w-16 shrink-0 text-right text-[var(--color-text-muted)]">{subject.count}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
