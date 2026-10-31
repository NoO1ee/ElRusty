import { afterEach, expect, it, vi } from 'vitest';
import { WebSocketServer } from 'ws';
import protobuf from 'protobufjs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { RustConnection } from '../server/rust';
const require = createRequire(import.meta.url);
const clients: RustConnection[] = [],
  servers: WebSocketServer[] = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const c of clients.splice(0)) c.close();
  for (const s of servers.splice(0)) {
    for (const c of s.clients) c.terminate();
    await new Promise<void>((r) => s.close(() => r()));
  }
});
async function setup() {
  const schema = await protobuf.load(
    join(dirname(require.resolve('@liamcottle/rustplus.js')), 'rustplus.proto'),
  );
  const Request = schema.lookupType('rustplus.AppRequest'),
    Message = schema.lookupType('rustplus.AppMessage');
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  servers.push(server);
  await new Promise<void>((r) => server.on('listening', r));
  const port = (server.address() as { port: number }).port,
    requests: any[] = [];
  server.on('connection', (socket) =>
    socket.on('message', (data) => {
      const request = Request.toObject(Request.decode(new Uint8Array(data as Buffer)), {
        longs: String,
      });
      requests.push(request);
      let response: any = { seq: request.seq };
      if (request.getInfo)
        response.info = {
          name: 'Local Rust fixture',
          headerImage: '',
          url: '',
          map: 'Procedural',
          mapSize: 3500,
          wipeTime: 0,
          players: 1,
          maxPlayers: 100,
          queuedPlayers: 0,
        };
      if (request.getTeamInfo)
        response.teamInfo = {
          leaderSteamId: '76561198000000000',
          members: [
            {
              steamId: '76561198000000000',
              name: 'Owner',
              x: 1,
              y: 2,
              isOnline: true,
              spawnTime: 0,
              isAlive: true,
              deathTime: 0,
            },
          ],
        };
      if (request.getTime)
        response.time = { dayLengthMinutes: 60, timeScale: 1, sunrise: 8, sunset: 18, time: 18.7 };
      if (request.getEntityInfo) response.entityInfo = { type: 1, payload: { value: true } };
      if (request.setEntityValue || request.sendTeamMessage) response.success = {};
      if (request.entityId === 99) response.error = { error: 'secret-token-must-not-leak' };
      socket.send(Message.encode(Message.fromObject({ response })).finish());
    }),
  );
  const client = new RustConnection({
    id: 'test',
    name: 'test',
    host: '127.0.0.1',
    port,
    playerId: '76561198000000000',
    playerToken: 123,
    useProxy: false,
  });
  clients.push(client);
  await client.open();
  return { client, server, Message, requests };
}
it('använder bibliotekets riktiga WebSocket/protobuf för autentiserade anrop', async () => {
  const { client, requests } = await setup();
  await client.info();
  expect((await client.team())[0].steamId).toBe('76561198000000000');
  expect(await client.time()).toBeCloseTo(18.7);
  expect(await client.entity(1)).toMatchObject({ type: 'switch', value: true });
  await client.set(1, false);
  await client.chat('[ElRusty] Speltid: 18:42');
  expect(requests.every((r) => r.playerId === '76561198000000000' && r.playerToken === 123)).toBe(
    true,
  );
  expect(requests.find((r) => r.sendTeamMessage).sendTeamMessage.message).toBe(
    '[ElRusty] Speltid: 18:42',
  );
  await expect(client.entity(99)).rejects.not.toThrow('secret-token-must-not-leak');
});
it('översätter nya chatt- och enhetshändelser och avbryter anrop vid stängning', async () => {
  const { client, server, Message } = await setup();
  const incoming = new Promise<any>((r) => client.once('chat', r));
  for (const socket of server.clients)
    socket.send(
      Message.encode(
        Message.fromObject({
          broadcast: {
            teamMessage: {
              message: {
                steamId: '76561198000000000',
                name: 'Owner',
                message: '!time',
                color: '',
                time: 123,
              },
            },
          },
        }),
      ).finish(),
    );
  expect(await incoming).toEqual({ steamId: '76561198000000000', message: '!time', time: 123 });
  const pending = client.time();
  client.close();
  await expect(pending).rejects.toThrow('Frånkopplad');
});
it('ger timeout när protokollservern inte svarar', async () => {
  const { client, server } = await setup();
  for (const socket of server.clients) socket.removeAllListeners('message');
  vi.useFakeTimers();
  const check = expect(client.time()).rejects.toThrow('svarade inte i tid');
  await vi.advanceTimersByTimeAsync(8000);
  await check;
});
