import { test, expect } from '@playwright/test';

test('Nih Memory Cell har separata kabelspår och identifierbara ändpunkter', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await page.getByRole('button', { name: 'Exempelbyggen', exact: true }).click();
  await page
    .getByTestId('example-nih-core')
    .getByRole('button', { name: 'Öppna egen kopia' })
    .click();
  await page.getByRole('button', { name: 'Dölj guide', exact: true }).click();
  await page.getByRole('button', { name: 'Dölj komponenter', exact: true }).click();
  await page.getByRole('button', { name: 'Dölj inställningar', exact: true }).click();
  await page.getByRole('button', { name: 'Fit View', exact: true }).click();
  const memory = page
    .locator('.react-flow__node')
    .filter({ hasText: 'Välj laddning / direktmatning' });
  await expect(memory).toBeVisible();
  const memoryId = await memory.getAttribute('data-id');
  const incoming = page.locator(`.react-flow__edge[aria-label$="to ${memoryId}"]`);
  await expect(incoming).toHaveCount(3);
  const routes = await incoming.locator('.react-flow__edge-path').evaluateAll((elements) =>
    elements.map((element) => {
      const values = element
        .getAttribute('d')!
        .match(/-?\d+(?:\.\d+)?/g)!
        .map(Number);
      return Array.from({ length: values.length / 2 }, (_, i) => ({
        x: values[i * 2],
        y: values[i * 2 + 1],
      }));
    }),
  );
  for (let a = 0; a < routes.length; a++)
    for (let b = a + 1; b < routes.length; b++) {
      for (let i = 1; i < routes[a].length; i++)
        for (let j = 1; j < routes[b].length; j++) {
          const [p, q, r, s] = [routes[a][i - 1], routes[a][i], routes[b][j - 1], routes[b][j]];
          if (p.x === q.x && r.x === s.x && p.x === r.x)
            expect(
              Math.min(Math.max(p.y, q.y), Math.max(r.y, s.y)) -
                Math.max(Math.min(p.y, q.y), Math.min(r.y, s.y)),
            ).toBeLessThanOrEqual(0);
          if (p.y === q.y && r.y === s.y && p.y === r.y)
            expect(
              Math.min(Math.max(p.x, q.x), Math.max(r.x, s.x)) -
                Math.max(Math.min(p.x, q.x), Math.min(r.x, s.x)),
            ).toBeLessThanOrEqual(0);
        }
    }
  // Selecting through the keyboard avoids ambiguous pointer hits at a crossing.
  await incoming.first().focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Markerad kabel')).toContainText('Power In');
  await expect(page.getByLabel('Markerad kabel')).toContainText('Välj laddning / direktmatning');
  await expect(page.getByLabel('Markerad kabel')).toContainText('Kopplingsreferens');
});
