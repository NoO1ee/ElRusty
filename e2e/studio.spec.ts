import { test, expect } from '@playwright/test';
test('panelerna döljs oberoende och återställs efter omladdning', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await expect(page.locator('.library')).toBeVisible();
  await page.getByRole('button', { name: 'Dölj komponenter', exact: true }).click();
  await expect(page.locator('.library')).toHaveCount(0);
  await expect(page.locator('.inspector')).toBeVisible();
  await page.getByRole('button', { name: 'Dölj inställningar', exact: true }).click();
  await expect(page.locator('.inspector')).toHaveCount(0);
  await page.waitForTimeout(900);
  await page.reload();
  await expect(page.locator('.library')).toHaveCount(0);
  await expect(page.locator('.inspector')).toHaveCount(0);
});
test('filter är fristående och sparas för redigering', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await page.getByRole('button', { name: 'Conveyor-filter', exact: true }).click();
  await page.getByRole('textbox', { name: 'Sök Rust-items' }).fill('Wood');
  await page
    .locator('.item-tile')
    .filter({ hasText: /^Woodwood/ })
    .click();
  await page
    .locator('.filter-rules>label')
    .filter({ hasText: 'Filternamn' })
    .locator('input')
    .fill('Mitt wood-filter');
  await page.getByRole('button', { name: 'Spara filter', exact: true }).click();
  await page.getByRole('button', { name: /^Sparat/ }).click();
  const card = page.locator('.saved-card').filter({ hasText: 'Mitt wood-filter' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Öppna och redigera' }).click();
  await expect(page.locator('.filter-rule')).toHaveCount(1);
  await page.getByRole('button', { name: 'Kretsbyggare', exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(5);
});
test('komponent kan placeras, raderas och ångras', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await page.getByRole('button', { name: 'Ny krets', exact: true }).click();
  await page.getByTestId('palette-solar').click();
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await page.keyboard.press('Delete');
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
});
test('klickanslutning fungerar och Delete påverkar inte textfält', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await page.getByRole('button', { name: 'Ny krets', exact: true }).click();
  await page.getByTestId('palette-solar').click();
  await page.getByTestId('palette-light').click();
  await page.getByLabel('Large Solar Panel Power Out', { exact: true }).click();
  await page.getByLabel('Ceiling Light Power In', { exact: true }).click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await page.getByRole('textbox', { name: 'Kretsnamn' }).fill('A');
  await page.keyboard.press('Delete');
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
});
test('en kabelfärg ändras och sparas utan att andra kablar påverkas', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  const paths = page.locator('.react-flow__edge-path');
  const before = await paths.evaluateAll((els) => els.map((el) => (el as SVGElement).style.stroke));
  const point = await page
    .locator('.react-flow__edge-path')
    .first()
    .evaluate((el) => {
      const path = el as SVGPathElement;
      const p = path.getPointAtLength(path.getTotalLength() / 2);
      const v = new DOMPoint(p.x, p.y).matrixTransform(path.getScreenCTM()!);
      return { x: v.x, y: v.y };
    });
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await page.getByRole('button', { name: 'Kabelfärg #bd9aff', exact: true }).click();
  const after = await paths.evaluateAll((els) => els.map((el) => (el as SVGElement).style.stroke));
  expect(after[0]).not.toBe(before[0]);
  expect(after.slice(1)).toEqual(before.slice(1));
  await page.waitForTimeout(900);
  await page.reload();
  await expect(paths.first()).toHaveCSS('stroke', 'rgb(189, 154, 255)');
});
test('Ctrl-scroll zoomar diagrammet utan att ändra dokumentets layout', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  const viewport = page.locator('.react-flow__viewport');
  const before = await viewport.getAttribute('style');
  const rect = await page.locator('.react-flow__pane').boundingBox();
  await page.mouse.move(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -300);
  await page.keyboard.up('Control');
  await expect(viewport).not.toHaveAttribute('style', before!);
});
