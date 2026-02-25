/**
 * New thread creation editor.
 * Ported from Slevo's PostDialog (PostDialogMode.NewThread) +
 * ThreadCreatePostDialogExecutor logic.
 *
 * Sends a new-thread POST via IPC (bbs:post with threadId = '' and subject set),
 * then refreshes the board subject list on success.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { mdiSend, mdiLoading, mdiClose } from '@mdi/js';
import { useBBSStore } from '../../stores/bbs-store';
import { useStatusLogStore } from '../../stores/status-log-store';
import { MdiIcon } from '../common/MdiIcon';
import { TopResizeHandle } from '../common/TopResizeHandle';

interface NewThreadEditorProps {
  readonly boardUrl: string;
  readonly onClose: () => void;
}

export function NewThreadEditor({ boardUrl, onClose }: NewThreadEditorProps): React.JSX.Element {
  const kotehan = useBBSStore((s) => s.kotehan);
  const saveKotehan = useBBSStore((s) => s.saveKotehan);
  const setStatusMessage = useBBSStore((s) => s.setStatusMessage);
  const refreshSelectedBoard = useBBSStore((s) => s.refreshSelectedBoard);
  const openThread = useBBSStore((s) => s.openThread);
  const nextThreadDraft = useBBSStore((s) => s.nextThreadDraft);

  const [subject, setSubject] = useState(nextThreadDraft?.subject ?? '');
  const [name, setName] = useState(kotehan.name);
  const [mail, setMail] = useState(kotehan.mail.length > 0 ? kotehan.mail : '');
  const [message, setMessage] = useState(nextThreadDraft?.message ?? '');
  const [posting, setPosting] = useState(false);
  const [resultMessage, setResultMessage] = useState('');
  const subjectRef = useRef<HTMLInputElement>(null);

  const [panelHeight, setPanelHeight] = useState(280);
  const handlePanelResize = useCallback((deltaY: number) => {
    setPanelHeight((prev) => Math.max(200, Math.min(window.innerHeight * 0.7, prev - deltaY)));
  }, []);

  useEffect(() => {
    setName(kotehan.name);
    setMail(kotehan.mail.length > 0 ? kotehan.mail : '');
  }, [kotehan]);

  // Focus the subject input on mount
  useEffect(() => {
    requestAnimationFrame(() => {
      subjectRef.current?.focus();
    });
  }, []);

  const handlePost = useCallback(async () => {
    if (subject.trim().length === 0) {
      setResultMessage('スレッドタイトルを入力してください');
      return;
    }
    if (message.trim().length === 0) {
      setResultMessage('本文を入力してください');
      return;
    }

    setPosting(true);
    setResultMessage('');
    const pushLog = useStatusLogStore.getState().pushLog;
    pushLog('post', 'info', 'スレッド作成中...');

    try {
      const result = await window.electronApi.invoke('bbs:post', {
        boardUrl,
        threadId: '',
        name,
        mail,
        message,
        subject: subject.trim(),
      });

      if (result.success) {
        setResultMessage('スレッド作成成功');
        setStatusMessage('スレッド作成が完了しました');
        pushLog('post', 'success', 'スレッド作成が完了しました');
        void saveKotehan(boardUrl, { name, mail });

        // Refresh board thread list to include the new thread
        await refreshSelectedBoard();

        // Try to open the newly created thread (it should now be at the top of the list)
        const { subjects } = useBBSStore.getState();
        const newest = subjects[0];
        if (newest !== undefined) {
          const newThreadId = newest.fileName.replace('.dat', '');
          void openThread(boardUrl, newThreadId, newest.title);
        }

        setTimeout(() => {
          onClose();
        }, 800);
      } else {
        setResultMessage(`作成失敗: ${result.resultType}`);
        setStatusMessage(`スレッド作成失敗: ${result.resultType}`);
        pushLog('post', 'error', `スレッド作成失敗: ${result.resultType}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setResultMessage(`エラー: ${msg}`);
      useStatusLogStore.getState().pushLog('post', 'error', `スレッド作成エラー: ${msg}`);
    } finally {
      setPosting(false);
    }
  }, [
    boardUrl,
    subject,
    name,
    mail,
    message,
    setStatusMessage,
    saveKotehan,
    refreshSelectedBoard,
    openThread,
    onClose,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        void handlePost();
      }
    },
    [handlePost],
  );

  const isDisabled = posting || subject.trim().length === 0 || message.trim().length === 0;

  return (
    <>
      <TopResizeHandle onResize={handlePanelResize} />
      <div
        className="flex flex-col overflow-hidden bg-[var(--color-bg-secondary)]"
        style={{ height: panelHeight }}
      >
        <div className="flex shrink-0 items-center justify-between px-3 py-1">
          <span className="text-xs font-semibold text-[var(--color-text-secondary)]">
            スレッド新規作成
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
            aria-label="閉じる"
          >
            <MdiIcon path={mdiClose} size={12} />
          </button>
        </div>
        <div className="flex-1 overflow-auto px-3 pb-3">
          {/* Subject (thread title) — required */}
          <div className="mb-2">
            <input
              ref={subjectRef}
              type="text"
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
              }}
              onKeyDown={handleKeyDown}
              placeholder="スレッドタイトル（必須）"
              className="w-full rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-2 py-1 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
            />
          </div>
          {/* Name / Mail / Post button row */}
          <div className="mb-2 flex flex-wrap gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
              placeholder="名前"
              className="w-32 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-2 py-1 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
            />
            <input
              type="text"
              value={mail}
              onChange={(e) => {
                setMail(e.target.value);
              }}
              placeholder="メール"
              className="w-32 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-2 py-1 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                void handlePost();
              }}
              disabled={isDisabled}
              className="ml-auto flex items-center gap-1 rounded bg-[var(--color-accent)] px-3 py-1 text-xs text-white hover:opacity-90 disabled:opacity-50"
            >
              <MdiIcon
                path={posting ? mdiLoading : mdiSend}
                size={12}
                className={posting ? 'animate-spin' : ''}
              />
              スレッドを立てる
            </button>
          </div>
          {/* Message body */}
          <textarea
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            placeholder="本文を入力 (Ctrl+Enter で送信)"
            rows={5}
            className="w-full resize-y rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-2 py-1 text-xs leading-relaxed text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
          />
          {resultMessage.length > 0 && (
            <p
              className={`mt-1 text-xs ${resultMessage.includes('成功') ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}
            >
              {resultMessage}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
