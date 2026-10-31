import { cleanupBrowser } from './pairing-cleanup.ts';
import { pairingLaunchOptions } from './pairing-launch.ts';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { AUTH_ORIGIN, authBridgeScript, authFromBinding } from './pairing-protocol.ts';
const deps = createRequire(createRequire(import.meta.url).resolve('@liamcottle/rustplus.js'));
export async function browserAuth(
  configFile: string,
  signal: AbortSignal,
  onCleanupWarning?: () => void,
): Promise<string> {
  const launcher = deps('chrome-launcher'),
    WebSocket = deps('ws');
  const base = dirname(configFile),
    profile = await mkdtemp(join(base, 'pairing-browser-'));
  let chrome: any, socket: any;
  try {
    signal.throwIfAborted();
    chrome = await launcher.launch(pairingLaunchOptions(profile));
    signal.throwIfAborted();
    const pages = (await (
      await fetch(`http://127.0.0.1:${chrome.port}/json/list`, { signal })
    ).json()) as any[];
    const page = pages.find((p) => p.type === 'page' && p.url === 'about:blank');
    if (!page?.webSocketDebuggerUrl) throw Error('Inloggningsfönstret saknas.');
    socket = new WebSocket(page.webSocketDebuggerUrl);
    return await new Promise<string>((resolve, reject) => {
      let sequence = 0;
      const waiting = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>(),
        contexts = new Map<number, { origin: string; isDefault: boolean }>();
      const send = (method: string, params: unknown = {}) =>
        new Promise<any>((res, rej) => {
          const id = ++sequence;
          waiting.set(id, { resolve: res, reject: rej });
          socket.send(JSON.stringify({ id, method, params }));
        });
      const abort = () => {
        for (const w of waiting.values()) w.reject(Error('Avbruten.'));
        waiting.clear();
        reject(Error('Avbruten.'));
      };
      signal.addEventListener('abort', abort, { once: true });
      const finish = () => signal.removeEventListener('abort', abort);
      socket.on('close', () => {
        finish();
        abort();
      });
      socket.on('error', () => {
        finish();
        abort();
      });
      socket.on('message', (raw: Buffer) => {
        try {
          const m = JSON.parse(raw.toString());
          if (m.id) {
            const w = waiting.get(m.id);
            waiting.delete(m.id);
            if (m.error) w?.reject(Error('Inloggningen kunde inte förberedas.'));
            else w?.resolve(m.result);
          }
          if (m.method === 'Runtime.executionContextCreated') {
            const c = m.params.context;
            contexts.set(c.id, { origin: c.origin, isDefault: c.auxData?.isDefault === true });
          }
          if (m.method === 'Runtime.executionContextDestroyed')
            contexts.delete(m.params.executionContextId);
          if (m.method === 'Runtime.executionContextsCleared') contexts.clear();
          if (m.method === 'Runtime.bindingCalled' && m.params.name === 'elrustyAuth') {
            const c = contexts.get(m.params.executionContextId);
            const token = authFromBinding(c?.origin || '', !!c?.isDefault, m.params.payload);
            if (token) {
              finish();
              resolve(token);
            }
          }
        } catch {
          finish();
          reject(Error('Ogiltigt inloggningssvar.'));
        }
      });
      socket.on(
        'open',
        () =>
          void (async () => {
            await send('Runtime.enable');
            await send('Page.enable');
            await send('Runtime.addBinding', { name: 'elrustyAuth' });
            await send('Page.addScriptToEvaluateOnNewDocument', { source: authBridgeScript });
            await send('Page.navigate', { url: AUTH_ORIGIN + '/login' });
          })().catch(() => {
            finish();
            reject(Error('Kunde inte öppna inloggningen.'));
          }),
      );
    });
  } finally {
    const cleaned = await cleanupBrowser(chrome, socket, base, profile);
    if (!cleaned) {
      try {
        onCleanupWarning?.();
      } catch {
        /* Diagnostics cannot replace the auth result. */
      }
    }
  }
}
