/**
 * Post editor component.
 * Sends responses via IPC to the main process post service.
 * Uses kotehan (per-board default name/mail) for initial values.
 * Displays Samba timer countdown when posting interval is restricted.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { mdiSend, mdiLoading, mdiTimerSand, mdiTree, mdiHelpCircleOutline, mdiClose } from '@mdi/js';
import type { DonguriState } from '@shared/auth';
import { useBBSStore } from '../../stores/bbs-store';
import { useStatusLogStore } from '../../stores/status-log-store';
import { MdiIcon } from '../common/MdiIcon';
import { TopResizeHandle } from '../common/TopResizeHandle';

interface PostEditorProps {
  readonly boardUrl: string;
  readonly threadId: string;
  readonly hasExposedIps?: boolean | undefined;
}

const AUTO_CLOSE_KEY = 'vbbb-post-auto-close';

function loadAutoClose(): boolean {
  try {
    const raw = localStorage.getItem(AUTO_CLOSE_KEY);
    return raw !== 'false';
  } catch {
    return true;
  }
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

export function PostEditor({ boardUrl, threadId, hasExposedIps }: PostEditorProps): React.JSX.Element {
  const kotehan = useBBSStore((s) => s.kotehan);
  const sambaInfo = useBBSStore((s) => s.sambaInfo);
  const saveKotehan = useBBSStore((s) => s.saveKotehan);
  const recordSambaTime = useBBSStore((s) => s.recordSambaTime);
  const setStatusMessage = useBBSStore((s) => s.setStatusMessage);
  const closePostEditor = useBBSStore((s) => s.closePostEditor);
  const refreshActiveThread = useBBSStore((s) => s.refreshActiveThread);

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
  const [donguriState, setDonguriState] = useState<DonguriState>({ status: 'none', message: '', loggedIn: false });
  const [autoClose, setAutoClose] = useState(loadAutoClose);
  const [tripHelpOpen, setTripHelpOpen] = useState(false);
  const [donguriPopupOpen, setDonguriPopupOpen] = useState(false);
  const donguriButtonRef = useRef<HTMLButtonElement>(null);
  const [donguriPopupPos, setDonguriPopupPos] = useState({ x: 0, y: 0 });
  const [donguriLoading, setDonguriLoading] = useState(false);
  const [donguriMail, setDonguriMail] = useState('');
  const [donguriPassword, setDonguriPassword] = useState('');
  const [donguriActionMessage, setDonguriActionMessage] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [panelHeight, setPanelHeight] = useState(256);
  const handlePanelResize = useCallback((deltaY: number) => {
    setPanelHeight((prev) => Math.max(160, Math.min(window.innerHeight * 0.7, prev - deltaY)));
  }, []);

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

  const refreshDonguriDetails = useCallback(async () => {
    setDonguriLoading(true);
    setDonguriActionMessage('');
    try {
      const state = await window.electronApi.invoke('auth:donguri-refresh');
      setDonguriState(state);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setDonguriActionMessage(`どんぐり状態取得エラー: ${message}`);
    } finally {
      setDonguriLoading(false);
    }
  }, []);

  const handleToggleDonguriPopup = useCallback(() => {
    setDonguriPopupOpen((prev) => {
      const next = !prev;
      if (next) {
        void refreshDonguriDetails();
        if (donguriButtonRef.current !== null) {
          const rect = donguriButtonRef.current.getBoundingClientRect();
          setDonguriPopupPos({ x: rect.left, y: rect.top });
        }
      }
      return next;
    });
  }, [refreshDonguriDetails]);

  const handleDonguriLogin = useCallback(async () => {
    setDonguriLoading(true);
    setDonguriActionMessage('');
    try {
      const result = await window.electronApi.invoke('auth:donguri-login', donguriMail, donguriPassword);
      setDonguriState(result.state);
      setDonguriActionMessage(result.message);
      setStatusMessage(result.message);
      if (result.success) {
        setDonguriPassword('');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setDonguriActionMessage(`どんぐりログインエラー: ${message}`);
    } finally {
      setDonguriLoading(false);
    }
  }, [donguriMail, donguriPassword, setStatusMessage]);

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
    const pushLog = useStatusLogStore.getState().pushLog;
    pushLog('post', 'info', '投稿送信中...');

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
        pushLog('post', 'success', '投稿が完了しました');
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

        // Auto-refresh thread and conditionally close editor
        void refreshActiveThread();
        if (autoClose) {
          setTimeout(() => {
            closePostEditor();
          }, 800);
        }
      } else {
        // Update donguri state on relevant result types
        if (result.resultType === 'grtDonguri' || result.resultType === 'grtDngBroken') {
          await refreshDonguriDetails();
        }
        setResultMessage(`投稿失敗: ${result.resultType}`);
        setStatusMessage(`投稿失敗: ${result.resultType}`);
        pushLog('post', 'error', `投稿失敗: ${result.resultType}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setResultMessage(`エラー: ${msg}`);
      pushLog('post', 'error', `投稿エラー: ${msg}`);
    } finally {
      setPosting(false);
    }
  }, [boardUrl, threadId, name, mail, message, sambaRemaining, autoClose, setStatusMessage, saveKotehan, recordSambaTime, refreshActiveThread, closePostEditor, refreshDonguriDetails]);

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
    <>
    <TopResizeHandle onResize={handlePanelResize} />
    <div className="flex flex-col overflow-hidden bg-[var(--color-bg-secondary)]" style={{ height: panelHeight }}>
      <div className="flex shrink-0 items-center justify-between px-3 py-1">
        <span className="text-xs font-semibold text-[var(--color-text-secondary)]">書き込み</span>
        <button
          type="button"
          onClick={() => { closePostEditor(); }}
          className="rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          aria-label="閉じる"
        >
          <MdiIcon path={mdiClose} size={12} />
        </button>
      </div>
      <div className="flex-1 overflow-auto px-3 pb-3">
      {/* F35: IP privacy warning */}
      {hasExposedIps === true && (
        <div className="mb-2 flex items-center gap-2 rounded border border-[var(--color-error)] bg-[var(--color-error)]/10 px-3 py-1.5">
          <span className="text-xs font-bold text-[var(--color-error)]">⚠ プライバシー警告</span>
          <span className="text-xs text-[var(--color-text-secondary)]">
            このスレッドではIPアドレスが表示されています。書き込むとあなたのIPアドレスも公開される可能性があります。
          </span>
        </div>
      )}
      <div className="mb-2 flex flex-wrap gap-2">
        <div className="relative flex items-center gap-0.5">
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); }}
            placeholder="名前"
            className="w-32 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-2 py-1 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
          />
          {/* F30: Trip help button */}
          <button
            type="button"
            onClick={() => { setTripHelpOpen((p) => !p); }}
            className="rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-accent)]"
            title="トリップについて"
          >
            <MdiIcon path={mdiHelpCircleOutline} size={12} />
          </button>
          {tripHelpOpen && (
            <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-3 text-xs shadow-lg">
              <h4 className="mb-1 font-bold text-[var(--color-text-primary)]">トリップの使い方</h4>
              <p className="mb-1 text-[var(--color-text-secondary)]">
                名前欄に <code className="rounded bg-[var(--color-bg-tertiary)] px-1">名前#パスワード</code> と入力すると、
                パスワードからトリップ（固有ID）が生成されます。
              </p>
              <ul className="ml-3 list-disc space-y-0.5 text-[var(--color-text-muted)]">
                <li><code>#</code> の後に好きな文字列を入力</li>
                <li>8文字以下は10桁トリップ</li>
                <li>12文字以上で <code>##</code> を使うと新方式トリップ</li>
                <li>同じパスワードなら常に同じトリップになります</li>
              </ul>
              <button
                type="button"
                onClick={() => { setTripHelpOpen(false); }}
                className="mt-2 w-full rounded bg-[var(--color-bg-hover)] px-2 py-1 text-xs text-[var(--color-text-primary)]"
              >
                閉じる
              </button>
            </div>
          )}
        </div>
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
        {/* F34: Donguri status (clickable for popup) */}
        <div className="relative">
          <button
            ref={donguriButtonRef}
            type="button"
            onClick={handleToggleDonguriPopup}
            className={`flex items-center gap-1 rounded px-1 py-0.5 text-xs hover:bg-[var(--color-bg-hover)] ${
              donguriState.status === 'active' ? 'text-green-400' :
              donguriState.status === 'broken' ? 'text-[var(--color-error)]' :
              donguriState.status === 'consumed' ? 'text-[var(--color-warning)]' :
              'text-[var(--color-text-muted)]'
            }`}
            title="どんぐりステータス"
          >
            <MdiIcon path={mdiTree} size={12} />
            {donguriState.status === 'active' ? 'どんぐり' :
             donguriState.status === 'broken' ? 'どんぐり破損' :
             donguriState.status === 'consumed' ? 'どんぐり消費済み' :
             donguriState.status === 'none' ? 'どんぐり未ログイン' : ''}
          </button>
          {donguriPopupOpen && (
            <>
            <div className="fixed inset-0 z-40" onClick={() => { setDonguriPopupOpen(false); }} />
            <div
              className="fixed z-50 w-72 max-h-[80vh] overflow-y-auto rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-3 text-xs shadow-lg"
              style={{ left: donguriPopupPos.x, bottom: window.innerHeight - donguriPopupPos.y + 4 }}
            >
              <h4 className="mb-1 font-bold text-[var(--color-text-primary)]">どんぐりステータス</h4>
              {donguriLoading && (
                <p className="mb-2 text-[var(--color-text-muted)]">どんぐり状態を取得中...</p>
              )}
              <table className="w-full text-[var(--color-text-secondary)]">
                <tbody>
                  <tr>
                    <td className="pr-2 font-semibold">状態</td>
                    <td className={
                      donguriState.status === 'active' ? 'text-green-400' :
                      donguriState.status === 'broken' ? 'text-[var(--color-error)]' :
                      donguriState.status === 'consumed' ? 'text-[var(--color-warning)]' :
                      'text-[var(--color-text-muted)]'
                    }>
                      {donguriState.status === 'active' ? 'アクティブ' :
                       donguriState.status === 'broken' ? '破損' :
                       donguriState.status === 'consumed' ? '消費済み' :
                       '未ログイン'}
                    </td>
                  </tr>
                  <tr>
                    <td className="pr-2 font-semibold">ログイン</td>
                    <td>{donguriState.loggedIn === true ? '済み' : '未ログイン'}</td>
                  </tr>
                  {donguriState.loggedIn === true && donguriState.userMode !== undefined && (
                    <tr>
                      <td className="pr-2 font-semibold">モード</td>
                      <td>{donguriState.userMode}</td>
                    </tr>
                  )}
                  {donguriState.loggedIn === true && donguriState.userId !== undefined && (
                    <tr>
                      <td className="pr-2 font-semibold">ID</td>
                      <td>{donguriState.userId}</td>
                    </tr>
                  )}
                  {donguriState.loggedIn === true && donguriState.userName !== undefined && (
                    <tr>
                      <td className="pr-2 font-semibold">ユーザー名</td>
                      <td>{donguriState.userName}</td>
                    </tr>
                  )}
                  {donguriState.loggedIn === true && donguriState.level !== undefined && (
                    <tr>
                      <td className="pr-2 font-semibold">レベル</td>
                      <td>{donguriState.level}</td>
                    </tr>
                  )}
                  {donguriState.loggedIn === true && donguriState.acorn !== undefined && (
                    <tr>
                      <td className="pr-2 font-semibold">残高</td>
                      <td>{donguriState.acorn}</td>
                    </tr>
                  )}
                  {donguriState.loggedIn === true && donguriState.cannonStats !== undefined && (
                    <tr>
                      <td className="pr-2 font-semibold">大砲統計</td>
                      <td>{donguriState.cannonStats}</td>
                    </tr>
                  )}
                  {donguriState.loggedIn === true && donguriState.fightStats !== undefined && (
                    <tr>
                      <td className="pr-2 font-semibold">大乱闘統計</td>
                      <td>{donguriState.fightStats}</td>
                    </tr>
                  )}
                  {donguriState.donguriStat !== undefined && (
                    <tr>
                      <td className="pr-2 font-semibold">ヘッダ統計</td>
                      <td>{donguriState.donguriStat}</td>
                    </tr>
                  )}
                  {donguriState.message.length > 0 && (
                    <tr>
                      <td className="pr-2 font-semibold">メッセージ</td>
                      <td>{donguriState.message}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              {donguriState.loggedIn !== true && (
                <div className="mt-2 space-y-1 rounded border border-[var(--color-border-secondary)] bg-[var(--color-bg-primary)] p-2">
                  <p className="text-[10px] text-[var(--color-text-muted)]">どんぐりにログインして詳細ステータスを取得</p>
                  <input
                    type="email"
                    value={donguriMail}
                    onChange={(e) => { setDonguriMail(e.target.value); }}
                    placeholder="メールアドレス"
                    className="w-full rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-2 py-1 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
                  />
                  <input
                    type="password"
                    value={donguriPassword}
                    onChange={(e) => { setDonguriPassword(e.target.value); }}
                    placeholder="パスワード"
                    className="w-full rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-2 py-1 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => { void handleDonguriLogin(); }}
                    disabled={donguriLoading}
                    className="w-full rounded bg-[var(--color-accent)] px-2 py-1 text-xs text-white hover:opacity-90 disabled:opacity-50"
                  >
                    ログイン
                  </button>
                </div>
              )}
              {donguriActionMessage.length > 0 && (
                <p className="mt-2 text-[10px] text-[var(--color-text-secondary)]">{donguriActionMessage}</p>
              )}
              <button
                type="button"
                onClick={() => { setDonguriPopupOpen(false); }}
                className="mt-2 w-full rounded bg-[var(--color-bg-hover)] px-2 py-1 text-xs text-[var(--color-text-primary)]"
              >
                閉じる
              </button>
            </div>
            </>
          )}
        </div>
        <label className="ml-auto flex cursor-pointer items-center gap-1 text-xs text-[var(--color-text-muted)]">
          <input
            type="checkbox"
            checked={autoClose}
            onChange={(e) => {
              setAutoClose(e.target.checked);
              try { localStorage.setItem(AUTO_CLOSE_KEY, String(e.target.checked)); } catch { /* ignore */ }
            }}
            className="accent-[var(--color-accent)]"
          />
          自動で閉じる
        </label>
        <button
          type="button"
          onClick={() => { void handlePost(); }}
          disabled={isDisabled}
          className="flex items-center gap-1 rounded bg-[var(--color-accent)] px-3 py-1 text-xs text-white hover:opacity-90 disabled:opacity-50"
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
        className="w-full resize-y rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-2 py-1 text-xs leading-relaxed text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
      />
      {resultMessage.length > 0 && (
        <p className={`mt-1 text-xs ${resultMessage.includes('成功') ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
          {resultMessage}
        </p>
      )}
      </div>
    </div>
    </>
  );
}
