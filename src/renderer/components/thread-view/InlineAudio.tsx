import { useCallback, useRef, useState } from 'react';
import { useStatusLogStore } from '../../stores/status-log-store';

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
  const [hasError, setHasError] = useState(false);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const audioRef = useCallback(
    (el: HTMLAudioElement | null) => {
      audioElRef.current = el;
      if (el !== null) {
        el.volume = Math.min(1, Math.max(0, initialVolume));
      }
    },
    [initialVolume],
  );

  const handleError = useCallback(() => {
    console.warn(`[InlineAudio] 音声読み込みエラー — url: ${url} / originalUrl: ${originalUrl}`);
    setHasError(true);
    useStatusLogStore.getState().pushLog('media', 'error', `音声読み込みエラー: ${originalUrl}`);
  }, [url, originalUrl]);

  const handleOpenExternal = useCallback(() => {
    void window.electronApi.invoke('shell:open-external', originalUrl);
  }, [originalUrl]);

  if (hasError) {
    return (
      <button
        type="button"
        onClick={handleOpenExternal}
        className="inline-block rounded border border-[var(--color-border-secondary)] bg-[var(--color-bg-tertiary)] px-2 py-1 text-xs text-[var(--color-text-muted)] hover:underline"
        title="外部ブラウザで開く"
      >
        [音声読み込みエラー: {originalUrl}]
      </button>
    );
  }

  return (
    <audio
      ref={audioRef}
      src={url}
      controls
      preload="metadata"
      onError={handleError}
      className="h-8 max-w-[320px] rounded border border-[var(--color-border-secondary)]"
    />
  );
}
