import { afterEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cleanupBrowser } from '../server/pairing-cleanup';
import { safeFailure, pairingFailureMessage } from '../server/pairing-errors';
const base = join(tmpdir(), 'elrusty-cleanup-test'),
  profile = join(base, 'pairing-browser-owned');
afterEach(() => vi.useRealTimers());
function runningChild() {
  const child = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null });
  return child as unknown as ChildProcess;
}
it('väntar på att webbläsaren stängts innan profilfilerna tas bort', async () => {
  const child = runningChild(),
    remove = vi.fn(async () => {}),
    socket = { close: vi.fn() },
    browser = { process: child, kill: vi.fn() };
  const result = cleanupBrowser(browser, socket, base, profile, remove);
  expect(remove).not.toHaveBeenCalled();
  child.emit('close', 0);
  expect(await result).toBe(true);
  expect(remove).toHaveBeenCalledWith(profile, {
    recursive: true,
    force: true,
    maxRetries: 6,
    retryDelay: 100,
  });
  expect(socket.close).toHaveBeenCalledOnce();
});
it('låsta Windows-filer returnerar varning, aldrig ett inloggningsfel', async () => {
  const remove = vi.fn(async () => {
    throw Object.assign(Error('private-path-and-secret'), { code: 'EBUSY' });
  });
  await expect(cleanupBrowser(undefined, undefined, base, profile, remove)).resolves.toBe(false);
});
it('raderar inte profilfiler medan webbläsaren fortfarande körs', async () => {
  vi.useFakeTimers();
  const child = runningChild(),
    remove = vi.fn(async () => {});
  const result = cleanupBrowser(
    {
      process: child,
      kill: () => {
        throw Error('kill failed');
      },
    },
    undefined,
    base,
    profile,
    remove,
  );
  await vi.advanceTimersByTimeAsync(2000);
  expect(await result).toBe(false);
  expect(remove).not.toHaveBeenCalled();
  expect(child.listenerCount('close')).toBe(0);
});
it('tillåter inte att städningen går utanför den privata katalogen', async () => {
  const remove = vi.fn(async () => {});
  expect(
    await cleanupBrowser(undefined, undefined, base, join(base, '..', 'other-profile'), remove),
  ).toBe(false);
  expect(remove).not.toHaveBeenCalled();
});
it('redan stängd webbläsare kan städas även om kill inte längre fungerar', async () => {
  const child = Object.assign(runningChild(), { exitCode: 0 }),
    remove = vi.fn(async () => {});
  expect(
    await cleanupBrowser(
      {
        process: child,
        kill: () => {
          throw Error();
        },
      },
      undefined,
      base,
      profile,
      remove,
    ),
  ).toBe(true);
});
it('felrapporteringen tar bara med steg och tillåtna statuskoder', () => {
  const failure = safeFailure('companion', {
    message: 'secret',
    response: { status: 401, data: { Token: 'secret' } },
    config: { headers: { Authorization: 'secret' } },
  });
  expect(failure).toEqual({ step: 'companion', httpStatus: 401 });
  expect(JSON.stringify(failure)).not.toContain('secret');
  expect(pairingFailureMessage(failure, 'register')).toContain('Inloggningen mottogs');
  expect(pairingFailureMessage(failure, 'register')).toContain('HTTP 401');
  expect(
    pairingFailureMessage(safeFailure('save', { code: 'EPERM', path: 'private-path' }), 'register'),
  ).toContain('EPERM');
  expect(
    pairingFailureMessage(
      { step: 'browser', fileCode: 'secret', httpStatus: Infinity },
      'register',
    ),
  ).not.toContain('secret');
});
