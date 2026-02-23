/**
 * Form-based DSL editor modal.
 * Users fill in structured fields to build a .vbbs script.
 * The generated DSL source is shown in a live preview panel.
 */
import { useState, useCallback, useRef, useMemo } from 'react';
import {
  mdiClose,
  mdiPlus,
  mdiDelete,
  mdiFileUpload,
  mdiContentSave,
  mdiContentCopy,
  mdiDownload,
  mdiChevronDown,
  mdiChevronUp,
} from '@mdi/js';
import { MdiIcon } from '../common/MdiIcon';
import { generateDslSource } from '../../utils/dsl-generator';
import { parseDslScript, DSL_SPEC_TEXT } from '../../utils/dsl-parser';
import type { DslFormData, DslFormPost } from '../../../types/dsl';

interface DslEditorProps {
  readonly onClose: () => void;
}

function createEmptyPost(): DslFormPost {
  return {
    id: crypto.randomUUID(),
    name: '',
    mail: 'sage',
    message: '',
    repeat: 1,
    intervalSec: undefined,
  };
}

function formDataFromDefaults(): DslFormData {
  return {
    scheduleAt: '',
    countdownSec: undefined,
    posts: [createEmptyPost()],
  };
}

export function DslEditor({ onClose }: DslEditorProps): React.JSX.Element {
  const [formData, setFormData] = useState<DslFormData>(formDataFromDefaults);

  const [useSchedule, setUseSchedule] = useState(false);
  const [useCountdown, setUseCountdown] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [collapsedPosts, setCollapsedPosts] = useState<ReadonlySet<string>>(new Set());

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const dslSource = useMemo(() => {
    const validPosts = formData.posts.filter((p) => p.message.trim().length > 0);
    if (validPosts.length === 0) return '';
    return generateDslSource({ ...formData, posts: validPosts });
  }, [formData]);

  // --- Global settings ---
  const handleScheduleToggle = useCallback((checked: boolean) => {
    setUseSchedule(checked);
    if (!checked) {
      setFormData((prev) => ({ ...prev, scheduleAt: '' }));
    }
  }, []);

  const handleCountdownToggle = useCallback((checked: boolean) => {
    setUseCountdown(checked);
    if (!checked) {
      setFormData((prev) => ({ ...prev, countdownSec: undefined }));
    }
  }, []);

  const handleScheduleChange = useCallback((value: string) => {
    setFormData((prev) => ({ ...prev, scheduleAt: value }));
  }, []);

  const handleCountdownChange = useCallback((value: number) => {
    setFormData((prev) => ({ ...prev, countdownSec: value > 0 ? value : undefined }));
  }, []);

  // --- Post block management ---
  const handleAddPost = useCallback(() => {
    setFormData((prev) => ({ ...prev, posts: [...prev.posts, createEmptyPost()] }));
  }, []);

  const handleRemovePost = useCallback((postId: string) => {
    setFormData((prev) => {
      if (prev.posts.length <= 1) return prev;
      return { ...prev, posts: prev.posts.filter((p) => p.id !== postId) };
    });
    setCollapsedPosts((prev) => {
      const next = new Set(prev);
      next.delete(postId);
      return next;
    });
  }, []);

  const handleUpdatePost = useCallback(
    <K extends keyof DslFormPost>(postId: string, field: K, value: DslFormPost[K]) => {
      setFormData((prev) => ({
        ...prev,
        posts: prev.posts.map((p) => (p.id === postId ? { ...p, [field]: value } : p)),
      }));
    },
    [],
  );

  const togglePostCollapse = useCallback((postId: string) => {
    setCollapsedPosts((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
  }, []);

  // --- File operations ---
  const handleOpenFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file === undefined) return;
    setLoadError('');

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      const result = parseDslScript(text);
      if (!result.ok) {
        setLoadError(
          result.errors
            .map((err) => (err.line > 0 ? `行${String(err.line)}: ${err.message}` : err.message))
            .join('\n'),
        );
        return;
      }

      const script = result.script;
      const hasSchedule = script.scheduleAt !== undefined;
      const hasCountdown = script.countdownSec !== undefined && script.countdownSec > 0;

      setUseSchedule(hasSchedule);
      setUseCountdown(hasCountdown);
      setCollapsedPosts(new Set());

      setFormData({
        scheduleAt: hasSchedule ? script.scheduleAt.toISOString().slice(0, 16) : '',
        countdownSec: hasCountdown ? script.countdownSec : undefined,
        posts: script.posts.map((p) => ({
          id: crypto.randomUUID(),
          name: p.name,
          mail: p.mail,
          message: p.message,
          repeat: p.repeat,
          intervalSec: p.intervalSec,
        })),
      });
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  }, []);

  const handleSaveFile = useCallback(() => {
    if (dslSource.length === 0) return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    void window.electronApi.invoke('dsl:save-file', dslSource, `script-${timestamp}.vbbs`);
  }, [dslSource]);

  const handleCopyToClipboard = useCallback(() => {
    if (dslSource.length === 0) return;
    void navigator.clipboard.writeText(dslSource).then(() => {
      setCopyFeedback(true);
      setTimeout(() => {
        setCopyFeedback(false);
      }, 1500);
    });
  }, [dslSource]);

  const handleDownloadSpec = useCallback(() => {
    const blob = new Blob([DSL_SPEC_TEXT], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vbbb-dsl-spec.txt';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleReset = useCallback(() => {
    setFormData(formDataFromDefaults());
    setUseSchedule(false);
    setUseCountdown(false);
    setLoadError('');
    setCollapsedPosts(new Set());
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border-primary)] px-4 py-2">
        <h2 className="text-sm font-bold text-[var(--color-text-primary)]">DSL エディタ</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          aria-label="閉じる"
        >
          <MdiIcon path={mdiClose} size={16} />
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--color-border-primary)] px-4 py-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".vbbs,.txt"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          type="button"
          onClick={handleOpenFile}
          className="flex items-center gap-1 rounded border border-[var(--color-border-primary)] px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
        >
          <MdiIcon path={mdiFileUpload} size={12} />
          ファイルを開く
        </button>
        <button
          type="button"
          onClick={handleSaveFile}
          disabled={dslSource.length === 0}
          className="flex items-center gap-1 rounded border border-[var(--color-border-primary)] px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] disabled:opacity-40"
        >
          <MdiIcon path={mdiContentSave} size={12} />
          名前を付けて保存
        </button>
        <button
          type="button"
          onClick={handleCopyToClipboard}
          disabled={dslSource.length === 0}
          className="flex items-center gap-1 rounded border border-[var(--color-border-primary)] px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] disabled:opacity-40"
        >
          <MdiIcon path={mdiContentCopy} size={12} />
          {copyFeedback ? 'コピーしました' : 'コピー'}
        </button>
        <button
          type="button"
          onClick={handleDownloadSpec}
          className="flex items-center gap-1 rounded border border-[var(--color-border-primary)] px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]"
        >
          <MdiIcon path={mdiDownload} size={12} />
          DSL仕様書
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleReset}
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
        >
          リセット
        </button>
      </div>

      {/* Load error */}
      {loadError.length > 0 && (
        <div className="shrink-0 border-b border-[var(--color-error)] bg-[var(--color-bg-primary)] px-4 py-2">
          {loadError.split('\n').map((line, i) => (
            <p key={i} className="text-xs text-[var(--color-error)]">
              {line}
            </p>
          ))}
        </div>
      )}

      {/* Main content: form + preview */}
      <div className="flex min-h-0 flex-1">
        {/* Form panel */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto border-r border-[var(--color-border-primary)] px-4 py-3">
          {/* Global settings */}
          <fieldset className="mb-4">
            <legend className="mb-2 text-xs font-semibold text-[var(--color-text-secondary)]">
              グローバル設定
            </legend>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                <input
                  type="checkbox"
                  checked={useSchedule}
                  onChange={(e) => {
                    handleScheduleToggle(e.target.checked);
                  }}
                  className="accent-[var(--color-accent)]"
                />
                SCHEDULE（開始日時）
              </label>
              {useSchedule && (
                <input
                  type="datetime-local"
                  value={formData.scheduleAt}
                  onChange={(e) => {
                    handleScheduleChange(e.target.value);
                  }}
                  className="ml-6 w-56 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-2 py-1 text-xs text-[var(--color-text-primary)] focus:outline-none"
                />
              )}

              <label className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                <input
                  type="checkbox"
                  checked={useCountdown}
                  onChange={(e) => {
                    handleCountdownToggle(e.target.checked);
                  }}
                  className="accent-[var(--color-accent)]"
                />
                COUNTDOWN（待機秒数）
              </label>
              {useCountdown && (
                <div className="ml-6 flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    value={formData.countdownSec ?? ''}
                    onChange={(e) => {
                      handleCountdownChange(Number(e.target.value));
                    }}
                    className="w-20 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-2 py-1 text-xs text-[var(--color-text-primary)] focus:outline-none"
                    placeholder="秒"
                  />
                  <span className="text-xs text-[var(--color-text-muted)]">秒</span>
                </div>
              )}
            </div>
          </fieldset>

          {/* Post blocks */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--color-text-secondary)]">
              投稿ブロック
            </span>
            <button
              type="button"
              onClick={handleAddPost}
              className="flex items-center gap-1 rounded border border-dashed border-[var(--color-border-primary)] px-2 py-0.5 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]"
            >
              <MdiIcon path={mdiPlus} size={10} />
              ブロック追加
            </button>
          </div>

          <div className="mt-2 flex flex-col gap-3">
            {formData.posts.map((post, idx) => {
              const isCollapsed = collapsedPosts.has(post.id);
              const postLabel =
                post.message.trim().length > 0
                  ? post.message.trim().slice(0, 20) +
                    (post.message.trim().length > 20 ? '...' : '')
                  : '(未入力)';
              return (
                <div
                  key={post.id}
                  className="rounded border border-[var(--color-border-secondary)] bg-[var(--color-bg-primary)] p-3"
                >
                  {/* Block header */}
                  <div className="mb-2 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        togglePostCollapse(post.id);
                      }}
                      className="flex items-center gap-1 text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                    >
                      <MdiIcon path={isCollapsed ? mdiChevronDown : mdiChevronUp} size={14} />
                      <span>POST #{String(idx + 1)}</span>
                      {isCollapsed && (
                        <span className="ml-2 font-normal text-[var(--color-text-muted)]">
                          {postLabel}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleRemovePost(post.id);
                      }}
                      disabled={formData.posts.length <= 1}
                      className="rounded p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-error)] disabled:opacity-30"
                      aria-label="ブロック削除"
                    >
                      <MdiIcon path={mdiDelete} size={12} />
                    </button>
                  </div>

                  {/* Block fields */}
                  {!isCollapsed && (
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[10px] text-[var(--color-text-muted)]">NAME</span>
                          <input
                            type="text"
                            value={post.name}
                            onChange={(e) => {
                              handleUpdatePost(post.id, 'name', e.target.value);
                            }}
                            placeholder="名前（空欄=名無し）"
                            className="w-36 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-2 py-1 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
                          />
                        </label>
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[10px] text-[var(--color-text-muted)]">MAIL</span>
                          <input
                            type="text"
                            value={post.mail}
                            onChange={(e) => {
                              handleUpdatePost(post.id, 'mail', e.target.value);
                            }}
                            placeholder="メール（例: sage）"
                            className="w-36 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-2 py-1 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
                          />
                        </label>
                      </div>

                      <div className="flex gap-2">
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[10px] text-[var(--color-text-muted)]">REPEAT</span>
                          <input
                            type="number"
                            min={1}
                            value={post.repeat}
                            onChange={(e) => {
                              handleUpdatePost(
                                post.id,
                                'repeat',
                                Math.max(1, Number(e.target.value)),
                              );
                            }}
                            className="w-20 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-2 py-1 text-xs text-[var(--color-text-primary)] focus:outline-none"
                          />
                        </label>
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[10px] text-[var(--color-text-muted)]">
                            INTERVAL（秒）
                          </span>
                          <input
                            type="number"
                            min={0}
                            value={post.intervalSec ?? ''}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              handleUpdatePost(
                                post.id,
                                'intervalSec',
                                Number.isFinite(v) && v > 0 ? v : undefined,
                              );
                            }}
                            placeholder="なし"
                            className="w-20 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-2 py-1 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
                          />
                        </label>
                      </div>

                      <label className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-[var(--color-text-muted)]">
                          MESSAGE（必須）
                        </span>
                        <textarea
                          value={post.message}
                          onChange={(e) => {
                            handleUpdatePost(post.id, 'message', e.target.value);
                          }}
                          placeholder="投稿本文を入力"
                          rows={3}
                          className="w-full resize-y rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-2 py-1 text-xs leading-relaxed text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
                        />
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Preview panel */}
        <div className="flex w-[320px] shrink-0 flex-col bg-[var(--color-bg-primary)] px-4 py-3">
          <span className="mb-2 text-xs font-semibold text-[var(--color-text-secondary)]">
            DSL ソースプレビュー
          </span>
          <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-all rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-2 font-mono text-xs leading-relaxed text-[var(--color-text-primary)]">
            {dslSource.length > 0
              ? dslSource
              : '(投稿ブロックの MESSAGE を入力するとプレビューが表示されます)'}
          </pre>
        </div>
      </div>
    </div>
  );
}
