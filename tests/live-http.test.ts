import { afterEach, expect, it } from 'vitest';
import { request } from 'node:http';
import { EventEmitter } from 'node:events';
import { LiveDB } from '../server/db';
import { LiveService } from '../server/service';
import { createLiveHttp } from '../server/http';
const resources: { close: () => Promise<void> }[] = [];
afterEach(async () => {
  for (const r of resources.splice(0)) await r.close();
});
async function setup() {
  const db = new LiveDB(':memory:'),
    s = new LiveService(db, () => new EventEmitter() as never);
  const server = createLiveHttp(s, { start: async () => {}, stop: async () => {} }, { port: 0 });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  resources.push({
    close: async () => {
      s.close();
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
      db.close();
    },
  });
  const call = (
    path: string,
    method = 'GET',
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    new Promise<{ status: number; data: any }>((resolve, reject) => {
      const req = request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/api/live/' + path,
          method,
          headers: { Host: '127.0.0.1:0', 'Content-Type': 'application/json', ...headers },
        },
        (res) => {
          let raw = '';
          res.on('data', (chunk) => (raw += chunk));
          res.on('end', () => resolve({ status: res.statusCode!, data: JSON.parse(raw) }));
        },
      );
      req.on('error', reject);
      req.end(body ? JSON.stringify(body) : undefined);
    });
  return { s, call, port };
}
it('kräver CSRF, kontrollerar Host/Origin och döljer token i API-svaret', async () => {
  const { call } = await setup();
  const state = await call('state');
  expect(state.status).toBe(200);
  const body = {
    name: 'Test',
    host: '1.2.3.4',
    port: 28082,
    playerId: '76561198000000000',
    playerToken: 882299,
  };
  expect((await call('profile', 'POST', body)).status).toBe(403);
  expect(
    (
      await call('profile', 'POST', body, {
        'X-ElRusty-CSRF': state.data.csrf,
        Origin: 'https://evil.example',
      })
    ).status,
  ).toBe(403);
  expect((await call('state', 'GET', undefined, { Host: 'evil.example' })).status).toBe(403);
  expect((await call('profile', 'POST', body, { 'X-ElRusty-CSRF': state.data.csrf })).status).toBe(
    200,
  );
  const saved = await call('state');
  expect(saved.data.profiles).toHaveLength(1);
  expect(JSON.stringify(saved.data)).not.toContain('882299');
  expect(saved.data.profiles[0]).not.toHaveProperty('playerToken');
});
it('felaktig import skriver inte över befintlig profil', async () => {
  const { call } = await setup();
  const { data } = await call('state');
  const headers = { 'X-ElRusty-CSRF': data.csrf };
  const result = await call(
    'profile',
    'POST',
    { name: 'A', host: '1.2.3.4', port: 28082, playerId: '76561198000000000', playerToken: 1 },
    headers,
  );
  expect((await call('profile', 'POST', { id: result.data.id, name: 'Bad' }, headers)).status).toBe(
    400,
  );
  const saved = await call('state');
  expect(saved.data.profiles[0].name).toBe('A');
});
it('SSE skickar initial status och nya ändringar utan privata token', async () => {
  const { s, port } = await setup();
  const messages: any[] = [];
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('SSE-timeout')), 2000);
    const req = request(
      { hostname: '127.0.0.1', port, path: '/api/live/events', headers: { Host: '127.0.0.1:0' } },
      (res) => {
        expect(res.headers['content-type']).toBe('text/event-stream');
        let buffer = '';
        res.on('data', (chunk) => {
          buffer += chunk;
          let boundary: number;
          while ((boundary = buffer.indexOf('\n\n')) >= 0) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            if (!frame.startsWith('data: ')) continue;
            messages.push(JSON.parse(frame.slice(6)));
            if (messages.length === 1)
              s.saveProfile({
                name: 'Stream profile',
                host: '127.0.0.1',
                port: 28082,
                playerId: '76561198000000000',
                playerToken: 998877,
              });
            if (messages.length === 2) {
              clearTimeout(timer);
              res.destroy();
              resolve();
            }
          }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
  expect(messages[0].profiles).toEqual([]);
  expect(messages[1].profiles[0].name).toBe('Stream profile');
  expect(JSON.stringify(messages)).not.toContain('998877');
});
