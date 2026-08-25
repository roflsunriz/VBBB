import { cleanup, render, screen } from '@testing-library/react';
import { createElement, type ComponentType } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ElectronApi } from '../../src/types/ipc';

vi.mock('../../src/renderer/hooks/use-lazy-load', () => ({
  useLazyLoad: () => ({ ref: () => undefined, isVisible: true }),
}));

const invokeMock = vi.fn();

interface ImageThumbnailTestProps {
  readonly url: string;
  readonly displayUrl: string;
  readonly requiresThumbnailResolution?: boolean;
  readonly allImageUrls?: readonly string[];
}

async function loadImageThumbnail(): Promise<ComponentType<ImageThumbnailTestProps>> {
  const modulePath = '../../src/renderer/components/thread-view/ImageThumbnail';
  const module = (await import(modulePath)) as {
    ImageThumbnail: ComponentType<ImageThumbnailTestProps>;
  };
  return module.ImageThumbnail;
}

beforeEach(() => {
  invokeMock.mockReset();
  Object.defineProperty(window, 'electronApi', {
    configurable: true,
    value: {
      invoke: invokeMock,
      sendSync: vi.fn(),
      on: vi.fn(() => () => undefined),
    } as unknown as ElectronApi,
  });
});

afterEach(() => {
  cleanup();
});

describe('ImageThumbnail Imgur album resolution', () => {
  it('resolves an album before rendering the image', async () => {
    const ImageThumbnail = await loadImageThumbnail();
    invokeMock.mockResolvedValueOnce({
      ok: true,
      thumbnailUrl: 'https://i.imgur.com/ZU1CFcJh.jpg',
    });

    render(
      createElement(ImageThumbnail, {
        url: 'https://imgur.com/a/3Txs1fv',
        displayUrl: 'https://imgur.com/a/3Txs1fv',
        requiresThumbnailResolution: true,
        allImageUrls: ['https://imgur.com/a/3Txs1fv'],
      }),
    );

    const image = await screen.findByRole('img', { name: 'https://imgur.com/a/3Txs1fv' });
    expect(image.getAttribute('src')).toBe('https://i.imgur.com/ZU1CFcJh.jpg');
    expect(invokeMock).toHaveBeenCalledWith(
      'image:resolve-thumbnail',
      'https://imgur.com/a/3Txs1fv',
    );
  });

  it('shows an actionable error when album resolution fails', async () => {
    const ImageThumbnail = await loadImageThumbnail();
    invokeMock.mockResolvedValueOnce({
      ok: false,
      errorMessage: 'Imgurアルバム内のサムネイル画像を見つけられませんでした。',
    });

    render(
      createElement(ImageThumbnail, {
        url: 'https://imgur.com/a/3Txs1fv',
        displayUrl: 'https://imgur.com/a/3Txs1fv',
        requiresThumbnailResolution: true,
      }),
    );

    const reason = await screen.findByText('Imgurアルバムのサムネイルを取得できませんでした');
    expect(reason).not.toBeNull();
    expect(
      screen.getByText('Imgurアルバム内のサムネイル画像を見つけられませんでした。'),
    ).not.toBeNull();
  });
});
