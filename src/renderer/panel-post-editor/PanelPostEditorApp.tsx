/**
 * Panel wrapper for PostEditor in a standalone BrowserWindow.
 * Fetches init data from main process and renders PostEditor.
 */
import { useEffect, useState } from 'react';
import type { PanelWindowInitData } from '@shared/view-ipc';
import { PostEditor } from '../components/post-editor/PostEditor';

export function PanelPostEditorApp(): React.JSX.Element {
  const [initData, setInitData] = useState<PanelWindowInitData | null>(null);

  useEffect(() => {
    void window.electronApi.invoke('panel:ready').then((data) => {
      setInitData(data);
    });
  }, []);

  if (initData === null) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-400">
        読み込み中...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PostEditor
        boardUrl={initData.boardUrl}
        threadId={initData.threadId}
        initialMessage={initData.initialMessage ?? ''}
        hasExposedIps={initData.hasExposedIps}
        standalone
        onClose={() => {
          window.close();
        }}
      />
    </div>
  );
}
