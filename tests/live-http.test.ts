import type { PairingManager } from '../server/pairing';
import { vi } from 'vitest';
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
async function setup(pairing?: PairingManager) {
  const db = new LiveDB(':memory:'),
    s = new LiveService(db, () => new EventEmitter() as never);
  const server = createLiveHttp(
    s,
    { start: async () => {}, stop: async () => {} },
    { port: 0, pairing },
  );
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

it('parningsknappar kräver CSRF innan ett jobb startas', async () => {
  const start = vi.fn(),
    cancel = vi.fn(async () => {}),
    accept = vi.fn(async () => ({ id: 'new' }));
  const { call } = await setup({
    start,
    register: async () => start('register'),
    enable: () => start('listen'),
    cancel,
    accept,
    acceptDevice: accept,
    dismissDevice: cancel,
  } as unknown as PairingManager);
  expect((await call('pairing/register', 'POST', {})).status).toBe(403);
  expect((await call('pairing/device/accept', 'POST', { id: 'device' })).status).toBe(403);
  expect((await call('pairing/device/dismiss', 'POST', { id: 'dismiss' })).status).toBe(403);
  expect(cancel).not.toHaveBeenCalled();
  expect(accept).not.toHaveBeenCalled();
  expect(start).not.toHaveBeenCalled();
  const { data } = await call('state');
  const headers = { 'X-ElRusty-CSRF': data.csrf };
  expect((await call('pairing/register', 'POST', {}, headers)).status).toBe(200);
  expect(start).toHaveBeenCalledWith('register');
  expect((await call('pairing/listen', 'POST', {}, headers)).status).toBe(200);
  expect(start).toHaveBeenCalledWith('listen');
  expect((await call('pairing/cancel', 'POST', {}, headers)).status).toBe(200);
  expect(cancel).toHaveBeenCalledOnce();
  expect((await call('pairing/accept', 'POST', { id: 'candidate' }, headers)).data).toEqual({
    id: 'new',
  });
  expect(accept).toHaveBeenCalledWith('candidate');
  expect((await call('pairing/device/accept', 'POST', { id: 'device' }, headers)).status).toBe(200);
  expect(accept).toHaveBeenCalledWith('device');
  expect((await call('pairing/device/dismiss', 'POST', { id: 'dismiss' }, headers)).status).toBe(
    200,
  );
  expect(cancel).toHaveBeenCalledWith('dismiss');
});

it('timer-API kräver CSRF, validerar och ignorerar falsk skapare/profil från klienten', async () => {
  const { s, call } = await setup();
  const { data } = await call('state'),
    headers = { 'X-ElRusty-CSRF': data.csrf };
  const id = s.saveProfile({
    name: 'Timer server',
    host: 'localhost',
    port: 1,
    playerId: '76561198000000000',
    playerToken: 123,
  });
  s.config.activeProfileId = id;
  expect((await call('timers', 'POST', { name: 'Oil Rig', duration: '15m' })).status).toBe(403);
  expect((await call('timers', 'POST', { name: 'Invalid', duration: '9s' }, headers)).status).toBe(
    400,
  );
  const created = await call(
    'timers',
    'POST',
    { name: 'Oil Rig', duration: '15m', creatorId: 'stranger', profileId: 'foreign' },
    headers,
  );
  expect(created.status).toBe(200);
  expect(created.data).toMatchObject({
    creatorId: '76561198000000000',
    profileId: id,
    state: 'active',
  });
  const other = s.saveProfile({
    name: 'Other',
    host: 'localhost',
    port: 2,
    playerId: '76561198000000000',
    playerToken: 123,
  });
  s.config.activeProfileId = other;
  expect((await call('timers/cancel', 'POST', { id: created.data.id }, headers)).status).toBe(400);
  s.config.activeProfileId = id;
  expect(
    (await call('timers/cancel', 'POST', { id: created.data.shortId }, headers)).data.state,
  ).toBe('cancelled');
  expect((await call('state')).data.timers[0].state).toBe('cancelled');
});

it('Discord-behörighets-API kräver CSRF och bevarar token, guild och aktiverad bot', async () => {
  const { s, call } = await setup();
  s.config.discord = {
    guildId: '123456789012345678',
    channelId: '',
    token: 'secret',
    userIds: [],
    roleIds: [],
    enabled: true,
  };
  const body = { userIds: ['123456789012345679'], roleIds: [] };
  expect((await call('discord/access', 'POST', body)).status).toBe(403);
  const { data } = await call('state');
  expect((await call('discord/access', 'POST', body, { 'X-ElRusty-CSRF': data.csrf })).status).toBe(
    200,
  );
  expect(s.config.discord).toMatchObject({
    ...body,
    enabled: true,
    token: 'secret',
    guildId: '123456789012345678',
  });
});

it('lagchatt kräver CSRF och avvisar utskick när Rust är frånkopplat', async () => {
  const { s, call } = await setup();
  const send = vi.spyOn(s.chat, 'send');
  const payload = { clientId: 'browser-message', text: 'Hej' };
  expect((await call('teamchat/send', 'POST', payload)).status).toBe(403);
  expect(send).not.toHaveBeenCalled();
  const { data } = await call('state');
  expect(
    (await call('teamchat/send', 'POST', payload, { 'X-ElRusty-CSRF': data.csrf })).status,
  ).not.toBe(200);
});
