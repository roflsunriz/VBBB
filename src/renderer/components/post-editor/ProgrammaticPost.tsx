/**
 * Programmatic posting panel.
 *
 * Two modes:
 *  - Manual: schedule / interval / countdown / repeat / batch fields (existing)
 *  - DSL: load a .vbbs script file and execute it
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import {
  mdiPlay,
  mdiStop,
  mdiPlus,
  mdiDelete,
  mdiClose,
  mdiFileUpload,
  mdiDownload,
} from '@mdi/js';
import { MdiIcon } from '../common/MdiIcon';
import { TopResizeHandle } from '../common/TopResizeHandle';
import { parseDslScript, DSL_SPEC_TEXT } from '../../utils/dsl-parser';
import type { DslScript } from '../../../types/dsl';

interface ProgrammaticPostProps {
  readonly boardUrl: string;
  readonly threadId: string;
  readonly onClose: () => void;
}

interface BatchEntry {
  readonly id: string;
  name: string;
  mail: string;
  message: string;
}

type PanelMode = 'manual' | 'dsl';

export function ProgrammaticPost({
  boardUrl,
  threadId,
  onClose,
}: ProgrammaticPostProps): React.JSX.Element {
  const [mode, setMode] = useState<PanelMode>('manual');

  // --- Manual mode: condition toggles ---
  const [useSchedule, setUseSchedule] = useState(false);
  const [useInterval, setUseInterval] = useState(false);
  const [useCountdown, setUseCountdown] = useState(false);
  const [useRepeat, setUseRepeat] = useState(false);
  const [useBatch, setUseBatch] = useState(false);

  // --- Manual mode: condition values ---
  const [scheduledTime, setScheduledTime] = useState('');
  const [intervalSec, setIntervalSec] = useState(60);
  const [countdownSec, setCountdownSec] = useState(10);
  const [repeatCount, setRepeatCount] = useState(3);

  // --- Manual mode: single post fields ---
  const [name, setName] = useState('');
  const [mail, setMail] = useState('sage');
  const [message, setMessage] = useState('');

  // --- Manual mode: batch entries ---
  const [batchEntries, setBatchEntries] = useState<BatchEntry[]>([]);

  // --- DSL mode ---
  const [dslSource, setDslSource] = useState('');
  const [dslParseError, setDslParseError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // --- Shared execution state ---
  const [running, setRunning] = useState(false);
  const [logLines, setLogLines] = useState<readonly string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef(false);

  const [panelHeight, setPanelHeight] = useState(288);
  const handlePanelResize = useCallback((deltaY: number) => {
    setPanelHeight((prev) => Math.max(176, Math.min(window.innerHeight * 0.7, prev - deltaY)));
  }, []);

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString('ja-JP');
    setLogLines((prev) => [...prev, `[${ts}] ${msg}`]);
  }, []);

  // --- Manual mode: batch helpers ---
  const handleAddBatch = useCallback(() => {
    setBatchEntries((prev) => [
      ...prev,
      { id: String(Date.now()), name: '', mail: 'sage', message: '' },
    ]);
  }, []);

  const handleRemoveBatch = useCallback((id: string) => {
    setBatchEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const handleUpdateBatch = useCallback(
    (id: string, field: 'name' | 'mail' | 'message', value: string) => {
      setBatchEntries((prev) => prev.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
    },
    [],
  );

  /** Execute a single post via IPC */
  const doPost = useCallback(
    async (n: string, m: string, msg: string): Promise<boolean> => {
      try {
        const result = await window.electronApi.invoke('bbs:post', {
          boardUrl,
          threadId,
          name: n,
          mail: m,
          message: msg,
        });
        if (result.success) {
          addLog(`投稿成功: "${msg.slice(0, 30)}${msg.length > 30 ? '…' : ''}"`);
          return true;
        }
        addLog(`投稿失敗: ${result.resultType}`);
        return false;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        addLog(`エラー: ${errMsg}`);
        return false;
      }
    },
    [boardUrl, threadId, addLog],
  );

  const handleStop = useCallback(() => {
    abortRef.current = true;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setRunning(false);
    addLog('停止しました');
  }, [addLog]);

  // Cleanup on unmount
  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    },
    [],
  );

  const waitMs = useCallback(
    (ms: number): Promise<void> =>
      new Promise<void>((resolve) => {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          resolve();
        }, ms);
      }),
    [],
  );

  // --- DSL mode: file loading ---
  const handleOpenFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file === undefined) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setDslSource(text);
      setDslParseError('');
      setLogLines([]);
    };
    reader.readAsText(file, 'utf-8');
    // Reset so the same file can be re-selected
    e.target.value = '';
  }, []);

  const handleDownloadSpec = useCallback(() => {
    const blob = new Blob([DSL_SPEC_TEXT], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vbbb-dsl-spec.txt';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // --- Manual mode execution ---
  const handleStartManual = useCallback(async () => {
    abortRef.current = false;
    setRunning(true);
    setLogLines([]);
    addLog('開始...');

    const items: { name: string; mail: string; message: string }[] = [];
    if (useBatch && batchEntries.length > 0) {
      for (const entry of batchEntries) {
        items.push({ name: entry.name, mail: entry.mail, message: entry.message });
      }
    } else if (useRepeat) {
      for (let i = 0; i < repeatCount; i++) {
        items.push({ name, mail, message });
      }
    } else {
      items.push({ name, mail, message });
    }

    if (useSchedule && scheduledTime.length > 0) {
      const targetDate = new Date(scheduledTime);
      const delay = targetDate.getTime() - Date.now();
      if (delay > 0) {
        addLog(`指定時刻まで待機中: ${targetDate.toLocaleTimeString('ja-JP')}`);
        await waitMs(delay);
        if (abortRef.current) {
          setRunning(false);
          return;
        }
      }
    }

    if (useCountdown && countdownSec > 0) {
      addLog(`カウントダウン: ${String(countdownSec)}秒`);
      await waitMs(countdownSec * 1000);
      if (abortRef.current) {
        setRunning(false);
        return;
      }
    }

    for (let i = 0; i < items.length; i++) {
      if (abortRef.current) break;
      const item = items[i];
      if (item === undefined) continue;
      addLog(`投稿 ${String(i + 1)}/${String(items.length)}...`);
      await doPost(item.name, item.mail, item.message);

      if (useInterval && intervalSec > 0 && i < items.length - 1) {
        addLog(`次の投稿まで ${String(intervalSec)}秒待機...`);
        await waitMs(intervalSec * 1000);
        if (abortRef.current) break;
      }
    }

    if (!abortRef.current) addLog('完了');
    setRunning(false);
  }, [
    useBatch,
    batchEntries,
    useRepeat,
    repeatCount,
    useSchedule,
    scheduledTime,
    useCountdown,
    countdownSec,
    useInterval,
    intervalSec,
    name,
    mail,
    message,
    doPost,
    addLog,
    waitMs,
  ]);

  /** Execute a fully-parsed DSL script */
  const executeDslScript = useCallback(
    async (script: DslScript): Promise<void> => {
      if (script.scheduleAt !== undefined) {
        const delay = script.scheduleAt.getTime() - Date.now();
        if (delay > 0) {
          addLog(`指定時刻まで待機中: ${script.scheduleAt.toLocaleString('ja-JP')}`);
          await waitMs(delay);
          if (abortRef.current) return;
        }
      }

      if (script.countdownSec !== undefined && script.countdownSec > 0) {
        addLog(`カウントダウン: ${String(script.countdownSec)}秒`);
        await waitMs(script.countdownSec * 1000);
        if (abortRef.current) return;
      }

      // Expand all posts with repeat into a flat execution list
      const flatPosts: Array<{
        name: string;
        mail: string;
        message: string;
        intervalSec: number | undefined;
        isLast: boolean;
      }> = [];
      for (const post of script.posts) {
        for (let r = 0; r < post.repeat; r++) {
          flatPosts.push({
            name: post.name,
            mail: post.mail,
            message: post.message,
            intervalSec: post.intervalSec,
            isLast: false,
          });
        }
      }
      // Mark the last entry so we don't wait after it
      if (flatPosts.length > 0) {
        const last = flatPosts[flatPosts.length - 1];
        if (last !== undefined) {
          flatPosts[flatPosts.length - 1] = { ...last, isLast: true };
        }
      }

      for (let i = 0; i < flatPosts.length; i++) {
        if (abortRef.current) break;
        const post = flatPosts[i];
        if (post === undefined) continue;

        addLog(`投稿 ${String(i + 1)}/${String(flatPosts.length)}...`);
        await doPost(post.name, post.mail, post.message);

        if (!post.isLast && post.intervalSec !== undefined && post.intervalSec > 0) {
          addLog(`次の投稿まで ${String(post.intervalSec)}秒待機...`);
          await waitMs(post.intervalSec * 1000);
          if (abortRef.current) break;
        }
      }
    },
    [addLog, waitMs, doPost],
  );

  // --- DSL mode execution ---
  const handleStartDsl = useCallback(async () => {
    setDslParseError('');

    if (dslSource.trim().length === 0) {
      setDslParseError('スクリプトが空です。.vbbs ファイルを読み込んでください。');
      return;
    }

    const result = parseDslScript(dslSource);
    if (!result.ok) {
      setDslParseError(
        result.errors
          .map((e) => (e.line > 0 ? `行${String(e.line)}: ${e.message}` : e.message))
          .join('\n'),
      );
      return;
    }

    abortRef.current = false;
    setRunning(true);
    setLogLines([]);
    addLog('DSLスクリプト開始...');

    await executeDslScript(result.script);

    if (!abortRef.current) addLog('完了');
    setRunning(false);
  }, [dslSource, addLog, executeDslScript]);

  const handleStart = useCallback(() => {
    if (mode === 'dsl') {
      void handleStartDsl();
    } else {
      void handleStartManual();
    }
  }, [mode, handleStartDsl, handleStartManual]);

  return (
    <>
      <TopResizeHandle onResize={handlePanelResize} />
      <div
        className="flex flex-col overflow-hidden bg-[var(--color-bg-secondary)]"
        style={{ height: panelHeight }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-3 py-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[var(--color-text-secondary)]">
              プログラマティック書き込み
            </span>
            <span className="text-[10px] text-[var(--color-text-muted)]">
              ({boardUrl} / {threadId})
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
            aria-label="閉じる"
          >
            <MdiIcon path={mdiClose} size={12} />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex shrink-0 gap-0 border-b border-[var(--color-border-primary)] px-3">
          {(['manual', 'dsl'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
              }}
              className={[
                'px-3 py-1 text-xs transition-colors',
                mode === m
                  ? 'border-b-2 border-[var(--color-accent)] font-semibold text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
              ].join(' ')}
            >
              {m === 'manual' ? '手動' : 'DSL'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto px-3 pb-3 pt-2">
          {mode === 'manual' ? (
            <>
              {/* Manual: condition toggles */}
              <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <label className="flex cursor-pointer items-center gap-1 text-[var(--color-text-secondary)]">
                  <input
                    type="checkbox"
                    checked={useSchedule}
                    onChange={(e) => {
                      setUseSchedule(e.target.checked);
                    }}
                    className="accent-[var(--color-accent)]"
                  />
                  指定日時
                </label>
                <label className="flex cursor-pointer items-center gap-1 text-[var(--color-text-secondary)]">
                  <input
                    type="checkbox"
                    checked={useInterval}
                    onChange={(e) => {
                      setUseInterval(e.target.checked);
                    }}
                    className="accent-[var(--color-accent)]"
                  />
                  間隔指定
                </label>
                <label className="flex cursor-pointer items-center gap-1 text-[var(--color-text-secondary)]">
                  <input
                    type="checkbox"
                    checked={useCountdown}
                    onChange={(e) => {
                      setUseCountdown(e.target.checked);
                    }}
                    className="accent-[var(--color-accent)]"
                  />
                  カウントダウン
                </label>
                <label className="flex cursor-pointer items-center gap-1 text-[var(--color-text-secondary)]">
                  <input
                    type="checkbox"
                    checked={useRepeat}
                    onChange={(e) => {
                      setUseRepeat(e.target.checked);
                      if (e.target.checked) setUseBatch(false);
                    }}
                    className="accent-[var(--color-accent)]"
                  />
                  繰り返し
                </label>
                <label className="flex cursor-pointer items-center gap-1 text-[var(--color-text-secondary)]">
                  <input
                    type="checkbox"
                    checked={useBatch}
                    onChange={(e) => {
                      setUseBatch(e.target.checked);
                      if (e.target.checked) setUseRepeat(false);
                    }}
                    className="accent-[var(--color-accent)]"
                  />
                  バッチ投稿
                </label>
              </div>

              {/* Manual: condition values */}
              <div className="mb-2 flex flex-wrap gap-2">
                {useSchedule && (
                  <input
                    type="datetime-local"
                    value={scheduledTime}
                    onChange={(e) => {
                      setScheduledTime(e.target.value);
                    }}
                    className="rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-2 py-0.5 text-xs text-[var(--color-text-primary)] focus:outline-none"
                  />
                )}
                {useInterval && (
                  <label className="flex items-center gap-1 text-xs text-[var(--color-text-secondary)]">
                    間隔
                    <input
                      type="number"
                      min={1}
                      value={intervalSec}
                      onChange={(e) => {
                        setIntervalSec(Number(e.target.value));
                      }}
                      className="w-16 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-1 py-0.5 text-xs text-[var(--color-text-primary)] focus:outline-none"
                    />
                    秒
                  </label>
                )}
                {useCountdown && (
                  <label className="flex items-center gap-1 text-xs text-[var(--color-text-secondary)]">
                    カウントダウン
                    <input
                      type="number"
                      min={1}
                      value={countdownSec}
                      onChange={(e) => {
                        setCountdownSec(Number(e.target.value));
                      }}
                      className="w-16 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-1 py-0.5 text-xs text-[var(--color-text-primary)] focus:outline-none"
                    />
                    秒
                  </label>
                )}
                {useRepeat && (
                  <label className="flex items-center gap-1 text-xs text-[var(--color-text-secondary)]">
                    繰り返し
                    <input
                      type="number"
                      min={1}
                      value={repeatCount}
                      onChange={(e) => {
                        setRepeatCount(Number(e.target.value));
                      }}
                      className="w-16 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-1 py-0.5 text-xs text-[var(--color-text-primary)] focus:outline-none"
                    />
                    回
                  </label>
                )}
              </div>

              {/* Manual: single post fields */}
              {!useBatch && (
                <div className="mb-2 flex flex-col gap-1">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                      }}
                      placeholder="名前"
                      className="w-32 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-2 py-0.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
                    />
                    <input
                      type="text"
                      value={mail}
                      onChange={(e) => {
                        setMail(e.target.value);
                      }}
                      placeholder="メール"
                      className="w-32 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-2 py-0.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
                    />
                  </div>
                  <textarea
                    value={message}
                    onChange={(e) => {
                      setMessage(e.target.value);
                    }}
                    placeholder="本文"
                    rows={2}
                    className="w-full resize-y rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-2 py-0.5 text-xs leading-relaxed text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
                  />
                </div>
              )}

              {/* Manual: batch entries */}
              {useBatch && (
                <div className="mb-2 space-y-1">
                  {batchEntries.map((entry, i) => (
                    <div
                      key={entry.id}
                      className="flex items-start gap-1 rounded border border-[var(--color-border-secondary)] bg-[var(--color-bg-primary)] p-1"
                    >
                      <span className="mt-1 shrink-0 text-[10px] text-[var(--color-text-muted)]">
                        #{String(i + 1)}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex gap-1">
                          <input
                            type="text"
                            value={entry.name}
                            onChange={(e) => {
                              handleUpdateBatch(entry.id, 'name', e.target.value);
                            }}
                            placeholder="名前"
                            className="w-24 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-1 py-0.5 text-[10px] text-[var(--color-text-primary)] focus:outline-none"
                          />
                          <input
                            type="text"
                            value={entry.mail}
                            onChange={(e) => {
                              handleUpdateBatch(entry.id, 'mail', e.target.value);
                            }}
                            placeholder="メール"
                            className="w-24 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-1 py-0.5 text-[10px] text-[var(--color-text-primary)] focus:outline-none"
                          />
                        </div>
                        <textarea
                          value={entry.message}
                          onChange={(e) => {
                            handleUpdateBatch(entry.id, 'message', e.target.value);
                          }}
                          placeholder="本文"
                          rows={1}
                          className="w-full resize-y rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-1 py-0.5 text-[10px] leading-relaxed text-[var(--color-text-primary)] focus:outline-none"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          handleRemoveBatch(entry.id);
                        }}
                        className="mt-1 shrink-0 rounded p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-error)]"
                      >
                        <MdiIcon path={mdiDelete} size={10} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={handleAddBatch}
                    className="flex items-center gap-1 rounded border border-dashed border-[var(--color-border-primary)] px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]"
                  >
                    <MdiIcon path={mdiPlus} size={10} />
                    エントリを追加
                  </button>
                </div>
              )}
            </>
          ) : (
            /* DSL mode */
            <>
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".vbbs,.txt"
                className="hidden"
                onChange={handleFileChange}
              />

              {/* DSL toolbar */}
              <div className="mb-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenFile}
                  disabled={running}
                  className="flex items-center gap-1 rounded border border-[var(--color-border-primary)] px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] disabled:opacity-50"
                >
                  <MdiIcon path={mdiFileUpload} size={12} />
                  ファイルを開く
                </button>
                <button
                  type="button"
                  onClick={handleDownloadSpec}
                  className="flex items-center gap-1 rounded border border-[var(--color-border-primary)] px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]"
                >
                  <MdiIcon path={mdiDownload} size={12} />
                  DSL仕様書
                </button>
                {dslSource.trim().length > 0 && (
                  <span className="text-[10px] text-[var(--color-text-muted)]">
                    スクリプト読み込み済み
                  </span>
                )}
              </div>

              {/* Parse error */}
              {dslParseError.length > 0 && (
                <div className="mb-1 rounded border border-[var(--color-error)] bg-[var(--color-bg-primary)] p-1">
                  {dslParseError.split('\n').map((line, i) => (
                    <p key={i} className="text-[10px] text-[var(--color-error)]">
                      {line}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Controls (shared) */}
          <div className="mb-1 flex items-center gap-2">
            {!running ? (
              <button
                type="button"
                onClick={handleStart}
                className="flex items-center gap-1 rounded bg-[var(--color-accent)] px-3 py-1 text-xs text-white hover:opacity-90"
              >
                <MdiIcon path={mdiPlay} size={12} />
                実行
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStop}
                className="flex items-center gap-1 rounded bg-[var(--color-error)] px-3 py-1 text-xs text-white hover:opacity-90"
              >
                <MdiIcon path={mdiStop} size={12} />
                停止
              </button>
            )}
          </div>

          {/* Log output (shared) */}
          {logLines.length > 0 && (
            <div className="max-h-24 overflow-y-auto rounded border border-[var(--color-border-secondary)] bg-[var(--color-bg-primary)] p-1">
              {logLines.map((line, i) => (
                <p key={i} className="text-[10px] text-[var(--color-text-muted)]">
                  {line}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
