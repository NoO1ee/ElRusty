import type { PairingManager } from './pairing.ts';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import type { LiveService } from './service.ts';
import type { DiscordBot } from './discord.ts';
import { UserError, insist, object, text, discord } from './validation.ts';
export function createLiveHttp(
  service: LiveService,
  bot: Pick<DiscordBot, 'start' | 'stop'> &
    Partial<Pick<DiscordBot, 'guildList' | 'preview' | 'setup' | 'isSettingUp' | 'setRelay'>>,
  options: { port: number; dist?: string; dev?: boolean; pairing?: PairingManager },
) {
  const csrf = randomBytes(32).toString('hex'),
    streams = new Set<ServerResponse>();
  const hosts = new Set([`127.0.0.1:${options.port}`, `localhost:${options.port}`]);
  const origins = new Set([...hosts].map((h) => 'http://' + h));
  if (options.dev) {
    origins.add('http://127.0.0.1:5173');
    origins.add('http://localhost:5173');
  }
  const json = (res: ServerResponse, status: number, value: unknown) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(JSON.stringify(value));
  };
  const broadcast = () => {
    const data = `data: ${JSON.stringify(service.snapshot())}\n\n`;
    for (const res of streams) res.write(data);
  };
  service.on('change', broadcast);
  const heartbeat = setInterval(() => {
    for (const res of streams) res.write(': heartbeat\n\n');
  }, 20000);
  heartbeat.unref();
  async function body(req: IncomingMessage) {
    insist(req.headers['content-type']?.split(';')[0] === 'application/json', 'JSON krävs.');
    let input = '';
    for await (const chunk of req) {
      input += chunk;
      insist(input.length <= 64000, 'För stor begäran.');
    }
    try {
      return object(JSON.parse(input || '{}'));
    } catch {
      throw new UserError('Ogiltig JSON.');
    }
  }
  const server = createServer(async (req, res) => {
    try {
      if (!hosts.has(req.headers.host || '')) {
        json(res, 403, { error: 'Otillåten värd.' });
        return;
      }
      if (req.headers.origin && !origins.has(req.headers.origin)) {
        json(res, 403, { error: 'Otillåtet ursprung.' });
        return;
      }
      const url = new URL(req.url || '/', 'http://127.0.0.1'),
        path = url.pathname;
      if (path.startsWith('/api/live')) {
        if (req.method === 'GET' && path === '/api/live/map/image') {
          const bytes = service.world?.bytes(url.searchParams.get('revision') || '');
          if (!bytes) {
            json(res, 404, { error: 'Kartbild saknas.' });
            return;
          }
          res.writeHead(200, {
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          });
          res.end(bytes);
          return;
        }
        if (req.method === 'GET' && path === '/api/live/state') {
          json(res, 200, { ...service.snapshot(), csrf });
          return;
        }
        if (req.method === 'GET' && path === '/api/live/events') {
          if (streams.size >= 20) {
            json(res, 429, { error: 'För många anslutningar.' });
            return;
          }
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-store',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          });
          res.write(`data: ${JSON.stringify(service.snapshot())}\n\n`);
          streams.add(res);
          req.on('close', () => streams.delete(res));
          return;
        }
        const token = req.headers['x-elrusty-csrf'];
        if (
          typeof token !== 'string' ||
          !/^[a-f0-9]{64}$/.test(token) ||
          !timingSafeEqual(Buffer.from(token), Buffer.from(csrf))
        ) {
          json(res, 403, { error: 'Ladda om Live-fliken och försök igen.' });
          return;
        }
        const b = await body(req),
          id = typeof b.id === 'string' ? b.id : undefined;
        let result: unknown = { ok: true };
        if (req.method !== 'POST') {
          json(res, 405, { error: 'Metoden stöds inte.' });
          return;
        }
        switch (path) {
          case '/api/live/controls':
            service.setControlUsers(text(b.id), b.steamIds);
            break;
          case '/api/live/discord/relay':
            insist(!bot.isSettingUp && bot.setRelay, 'Vänta tills kanalsetupen är klar.');
            insist(typeof b.enabled === 'boolean', 'Ogiltigt chattval.');
            await bot.setRelay(b.enabled);
            break;
          case '/api/live/discord/guilds':
            insist(bot.guildList, 'Setup stöds inte.');
            result = await bot.guildList();
            break;
          case '/api/live/discord/preview':
            insist(bot.preview, 'Setup stöds inte.');
            result = await bot.preview();
            break;
          case '/api/live/discord/setup':
            insist(bot.setup, 'Setup stöds inte.');
            result = await bot.setup();
            break;
          case '/api/live/discord/select': {
            insist(!bot.isSettingUp, 'Vänta tills kanalsetupen är klar.');
            const candidate = { ...service.config.discord, guildId: text(b.guildId) };
            discord(candidate, service.config.discord);
            await bot.stop();
            service.saveDiscord(candidate);
            break;
          }
          case '/api/live/map/load':
            insist(service.world, 'Karta är inte tillgänglig.');
            await service.world.load();
            break;
          case '/api/live/pairing/register':
            insist(options.pairing, 'Parning är inte tillgänglig.');
            options.pairing.start('register');
            break;
          case '/api/live/pairing/listen':
            insist(options.pairing, 'Parning är inte tillgänglig.');
            options.pairing.start('listen');
            break;
          case '/api/live/pairing/cancel':
            insist(options.pairing, 'Parning är inte tillgänglig.');
            await options.pairing.cancel();
            break;
          case '/api/live/pairing/accept':
            insist(options.pairing, 'Parning är inte tillgänglig.');
            result = await options.pairing.accept(text(b.id));
            break;
          case '/api/live/profile':
            result = { id: service.saveProfile(b, id) };
            break;
          case '/api/live/profile/delete':
            service.deleteProfile(text(b.id));
            break;
          case '/api/live/connect':
            service.connect(text(b.id));
            break;
          case '/api/live/disconnect':
            service.disconnect();
            break;
          case '/api/live/device':
            result = await service.addDevice(b);
            break;
          case '/api/live/device/edit':
            service.updateDevice(text(b.id), b);
            break;
          case '/api/live/device/delete':
            service.deleteDevice(text(b.id));
            break;
          case '/api/live/mode':
            result = service.saveMode(b, id);
            break;
          case '/api/live/mode/delete':
            service.deleteMode(text(b.id));
            break;
          case '/api/live/switch':
            insist(typeof b.value === 'boolean', 'Ange på eller av.');
            result = await service.run([{ deviceId: text(b.id), value: b.value }]);
            break;
          case '/api/live/group':
            insist(typeof b.value === 'boolean', 'Ange på eller av.');
            result = await service.runGroup(text(b.group), b.value);
            break;
          case '/api/live/mode/run':
            result = await service.runMode(text(b.id));
            break;
          case '/api/live/discord':
            insist(!bot.isSettingUp, 'Vänta tills kanalsetupen är klar.');
            discord(b, service.config.discord);
            await bot.stop();
            service.saveDiscord(b);
            break;
          case '/api/live/discord/start':
            insist(!bot.isSettingUp, 'Vänta tills kanalsetupen är klar.');
            await bot.start();
            break;
          case '/api/live/discord/stop':
            insist(!bot.isSettingUp, 'Vänta tills kanalsetupen är klar.');
            await bot.stop();
            break;
          default:
            json(res, 404, { error: 'Okänd funktion.' });
            return;
        }
        json(res, 200, result);
        return;
      }
      if (req.method !== 'GET' || !options.dist) {
        json(res, 404, { error: 'Hittades inte.' });
        return;
      }
      const root = resolve(options.dist);
      let file = resolve(root, '.' + decodeURIComponent(path));
      if (file !== root && !file.startsWith(root + '/') && !file.startsWith(root + '\\')) {
        json(res, 403, { error: 'Ogiltig sökväg.' });
        return;
      }
      try {
        if (!(await stat(file)).isFile()) file = resolve(root, 'index.html');
      } catch {
        file = resolve(root, 'index.html');
      }
      const types: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.webp': 'image/webp',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.json': 'application/json',
      };
      const data = await readFile(file);
      res.writeHead(200, {
        'Content-Type': types[extname(file)] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      });
      res.end(data);
    } catch (error) {
      if (!res.headersSent)
        json(res, error instanceof UserError ? 400 : 502, {
          error:
            error instanceof UserError
              ? error.message
              : 'Tjänsten kunde inte utföra begäran. Kontrollera anslutningen.',
        });
      else res.end();
    }
  });
  server.on('close', () => {
    clearInterval(heartbeat);
    service.off('change', broadcast);
    for (const res of streams) res.end();
  });
  return server;
}
