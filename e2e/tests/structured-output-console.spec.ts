import { test, expect } from '@playwright/test';
import { navLink } from './support/nav-link';

test('is reachable from the nav, loads its docs, and renders a parsed structured-output call', async ({
  page,
}) => {
  await page.goto('/home');

  await test.step('Structured Output Console is reachable from the nav', async () => {
    const link = navLink(page, 'Structured Output Console');
    await link.click();
    await expect(page).toHaveURL(/\/structured-output-console$/);
  });

  await test.step('in-app docs panel renders non-empty content', async () => {
    const docsContent = page.locator('app-docs-panel .docs-panel-content');
    await expect(docsContent).toBeVisible();
    expect((await docsContent.innerText()).trim().length).toBeGreaterThan(0);
  });

  await test.step('selecting a model and submitting free text renders the parsed fields and the inspector', async () => {
    await page.getByRole('radio', { name: 'Opus' }).check();
    await page
      .getByLabel('Structured input')
      .fill('The product launch went great and the team is thrilled.');
    await page.getByRole('button', { name: 'Run' }).click();

    // Unqueued fake-mode calls fall back to this fixed value for every schema field.
    const fallbackText = 'fake mode — no response was queued for this call';
    const result = page.getByTestId('structured-result');
    await expect(result.getByText(fallbackText).first()).toBeVisible();
    // Renders both as the summary and as the sole action item.
    await expect(result.getByText(fallbackText)).toHaveCount(2);
    await expect(result.getByText('positive', { exact: true })).toBeVisible();

    const inspector = page.locator('app-inspector-panel');
    await expect(inspector.getByText('stop_reason: end_turn')).toBeVisible();
    await expect(inspector.getByText('in 10 / out 10')).toBeVisible();
    await expect(inspector).toContainText(fallbackText);
  });
});
