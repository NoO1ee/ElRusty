import { test, expect } from '@playwright/test';
async function open(page: import('@playwright/test').Page, id: string) {
  await page.goto('/');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await page.getByRole('button', { name: 'Exempelbyggen', exact: true }).click();
  await page
    .getByTestId('example-learn-' + id)
    .getByRole('button', { name: 'Öppna egen kopia' })
    .click();
}
test('AND visar visuella regler och kan provas utan att köra klockan', async ({ page }) => {
  await open(page, 'and');
  const guide = page.getByRole('region', { name: 'Guide för exempelbygge' });
  await expect(page.locator('.lesson-area')).toHaveCount(3);
  await expect(guide.getByRole('table', { name: 'Sanningstabell för AND Switch' })).toBeVisible();
  await expect(guide.getByRole('img', { name: 'Visuell signalbild för AND Switch' })).toBeVisible();
  const result = guide.getByLabel('Resultat för nivån');
  await expect(result).toHaveText('Lampan är släckt');
  await guide.getByLabel('A · 20 rW', { exact: true }).check();
  await expect(result).toHaveText('Lampan är släckt');
  await guide.getByLabel('B · 40 rW', { exact: true }).check();
  await expect(result).toHaveText('Lampan lyser');
  await guide.getByLabel('A · 20 rW', { exact: true }).uncheck();
  await expect(result).toHaveText('Lampan är släckt');
  await expect(page.locator('.simulation-strip')).toContainText('0.00 s');
});
test('Memory Cell behåller Set efter släpp och Toggle fungerar på två kanter', async ({ page }) => {
  await open(page, 'memory');
  const guide = page.getByRole('region', { name: 'Guide för exempelbygge' }),
    result = guide.getByLabel('Resultat för nivån');
  await guide.getByLabel('Set · Sätt minnet', { exact: true }).check();
  await expect(result).toHaveText('Lampan lyser');
  await guide.getByLabel('Set · Sätt minnet', { exact: true }).uncheck();
  await expect(result).toHaveText('Lampan lyser');
  await guide.getByLabel('Reset · Nollställ', { exact: true }).check();
  await expect(result).toHaveText('Lampan är släckt');
  await guide.getByRole('button', { name: 'Mellan', exact: true }).click();
  await guide.getByLabel('Toggle · Växla läge', { exact: true }).check();
  await expect(result).toHaveText('Lampan lyser');
  await guide.getByLabel('Toggle · Växla läge', { exact: true }).uncheck();
  await expect(result).toHaveText('Lampan lyser');
  await guide.getByLabel('Toggle · Växla läge', { exact: true }).check();
  await expect(result).toHaveText('Lampan är släckt');
});
test('nivåval fokuserar arbetsytan och alla tre områden finns kvar efter omladdning', async ({
  page,
}) => {
  await open(page, 'xor');
  const guide = page.getByRole('region', { name: 'Guide för exempelbygge' });
  const viewport = page.locator('.react-flow__viewport');
  const before = await viewport.getAttribute('style');
  await guide.getByRole('button', { name: 'Avancerad', exact: true }).click();
  await expect(guide.getByRole('button', { name: 'Avancerad', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(viewport).not.toHaveAttribute('style', before!);
  await expect(guide.getByLabel('D · Zon 2, villkor 2', { exact: true })).toBeVisible();
  await page.waitForTimeout(900);
  await page.reload();
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await expect(page.locator('.lesson-area')).toHaveCount(3);
  await expect(guide.getByRole('button', { name: 'Avancerad', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
