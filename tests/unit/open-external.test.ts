import { beforeEach, describe, expect, it, vi } from 'vitest';

const shellMock = {
  openExternal: vi.fn<(_: string) => Promise<void>>().mockResolvedValue(undefined),
};

vi.mock('electron', () => ({
  shell: shellMock,
}));

describe('openExternalUrl', () => {
  beforeEach(() => {
    shellMock.openExternal.mockClear();
  });

  it('uses Windows default browser launch path on win32', async () => {
    const openExternalImpl = vi.fn<(_: string) => Promise<void>>().mockResolvedValue(undefined);
    const child = {
      once: vi.fn((event: string, handler: () => void) => {
        if (event === 'spawn') {
          queueMicrotask(handler);
        }
        return child;
      }),
      unref: vi.fn(),
    };
    const spawnImpl = vi.fn().mockReturnValue(child);
    const { openExternalUrl } = await import('../../src/main/services/open-external');

    await openExternalUrl('https://example.com/', {
      platform: 'win32',
      openExternalImpl,
      spawnImpl: spawnImpl as never,
    });

    expect(spawnImpl).toHaveBeenCalledWith(
      'rundll32.exe',
      ['url.dll,FileProtocolHandler', 'https://example.com/'],
      expect.objectContaining({
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      }),
    );
    expect(child.unref).toHaveBeenCalled();
    expect(openExternalImpl).not.toHaveBeenCalled();
  });

  it('falls back to shell.openExternal when Windows launch helper fails', async () => {
    const openExternalImpl = vi.fn<(_: string) => Promise<void>>().mockResolvedValue(undefined);
    const child = {
      once: vi.fn((event: string, handler: (error?: Error) => void) => {
        if (event === 'error') {
          queueMicrotask(() => {
            handler(new Error('spawn failed'));
          });
        }
        return child;
      }),
      unref: vi.fn(),
    };
    const spawnImpl = vi.fn().mockReturnValue(child);
    const { openExternalUrl } = await import('../../src/main/services/open-external');

    await openExternalUrl('https://example.com/', {
      platform: 'win32',
      openExternalImpl,
      spawnImpl: spawnImpl as never,
    });

    expect(openExternalImpl).toHaveBeenCalledWith('https://example.com/');
  });

  it('uses shell.openExternal on non-Windows platforms', async () => {
    const openExternalImpl = vi.fn<(_: string) => Promise<void>>().mockResolvedValue(undefined);
    const spawnImpl = vi.fn();
    const { openExternalUrl } = await import('../../src/main/services/open-external');

    await openExternalUrl('https://example.com/', {
      platform: 'linux',
      openExternalImpl,
      spawnImpl: spawnImpl as never,
    });

    expect(openExternalImpl).toHaveBeenCalledWith('https://example.com/');
    expect(spawnImpl).not.toHaveBeenCalled();
  });
});
