import { safeFailure, type PairingStep } from './pairing-errors.ts';
import { createRequire } from 'node:module';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { browserAuth } from './pairing-browser.ts';
import { entityNotification } from './device-notification.ts';
import { serverNotification } from './pairing-protocol.ts';
const deps = createRequire(createRequire(import.meta.url).resolve('@liamcottle/rustplus.js'));
const [action, configFile] = process.argv.slice(2),
  abort = new AbortController();
let client: any;
let step: PairingStep = action === 'listen' ? 'listen' : 'fcm';
const emit = (value: unknown) => {
  if (process.connected) process.send?.(value);
};
const stage = (text: string) => emit({ type: 'stage', text });
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  abort.abort();
  client?.destroy();
}
process.on('message', (message) => {
  if ((message as any)?.type === 'stop') void stop();
});
process.on('disconnect', () => void stop());
process.on('SIGTERM', () => void stop());
async function run() {
  await mkdir(dirname(configFile), { recursive: true, mode: 0o700 });
  if (action === 'register') {
    const AndroidFCM = deps('@liamcottle/push-receiver/src/android/fcm'),
      axios = deps('axios').create({ timeout: 30000, signal: abort.signal });
    stage('Registrerar anslutning hos FCM…');
    const credentials = await AndroidFCM.register(
      'AIzaSyB5y2y-Tzqb4-I4Qnlsh_9naYv_TD8pCvY',
      'rust-companion-app',
      '976529667804',
      '1:976529667804:android:d6f1ddeb4403b338fea619',
      'com.facepunch.rust.companion',
      'E28D05345FB78A7A1A63D70F4A302DBF426CA5AD',
    );
    abort.signal.throwIfAborted();
    step = 'expo';
    stage('Förbereder Rust+-anslutningen…');
    const expo = (
      await axios.post('https://exp.host/--/api/v2/push/getExpoPushToken', {
        type: 'fcm',
        deviceId: randomUUID(),
        development: false,
        appId: 'com.facepunch.rust.companion',
        deviceToken: credentials.fcm.token,
        projectId: '49451aca-a822-41e6-ad59-955718d0ff9c',
      })
    ).data.data.expoPushToken;
    step = 'browser';
    stage('Logga in med Steam i det separata fönstret.');
    const token = await browserAuth(configFile, abort.signal, () =>
      emit({ type: 'warning', code: 'browser-cleanup' }),
    );
    abort.signal.throwIfAborted();
    step = 'companion';
    stage('Slutför registreringen hos Rust+…');
    await axios.post('https://companion-rust.facepunch.com/api/push/register', {
      AuthToken: token,
      DeviceId: 'ElRusty',
      PushKind: 3,
      PushToken: expo,
    });
    abort.signal.throwIfAborted();
    step = 'save';
    stage('Sparar registreringen lokalt…');
    const temp = configFile + '.' + randomUUID() + '.tmp';
    await writeFile(
      temp,
      JSON.stringify({
        fcm_credentials: credentials,
        expo_push_token: expo,
        rustplus_auth_token: token,
      }),
      { mode: 0o600 },
    );
    abort.signal.throwIfAborted();
    await rename(temp, configFile);
    emit({ type: 'registered' });
  } else if (action === 'listen') {
    const config = JSON.parse(await readFile(configFile, 'utf8'));
    const PushClient = deps('@liamcottle/push-receiver/src/client');
    client = new PushClient(
      config.fcm_credentials.gcm.androidId,
      config.fcm_credentials.gcm.securityToken,
      [],
    );
    client.on('ON_DATA_RECEIVED', (data: unknown) => {
      if (stopping) return;
      const server = serverNotification(data);
      if (server) emit({ type: 'candidate', server });
      const device = entityNotification(data);
      if (device) emit({ type: 'device', device });
    });
    client.on('connect', () =>
      stage('Lyssnar efter server- och enhetsparningar. Para servern eller en smart enhet i Rust.'),
    );
    client.on('disconnect', () => stage('Anslutningen till notistjänsten bröts. Försöker igen…'));
    stage('Ansluter till Rust+ notistjänst…');
    await client.connect();
    if (stopping) {
      client.destroy();
      return;
    }
    await new Promise<void>((resolve) =>
      abort.signal.addEventListener('abort', () => resolve(), { once: true }),
    );
  } else throw Error('Okänd parningsåtgärd.');
}
void run()
  .catch((error) => {
    if (!stopping) emit({ type: 'failed', ...safeFailure(step, error) });
  })
  .finally(async () => {
    await stop();
    if (process.connected) process.disconnect?.();
  });
