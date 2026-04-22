import { spawn, type ChildProcess } from 'node:child_process';
import { shell } from 'electron';

export interface OpenExternalDeps {
  readonly platform?: NodeJS.Platform;
  readonly openExternalImpl?: (url: string) => Promise<void>;
  readonly spawnImpl?: typeof spawn;
}

function launchWindowsDefaultBrowser(url: string, spawnImpl: typeof spawn): Promise<void> {
  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawnImpl(
      'rundll32.exe',
      ['url.dll,FileProtocolHandler', url],
      {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      },
    );

    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

export async function openExternalUrl(url: string, deps: OpenExternalDeps = {}): Promise<void> {
  const platform = deps.platform ?? process.platform;
  const openExternalImpl = deps.openExternalImpl ?? shell.openExternal;
  const spawnImpl = deps.spawnImpl ?? spawn;

  if (platform === 'win32') {
    try {
      await launchWindowsDefaultBrowser(url, spawnImpl);
      return;
    } catch {
      await openExternalImpl(url);
      return;
    }
  }

  await openExternalImpl(url);
}
