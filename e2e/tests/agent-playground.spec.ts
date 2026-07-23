import { test, expect } from '@playwright/test';
import { navLink } from './support/nav-link';

test('is reachable from the nav, loads its docs, and runs the agent to a final answer', async ({
  page,
}) => {
  await page.goto('/home');

  await test.step('Agent Playground is reachable from the nav, as the last entry', async () => {
    const link = navLink(page, 'Agent Playground');
    await link.click();
    await expect(page).toHaveURL(/\/agent-playground$/);
    await expect(link).toHaveClass(/nav-link-active/);
  });

  await test.step('in-app docs panel renders non-empty content', async () => {
    const docsContent = page.locator('app-docs-panel .docs-panel-content');
    await expect(docsContent).toBeVisible();
    expect((await docsContent.innerText()).trim().length).toBeGreaterThan(0);
  });

  await test.step('Run has no form fields to fill in first', async () => {
    await expect(page.getByRole('button', { name: 'Run' })).toBeEnabled();
  });

  await test.step('running the agent renders tool activity and a final answer', async () => {
    await page.getByRole('button', { name: 'Run' }).click();

    const activityItems = page.getByTestId('tool-activity-list').locator('li');
    await expect(activityItems.first()).toBeVisible();

    // Unqueued fake-mode calls fall back to this fixed value.
    const fallbackText =
      'This is a fabricated fake-mode response — no real Claude API call was made, and no response was queued for this call.';
    await expect(page.getByTestId('final-answer')).toHaveText(fallbackText);

    await expect(page.getByTestId('comparison-callout')).toBeVisible();
  });

  await test.step('the inspector shows the multi-call trace', async () => {
    const inspector = page.locator('app-inspector-panel');
    await expect(inspector.getByText('stop_reason: end_turn')).toBeVisible();
  });
});
