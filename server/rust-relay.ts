import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const deps = createRequire(require.resolve('@liamcottle/rustplus.js'));

/** Use the authenticated server-ID transport while retaining the adapter's RPC API. */
export function configureRelay(client: any, serverId: string, authToken: string) {
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(serverId) || !authToken)
    throw new Error('Rust+-registrering eller server-ID saknas.');
  let cancelled = false;
  const disconnect = client.disconnect.bind(client);
  client.disconnect = () => {
    cancelled = true;
    disconnect();
  };
  client.connect = () => {
    void deps('protobufjs')
      .load(join(dirname(require.resolve('@liamcottle/rustplus.js')), 'rustplus.proto'))
      .then((root: any) => {
        if (cancelled) return;
        client.AppRequest = root.lookupType('rustplus.AppRequest');
        client.AppMessage = root.lookupType('rustplus.AppMessage');
        const WebSocket = deps('ws');
        const socket = new WebSocket(
          `wss://companion-rust.facepunch.com/socket/${serverId}?v=0`,
          ['rustplus.auth.v1', Buffer.from(authToken).toString('base64url')],
          { handshakeTimeout: 10000 },
        );
        client.websocket = socket;
        socket.on('open', () => client.emit('connected'));
        socket.on('error', () =>
          client.emit('error', new Error('Rust+-reläanslutningen misslyckades.')),
        );
        socket.on('close', () => client.emit('disconnected'));
        socket.on('message', (bytes: Buffer) => {
          let message: any;
          try {
            message = client.AppMessage.decode(bytes);
          } catch {
            client.emit(
              'error',
              Object.assign(new Error('Rust+ protocol error'), { code: 'ELRUSTY_PROTOCOL' }),
            );
            return;
          }
          const seq = message.response?.seq;
          const callback = seq && client.seqCallbacks[seq];
          if (callback) {
            const handled = callback(message);
            delete client.seqCallbacks[seq];
            if (handled) return;
          }
          client.emit('message', message);
        });
      })
      .catch(() => client.emit('error', new Error('Kunde inte förbereda Rust+-reläanslutningen.')));
  };
}
