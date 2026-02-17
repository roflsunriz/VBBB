/**
 * Full-area overlay showing a large spinning refresh icon.
 * Used during scroll-triggered refresh in ThreadList / ThreadView.
 */
import { mdiRefresh } from '@mdi/js';
import { MdiIcon } from './MdiIcon';

export function RefreshOverlay(): React.JSX.Element {
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
      <MdiIcon
        path={mdiRefresh}
        size={256}
        className="animate-spin text-[var(--color-accent)] opacity-30"
      />
    </div>
  );
}
