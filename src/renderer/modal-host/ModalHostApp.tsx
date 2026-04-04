import { lazy, Suspense, useEffect, useState } from 'react';
import type { MediaViewerPayload, ModalWindowInitData, ModalWindowType } from '@shared/view-ipc';
import { getStoredTheme, applyTheme } from '../components/settings/ThemeSelector';
import { MediaViewer } from '../components/thread-view/MediaViewer';

const AuthPanel = lazy(() =>
  import('../components/auth/AuthPanel').then((m) => ({ default: m.AuthPanel })),
);
const ProxySettings = lazy(() =>
  import('../components/settings/ProxySettings').then((m) => ({ default: m.ProxySettings })),
);
const RoundPanel = lazy(() =>
  import('../components/round/RoundPanel').then((m) => ({ default: m.RoundPanel })),
);
const NgEditor = lazy(() =>
  import('../components/ng-editor/NgEditor').then((m) => ({ default: m.NgEditor })),
);
const CookieManager = lazy(() =>
  import('../components/settings/CookieManager').then((m) => ({ default: m.CookieManager })),
);
const ConsoleModal = lazy(() =>
  import('../components/console/ConsoleModal').then((m) => ({ default: m.ConsoleModal })),
);
const AddBoardDialog = lazy(() =>
  import('../components/board-tree/AddBoardDialog').then((m) => ({ default: m.AddBoardDialog })),
);
const UpdateDialog = lazy(() =>
  import('../components/update/UpdateDialog').then((m) => ({ default: m.UpdateDialog })),
);
const DslEditor = lazy(() =>
  import('../components/dsl-editor/DslEditor').then((m) => ({ default: m.DslEditor })),
);
const AboutPanel = lazy(() =>
  import('../components/about/AboutPanel').then((m) => ({ default: m.AboutPanel })),
);

const onClose = (): void => {
  void window.electronApi.invoke('modal:close-self');
};

function renderModal(modalType: ModalWindowType): React.JSX.Element {
  switch (modalType) {
    case 'auth':
      return <AuthPanel onClose={onClose} />;
    case 'proxy':
      return <ProxySettings onClose={onClose} />;
    case 'round':
      return <RoundPanel onClose={onClose} />;
    case 'ng':
      return <NgEditor onClose={onClose} />;
    case 'about':
      return <AboutPanel onClose={onClose} />;
    case 'cookie-manager':
      return <CookieManager onClose={onClose} />;
    case 'console':
      return <ConsoleModal onClose={onClose} />;
    case 'add-board':
      return <AddBoardDialog onClose={onClose} />;
    case 'update':
      return <UpdateDialog onClose={onClose} />;
    case 'dsl-editor':
      return <DslEditor onClose={onClose} />;
    case 'media':
      return <div />;
  }
}

export function ModalHostApp(): React.JSX.Element {
  const [initData, setInitData] = useState<ModalWindowInitData | null>(null);

  useEffect(() => {
    applyTheme(getStoredTheme());
  }, []);

  useEffect(() => {
    void window.electronApi.invoke('modal:host-ready').then((data) => {
      setInitData(data);
    });
  }, []);

  useEffect(() => {
    return window.electronApi.on('media:update', (...args: unknown[]) => {
      const payload = args[0] as MediaViewerPayload;
      setInitData({ modalType: 'media', payload });
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        void window.electronApi.invoke('modal:close-self');
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  if (initData === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--color-bg-primary)] text-sm text-[var(--color-text-muted)]">
        読み込み中...
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-muted)]">
            読み込み中...
          </div>
        }
      >
        {initData.modalType === 'media' ? (
          <MediaViewer payload={initData.payload} onClose={onClose} />
        ) : (
          renderModal(initData.modalType)
        )}
      </Suspense>
    </div>
  );
}
