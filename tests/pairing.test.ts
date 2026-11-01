import { afterEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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
    service = new LiveService(db, () => new EventEmitter() as never),
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
  return { manager, service, db, dir, spawn, children };
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
