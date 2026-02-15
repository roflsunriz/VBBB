/**
 * Post editor component.
 * Sends responses via IPC to the main process post service.
 */
import { useState, useCallback } from 'react';
import { mdiSend, mdiLoading } from '@mdi/js';
import { useBBSStore } from '../../stores/bbs-store';
import { MdiIcon } from '../common/MdiIcon';

interface PostEditorProps {
  readonly boardUrl: string;
  readonly threadId: string;
}

export function PostEditor({ boardUrl, threadId }: PostEditorProps): React.JSX.Element {
  const [name, setName] = useState('');
  const [mail, setMail] = useState('sage');
  const [message, setMessage] = useState('');
  const [posting, setPosting] = useState(false);
  const [resultMessage, setResultMessage] = useState('');
  const setStatusMessage = useBBSStore((s) => s.setStatusMessage);

  const handlePost = useCallback(async () => {
    if (message.trim().length === 0) {
      setResultMessage('本文を入力してください');
      return;
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
      } else {
        setResultMessage(`投稿失敗: ${result.resultType}`);
        setStatusMessage(`投稿失敗: ${result.resultType}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setResultMessage(`エラー: ${msg}`);
    } finally {
      setPosting(false);
    }
  }, [boardUrl, threadId, name, mail, message, setStatusMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        void handlePost();
      }
    },
    [handlePost],
  );

  return (
    <div className="border-t border-neutral-700 bg-neutral-800 p-3">
      <div className="mb-2 flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); }}
          placeholder="名前"
          className="w-32 rounded border border-neutral-600 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 placeholder:text-neutral-600 focus:border-blue-500 focus:outline-none"
        />
        <input
          type="text"
          value={mail}
          onChange={(e) => { setMail(e.target.value); }}
          placeholder="メール"
          className="w-32 rounded border border-neutral-600 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 placeholder:text-neutral-600 focus:border-blue-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => { void handlePost(); }}
          disabled={posting || message.trim().length === 0}
          className="ml-auto flex items-center gap-1 rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-500 disabled:opacity-50"
        >
          <MdiIcon path={posting ? mdiLoading : mdiSend} size={12} className={posting ? 'animate-spin' : ''} />
          書き込む
        </button>
      </div>
      <textarea
        value={message}
        onChange={(e) => { setMessage(e.target.value); }}
        onKeyDown={handleKeyDown}
        placeholder="本文を入力 (Ctrl+Enter で送信)"
        rows={4}
        className="w-full resize-none rounded border border-neutral-600 bg-neutral-900 px-2 py-1 text-xs leading-relaxed text-neutral-200 placeholder:text-neutral-600 focus:border-blue-500 focus:outline-none"
      />
      {resultMessage.length > 0 && (
        <p className={`mt-1 text-xs ${resultMessage.includes('成功') ? 'text-green-400' : 'text-red-400'}`}>
          {resultMessage}
        </p>
      )}
    </div>
  );
}
