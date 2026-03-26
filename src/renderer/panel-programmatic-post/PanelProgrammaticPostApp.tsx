/**
 * Panel wrapper for ProgrammaticPost in a standalone BrowserWindow.
 */
import { useEffect, useState } from 'react';
import type { PanelWindowInitData } from '@shared/view-ipc';
import { ProgrammaticPost } from '../components/post-editor/ProgrammaticPost';

export function PanelProgrammaticPostApp(): React.JSX.Element {
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
      <ProgrammaticPost
        boardUrl={initData.boardUrl}
        threadId={initData.threadId}
        standalone
        onClose={() => {
          window.close();
        }}
      />
    </div>
  );
}
