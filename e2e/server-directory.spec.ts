import { expect, test } from '@playwright/test';
import type { DirectoryResult, DirectoryServer } from '../shared/servers';
const live = {
  csrf: 'fixture',
  connection: 'disconnected',
  connectionError: '',
  profiles: [],
  activeProfileId: null,
  team: [],
  teamUpdatedAt: null,
  devices: [],
  states: {},
  pending: [],
  verified: [],
  modes: [],
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
const first: DirectoryServer & { displayWipe: any } = {
  id: 'one',
  name: 'Rustoria EU Main',
  host: '203.0.113.1',
  port: 28015,
  region: 'EU',
  country: 'SE',
  players: 120,
  maxPlayers: 200,
  queue: 3,
  groupLimit: 2,
  scheduleSource: 'declared',
  lastWipeAt: null,
  wipes: [],
  displayWipe: { at: Date.parse('2026-11-12T15:00:00Z'), kind: 'map' },
  sourceUrl: 'https://wipeboard.net/server/one',
};
const second = {
  ...first,
  id: 'two',
  name: 'Facepunch EU',
  players: 80,
  queue: 0,
  groupLimit: null,
  scheduleSource: 'unknown' as const,
  displayWipe: null,
};
function response(servers = [first, second], stale = false): DirectoryResult {
  return {
    servers,
    total: servers.length,
    page: 1,
    pages: 1,
    updatedAt: Date.now(),
    retrievedAt: Date.now(),
    stale,
    warning: stale ? 'Uppgifterna kan vara inaktuella. Senast tillgängliga lista visas.' : '',
    source: 'Wipe Board',
  };
}
test('serverlista har EU-standard, deklarerat wipefilter, sortering och kopiering utan Rust+-anslutning', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async (text: string) => {
          (window as any).__serverClipboard = text;
        },
      },
    });
  });
  const requests: URL[] = [];
  await page.route('**/api/live/**', (route) => route.fulfill({ json: live }));
  await page.route('**/api/servers?*', async (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    await route.fulfill({
      json: response(
        url.searchParams.get('day') === 'thu' || url.searchParams.get('group') === '2'
          ? [first]
          : [first, second],
      ),
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Servrar', exact: true }).click();
  await expect(page.getByLabel('Serverregion')).toHaveValue('EU');
  await expect(page.getByRole('region', { name: 'Serverresultat' })).toContainText(
    'Rustoria EU Main',
  );
  await expect(page.getByText('Inget deklarerat schema', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/server-directory.png', fullPage: true });
  await page.getByLabel('Gruppgräns').selectOption('2');
  await expect(page.getByRole('region', { name: 'Serverresultat' })).not.toContainText(
    'Facepunch EU',
  );
  await expect.poll(() => requests.at(-1)?.searchParams.get('group')).toBe('2');
  await expect(page.getByRole('region', { name: 'Serverresultat' })).toContainText('Duo (max 2)');
  await page.getByLabel('Deklarerad wipedag').selectOption('thu');
  await expect(page.getByRole('region', { name: 'Serverresultat' })).not.toContainText(
    'Facepunch EU',
  );
  await page.getByLabel('Sök server', { exact: true }).fill('Rustoria');
  await page.getByLabel('Sortera servrar').selectOption('wipe');
  await expect
    .poll(() => [requests.at(-1)?.searchParams.get('q'), requests.at(-1)?.searchParams.get('sort')])
    .toEqual(['Rustoria', 'wipe']);
  await page.getByRole('button', { name: 'Kopiera anslutning till Rustoria EU Main' }).click();
  await expect(page.getByText('Kopierat', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__serverClipboard)).toBe(
    'client.connect 203.0.113.1:28015',
  );
  await page.reload();
  await page.getByRole('button', { name: 'Servrar', exact: true }).click();
  await expect(page.getByLabel('Deklarerad wipedag')).toHaveValue('thu');
  await expect(page.getByLabel('Gruppgräns')).toHaveValue('2');
  await expect(page.getByLabel('Sök server', { exact: true })).toHaveValue('Rustoria');
});
test('serverlista visar inaktuell data och begripliga fel utan att tappa sista listan', async ({
  page,
}) => {
  let fail = false;
  await page.route('**/api/live/**', (route) => route.fulfill({ json: live }));
  await page.route('**/api/servers?*', (route) =>
    route.fulfill(
      fail
        ? {
            status: 503,
            json: { error: 'Serverlistan kunde inte hämtas. Försök igen om en stund.' },
          }
        : { json: response([first], true) },
    ),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Servrar', exact: true }).click();
  await expect(page.getByText(/Uppgifterna kan vara inaktuella/)).toBeVisible();
  fail = true;
  await page.getByRole('button', { name: 'Uppdatera serverlistan' }).click();
  await expect(page.getByRole('alert')).toContainText('Serverlistan kunde inte hämtas');
  await expect(page.getByRole('region', { name: 'Serverresultat' })).toContainText(
    'Rustoria EU Main',
  );
});
