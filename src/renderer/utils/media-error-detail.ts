export interface MediaErrorDetail {
  readonly title: string;
  readonly reason: string;
  readonly detail: string;
  readonly url: string;
}

export function getMediaElementErrorDetail(media: HTMLMediaElement | null): string | undefined {
  const code = media?.error?.code;
  switch (code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return 'ブラウザ側で読み込みが中断されました。';
    case MediaError.MEDIA_ERR_NETWORK:
      return '再生中または読み込み中にネットワークエラーが発生しました。';
    case MediaError.MEDIA_ERR_DECODE:
      return 'ファイルの破損、コーデック非対応、またはデコード失敗の可能性があります。';
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return 'ブラウザがこのURLまたはメディア形式を再生対象として扱えませんでした。';
    default:
      return undefined;
  }
}

export async function buildMediaErrorDetail(
  title: string,
  url: string,
  expectedType: 'image' | 'video' | 'audio',
  elementDetail?: string | undefined,
): Promise<MediaErrorDetail> {
  try {
    const probe = await window.electronApi.invoke('media:probe-url', url, expectedType);
    const detail =
      elementDetail !== undefined
        ? `${probe.detail} / ブラウザ側の詳細: ${elementDetail}`
        : probe.detail;
    return {
      title,
      reason: probe.reason,
      detail,
      url,
    };
  } catch (err) {
    return {
      title,
      reason: '原因の追加調査に失敗しました',
      detail: err instanceof Error ? err.message : String(err),
      url,
    };
  }
}
