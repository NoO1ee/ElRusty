import { LiveWorld } from './world.ts';
import { PairingManager } from './pairing.ts';
import { resolve } from 'node:path';
import { LiveDB } from './db.ts';
import { LiveService } from './service.ts';
import { RustConnection } from './rust.ts';
import { DiscordBot } from './discord.ts';
import { createLiveHttp } from './http.ts';
const dev = process.argv.includes('--dev'),
  port = Number(process.env.ELRUSTY_PORT || (dev ? 5175 : 5173));
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Ogiltig ELRUSTY_PORT.');
const db = new LiveDB(resolve(process.env.ELRUSTY_DATA_DIR || '.private', 'live.sqlite'));
const service = new LiveService(db, (p) => new RustConnection(p)),
  bot = new DiscordBot(service);
new LiveWorld(service);
const pairing = new PairingManager(service, resolve(process.env.ELRUSTY_DATA_DIR || '.private'));
const server = createLiveHttp(service, bot, {
  port,
  dev,
  pairing,
  dist: dev ? undefined : resolve('dist'),
});
server.listen(port, '127.0.0.1', () => {
  console.log(`ElRusty ${dev ? 'Live-tjänst' : 'Live'}: http://127.0.0.1:${port}`);
  if (service.config.activeProfileId) service.connect(service.config.activeProfileId);
  if (service.config.discord.enabled)
    void bot
      .start()
      .catch(() => console.error('Discord kunde inte startas. Kontrollera inställningarna.'));
});
server.on('error', () => {
  console.error('ElRusty kunde inte starta. Är porten upptagen?');
  void shutdown(1);
});
let stopping = false;
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  await pairing.close();
  service.close();
  await bot.close();
  server.close();
  server.closeAllConnections();
  db.close();
  process.exitCode = code;
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
