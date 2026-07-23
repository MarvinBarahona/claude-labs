import { test, expect } from '@playwright/test';
import { navLink } from './support/nav-link';

test('is reachable from the nav, loads its docs, and runs the 3-way thinking comparison', async ({
  page,
}) => {
  await page.goto('/home');

  await test.step('Extended Thinking Bench is reachable from the nav, right after Workflow Gallery', async () => {
    const link = navLink(page, 'Extended Thinking Bench');
    await link.click();
    await expect(page).toHaveURL(/\/extended-thinking-bench$/);
    await expect(link).toHaveClass(/nav-link-active/);
  });

  await test.step('in-app docs panel renders non-empty content', async () => {
    const docsContent = page.locator('app-docs-panel .docs-panel-content');
    await expect(docsContent).toBeVisible();
    expect((await docsContent.innerText()).trim().length).toBeGreaterThan(0);
  });

  await test.step('the picker auto-selects the one fake-mode issue, so Run works without touching the dropdown first', async () => {
    // Regression check: the disabled first <option> makes a real browser auto-display the next option with no `change` event — the component must independently default-select it, or Run stays silently disabled.
    await expect(page.getByLabel('Select an issue')).toHaveValue('1');
    await expect(page.getByRole('button', { name: 'Run' })).toBeEnabled();
  });

  await test.step('running the one fake-mode issue renders all 3 comparison columns', async () => {
    // No selectOption() call here — the previous step already proved the picker auto-selects, so clicking Run alone is the regression check.
    await page.getByRole('button', { name: 'Run' }).click();

    await expect(page.getByTestId('comparison-result')).toBeVisible();

    const offColumn = page.getByTestId('comparison-column-thinking-off');
    const mediumColumn = page.getByTestId('comparison-column-thinking-medium');
    const highColumn = page.getByTestId('comparison-column-thinking-high');

    await expect(offColumn).toBeVisible();
    await expect(mediumColumn).toBeVisible();
    await expect(highColumn).toBeVisible();

    const fallbackText =
      'This is a fabricated fake-mode response — no real Claude API call was made, and no response was queued for this call.';
    await expect(offColumn.getByTestId('answer-text')).toHaveText(fallbackText);
    await expect(mediumColumn.getByTestId('answer-text')).toHaveText(fallbackText);
    await expect(highColumn.getByTestId('answer-text')).toHaveText(fallbackText);
  });

  await test.step('each column feeds its own inspector-panel instance', async () => {
    const inspectors = page.locator('app-inspector-panel');
    await expect(inspectors).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      await expect(inspectors.nth(i).getByText('stop_reason: end_turn')).toBeVisible();
    }
  });
});
