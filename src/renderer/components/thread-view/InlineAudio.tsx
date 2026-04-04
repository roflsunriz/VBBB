import { useCallback } from 'react';

interface InlineAudioProps {
  readonly url: string;
  readonly originalUrl: string;
  readonly initialVolume: number;
}

export function InlineAudio({
  url,
  originalUrl,
  initialVolume,
}: InlineAudioProps): React.JSX.Element {
  const handleOpenPlayer = useCallback(() => {
    void window.electronApi.invoke('media:open', {
      mediaType: 'audio',
      url,
      originalUrl,
      initialVolume,
    });
  }, [initialVolume, originalUrl, url]);

  return (
    <button
      type="button"
      onClick={handleOpenPlayer}
      className="flex w-full max-w-[420px] items-center justify-between rounded border border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)] px-3 py-2 text-left text-xs hover:bg-[var(--color-bg-hover)]"
      title={originalUrl}
    >
      <span className="truncate text-[var(--color-text-primary)]">音声プレイヤーで開く</span>
      <span className="ml-3 shrink-0 text-[var(--color-text-muted)]">audio</span>
    </button>
  );
}
