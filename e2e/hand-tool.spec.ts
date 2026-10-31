import { test, expect, type Page } from '@playwright/test';

async function prepare(page: Page) {
  await page.goto('/');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await expect(page.locator('.react-flow__node')).toHaveCount(5);
  await page.getByRole('button', { name: 'Fit View', exact: true }).click();
}

async function viewport(page: Page) {
  return page.locator('.react-flow__viewport').evaluate((el) => {
    const m = new DOMMatrix((el as HTMLElement).style.transform);
    return { x: m.e, y: m.f, zoom: m.a };
  });
}

async function nodePositions(page: Page) {
  return page
    .locator('.react-flow__node')
    .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).style.transform));
}

test('Ctrl + vänsterdrag panorerar arbetsytan utan att flytta komponenter eller zooma', async ({
  page,
}) => {
  await prepare(page);
  const before = await viewport(page);
  const nodesBefore = await nodePositions(page);
  const pane = await page.locator('.react-flow__pane').boundingBox();
  await page.keyboard.down('Control');
  await expect(page.locator('.canvas-shell')).toHaveClass(/hand-mode/);
  await page.mouse.move(pane!.x + pane!.width - 70, pane!.y + pane!.height - 100);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(pane!.x + pane!.width - 170, pane!.y + pane!.height - 165, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.up('Control');
  await expect(page.locator('.canvas-shell')).not.toHaveClass(/hand-mode/);
  const after = await viewport(page);
  expect(Math.abs(after.x - before.x)).toBeGreaterThan(60);
  expect(Math.abs(after.y - before.y)).toBeGreaterThan(35);
  expect(after.zoom).toBeCloseTo(before.zoom, 5);
  expect(await nodePositions(page)).toEqual(nodesBefore);
  await expect(page.getByRole('button', { name: 'Ångra', exact: true })).toBeDisabled();
});

test('Ctrl-handverktyget fungerar även över ett komponentkort', async ({ page }) => {
  await prepare(page);
  const before = await viewport(page);
  const nodesBefore = await nodePositions(page);
  const card = await page.locator('.component-header').first().boundingBox();
  await page.keyboard.down('Control');
  await expect(page.locator('.canvas-shell')).toHaveClass(/hand-mode/);
  await page.mouse.move(card!.x + 25, card!.y + 20);
  await page.mouse.down();
  await page.mouse.move(card!.x + 115, card!.y + 65, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.up('Control');
  const after = await viewport(page);
  expect(Math.abs(after.x - before.x)).toBeGreaterThan(50);
  expect(await nodePositions(page)).toEqual(nodesBefore);
});

test('vanlig vänsterdrag flyttar kortet igen efter att Ctrl släppts', async ({ page }) => {
  await prepare(page);
  await page.keyboard.down('Control');
  await expect(page.locator('.canvas-shell')).toHaveClass(/hand-mode/);
  await page.keyboard.up('Control');
  await expect(page.locator('.canvas-shell')).not.toHaveClass(/hand-mode/);
  const before = await nodePositions(page);
  const card = await page.locator('.component-header').first().boundingBox();
  await page.mouse.move(card!.x + 25, card!.y + 20);
  await page.mouse.down();
  await page.mouse.move(card!.x + 95, card!.y + 60, { steps: 12 });
  await page.mouse.up();
  const after = await nodePositions(page);
  expect(after[0]).not.toBe(before[0]);
  expect(after.slice(1)).toEqual(before.slice(1));
  await expect(page.getByRole('button', { name: 'Ångra', exact: true })).toBeEnabled();
});
