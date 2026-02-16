/**
 * Post editor component.
 * Sends responses via IPC to the main process post service.
 * Uses kotehan (per-board default name/mail) for initial values.
 * Displays Samba timer countdown when posting interval is restricted.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { mdiSend, mdiLoading, mdiTimerSand, mdiTree } from '@mdi/js';
import type { DonguriState } from '@shared/auth';
import { useBBSStore } from '../../stores/bbs-store';
import { MdiIcon } from '../common/MdiIcon';

interface PostEditorProps {
  readonly boardUrl: string;
  readonly threadId: string;
}

/**
 * Calculate remaining seconds until Samba restriction is cleared.
 */
function calcSambaRemaining(interval: number, lastPostTime: string | null): number {
  if (interval <= 0 || lastPostTime === null) return 0;
  const elapsed = (Date.now() - new Date(lastPostTime).getTime()) / 1000;
  const remaining = interval - elapsed;
  return remaining > 0 ? Math.ceil(remaining) : 0;
}

export function PostEditor({ boardUrl, threadId }: PostEditorProps): React.JSX.Element {
  const kotehan = useBBSStore((s) => s.kotehan);
  const sambaInfo = useBBSStore((s) => s.sambaInfo);
  const saveKotehan = useBBSStore((s) => s.saveKotehan);
  const recordSambaTime = useBBSStore((s) => s.recordSambaTime);
  const setStatusMessage = useBBSStore((s) => s.setStatusMessage);

  const postEditorInitialMessage = useBBSStore((s) => s.postEditorInitialMessage);

  const [name, setName] = useState(kotehan.name);
  const [mail, setMail] = useState(kotehan.mail.length > 0 ? kotehan.mail : 'sage');
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Apply initial message (e.g. >>N from res number click)
  useEffect(() => {
    if (postEditorInitialMessage.length > 0) {
      setMessage((prev) => prev + postEditorInitialMessage);
      // Focus textarea after inserting quote
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        if (textareaRef.current !== null) {
          const len = textareaRef.current.value.length;
          textareaRef.current.setSelectionRange(len, len);
        }
      });
    }
  }, [postEditorInitialMessage]);
  const [posting, setPosting] = useState(false);
  const [resultMessage, setResultMessage] = useState('');
  const [sambaRemaining, setSambaRemaining] = useState(0);
  const [donguriState, setDonguriState] = useState<DonguriState>({ status: 'none', message: '' });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setName(kotehan.name);
    setMail(kotehan.mail.length > 0 ? kotehan.mail : 'sage');
  }, [kotehan]);

  // Load donguri state
  useEffect(() => {
    void (async () => {
      try {
        const authState = await window.electronApi.invoke('auth:get-state');
        setDonguriState(authState.donguri);
      } catch {
        // Ignore
      }
    })();
  }, []);

  // Samba countdown timer
  useEffect(() => {
    const update = (): void => {
      setSambaRemaining(calcSambaRemaining(sambaInfo.interval, sambaInfo.lastPostTime));
    };
    update();

    if (sambaInfo.interval > 0) {
      timerRef.current = setInterval(update, 1000);
    }

    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [sambaInfo.interval, sambaInfo.lastPostTime]);

  const handlePost = useCallback(async () => {
    if (message.trim().length === 0) {
      setResultMessage('本文を入力してください');
      return;
    }

    if (sambaRemaining > 0) {
      setResultMessage(`Samba規制中: あと ${String(sambaRemaining)} 秒お待ちください`);
      return;
    }

    // Misfire check: compare active tab with post target
    const { tabs, activeTabId } = useBBSStore.getState();
    const activeTab = tabs.find((t) => t.id === activeTabId);
    if (activeTab !== undefined) {
      const isTargetMatch = activeTab.boardUrl === boardUrl && activeTab.threadId === threadId;
      if (!isTargetMatch) {
        const confirmed = window.confirm(
          `投稿先が現在のタブと異なります。\n` +
          `投稿先: ${boardUrl} / ${threadId}\n` +
          `このまま投稿しますか？`,
        );
        if (!confirmed) return;
      }
    }

    setPosting(true);
    setResultMessage('');

    try {
      const result = await window.electronApi.invoke('bbs:post', {
        boardUrl,
        threadId,
        name,
        mail,
        message,
      });

      if (result.success) {
        setMessage('');
        setResultMessage('投稿成功');
        setStatusMessage('投稿が完了しました');
        void saveKotehan(boardUrl, { name, mail });
        void recordSambaTime(boardUrl);

        // Save post history
        void window.electronApi.invoke('post:save-history', {
          timestamp: new Date().toISOString(),
          boardUrl,
          threadId,
          name,
          mail,
          message,
        });
      } else {
        // Update donguri state on relevant result types
        if (result.resultType === 'grtDonguri' || result.resultType === 'grtDngBroken') {
          try {
            const authState = await window.electronApi.invoke('auth:get-state');
            setDonguriState(authState.donguri);
          } catch {
            // Ignore
          }
        }
        setResultMessage(`投稿失敗: ${result.resultType}`);
        setStatusMessage(`投稿失敗: ${result.resultType}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setResultMessage(`エラー: ${msg}`);
    } finally {
      setPosting(false);
    }
  }, [boardUrl, threadId, name, mail, message, sambaRemaining, setStatusMessage, saveKotehan, recordSambaTime]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        void handlePost();
      }
    },
    [handlePost],
  );

  const isDisabled = posting || message.trim().length === 0;

  return (
    <div className="border-t border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-3">
      <div className="mb-2 flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); }}
          placeholder="名前"
          className="w-32 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-2 py-1 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
        />
        <input
          type="text"
          value={mail}
          onChange={(e) => { setMail(e.target.value); }}
          placeholder="メール"
          className="w-32 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-2 py-1 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
        />
        {sambaRemaining > 0 && (
          <span className="flex items-center gap-1 text-xs text-[var(--color-warning)]">
            <MdiIcon path={mdiTimerSand} size={12} />
            あと {sambaRemaining} 秒
          </span>
        )}
        {donguriState.status !== 'none' && (
          <span className={`flex items-center gap-1 text-xs ${
            donguriState.status === 'active' ? 'text-green-400' :
            donguriState.status === 'broken' ? 'text-[var(--color-error)]' :
            donguriState.status === 'consumed' ? 'text-[var(--color-warning)]' :
            'text-[var(--color-text-muted)]'
          }`}>
            <MdiIcon path={mdiTree} size={12} />
            {donguriState.status === 'active' ? 'どんぐり' :
             donguriState.status === 'broken' ? 'どんぐり破損' :
             donguriState.status === 'consumed' ? 'どんぐり消費済み' : ''}
          </span>
        )}
        <button
          type="button"
          onClick={() => { void handlePost(); }}
          disabled={isDisabled}
          className="ml-auto flex items-center gap-1 rounded bg-[var(--color-accent)] px-3 py-1 text-xs text-white hover:opacity-90 disabled:opacity-50"
        >
          <MdiIcon path={posting ? mdiLoading : mdiSend} size={12} className={posting ? 'animate-spin' : ''} />
          書き込む
        </button>
      </div>
      <textarea
        ref={textareaRef}
        value={message}
        onChange={(e) => { setMessage(e.target.value); }}
        onKeyDown={handleKeyDown}
        placeholder="本文を入力 (Ctrl+Enter で送信)"
        rows={4}
        className="w-full resize-none rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-2 py-1 text-xs leading-relaxed text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
      />
      {resultMessage.length > 0 && (
        <p className={`mt-1 text-xs ${resultMessage.includes('成功') ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
          {resultMessage}
        </p>
      )}
    </div>
  );
}
