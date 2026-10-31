import { test, expect } from '@playwright/test';
test('NEXUS öppnas som redigerbar referens med alla anslutningar och sparad guide', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await page.getByRole('button', { name: 'Exempelbyggen', exact: true }).click();
  await page.getByRole('textbox', { name: 'Sök exempelbyggen' }).fill('NEXUS');
  await expect(page.locator('.example-card')).toHaveCount(1);
  await page.getByTestId('example-nexus').getByRole('button', { name: 'Öppna egen kopia' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(24);
  await expect(page.locator('.react-flow__edge')).toHaveCount(32);
  await expect(page.getByRole('button', { name: 'Simulera', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Stega simulering', exact: true })).toBeDisabled();
  await expect(page.getByRole('region', { name: 'Guide för exempelbygge' })).toContainText(
    'NEXUS Core',
  );
  await expect(page.locator('.is-power-warning')).toHaveCount(0);
  await page.getByRole('button', { name: 'Dölj guide', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Visa guide', exact: true })).toBeVisible();
  await page.waitForTimeout(900);
  await page.reload();
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await expect(page.locator('.react-flow__node')).toHaveCount(24);
  await expect(page.getByRole('button', { name: 'Simulera', exact: true })).toBeDisabled();
});
test('exempelfilter och egna kopior bevarar ett snabbt ändrat tidigare bygge', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await page.getByRole('button', { name: 'Exempelbyggen', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Filtrera exempel efter ursprung' })
    .selectOption('ElRusty');
  await page
    .locator('.example-categories')
    .getByRole('button', { name: 'Industrial', exact: true })
    .click();
  await expect(page.locator('.example-card')).toHaveCount(1);
  await page
    .getByTestId('example-auto-smelter')
    .getByRole('button', { name: 'Öppna egen kopia' })
    .click();
  await expect(page.getByRole('button', { name: 'Simulera', exact: true })).toBeEnabled();
  const original = await page.locator('.react-flow__node').first().getAttribute('data-id');
  await page.getByRole('textbox', { name: 'Kretsnamn' }).fill('Mitt smältverk');
  await page.getByRole('button', { name: 'Exempelbyggen', exact: true }).click();
  await page
    .getByTestId('example-auto-smelter')
    .getByRole('button', { name: 'Öppna egen kopia' })
    .click();
  await expect(page.getByRole('textbox', { name: 'Kretsnamn' })).toHaveValue(
    'Automatisk smältlinje · egen kopia',
  );
  expect(await page.locator('.react-flow__node').first().getAttribute('data-id')).not.toBe(
    original,
  );
  await page.getByRole('button', { name: /^Sparat/ }).click();
  await expect(page.locator('.saved-card').filter({ hasText: 'Mitt smältverk' })).toHaveCount(1);
});
