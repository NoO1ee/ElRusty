import { existsSync } from 'node:fs';
import { win32 } from 'node:path';

export function pairingBrowserPath(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  exists: (path: string) => boolean = existsSync,
): string | undefined {
  if (env.CHROME_PATH) return env.CHROME_PATH;
  if (platform !== 'win32') return undefined;
  const brave = [env.LOCALAPPDATA, env.PROGRAMFILES, env['PROGRAMFILES(X86)']]
    .filter((root): root is string => !!root)
    .map((root) => win32.join(root, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'));
  const edge = [env['PROGRAMFILES(X86)'], env.PROGRAMFILES]
    .filter((root): root is string => !!root)
    .map((root) => win32.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
  return [...brave, ...edge].find(exists);
}

export function pairingLaunchOptions(profile: string) {
  return {
    startingUrl: 'about:blank',
    userDataDir: profile,
    chromePath: pairingBrowserPath(),
    handleSIGINT: false,
    chromeFlags: [
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-address=127.0.0.1',
    ],
  };
}
