import { rm } from 'node:fs/promises';
import { relative, isAbsolute } from 'node:path';
import type { ChildProcess } from 'node:child_process';
interface Browser {
  process?: ChildProcess;
  kill(): unknown;
}
/** Cleanup must never turn a received authentication token into a login failure. */
export async function cleanupBrowser(
  browser: Browser | undefined,
  socket: { close(): unknown } | undefined,
  base: string,
  profile: string,
  remove: typeof rm = rm,
): Promise<boolean> {
  let socketClosed = true;
  try {
    socket?.close();
  } catch {
    socketClosed = false;
  }
  try {
    const child = browser?.process;
    const exited = !child || child.exitCode !== null || child.signalCode !== null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onClose: () => void = () => {};
    const closed = exited
      ? Promise.resolve(true)
      : new Promise<boolean>((resolve) => {
          onClose = () => resolve(true);
          child!.once('close', onClose);
          timer = setTimeout(() => resolve(false), 2000);
        });
    try {
      await browser?.kill();
    } catch {
      /* Still wait for the owned browser's close event. */
    }
    const stopped = await closed;
    clearTimeout(timer);
    child?.off('close', onClose);
    if (!stopped) return false;
    const inside = relative(base, profile);
    if (!inside || inside.startsWith('..') || isAbsolute(inside)) return false;
    await remove(profile, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 });
    return socketClosed;
  } catch {
    return false;
  }
}
