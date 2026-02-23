/**
 * Round (patrol) list management panel.
 * Shows registered boards/threads for automatic fetching.
 */
import { useState, useCallback, useEffect } from 'react';
import { mdiClose, mdiRefresh, mdiDelete, mdiPlay, mdiPause } from '@mdi/js';
import type { RoundBoardEntry, RoundItemEntry, RoundTimerConfig } from '@shared/round';
import { MdiIcon } from '../common/MdiIcon';

export function RoundPanel({ onClose }: { readonly onClose: () => void }): React.JSX.Element {
  const [boards, setBoards] = useState<readonly RoundBoardEntry[]>([]);
  const [items, setItems] = useState<readonly RoundItemEntry[]>([]);
  const [timerConfig, setTimerConfigState] = useState<RoundTimerConfig>({
    enabled: false,
    intervalMinutes: 15,
  });
  const [executing, setExecuting] = useState(false);
  const [activeTab, setActiveTab] = useState<'boards' | 'items'>('boards');

  const loadData = useCallback(async () => {
    const [boardList, itemList, timer] = await Promise.all([
      window.electronApi.invoke('round:get-boards'),
      window.electronApi.invoke('round:get-items'),
      window.electronApi.invoke('round:get-timer'),
    ]);
    setBoards(boardList);
    setItems(itemList);
    setTimerConfigState(timer);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleRemoveBoard = useCallback(async (url: string) => {
    await window.electronApi.invoke('round:remove-board', url);
    setBoards((prev) => prev.filter((b) => b.url !== url));
  }, []);

  const handleRemoveItem = useCallback(async (url: string, fileName: string) => {
    await window.electronApi.invoke('round:remove-item', url, fileName);
    setItems((prev) => prev.filter((i) => !(i.url === url && i.fileName === fileName)));
  }, []);

  const handleExecute = useCallback(async () => {
    setExecuting(true);
    try {
      await window.electronApi.invoke('round:execute');
    } finally {
      setExecuting(false);
    }
  }, []);

  const handleToggleTimer = useCallback(async () => {
    const newConfig: RoundTimerConfig = {
      ...timerConfig,
      enabled: !timerConfig.enabled,
    };
    await window.electronApi.invoke('round:set-timer', newConfig);
    setTimerConfigState(newConfig);
  }, [timerConfig]);

  const handleIntervalChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseInt(e.target.value, 10);
      if (Number.isNaN(value) || value < 1) return;
      const newConfig: RoundTimerConfig = { ...timerConfig, intervalMinutes: value };
      await window.electronApi.invoke('round:set-timer', newConfig);
      setTimerConfigState(newConfig);
    },
    [timerConfig],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border-primary)] px-2 py-1">
        <span className="text-xs font-semibold text-[var(--color-text-secondary)]">巡回リスト</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              void handleExecute();
            }}
            disabled={executing}
            className="rounded p-0.5 hover:bg-[var(--color-bg-hover)] disabled:opacity-50"
            title="手動巡回"
          >
            <MdiIcon path={mdiRefresh} size={12} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-0.5 hover:bg-[var(--color-bg-hover)]"
            aria-label="閉じる"
          >
            <MdiIcon path={mdiClose} size={12} />
          </button>
        </div>
      </div>

      {/* Timer controls */}
      <div className="flex items-center gap-2 border-b border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)] px-2 py-1">
        <button
          type="button"
          onClick={() => {
            void handleToggleTimer();
          }}
          className={`rounded p-0.5 ${timerConfig.enabled ? 'text-[var(--color-success)]' : 'text-[var(--color-text-muted)]'} hover:bg-[var(--color-bg-hover)]`}
          title={timerConfig.enabled ? '自動巡回停止' : '自動巡回開始'}
        >
          <MdiIcon path={timerConfig.enabled ? mdiPause : mdiPlay} size={14} />
        </button>
        <label className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
          間隔:
          <input
            type="number"
            min={1}
            value={timerConfig.intervalMinutes}
            onChange={(e) => {
              void handleIntervalChange(e);
            }}
            className="w-12 rounded border border-[var(--color-border-secondary)] bg-[var(--color-bg-primary)] px-1 py-0.5 text-xs text-[var(--color-text-primary)]"
          />
          分
        </label>
      </div>

      {/* Tab toggle */}
      <div className="flex border-b border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)]">
        <button
          type="button"
          onClick={() => {
            setActiveTab('boards');
          }}
          className={`flex-1 px-2 py-1 text-xs ${activeTab === 'boards' ? 'border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'}`}
        >
          板 ({String(boards.length)})
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('items');
          }}
          className={`flex-1 px-2 py-1 text-xs ${activeTab === 'items' ? 'border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'}`}
        >
          スレッド ({String(items.length)})
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'boards' &&
          boards.map((b) => (
            <div
              key={b.url}
              className="flex items-center justify-between border-b border-[var(--color-border-secondary)] px-2 py-1"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs text-[var(--color-text-primary)]">
                  {b.boardTitle}
                </div>
                <div className="truncate text-xs text-[var(--color-text-muted)]">{b.roundName}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  void handleRemoveBoard(b.url);
                }}
                className="shrink-0 rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-error)]"
                aria-label="削除"
              >
                <MdiIcon path={mdiDelete} size={12} />
              </button>
            </div>
          ))}

        {activeTab === 'items' &&
          items.map((item) => (
            <div
              key={`${item.url}-${item.fileName}`}
              className="flex items-center justify-between border-b border-[var(--color-border-secondary)] px-2 py-1"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs text-[var(--color-text-primary)]">
                  {item.threadTitle}
                </div>
                <div className="truncate text-xs text-[var(--color-text-muted)]">
                  {item.boardTitle} / {item.roundName}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  void handleRemoveItem(item.url, item.fileName);
                }}
                className="shrink-0 rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-error)]"
                aria-label="削除"
              >
                <MdiIcon path={mdiDelete} size={12} />
              </button>
            </div>
          ))}

        {((activeTab === 'boards' && boards.length === 0) ||
          (activeTab === 'items' && items.length === 0)) && (
          <div className="flex items-center justify-center py-4 text-xs text-[var(--color-text-muted)]">
            登録なし
          </div>
        )}
      </div>
    </div>
  );
}
