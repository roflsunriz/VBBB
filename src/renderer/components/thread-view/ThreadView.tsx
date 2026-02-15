/**
 * Thread view panel (右ペイン).
 * Displays thread responses with tabs for multiple threads.
 */
import { useCallback, useRef, useEffect } from 'react';
import { mdiClose, mdiPencil } from '@mdi/js';
import type { Res } from '@shared/domain';
import { useBBSStore } from '../../stores/bbs-store';
import { MdiIcon } from '../common/MdiIcon';
import { sanitizeHtml } from '../../hooks/use-sanitize';
import { PostEditor } from '../post-editor/PostEditor';

function ResItem({ res }: { readonly res: Res }): React.JSX.Element {
  return (
    <div className="border-b border-neutral-800/50 px-4 py-2" id={`res-${String(res.number)}`}>
      <div className="mb-1 flex flex-wrap items-baseline gap-2 text-xs">
        <span className="font-bold text-green-400">{res.number}</span>
        <span className="text-green-300" dangerouslySetInnerHTML={{ __html: sanitizeHtml(res.name) }} />
        {res.mail.length > 0 && (
          <span className="text-neutral-500">[{res.mail}]</span>
        )}
        <span className="text-neutral-600">{res.dateTime}</span>
      </div>
      <div
        className="text-sm leading-relaxed text-neutral-300"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(res.body) }}
      />
    </div>
  );
}

export function ThreadView(): React.JSX.Element {
  const tabs = useBBSStore((s) => s.tabs);
  const activeTabId = useBBSStore((s) => s.activeTabId);
  const closeTab = useBBSStore((s) => s.closeTab);
  const setActiveTab = useBBSStore((s) => s.setActiveTab);
  const postEditorOpen = useBBSStore((s) => s.postEditorOpen);
  const togglePostEditor = useBBSStore((s) => s.togglePostEditor);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Scroll to top when tab changes
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [activeTabId]);

  const handleCloseTab = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      e.stopPropagation();
      closeTab(tabId);
    },
    [closeTab],
  );

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      {/* Tab bar */}
      <div className="flex h-8 items-center border-b border-neutral-700 bg-neutral-800">
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => { setActiveTab(tab.id); }}
              className={`group flex max-w-48 shrink-0 items-center gap-1 rounded-t px-2 py-1 text-xs ${
                tab.id === activeTabId
                  ? 'bg-neutral-700 text-neutral-200'
                  : 'text-neutral-500 hover:bg-neutral-700/50 hover:text-neutral-400'
              }`}
            >
              <span className="truncate">{tab.title}</span>
              <button
                type="button"
                onClick={(e) => { handleCloseTab(e, tab.id); }}
                className="ml-1 rounded p-0.5 opacity-0 hover:bg-neutral-600 group-hover:opacity-100"
                aria-label="タブを閉じる"
              >
                <MdiIcon path={mdiClose} size={10} />
              </button>
            </button>
          ))}
        </div>
        {activeTab !== undefined && (
          <button
            type="button"
            onClick={togglePostEditor}
            className={`mr-2 rounded p-1 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200 ${
              postEditorOpen ? 'bg-neutral-700 text-blue-400' : ''
            }`}
            title="書き込み"
          >
            <MdiIcon path={mdiPencil} size={14} />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex min-h-0 flex-1 flex-col">
        {activeTab === undefined ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-xs text-neutral-500">スレッドを選択してください</p>
          </div>
        ) : (
          <>
            {/* Thread title */}
            <div className="border-b border-neutral-700/50 bg-neutral-800/30 px-4 py-1.5">
              <h2 className="text-sm font-medium text-neutral-200">{activeTab.title}</h2>
              <p className="text-xs text-neutral-500">{activeTab.responses.length} レス</p>
            </div>

            {/* Responses */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto">
              {activeTab.responses.map((res) => (
                <ResItem key={res.number} res={res} />
              ))}
            </div>

            {/* Post editor */}
            {postEditorOpen && (
              <PostEditor boardUrl={activeTab.boardUrl} threadId={activeTab.threadId} />
            )}
          </>
        )}
      </div>
    </section>
  );
}
