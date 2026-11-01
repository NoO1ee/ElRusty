import { afterEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { entityNotification } from '../server/device-notification';
import { PairingManager } from '../server/pairing';
import { LiveDB } from '../server/db';
import { LiveService } from '../server/service';
import {
  AUTH_ORIGIN,
  authFromBinding,
  authBridgeScript,
  serverNotification,
} from '../server/pairing-protocol';
class FakeChild extends EventEmitter {
  connected = true;
  pid = undefined;
  send = vi.fn(() => {
    queueMicrotask(() => this.emit('exit', 0));
  });
  kill = vi.fn(() => {
    queueMicrotask(() => this.emit('exit', 0));
    return true;
  });
}
const resources: { manager: PairingManager; service: LiveService; db: LiveDB; dir: string }[] = [];
function setup(registered = false, desktop = true) {
  const db = new LiveDB(':memory:'),
    adapter = Object.assign(new EventEmitter(), {
      open: async () => {},
      close: vi.fn(),
      info: async () => {},
      team: async () => [],
      entity: vi.fn(async () => ({
        type: 'switch' as 'switch' | 'alarm' | 'storage',
        value: false,
      })),
      set: async () => {},
      chat: async () => {},
      time: async () => 12,
      timeInfo: async () => ({
        time: 12,
        timeScale: 1,
        dayLengthMinutes: 60,
        sunrise: 6,
        sunset: 18,
      }),
    }),
    service = new LiveService(db, () => adapter),
    dir = mkdtempSync(join(tmpdir(), 'elrusty-pairing-test-'));
  if (registered)
    writeFileSync(
      join(dir, 'rustplus.config.json'),
      JSON.stringify({ fcm_credentials: { gcm: { androidId: 'a', securityToken: 'secret' } } }),
    );
  const children: FakeChild[] = [],
    spawn = vi.fn(() => {
      const child = new FakeChild();
      children.push(child);
      return child as unknown as ChildProcess;
    });
  const manager = new PairingManager(service, dir, spawn, desktop);
  resources.push({ manager, service, db, dir });
  return { manager, service, db, dir, spawn, children, adapter };
}
afterEach(async () => {
  for (const { manager, service, db, dir } of resources.splice(0)) {
    await manager.close();
    service.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const incoming = {
  name: 'Vanilla',
  host: '127.0.0.1',
  port: 28082,
  playerId: '76561198000000000',
  playerToken: '123456',
  useProxy: false,
};
it('headless tjänst tillåter lyssning med flyttad registrering men kräver skrivbord för inloggning', () => {
  const { manager, spawn } = setup(true, false);
  expect(() => manager.start('register')).toThrow('skrivbord');
  expect(spawn).not.toHaveBeenCalled();
  manager.start('listen');
  expect(spawn).toHaveBeenCalledOnce();
});
it('registrering och lyssning är separata steg och parallella jobb nekas', () => {
  const { manager, spawn, children, dir, service } = setup();
  expect(() => manager.start('listen')).toThrow('Registrera');
  manager.start('register');
  expect(spawn).toHaveBeenCalledWith('register', join(dir, 'rustplus.config.json'));
  expect(() => manager.start('register')).toThrow('redan');
  writeFileSync(
    join(dir, 'rustplus.config.json'),
    JSON.stringify({ fcm_credentials: { gcm: { androidId: 'a', securityToken: 'secret' } } }),
  );
  children[0].emit('message', { type: 'registered' });
  children[0].emit('exit', 0);
  expect(service.snapshot().pairing).toMatchObject({
    status: 'registered',
    hasRegistration: true,
    running: false,
  });
  manager.start('listen');
  expect(spawn).toHaveBeenLastCalledWith('listen', join(dir, 'rustplus.config.json'));
});
it('parningsnotiser blir maskerade förslag och sparas först efter godkännande', async () => {
  const { manager, service, children } = setup(true);
  manager.start('listen');
  children[0].emit('message', { type: 'candidate', server: incoming });
  children[0].emit('message', { type: 'candidate', server: incoming });
  const state = service.snapshot();
  expect(state.pairing!.candidates).toHaveLength(1);
  expect(JSON.stringify(state)).not.toContain('123456');
  expect(JSON.stringify(state)).not.toContain('secret');
  expect(service.config.profiles).toEqual([]);
  service.connect = vi.fn();
  await manager.accept(state.pairing!.candidates[0].id);
  expect(service.config.profiles[0].playerToken).toBe(123456);
  expect(service.connect).toHaveBeenCalledWith(service.config.profiles[0].id);
  expect(service.snapshot().pairing!.candidates).toEqual([]);
});
it('avbrott stoppar bara det egna jobbet och ignorerar sena notiser', async () => {
  const { manager, children, service } = setup(true);
  manager.start('listen');
  await manager.cancel();
  children[0].emit('message', { type: 'candidate', server: incoming });
  expect(children[0].send).toHaveBeenCalledWith({ type: 'stop' }, expect.any(Function));
  expect(service.snapshot().pairing).toMatchObject({
    running: false,
    status: 'idle',
    candidates: [],
  });
});
it('ogiltiga notiser och utgångna förslag ändrar inte profiler', async () => {
  const { manager, children, service } = setup(true);
  manager.start('listen');
  children[0].emit('message', { type: 'candidate', server: { ...incoming, playerId: 'invalid' } });
  expect(service.snapshot().pairing!.candidates).toEqual([]);
  children[0].emit('message', { type: 'candidate', server: incoming });
  const id = service.snapshot().pairing!.candidates[0].id;
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 16 * 60_000);
  await expect(manager.accept(id)).rejects.toThrow('gått ut');
  expect(service.config.profiles).toEqual([]);
  vi.restoreAllMocks();
});
it('processfel maskeras och tidsgränsen avbryter lyssningen', async () => {
  vi.useFakeTimers();
  const { manager, children, service } = setup(true);
  manager.start('listen');
  children[0].emit('message', { type: 'failed', error: 'super-secret' });
  children[0].emit('exit', 1);
  expect(service.snapshot().pairing!.status).toBe('error');
  expect(JSON.stringify(service.snapshot())).not.toContain('super-secret');
  manager.start('listen');
  await vi.advanceTimersByTimeAsync(10 * 60_000);
  expect(service.snapshot().pairing).toMatchObject({ status: 'idle', running: false });
});
it('autentiseringsbryggan accepterar endast Facepunchs huvudkontext', () => {
  const auth = JSON.stringify({ Token: 'auth-secret' });
  expect(authFromBinding(AUTH_ORIGIN, true, auth)).toBe('auth-secret');
  expect(authFromBinding('https://steamcommunity.com', true, auth)).toBeNull();
  expect(authFromBinding(AUTH_ORIGIN, false, auth)).toBeNull();
  expect(authFromBinding(AUTH_ORIGIN + '.evil.example', true, auth)).toBeNull();
  expect(authFromBinding(AUTH_ORIGIN, true, 'bad')).toBeNull();
  expect(authBridgeScript).toContain('window.top === window');
});
it('läser FCM appData och ignorerar larm eller bristfälliga serverparningar', () => {
  const body = JSON.stringify({ ...incoming, ip: incoming.host });
  expect(serverNotification({ appData: [{ key: 'body', value: body }] })).toMatchObject({
    host: '127.0.0.1',
    playerToken: '123456',
  });
  expect(serverNotification({ appData: [{ key: 'body', value: '{"type":"alarm"}' }] })).toBeNull();
  expect(serverNotification({ body: 'not json' })).toBeNull();
});

it('omparning bevarar lokal anslutningsadress, profil-ID och befintlig data', async () => {
  const { manager, service, db, children } = setup(true);
  const id = service.saveProfile({
    ...incoming,
    host: '203.0.113.1',
    playerToken: 100,
    connectionHost: '127.0.0.1',
  });
  service.config.profiles[0].controlSteamIds = ['76561198000000001'];
  service.config.devices.push({
    id: 'device',
    profileId: id,
    name: 'Light',
    entityId: 1,
    group: '',
    type: 'switch',
  });
  service.config.modes.push({
    id: 'mode',
    profileId: id,
    name: 'Night',
    values: [{ deviceId: 'device', value: true }],
  });
  const timer = db.timers.create({
    profileId: id,
    name: 'Reminder',
    creatorId: incoming.playerId,
    creatorName: 'Owner',
    createdAt: Date.now(),
    dueAt: Date.now() + 60000,
  });
  service.connect = vi.fn();
  manager.start('listen');
  children[0].emit('message', { type: 'candidate', server: { ...incoming, host: '203.0.113.1' } });
  await manager.accept(service.snapshot().pairing!.candidates[0].id);
  expect(service.config.profiles).toHaveLength(1);
  expect(service.config.profiles[0]).toMatchObject({
    id,
    host: '203.0.113.1',
    connectionHost: '127.0.0.1',
    playerToken: 123456,
    controlSteamIds: ['76561198000000001'],
  });
  expect(db.load().profiles[0].connectionHost).toBe('127.0.0.1');
  expect(service.config.devices[0].profileId).toBe(id);
  expect(service.config.modes[0].profileId).toBe(id);
  expect(db.timers.get(id, timer.id)?.state).toBe('active');
  expect(service.connect).toHaveBeenCalledWith(id);
});

const deviceNotice = {
  type: 'entity',
  ip: '127.0.0.1',
  port: '28082',
  playerId: '76561198000000000',
  playerToken: 'private-token',
  entityId: '987654',
  entityType: '1',
  entityName: 'Lights',
};
const flushPairing = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
it('enhetsnotiser innehåller endast tillåtna fält och blir aldrig serverparningar', () => {
  const raw = { body: deviceNotice };
  expect(entityNotification(raw)).toEqual({
    ip: '127.0.0.1',
    port: 28082,
    playerId: incoming.playerId,
    entityId: 987654,
    entityType: 1,
    entityName: 'Lights',
  });
  expect(
    serverNotification({ body: { ...deviceNotice, playerToken: 123, name: 'Server' } }),
  ).toBeNull();
  expect(
    entityNotification({
      appData: [
        {
          key: 'body',
          value: JSON.stringify({ ...deviceNotice, entityName: '@everyone <b>Lights</b>' }),
        },
      ],
    })?.entityName,
  ).toBe('＠everyone Lights');
});
it.each([
  { entityId: 0 },
  { entityId: 4294967296 },
  { entityId: 'bad' },
  { entityType: 9 },
  { ip: 'not-an-ip' },
  { port: 0 },
  { playerId: 123 },
  { type: 'server' },
])('ogiltig enhetsnotis ignoreras %j', (change) => {
  expect(entityNotification({ body: { ...deviceNotice, ...change } })).toBeNull();
});
it('automatisk mottagning kräver ingen inloggning på huvudlös tjänst och saknar tiominutersgräns', async () => {
  vi.useFakeTimers();
  const { manager, spawn, children, service } = setup(true, false);
  manager.enable();
  manager.enable();
  expect(spawn).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(11 * 60000);
  expect(service.pairing.running).toBe(true);
  expect(children[0].send).not.toHaveBeenCalled();
  await expect(manager.register()).rejects.toThrow('skrivbord');
  expect(children[0].send).not.toHaveBeenCalled();
  await manager.cancel();
  await vi.advanceTimersByTimeAsync(60000);
  expect(spawn).toHaveBeenCalledTimes(1);
});
it('utan registrering öppnar autostart ingen webbläsare och startar ingen worker', () => {
  const { manager, spawn, service } = setup(false);
  manager.enable();
  expect(spawn).not.toHaveBeenCalled();
  expect(service.pairing).toMatchObject({ status: 'idle', running: false, hasRegistration: false });
});
it('oväntat processavbrott startar en enda ny lyssnare med ökande väntetid', async () => {
  vi.useFakeTimers();
  const { manager, spawn, children } = setup(true);
  manager.enable();
  children[0].emit('exit', 1);
  await vi.advanceTimersByTimeAsync(999);
  expect(spawn).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(spawn).toHaveBeenCalledTimes(2);
  children[1].emit('error', Error('private'));
  children[1].emit('exit', 1);
  await vi.advanceTimersByTimeAsync(1999);
  expect(spawn).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  expect(spawn).toHaveBeenCalledTimes(3);
  await manager.close();
  await vi.advanceTimersByTimeAsync(60000);
  expect(spawn).toHaveBeenCalledTimes(3);
});
it('ny registrering pausar mottagningen och lyckad registrering startar den igen', async () => {
  vi.useFakeTimers();
  const { manager, spawn, children } = setup(true);
  manager.enable();
  await manager.register();
  expect(children[0].send).toHaveBeenCalled();
  expect(spawn).toHaveBeenLastCalledWith('register', expect.any(String));
  children[1].emit('message', { type: 'registered' });
  children[1].emit('exit', 0);
  await vi.advanceTimersByTimeAsync(0);
  expect(spawn).toHaveBeenLastCalledWith('listen', expect.any(String));
  expect(spawn).toHaveBeenCalledTimes(3);
});
it('förslag dedupliceras, visar ID och läggs endast till efter klick och serververifiering', async () => {
  const { manager, service, children, adapter } = setup(true);
  const id = service.saveProfile({ ...incoming, playerToken: 100, connectionHost: '127.0.0.1' });
  service.connect(id);
  await flushPairing();
  manager.enable();
  for (let i = 0; i < 2; i++) children[0].emit('message', { type: 'device', device: deviceNotice });
  expect(service.pairing.devices).toHaveLength(1);
  expect(service.config.devices).toHaveLength(0);
  expect(JSON.stringify(service.snapshot())).not.toContain('private-token');
  expect(service.config.profiles[0].playerToken).toBe(100);
  const candidate = service.pairing.devices![0];
  expect(candidate).toMatchObject({ profileId: id, name: 'Lights', entityId: 987654 });
  await manager.acceptDevice(candidate.id);
  expect(adapter.entity).toHaveBeenCalledWith(987654);
  expect(service.config.devices[0]).toMatchObject({
    profileId: id,
    entityId: 987654,
    type: 'switch',
  });
  expect(service.pairing.devices).toEqual([]);
  expect(service.pairing.running).toBe(true);
  children[0].emit('message', { type: 'device', device: deviceNotice });
  expect(service.pairing.devices).toEqual([]);
});
it('fel server, okänd profil och tvetydiga endpoint-profiler läggs inte till', async () => {
  const { manager, service, children } = setup(true);
  service.saveProfile({ ...incoming, playerToken: 1 });
  manager.enable();
  children[0].emit('message', { type: 'device', device: { ...deviceNotice, ip: '203.0.113.1' } });
  expect(service.pairing.devices).toEqual([]);
  children[0].emit('message', {
    type: 'device',
    device: { ...deviceNotice, playerId: '76561198000000001' },
  });
  expect(service.pairing.devices).toEqual([]);
  service.saveProfile({ ...incoming, playerId: '76561198000000001', playerToken: 2 });
  children[0].emit('message', { type: 'device', device: { ...deviceNotice, playerId: undefined } });
  expect(service.pairing.devices).toEqual([]);
  expect(service.config.devices).toHaveLength(0);
});
it('förslag är begränsade, förfaller och kräver rätt ansluten profil', async () => {
  vi.useFakeTimers();
  const { manager, service, children } = setup(true);
  service.saveProfile({ ...incoming, playerToken: 1 });
  manager.enable();
  for (let n = 1; n <= 25; n++)
    children[0].emit('message', { type: 'device', device: { ...deviceNotice, entityId: n } });
  expect(service.pairing.devices).toHaveLength(20);
  const candidate = service.pairing.devices![0];
  await expect(manager.acceptDevice(candidate.id)).rejects.toThrow('Anslut');
  await vi.advanceTimersByTimeAsync(15 * 60000);
  expect(service.pairing.devices).toEqual([]);
  await expect(manager.acceptDevice(candidate.id)).rejects.toThrow('gått ut');
});
it('typkonflikt och avbrott under verifiering lämnar inga sparade enheter', async () => {
  const { manager, service, children, adapter } = setup(true);
  const id = service.saveProfile({ ...incoming, playerToken: 1 });
  service.connect(id);
  await flushPairing();
  manager.enable();
  children[0].emit('message', { type: 'device', device: { ...deviceNotice, entityType: 2 } });
  const candidate = service.pairing.devices![0];
  await expect(manager.acceptDevice(candidate.id)).rejects.toThrow('typ');
  expect(service.config.devices).toHaveLength(0);
  let finish!: (value: { type: 'switch' | 'alarm' | 'storage'; value: boolean }) => void;
  adapter.entity.mockImplementationOnce(() => new Promise((r) => (finish = r)));
  const pending = manager.acceptDevice(candidate.id);
  const check = expect(pending).rejects.toThrow();
  await expect(manager.acceptDevice(candidate.id)).rejects.toThrow('redan');
  service.disconnect();
  finish({ type: 'alarm', value: false });
  await check;
  expect(service.config.devices).toHaveLength(0);
});
it('servergodkännande stoppar inte automatisk enhetsmottagning och behåller lokal adress', async () => {
  const { manager, service, children } = setup(true);
  const id = service.saveProfile({ ...incoming, playerToken: 1, connectionHost: '127.0.0.1' });
  manager.enable();
  service.connect = vi.fn();
  children[0].emit('message', { type: 'candidate', server: incoming });
  await manager.accept(service.pairing.candidates[0].id);
  expect(service.config.profiles[0]).toMatchObject({
    id,
    connectionHost: '127.0.0.1',
    playerToken: 123456,
  });
  expect(service.pairing.running).toBe(true);
  expect(children[0].send).not.toHaveBeenCalled();
});
