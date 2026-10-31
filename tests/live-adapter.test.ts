import RustPlus from '@liamcottle/rustplus.js';
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
  vi.restoreAllMocks();
  for (const c of clients.splice(0)) c.close();
  for (const s of servers.splice(0)) {
    for (const c of s.clients) c.terminate();
    await new Promise<void>((r) => s.close(() => r()));
  }
});
async function setup(omitQueuedPlayers = false, omitNoteType = false) {
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
          ...(omitQueuedPlayers ? {} : { queuedPlayers: 0 }),
        };
      if (request.getTeamInfo)
        response.teamInfo = {
          ...(omitNoteType ? {} : { leaderSteamId: '76561198000000000' }),
          mapNotes: omitNoteType ? [{ x: 125, y: 250 }] : [],
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
  return { client, server, Message, requests, schema };
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
  expect(await incoming).toEqual({
    name: 'Owner',
    steamId: '76561198000000000',
    message: '!time',
    time: 123,
  });
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

it('accepterar serversvar utan queuedPlayers och fortsätter med team och tid', async () => {
  const { client, schema } = await setup(true);
  const fields = schema.lookupType('rustplus.AppInfo').fields;
  expect(fields.queuedPlayers.id).toBe(9);
  expect(fields.queuedPlayers.type).toBe('uint32');
  expect(fields.queuedPlayers.required).toBe(false);
  expect(fields.name.required).toBe(true);
  expect(fields.players.required).toBe(true);
  await expect(client.info()).resolves.toMatchObject({ name: 'Local Rust fixture' });
  expect((await client.team())[0].name).toBe('Owner');
  expect(await client.time()).toBeCloseTo(18.7);
});
it('trasig protobuf avbryter väntande anrop och signalerar förlust en gång utan processkrasch', async () => {
  const { client, server } = await setup();
  const lost = vi.fn();
  client.on('lost', lost);
  for (const socket of server.clients) socket.removeAllListeners('message');
  const check = expect(client.time()).rejects.toThrow('Frånkopplad');
  for (const socket of server.clients) socket.send(Buffer.from([10, 255]));
  await check;
  await new Promise((r) => setImmediate(r));
  expect(lost).toHaveBeenCalledTimes(1);
  expect(lost).toHaveBeenCalledWith('protocol');
  await expect(client.team()).rejects.toThrow('Frånkopplad');
});
it('misslyckad protokolladdning fångas utan att exponera råa fel', async () => {
  vi.spyOn(protobuf, 'load').mockRejectedValueOnce(
    Object.assign(new Error('private-token'), { instance: { token: 'secret' } }),
  );
  const client = new RustConnection({
    id: 'schema',
    name: 'schema',
    host: '127.0.0.1',
    port: 9,
    playerId: '76561198000000000',
    playerToken: 123,
    useProxy: false,
  });
  clients.push(client);
  const lost = vi.fn();
  client.on('lost', lost);
  await expect(client.open()).rejects.toThrow('Kunde inte ansluta');
  expect(lost).toHaveBeenCalledWith('protocol');
  expect(lost).toHaveBeenCalledTimes(1);
});

it('bibliotekets protokollfel exponerar inte partiella protobuf-objekt', async () => {
  const { server } = await setup();
  const port = (server.address() as { port: number }).port;
  const raw = new RustPlus('127.0.0.1', port, '76561198000000000', 123);
  // A valid envelope containing an incomplete AppInfo with a private test marker.
  const packet = protobuf.Writer.create()
    .uint32(10)
    .fork()
    .uint32(8)
    .uint32(1)
    .uint32(50)
    .fork()
    .uint32(10)
    .string('private-marker')
    .ldelim()
    .ldelim()
    .finish();
  server.once('connection', (socket) => socket.send(packet));
  const errorPromise = new Promise<Error>((resolve) => raw.once('error', resolve));
  try {
    raw.connect();
    const error = await errorPromise;
    expect(error).toMatchObject({ message: 'Rust+ protocol error', code: 'ELRUSTY_PROTOCOL' });
    expect(error).not.toHaveProperty('instance');
    expect(JSON.stringify(error)).not.toContain('private-marker');
  } finally {
    raw.disconnect();
  }
});

it('accepterar teamkartnotering utan type och fortsätter till speltiden', async () => {
  const { client, schema } = await setup(true, true);
  const fields = schema.lookupType('rustplus.AppTeamInfo.Note').fields;
  expect(schema.lookupType('rustplus.AppTeamInfo').fields.leaderSteamId.required).toBe(false);
  expect(fields.type.id).toBe(2);
  expect(fields.type.type).toBe('int32');
  expect(fields.type.required).toBe(false);
  expect(fields.x.required).toBe(true);
  expect(fields.y.required).toBe(true);
  await expect(client.info()).resolves.toMatchObject({ name: 'Local Rust fixture' });
  expect((await client.team())[0].name).toBe('Owner');
  expect(await client.time()).toBeCloseTo(18.7);
});

it('en spelare utan team får tom teamlista utan protokollfel', async () => {
  const { client, server, Message } = await setup();
  for (const socket of server.clients) {
    socket.removeAllListeners('message');
    socket.on('message', () =>
      socket.send(
        Message.encode(Message.fromObject({ response: { seq: 1, teamInfo: {} } })).finish(),
      ),
    );
  }
  expect(await client.team()).toEqual([]);
});
