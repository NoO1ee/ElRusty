import { test, expect } from '@playwright/test';
import type { LiveSnapshot } from '../shared/live';
// HTTP responses drive these UI tests; the real event stream is covered by API tests.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    class QuietEventSource {
      onmessage = null;
      onerror = null;
      close() {}
    }
    window.EventSource = QuietEventSource as unknown as typeof EventSource;
  });
});
function initial(): LiveSnapshot & { csrf: string } {
  return {
    csrf: 'test-csrf',
    profiles: [
      {
        id: 'p1',
        name: 'Vanilla · EU',
        host: '127.0.0.1',
        port: 28082,
        playerId: '76561198000000000',
        useProxy: false,
      },
    ],
    activeProfileId: 'p1',
    devices: [
      {
        id: 'd1',
        profileId: 'p1',
        name: 'Basbelysning',
        entityId: 1,
        group: 'Bas',
        type: 'switch',
      },
      { id: 'd2', profileId: 'p1', name: 'Raidlarm', entityId: 2, group: 'Bas', type: 'alarm' },
    ],
    modes: [{ id: 'm1', profileId: 'p1', name: 'Natt', values: [{ deviceId: 'd1', value: true }] }],
    connection: 'connected',
    connectionError: '',
    team: [{ steamId: '76561198000000000', name: 'Spelare', isOnline: true, isAlive: true }],
    teamUpdatedAt: Date.now(),
    states: {
      d1: { type: 'switch', value: false, updatedAt: Date.now() },
      d2: { type: 'alarm', value: false, updatedAt: Date.now() },
    },
    verified: ['d1', 'd2'],
    pending: [],
    activity: [],
    discord: {
      guildId: '',
      channelId: '',
      userIds: [],
      roleIds: [],
      hasToken: false,
      status: 'Avstängd',
    },
  };
}
test('Live styr en bekräftad switch, visar team och kör ett sparat läge', async ({ page }) => {
  const state = initial(),
    calls: { path: string; body: any }[] = [];
  await page.route('**/api/live/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/events')) {
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': idle\n\n' });
      return;
    }
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: state });
      return;
    }
    expect(route.request().headers()['x-elrusty-csrf']).toBe('test-csrf');
    const body = route.request().postDataJSON();
    calls.push({ path, body });
    if (path.endsWith('/switch')) state.states.d1.value = body.value;
    if (path.endsWith('/mode/run')) state.states.d1.value = true;
    await route.fulfill({ json: [{ deviceId: 'd1', name: 'Basbelysning', ok: true }] });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Live', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'ElRusty Live' })).toBeVisible();
  await page.getByRole('button', { name: 'Enheter', exact: true }).click();
  const card = page.locator('.live-device').filter({ hasText: 'Basbelysning' });
  await expect(card.getByText('○ Av / inaktiv')).toBeVisible();
  await card.getByRole('button', { name: 'På', exact: true }).click();
  await expect(card.getByText('● På / aktiv')).toBeVisible();
  await page.getByRole('button', { name: 'Team', exact: true }).click();
  await expect(page.getByText('Spelare', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Lägen', exact: true }).click();
  await page.getByRole('button', { name: 'Aktivera', exact: true }).click();
  await expect(page.getByLabel('Kommandoresultat')).toContainText('Bekräftat');
  expect(calls.map((c) => c.path)).toEqual(['/api/live/switch', '/api/live/mode/run']);
});
test('Live importerar parning och maskerar hemligheter utan att röra kretsen', async ({ page }) => {
  const state = initial();
  state.profiles = [];
  state.activeProfileId = null;
  state.connection = 'disconnected';
  let saved: any;
  await page.route('**/api/live/**', async (route) => {
    if (route.request().url().endsWith('/events')) {
      await route.fulfill({ contentType: 'text/event-stream', body: ': idle\n\n' });
      return;
    }
    if (route.request().method() === 'POST') {
      saved = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true } });
    } else await route.fulfill({ json: state });
  });
  await page.goto('/');
  const circuit = await page.getByRole('textbox', { name: 'Kretsnamn' }).inputValue();
  await page.getByRole('button', { name: 'Live', exact: true }).click();
  await page.getByRole('button', { name: 'Inställningar', exact: true }).click();
  await page.getByText('Lägg in manuellt', { exact: true }).click();
  await page.getByLabel('Parnings-JSON').fill(
    JSON.stringify({
      ip: '1.2.3.4',
      port: 28082,
      playerId: '76561198000000000',
      playerToken: 123456,
    }),
  );
  await page.getByRole('button', { name: 'Läs parning' }).click();
  await expect(page.getByLabel('PlayerToken', { exact: true })).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Spara server', exact: true }).click();
  await expect(page.getByLabel('PlayerToken', { exact: true })).toHaveValue('');
  expect(saved.playerId).toBe('76561198000000000');
  expect(saved.playerToken).toBe(123456);
  await page.getByRole('button', { name: 'Kretsbyggare', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Kretsnamn' })).toHaveValue(circuit);
});
test('Live visar inaktuell enhetsstatus utan möjlighet att styra', async ({ page }) => {
  const state = initial();
  state.connection = 'reconnecting';
  state.verified = [];
  await page.route('**/api/live/**', async (route) => {
    if (route.request().url().endsWith('/events'))
      await route.fulfill({ contentType: 'text/event-stream', body: ': idle\n\n' });
    else await route.fulfill({ json: state });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Live', exact: true }).click();
  await page.getByRole('button', { name: 'Enheter', exact: true }).click();
  const card = page.locator('.live-device').filter({ hasText: 'Basbelysning' });
  await expect(card.getByRole('button', { name: 'På', exact: true })).toBeDisabled();
  await expect(card).toContainText('Inaktuell / ej verifierad');
});
test('Kretsbyggaren fungerar när Live-tjänsten saknas', async ({ page }) => {
  await page.route('**/api/live/**', (route) => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: 'Live', exact: true }).click();
  await expect(page.getByText('Starta ElRustys Live-tjänst', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Kretsbyggare', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Kretsnamn' })).toBeVisible();
});

