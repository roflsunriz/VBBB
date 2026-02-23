/**
 * NG (あぼーん) rule editor panel.
 * Allows users to view, add, and remove NG filter rules.
 * Supports pre-filled token from text selection and board/thread scope.
 */
import { useState, useCallback, useEffect } from 'react';
import { mdiClose, mdiPlus, mdiDelete } from '@mdi/js';
import { AbonType, NgMatchMode, NgTarget } from '@shared/ng';
import type { NgRule } from '@shared/ng';
import { useBBSStore } from '../../stores/bbs-store';
import { MdiIcon } from '../common/MdiIcon';
import { TopResizeHandle } from '../common/TopResizeHandle';

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function NgRuleRow({
  rule,
  onRemove,
}: {
  readonly rule: NgRule;
  readonly onRemove: (id: string) => void;
}): React.JSX.Element {
  const abonLabel = rule.abonType === AbonType.Transparent ? '透明' : '通常';
  const modeLabel = rule.matchMode === NgMatchMode.Regexp ? '正規表現' : 'テキスト';
  const targetLabel =
    rule.target === NgTarget.Thread ? '[スレ]' : rule.target === NgTarget.Board ? '[板]' : '[レス]';
  const scopeLabel =
    rule.threadId !== undefined
      ? `スレ: ${rule.boardId ?? ''}/${rule.threadId}`
      : rule.boardId !== undefined
        ? `板: ${rule.boardId}`
        : '全体';

  return (
    <div className="flex items-center gap-2 border-b border-[var(--color-border-secondary)] px-3 py-1.5 text-xs">
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 ${
          rule.abonType === AbonType.Transparent
            ? 'bg-[var(--color-error)]/15 text-[var(--color-error)]'
            : 'bg-[var(--color-warning)]/15 text-[var(--color-warning)]'
        }`}
      >
        {abonLabel}
      </span>
      <span className="shrink-0 text-[var(--color-text-muted)]">{targetLabel}</span>
      <span className="shrink-0 text-[var(--color-text-muted)]">[{modeLabel}]</span>
      <span className="min-w-0 flex-1 truncate text-[var(--color-text-primary)]">
        {rule.tokens.join(' AND ')}
      </span>
      <span className="shrink-0 text-[var(--color-text-muted)]">{scopeLabel}</span>
      <button
        type="button"
        onClick={() => {
          onRemove(rule.id);
        }}
        className="shrink-0 rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-error)]"
        aria-label="削除"
      >
        <MdiIcon path={mdiDelete} size={14} />
      </button>
    </div>
  );
}

interface NgEditorProps {
  /** Optional close callback. Falls back to store's toggleNgEditor when not provided. */
  readonly onClose?: () => void;
}

export function NgEditor({ onClose }: NgEditorProps = {}): React.JSX.Element {
  const ngRules = useBBSStore((s) => s.ngRules);
  const addNgRule = useBBSStore((s) => s.addNgRule);
  const removeNgRule = useBBSStore((s) => s.removeNgRule);
  const fetchNgRules = useBBSStore((s) => s.fetchNgRules);
  const toggleNgEditor = useBBSStore((s) => s.toggleNgEditor);
  const ngEditorInitialToken = useBBSStore((s) => s.ngEditorInitialToken);
  const ngEditorInitialBoardId = useBBSStore((s) => s.ngEditorInitialBoardId);
  const ngEditorInitialThreadId = useBBSStore((s) => s.ngEditorInitialThreadId);
  const handleClose = onClose ?? toggleNgEditor;

  const [newToken, setNewToken] = useState('');
  const [newTarget, setNewTarget] = useState<NgTarget>(NgTarget.Response);
  const [newAbonType, setNewAbonType] = useState<'normal' | 'transparent'>('normal');
  const [newMatchMode, setNewMatchMode] = useState<'plain' | 'regexp'>('plain');
  const [newBoardId, setNewBoardId] = useState('');
  const [newThreadId, setNewThreadId] = useState('');

  // Apply initial values from store (e.g. from text selection)
  useEffect(() => {
    if (ngEditorInitialToken.length > 0) {
      setNewToken(ngEditorInitialToken);
    }
    if (ngEditorInitialBoardId.length > 0) {
      setNewBoardId(ngEditorInitialBoardId);
    }
    if (ngEditorInitialThreadId.length > 0) {
      setNewThreadId(ngEditorInitialThreadId);
    }
  }, [ngEditorInitialToken, ngEditorInitialBoardId, ngEditorInitialThreadId]);

  useEffect(() => {
    void fetchNgRules();
  }, [fetchNgRules]);

  const handleAdd = useCallback(() => {
    if (newToken.trim().length === 0) return;

    const tokens = newMatchMode === 'regexp' ? [newToken.trim()] : newToken.trim().split(/\s+/);

    const rule: NgRule = {
      id: generateId(),
      target: newTarget === NgTarget.Response ? undefined : newTarget,
      abonType: newAbonType,
      matchMode: newMatchMode,
      tokens,
      boardId: newBoardId.length > 0 ? newBoardId : undefined,
      threadId: newThreadId.length > 0 ? newThreadId : undefined,
      enabled: true,
    };

    void addNgRule(rule);
    setNewToken('');
    setNewThreadId('');
  }, [newToken, newTarget, newAbonType, newMatchMode, newBoardId, newThreadId, addNgRule]);

  const handleRemove = useCallback(
    (id: string) => {
      void removeNgRule(id);
    },
    [removeNgRule],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleAdd();
      }
    },
    [handleAdd],
  );

  const isInline = onClose === undefined;
  const [panelHeight, setPanelHeight] = useState(256);
  const handlePanelResize = useCallback((deltaY: number) => {
    setPanelHeight((prev) => Math.max(160, Math.min(window.innerHeight * 0.7, prev - deltaY)));
  }, []);

  return (
    <>
      {isInline && <TopResizeHandle onResize={handlePanelResize} />}
      <div
        className={`flex flex-col overflow-hidden border-l border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]${isInline ? '' : ' h-64 min-h-40 max-h-[70vh]'}`}
        style={isInline ? { height: panelHeight } : undefined}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border-primary)] px-3 py-1.5">
          <h3 className="text-xs font-medium text-[var(--color-text-primary)]">NG ルール管理</h3>
          <button
            type="button"
            onClick={handleClose}
            className="rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
            aria-label="閉じる"
          >
            <MdiIcon path={mdiClose} size={14} />
          </button>
        </div>

        {/* Add form */}
        <div className="border-b border-[var(--color-border-primary)] p-2">
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            <select
              value={newTarget}
              onChange={(e) => {
                setNewTarget(e.target.value as NgTarget);
              }}
              className="rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-1.5 py-0.5 text-xs text-[var(--color-text-primary)]"
            >
              <option value="response">レス対象</option>
              <option value="thread">スレッド対象</option>
              <option value="board">板対象</option>
            </select>
            <select
              value={newAbonType}
              onChange={(e) => {
                setNewAbonType(e.target.value as 'normal' | 'transparent');
              }}
              className="rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-1.5 py-0.5 text-xs text-[var(--color-text-primary)]"
            >
              <option value="normal">通常あぼーん</option>
              <option value="transparent">透明あぼーん</option>
            </select>
            <select
              value={newMatchMode}
              onChange={(e) => {
                setNewMatchMode(e.target.value as 'plain' | 'regexp');
              }}
              className="rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-1.5 py-0.5 text-xs text-[var(--color-text-primary)]"
            >
              <option value="plain">テキスト</option>
              <option value="regexp">正規表現</option>
            </select>
            <input
              type="text"
              value={newBoardId}
              onChange={(e) => {
                setNewBoardId(e.target.value);
              }}
              placeholder="板ID (空=全体)"
              className="w-24 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-1.5 py-0.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
            />
            <input
              type="text"
              value={newThreadId}
              onChange={(e) => {
                setNewThreadId(e.target.value);
              }}
              placeholder="スレID (空=全スレ)"
              className="w-28 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-1.5 py-0.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
            />
          </div>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={newToken}
              onChange={(e) => {
                setNewToken(e.target.value);
              }}
              onKeyDown={handleKeyDown}
              placeholder={
                newMatchMode === 'regexp'
                  ? '正規表現パターン'
                  : newTarget === NgTarget.Thread
                    ? 'NGスレッドタイトル (スペース区切り=AND)'
                    : newTarget === NgTarget.Board
                      ? 'NG板名 (スペース区切り=AND)'
                      : 'NGワード (スペース区切り=AND)'
              }
              className="min-w-0 flex-1 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-2 py-1 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={newToken.trim().length === 0}
              className="flex items-center gap-0.5 rounded bg-[var(--color-accent)] px-2 py-1 text-xs text-white hover:opacity-90 disabled:opacity-50"
            >
              <MdiIcon path={mdiPlus} size={12} />
              追加
            </button>
          </div>
        </div>

        {/* Rule list */}
        <div className="flex-1 overflow-y-auto">
          {ngRules.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-[var(--color-text-muted)]">
              NG ルールはありません
            </p>
          ) : (
            ngRules.map((rule) => <NgRuleRow key={rule.id} rule={rule} onRemove={handleRemove} />)
          )}
        </div>
      </div>
    </>
  );
}
