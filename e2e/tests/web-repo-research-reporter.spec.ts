import { test, expect } from '@playwright/test';
import { navLink } from './support/nav-link';

test('is reachable from the nav, loads its docs, and runs a research brief with both search and DeepWiki calls', async ({
  page,
}) => {
  await page.goto('/home');

  await test.step('Web & Repo Research Reporter is reachable from the nav', async () => {
    const link = navLink(page, 'Web & Repo Research Reporter');
    await link.click();
    await expect(page).toHaveURL(/\/web-repo-research-reporter$/);
  });

  await test.step('in-app docs panel renders non-empty content', async () => {
    const docsContent = page.locator('app-docs-panel .docs-panel-content');
    await expect(docsContent).toBeVisible();
    expect((await docsContent.innerText()).trim().length).toBeGreaterThan(0);
  });

  await test.step('submitting a question at the default Max Searches renders the brief and both counters', async () => {
    await page
      .getByLabel('Research question')
      .fill('What testing approach does this repo use?');
    await page.getByRole('button', { name: 'Run' }).click();

    // Unqueued fake-mode calls fall back to this fixed value for every schema field.
    const fallbackText = 'fake mode — no response was queued for this call';
    const result = page.getByTestId('brief-result');
    await expect(result.getByText(fallbackText).first()).toBeVisible();

    await expect(page.getByTestId('searches-performed')).toContainText('1');
    await expect(page.getByTestId('mcp-calls-performed')).toContainText('1');

    const inspector = page.locator('app-inspector-panel');
    await expect(inspector.getByText('stop_reason: end_turn')).toBeVisible();
    await expect(inspector).toContainText('mcp_tool_result');
    await expect(inspector).toContainText('web_search_tool_result');
  });
});
