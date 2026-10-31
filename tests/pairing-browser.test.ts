import { afterEach, expect, it, vi } from 'vitest';
import { win32 } from 'node:path';
import { pairingBrowserPath, pairingLaunchOptions } from '../server/pairing-launch';
const env = {
  LOCALAPPDATA: 'C:\\Users\\Player\\AppData\\Local',
  PROGRAMFILES: 'C:\\Program Files',
  'PROGRAMFILES(X86)': 'C:\\Program Files (x86)',
};
const brave = (root: string) =>
  win32.join(root, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe');
const edge = win32.join(env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe');
afterEach(() => vi.unstubAllEnvs());
it.each(Object.values(env))('hittar Brave installerat under %s', (root) => {
  const installed = brave(root);
  expect(pairingBrowserPath(env, 'win32', (p) => p === installed || p === edge)).toBe(installed);
});
it('prioriterar användarens Brave före systeminstallationerna', () => {
  expect(pairingBrowserPath(env, 'win32', () => true)).toBe(brave(env.LOCALAPPDATA));
});
it('prioriterar explicit CHROME_PATH före alla upptäckta webbläsare', () => {
  const custom = 'D:\\My Browser\\browser.exe';
  const exists = vi.fn(() => true);
  expect(pairingBrowserPath({ ...env, CHROME_PATH: custom }, 'win32', exists)).toBe(custom);
  expect(exists).not.toHaveBeenCalled();
});
it('behåller Edge som reserv när Brave saknas', () => {
  expect(pairingBrowserPath(env, 'win32', (p) => p === edge)).toBe(edge);
});
it('överlåter Chrome-upptäckten till biblioteket när inga kandidater finns', () => {
  expect(pairingBrowserPath(env, 'win32', () => false)).toBeUndefined();
  expect(pairingBrowserPath({}, 'win32', () => true)).toBeUndefined();
});
it('behåller befintligt val på andra plattformar', () => {
  const exists = vi.fn(() => true);
  expect(pairingBrowserPath(env, 'linux', exists)).toBeUndefined();
  expect(pairingBrowserPath({ CHROME_PATH: '/opt/custom-browser' }, 'linux', exists)).toBe(
    '/opt/custom-browser',
  );
  expect(exists).not.toHaveBeenCalled();
});
it('startalternativen använder enbart den tillfälliga profilen och behåller säkerhetsskydden', () => {
  vi.stubEnv(
    'CHROME_PATH',
    'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  );
  const temporary = 'C:\\Private\\pairing-browser-test';
  const options = pairingLaunchOptions(temporary);
  expect(options.chromePath).toBe(process.env.CHROME_PATH);
  expect(options.userDataDir).toBe(temporary);
  expect(options.startingUrl).toBe('about:blank');
  expect(options.chromeFlags).toEqual([
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-address=127.0.0.1',
  ]);
  expect(options.chromeFlags.join(' ')).not.toMatch(
    /disable-web-security|disable-site-isolation|no-sandbox/,
  );
});
