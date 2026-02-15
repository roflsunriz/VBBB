import { useBBSStore } from './stores/bbs-store';
import { BoardTree } from './components/board-tree/BoardTree';
import { ThreadList } from './components/thread-list/ThreadList';
import { ThreadView } from './components/thread-view/ThreadView';

export function App(): React.JSX.Element {
  const statusMessage = useBBSStore((s) => s.statusMessage);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-neutral-900 text-neutral-100">
      {/* Main 3-pane layout */}
      <div className="flex min-h-0 flex-1">
        {/* Left: Board Tree */}
        <BoardTree />

        {/* Center: Thread List */}
        <ThreadList />

        {/* Right: Thread View */}
        <ThreadView />
      </div>

      {/* Status bar */}
      <footer className="flex h-6 shrink-0 items-center border-t border-neutral-700 bg-neutral-800 px-4">
        <span className="text-xs text-neutral-500">{statusMessage}</span>
      </footer>
    </div>
  );
}
