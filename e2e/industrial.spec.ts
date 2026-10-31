import { test, expect } from '@playwright/test';
test('ugnen saknar Passthrough och varnar tydligt vid 0 och 2 rW', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await page.getByRole('button', { name: 'Ny krets', exact: true }).click();
  await page.getByTestId('palette-furnace').click();
  const furnace = page.locator('.component-card').filter({ hasText: 'Electric Furnace + Adaptor' });
  await expect(furnace).toHaveAttribute('data-power-status', 'missing');
  await expect(furnace).toContainText('Saknar ström · 0 / 3 rW');
  await expect(
    page.getByLabel('Electric Furnace + Adaptor Passthrough', { exact: true }),
  ).toHaveCount(0);
  await page.getByTestId('palette-solar').click();
  await page.getByTestId('palette-branch').click();
  await page.getByLabel('Large Solar Panel Power Out', { exact: true }).click();
  await page.getByLabel('Electrical Branch Power In', { exact: true }).click();
  await page.getByLabel('Electrical Branch Branch Out', { exact: true }).click();
  await page.getByLabel('Electric Furnace + Adaptor Power In', { exact: true }).click();
  await expect(furnace).toHaveAttribute('data-power-status', 'insufficient');
  await expect(furnace).toContainText('För lite ström · 2 / 3 rW');
  await page.locator('.component-card').filter({ hasText: 'Electrical Branch' }).click();
  await page.locator('.inspector').getByLabel('Branch Out (rW)').fill('3');
  await expect(furnace).toHaveAttribute('data-power-status', 'ok');
  await expect(furnace).not.toHaveClass(/is-power-warning/);
  await furnace.click();
  await page.locator('.inspector').getByLabel('Aktiverad', { exact: true }).uncheck();
  await expect(furnace).toContainText('Avstängd');
  await expect(furnace).not.toHaveClass(/is-power-warning/);
});
test('fyra blueprint-platser och separata maskinlager sparas och återöppnas', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await page.getByRole('button', { name: 'Ny krets', exact: true }).click();
  await page.getByTestId('palette-crafter').click();
  const inspector = page.locator('.inspector');
  await inspector.getByLabel('Blueprint-plats 1', { exact: true }).selectOption('gunpowder');
  await inspector.getByLabel('Blueprint-plats 2', { exact: true }).selectOption('ammo.rifle');
  await inspector.getByLabel('Blueprint-plats 3', { exact: true }).selectOption('');
  await inspector.getByLabel('Blueprint-plats 4', { exact: true }).selectOption('syringe.medical');
  await expect(inspector.locator('.machine-slot')).toHaveCount(13);
  await expect(inspector.locator('.machine-slot').filter({ hasText: '1 / 1' })).toHaveCount(3);
  await page.waitForTimeout(900);
  await page.reload();
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await page.locator('.react-flow__node').click();
  for (const [i, id] of ['gunpowder', 'ammo.rifle', '', 'syringe.medical'].entries())
    await expect(inspector.getByLabel('Blueprint-plats ' + (i + 1), { exact: true })).toHaveValue(
      id,
    );
});