test('guidad Rust+-parning visar steg, avbrott och mottagna serverförslag', async ({ page }) => {
  const state = initial();
  state.pairing = {
    status: 'idle',
    message: 'Registrera Rust+ för att ta emot serverparningar.',
    running: false,
    hasRegistration: false,
    candidates: [],
  };
  const calls: string[] = [];
  await page.route('**/api/live/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'POST') {
      calls.push(path);
      if (path.endsWith('/register'))
        state.pairing = {
          status: 'registered',
          message: 'Rust+ är registrerat.',
          running: false,
          hasRegistration: true,
          candidates: [],
        };
      if (path.endsWith('/listen'))
        state.pairing = {
          status: 'listening',
          message: 'Serverparning mottagen.',
          running: true,
          hasRegistration: true,
          candidates: [
            {
              id: 'candidate',
              name: 'Ny Vanilla',
              host: '1.2.3.4',
              port: 28082,
              expiresAt: Date.now() + 60000,
            },
          ],
        };
      if (path.endsWith('/accept'))
        state.pairing = {
          ...state.pairing!,
          status: 'idle',
          message: 'Servern har lagts till.',
          running: false,
          candidates: [],
        };
      await route.fulfill({ json: { ok: true } });
    } else await route.fulfill({ json: state });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Live', exact: true }).click();
  await page.getByRole('button', { name: 'Inställningar', exact: true }).click();
  await expect(page.getByLabel('SteamID64', { exact: true })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Vänta på server', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Registrera Rust+', exact: true }).click();
  await page.getByRole('button', { name: 'Vänta på server', exact: true }).click();
  await expect(page.getByText('Ny Vanilla', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Avbryt parning', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Lägg till och anslut', exact: true }).click();
  await expect(page.getByText('Servern har lagts till.', { exact: true })).toBeVisible();
  expect(calls).toEqual([
    '/api/live/pairing/register',
    '/api/live/pairing/listen',
    '/api/live/pairing/accept',
  ]);
});

