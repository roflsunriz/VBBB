import { useCallback, useEffect, useRef, useState } from 'react';
import { useLazyLoad } from '../../hooks/use-lazy-load';
import { useStatusLogStore } from '../../stores/status-log-store';
import {
  buildMediaErrorDetail,
  getMediaElementErrorDetail,
  type MediaErrorDetail,
} from '../../utils/media-error-detail';

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
  const { ref, isVisible } = useLazyLoad<HTMLDivElement>({ rootMargin: '1200px 0px' });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [errorDetail, setErrorDetail] = useState<MediaErrorDetail | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio === null) return;
    audio.volume = Math.min(1, Math.max(0, initialVolume));
  }, [initialVolume, isVisible]);

  const handleOpenPlayer = useCallback(() => {
    void window.electronApi.invoke('media:open', {
      mediaType: 'audio',
      url,
      originalUrl,
      initialVolume,
    });
  }, [initialVolume, originalUrl, url]);

  const handleOpenExternal = useCallback(() => {
    void window.electronApi.invoke('shell:open-external', originalUrl);
  }, [originalUrl]);

  const handleError = useCallback(() => {
    console.warn(`[InlineAudio] 音声読み込みエラー — url: ${url}`);
    useStatusLogStore.getState().pushLog('media', 'error', `音声読み込みエラー: ${url}`);
    setErrorDetail({
      title: '音声読み込みエラー',
      reason: '原因を確認中です',
      detail: 'URLへ到達できるか、サーバー応答を確認しています。',
      url,
    });
    void buildMediaErrorDetail(
      '音声読み込みエラー',
      url,
      'audio',
      getMediaElementErrorDetail(audioRef.current),
    ).then(setErrorDetail);
  }, [url]);

  return (
    <div
      ref={ref}
      className="w-full max-w-[520px] rounded border border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)] px-3 py-2"
      title={originalUrl}
    >
      {isVisible ? (
        errorDetail !== null ? (
          <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold text-[var(--color-text-primary)]">
              {errorDetail.title}
            </div>
            <div className="text-xs text-[var(--color-text-muted)]">{errorDetail.reason}</div>
            <div className="break-words text-[10px] text-[var(--color-text-muted)]">
              {errorDetail.detail}
            </div>
            <div className="break-all text-[10px] text-[var(--color-text-muted)]">
              {errorDetail.url}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleOpenPlayer}
                className="rounded border border-[var(--color-border-primary)] px-2 py-1 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
              >
                プレイヤーで開く
              </button>
              <button
                type="button"
                onClick={handleOpenExternal}
                className="rounded border border-[var(--color-border-primary)] px-2 py-1 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
              >
                外部で開く
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <audio
              ref={audioRef}
              src={url}
              controls
              preload="metadata"
              onError={handleError}
              className="w-full"
            />
            {originalUrl !== url && (
              <div className="break-all text-[10px] text-[var(--color-text-muted)]">
                {originalUrl}
              </div>
            )}
          </div>
        )
      ) : (
        <div className="h-9 animate-pulse rounded bg-[var(--color-bg-tertiary)]" />
      )}
    </div>
  );
}