test('kartan har lager, markeringsdetaljer och statusprick även i kretsbyggaren', async ({
  page,
}) => {
  const state = initial();
  state.team[0] = { ...state.team[0], x: 250, y: 500, isLeader: true };
  state.mapNotes = [
    { id: 'self:0', source: 'self', type: 0, x: 150, y: 800, label: 'Farm', icon: 0 },
    {
      id: 'leader:0',
      source: 'leader',
      type: 1,
      x: 850,
      y: 800,
      label: 'Teamets waypoint',
      icon: 1,
    },
  ];
  state.lastDeath = {
    x: 750,
    y: 200,
    at: Date.now() - 60000,
    observedAt: Date.now(),
    approximate: true,
  };
  state.world = {
    profileId: 'p1',
    info: { name: 'Test', mapSize: 1000, wipeTime: 1, players: 2, maxPlayers: 100 },
    map: {
      revision: 'map-test',
      width: 1000,
      height: 1000,
      oceanMargin: 50,
      mapSize: 1000,
      monuments: [{ token: 'harbor', x: 300, y: 300 }],
    },
    markers: [{ id: 2, type: 5, x: 600, y: 600, name: 'Cargo Ship' }],
    updatedAt: Date.now(),
    error: '',
  };
  await page.route('**/api/live/**', async (route) => {
    if (route.request().method() === 'POST') {
      if (route.request().url().endsWith('/disconnect')) state.connection = 'disconnected';
      await route.fulfill({ json: { ok: true } });
    } else await route.fulfill({ json: state });
  });
  await page.goto('/');
  await expect(page.getByRole('img', { name: 'Rust+-status: Ansluten' })).toBeVisible();
  await page.getByRole('button', { name: 'Live', exact: true }).click();
  await page.getByRole('button', { name: 'Karta', exact: true }).click();
  await expect(page.getByLabel('Rust-serverns livekarta')).toBeVisible();
  await expect(page.locator('.map-monument-name')).toHaveText('HARBOR');
  await page.getByRole('button', { name: 'Utöka kartan' }).click();
  await expect(page.locator('.rustplus-map')).toHaveClass(/expanded/);
  await page.getByRole('button', { name: 'Minimera kartan' }).press('Escape');
  await expect(page.locator('.rustplus-map')).not.toHaveClass(/expanded/);
  await expect(page.getByLabel('Event', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/rustplus-map.png' });
  await page.getByRole('button', { name: 'Farm', exact: true }).click();
  await expect(page.locator('.live-map-detail')).toContainText('DIN WAYPOINT');
  await page.getByRole('button', { name: 'Teamets waypoint', exact: true }).click();
  await expect(page.locator('.live-map-detail')).toContainText('TEAMLEDARENS WAYPOINT');
  await page.getByRole('button', { name: 'Din senaste dödsplats', exact: true }).click();
  await expect(page.locator('.live-map-detail')).toContainText('Ungefärlig position');
  const marker = page.getByRole('button', { name: 'Cargo Ship', exact: true });
  await expect
    .poll(() => marker.locator('circle').evaluate((el) => el.getBoundingClientRect().width))
    .toBeGreaterThan(12);
  await marker.click();
  await expect(page.locator('.live-map-detail')).toContainText('Cargo Ship');
  await page.getByRole('button', { name: 'Kartlager', exact: true }).click();
  await page.getByLabel('Waypoints', { exact: true }).uncheck();
  await expect(page.getByRole('button', { name: 'Farm', exact: true })).toHaveCount(0);
  await page.getByLabel('Senaste dödsplats', { exact: true }).uncheck();
  await expect(
    page.getByRole('button', { name: 'Din senaste dödsplats', exact: true }),
  ).toHaveCount(0);
  await page.getByLabel('Event', { exact: true }).uncheck();
  await expect(page.getByRole('button', { name: 'Cargo Ship', exact: true })).toHaveCount(0);
  const before = await page.getByLabel('Rust-serverns livekarta').getAttribute('viewBox');
  await page.getByRole('button', { name: 'Zooma in kartan' }).click();
  await expect(page.getByLabel('Rust-serverns livekarta')).not.toHaveAttribute('viewBox', before!);
  await page.getByRole('button', { name: 'Visa hela kartan' }).click();
  await expect(page.getByLabel('Rust-serverns livekarta')).toHaveAttribute(
    'viewBox',
    '0 0 1000 1000',
  );
  await page.getByRole('button', { name: 'Koppla från', exact: true }).click();
  await expect(page.getByText(/Inaktuell information · anslut/)).toBeVisible();
  await page.getByRole('button', { name: 'Kretsbyggare', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Rust+-status: Frånkopplad' })).toBeVisible();
});

test('Discord-guiden förhandsvisar innan kanaler skapas', async ({ page }) => {
  const state = initial();
  state.discord.hasToken = true;
  state.discord.guildId = '12345678901234567';
  state.discord.userIds = ['23456789012345678'];
  const calls: string[] = [];
  await page.route('**/api/live/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'POST') {
      calls.push(path);
      if (path.endsWith('/guilds'))
        await route.fulfill({ json: [{ id: state.discord.guildId, name: 'Testteam' }] });
      else if (path.endsWith('/preview'))
        await route.fulfill({
          json: {
            guildName: 'Testteam',
            userIds: state.discord.userIds,
            roleIds: [],
            channels: ['status', 'larm', 'events', 'aktivitet', 'styrning', 'teamchat'],
          },
        });
      else await route.fulfill({ json: { ok: true } });
    } else await route.fulfill({ json: state });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Live', exact: true }).click();
  await page.getByRole('button', { name: 'Inställningar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Skapa ElRusty-kanaler' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Hämta Discord-servrar' }).click();
  await page.getByRole('button', { name: 'Förhandsvisa kanalsetup' }).click();
  await expect(page.getByText('Testteam → ElRusty')).toBeVisible();
  expect(calls).not.toContain('/api/live/discord/setup');
  await page.getByRole('button', { name: 'Skapa ElRusty-kanaler' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'ElRusty-kanalerna är klara' }),
  ).toBeVisible();
  expect(calls).toContain('/api/live/discord/setup');
});

test('chattbehörigheter sparas per server och tvåvägschatt är ett uttryckligt val', async ({
  page,
}) => {
  const state = initial();
  state.discord.hasToken = true;
  state.discord.channels = { teamchat: 'channel' };
  const calls: { path: string; body: any }[] = [];
  await page.route('**/api/live/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      calls.push({ path, body });
      if (path.endsWith('/controls')) state.profiles[0].controlSteamIds = body.steamIds;
      if (path.endsWith('/relay')) {
        state.discord.relayEnabled = body.enabled;
        state.discord.relayError = 'Chattkopplingen är pausad: aktivera Message Content Intent';
      }
      await route.fulfill({ json: { ok: true } });
    } else await route.fulfill({ json: state });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Live', exact: true }).click();
  await page.getByRole('button', { name: 'Inställningar', exact: true }).click();
  await page.getByText('Alla teamkommandon', { exact: true }).click();
  await expect(page.locator('.live-command-list')).toContainText('!wipe');
  await expect(page.locator('.live-command-list')).toContainText(
    'ungefärlig verklig tid till natt/dag',
  );
  await expect(page.locator('.live-command-list')).toContainText('!prox');
  await expect(page.locator('.live-command-list')).toContainText('!alive');
  await expect(page.locator('.live-command-list')).not.toContainText('!team');
  await page.getByLabel('Tillåtna SteamID:n för styrkommandon').fill('76561198000000001');
  await page.getByRole('button', { name: 'Spara chattbehörigheter' }).click();
  await expect(page.getByText('Chattbehörigheterna är sparade.')).toBeVisible();
  expect(calls.find((c) => c.path.endsWith('/controls'))?.body.steamIds).toEqual([
    '76561198000000001',
  ]);
  const relay = page.getByLabel('Aktivera tvåvägschatt');
  await expect(relay).not.toBeChecked();
  await relay.check();
  await expect(page.getByRole('alert').filter({ hasText: 'Message Content Intent' })).toBeVisible();
  expect(calls.find((c) => c.path.endsWith('/relay'))?.body.enabled).toBe(true);
});

test('timers skapas, räknar ned, överlever omladdning och visar kanalvis historik', async ({
  page,
}) => {
  const state = initial(),
    base = Date.now() + 1000;
  state.timers = [];
  await page.clock.install({ time: new Date(base - 1000) });
  await page.clock.pauseAt(new Date(base));
  let count = 0;
  await page.route('**/api/live/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      if (path === '/api/live/timers') {
        if (body.duration === '9s') {
          await route.fulfill({
            status: 400,
            json: { error: 'Timern måste vara mellan 10 sekunder och 7 dagar.' },
          });
          return;
        }
        const shortId = (++count).toString().padStart(8, '0');
        const t = {
          id: 'timer-' + count,
          shortId,
          profileId: 'p1',
          name: body.name,
          creatorId: state.profiles[0].playerId,
          creatorName: 'Webbpanelen',
          createdAt: base,
          dueAt: base + 10000,
          state: 'active' as const,
          finishedAt: null,
          rust: 'pending' as const,
          discord: 'pending' as const,
        };
        state.timers!.push(t);
        await route.fulfill({ json: t });
        return;
      }
      if (path === '/api/live/timers/cancel') {
        const t = state.timers!.find((t) => t.id === body.id)!;
        t.state = 'cancelled';
        t.finishedAt = base + 3000;
        t.rust = 'missed';
        t.discord = 'missed';
        await route.fulfill({ json: t });
        return;
      }
      await route.fulfill({ json: { ok: true } });
    } else await route.fulfill({ json: state });
  });
  const open = async () => {
    await page.getByRole('button', { name: 'Live', exact: true }).click();
    await page.getByRole('button', { name: 'Timers', exact: true }).click();
  };
  await page.goto('/');
  await open();
  await page.getByLabel('Timernamn', { exact: true }).fill('Oil Rig');
  await page.getByLabel('Tid', { exact: true }).fill('9s');
  await page.getByRole('button', { name: 'Skapa timer' }).click();
  await expect(page.getByRole('alert')).toContainText('10 sekunder');
  await page.getByLabel('Tid', { exact: true }).fill('10s');
  await page.getByRole('button', { name: 'Skapa timer' }).click();
  await expect(page.locator('.timer-card').filter({ hasText: 'Oil Rig' })).toContainText('10 s');
  await page.reload();
  await open();
  await expect(page.locator('.timer-card').filter({ hasText: 'Oil Rig' })).toBeVisible();
  await page.clock.fastForward(3000);
  await expect(page.locator('.timer-countdown')).toHaveText('7 s');
  await page.getByRole('button', { name: 'Avbryt timer 00000001' }).click();
  await expect(page.getByRole('region', { name: 'Timerhistorik' })).toContainText('AVBRUTEN');
  await page.getByLabel('Timernamn', { exact: true }).fill('Andra påminnelsen');
  await page.getByRole('button', { name: 'Skapa timer' }).click();
  await page.clock.fastForward(8000);
  await expect(page.locator('.timer-countdown')).toHaveText('Väntar på tjänsten…');
  const t = state.timers![1];
  t.state = 'expired';
  t.finishedAt = base + 10000;
  t.rust = 'sent';
  t.discord = 'missed';
  await page.reload();
  await open();
  const completed = page.locator('.timer-card').filter({ hasText: 'Andra påminnelsen' });
  await expect(completed).toContainText('Rust: Bekräftat');
  await expect(completed).toContainText('Discord: Missat');
  await page.getByRole('button', { name: 'Inställningar', exact: true }).click();
  await page.getByText('Alla teamkommandon', { exact: true }).click();
  await expect(page.locator('.live-command-list')).toContainText('!timer add');
});

test('lokal anslutningsadress sparas separat från parningsadressen', async ({ page }) => {
  const state = initial();
  state.profiles[0].host = '203.0.113.1';
  let saved: any;
  await page.route('**/api/live/**', async (route) => {
    if (route.request().method() === 'POST') {
      saved = route.request().postDataJSON();
      state.profiles[0] = { ...state.profiles[0], connectionHost: saved.connectionHost };
      await route.fulfill({ json: { id: 'p1' } });
    } else await route.fulfill({ json: state });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Live', exact: true }).click();
  await page.getByRole('button', { name: 'Inställningar', exact: true }).click();
  await page.getByRole('button', { name: 'Redigera server Vanilla · EU', exact: true }).click();
  await page.getByLabel('Anslutningsadress (valfri)', { exact: true }).fill('127.0.0.1');
  await page.getByRole('button', { name: 'Spara server', exact: true }).click();
  expect(saved).toMatchObject({
    id: 'p1',
    host: '203.0.113.1',
    connectionHost: '127.0.0.1',
    playerToken: '',
  });
  await expect(page.locator('.live-profile')).toContainText('127.0.0.1:28082');
  await expect(page.locator('.live-profile')).toContainText('Parningsadress: 203.0.113.1');
  await page.reload();
  await page.getByRole('button', { name: 'Live', exact: true }).click();
  await page.getByRole('button', { name: 'Inställningar', exact: true }).click();
  await page.getByRole('button', { name: 'Redigera server Vanilla · EU', exact: true }).click();
  await expect(page.getByLabel('Anslutningsadress (valfri)', { exact: true })).toHaveValue(
    '127.0.0.1',
  );
});

test('enhetsförslag visar namn och Entity-ID och sparas först vid Lägg till', async ({ page }) => {
  const state = initial();
  state.pairing = {
    status: 'listening',
    running: true,
    hasRegistration: true,
    message: 'Lyssnar efter server- och enhetsparningar.',
    candidates: [],
    devices: [
      {
        id: 'proposal',
        profileId: 'p1',
        entityId: 456,
        entityType: 1,
        name: 'Garage',
        expiresAt: Date.now() + 60000,
      },
      {
        id: 'other',
        profileId: 'other-profile',
        entityId: 789,
        entityType: 2,
        name: 'Other server',
        expiresAt: Date.now() + 60000,
      },
    ],
  };
  state.pairing.devices!.push({
    id: 'dismiss',
    profileId: 'p1',
    entityId: 999,
    entityType: 1,
    name: 'Oönskad',
    expiresAt: Date.now() + 60000,
  });
  const calls: string[] = [];
  let accepted: any;
  await page.route('**/api/live/**', async (route) => {
    if (route.request().method() === 'POST') {
      const path = new URL(route.request().url()).pathname;
      calls.push(path);
      const body = route.request().postDataJSON();
      if (path.endsWith('/dismiss')) {
        state.pairing!.devices = state.pairing!.devices!.filter((d) => d.id !== body.id);
        await route.fulfill({ json: { ok: true } });
        return;
      }
      if (path.endsWith('/delete')) {
        state.devices = state.devices.filter((d) => d.id !== body.id);
        await route.fulfill({ json: { ok: true } });
        return;
      }
      accepted = body;
      state.pairing!.devices = state.pairing!.devices!.filter((d) => d.id !== accepted.id);
      state.devices.push({
        id: 'new',
        profileId: 'p1',
        entityId: 456,
        type: 'switch',
        name: 'Garage',
        group: '',
      });
      state.states.new = { type: 'switch', value: false, updatedAt: Date.now() };
      state.verified.push('new');
      await route.fulfill({ json: { id: 'new' } });
    } else await route.fulfill({ json: state });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Live', exact: true }).click();
  await page.getByRole('button', { name: 'Enheter', exact: true }).click();
  const region = page.getByRole('region', { name: 'Enhetsparning' });
  await expect(region).toContainText('Garage');
  await expect(region).toContainText('Entity-ID: 456');
  await expect(region).not.toContainText('Other server');
  expect(accepted).toBeUndefined();
  await region.getByRole('button', { name: 'Avvisa Oönskad', exact: true }).click();
  await expect(region).not.toContainText('Oönskad');
  expect(accepted).toBeUndefined();
  await region.getByRole('button', { name: 'Lägg till', exact: true }).click();
  expect(accepted).toEqual({ id: 'proposal' });
  await expect(region.getByRole('button', { name: 'Lägg till', exact: true })).toHaveCount(0);
  const card = page.locator('.live-device').filter({ hasText: 'Garage' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Ta bort Garage från ElRusty', exact: true }).click();
  await expect(card).toHaveCount(0);
  expect(calls).toEqual([
    '/api/live/pairing/device/dismiss',
    '/api/live/pairing/device/accept',
    '/api/live/device/delete',
  ]);
});
