import { test, expect } from '@playwright/test';
import { navLinkAfter } from './support/nav-link-after';

test('is reachable as the nav entry right after Structured Output Console, loads its docs, and completes a tool-use turn non-streamed then streamed', async ({
  page,
}) => {
  await page.goto('/structured-output-console');

  await test.step('Live Tool-Use Console is the nav entry right after Structured Output Console', async () => {
    const link = await navLinkAfter(page, 'Structured Output Console');
    await expect(link).toHaveText('Live Tool-Use Console');
    await link.click();
    await expect(page).toHaveURL(/\/live-tool-use-console$/);
    await expect(link).toHaveClass(/nav-link-active/);
  });

  await test.step('in-app docs panel renders non-empty content', async () => {
    const docsContent = page.locator('app-docs-panel .docs-panel-content');
    await expect(docsContent).toBeVisible();
    expect((await docsContent.innerText()).trim().length).toBeGreaterThan(0);
  });

  const toolActivityItems = page.locator('[data-testid="tool-activity-list"] li');
  const answerText = page.getByTestId('answer-text');
  const inspector = page.locator('app-inspector-panel');
  // Unqueued fake-mode calls fabricate one tool_use round trip, then fall back to this fixed text.
  const fallbackText =
    'This is a fabricated fake-mode response — no real Claude API call was made, and no response was queued for this call.';

  await test.step('a non-streamed weather question runs get_weather and renders the fallback answer', async () => {
    await page.getByRole('radio', { name: 'Haiku' }).check();
    await page.getByLabel('Question').fill("What's the weather in Tokyo?");
    await page.getByRole('button', { name: 'Ask' }).click();

    await expect(toolActivityItems).toHaveCount(1);
    await expect(toolActivityItems.first()).toContainText('get_weather');
    await expect(toolActivityItems.first()).toContainText('done');
    await expect(answerText).toHaveText(fallbackText);

    await expect(inspector.getByText('Request (call 1)')).toBeVisible();
    await expect(inspector.getByText('stop_reason: end_turn')).toBeVisible();
  });

  await test.step('toggling streaming on and asking a repo-stats question runs get_repo_stats live', async () => {
    await page.getByLabel('Stream response').check();
    await page.getByLabel('Question').fill('What are the latest repo stats?');
    await page.getByRole('button', { name: 'Ask' }).click();

    await expect(toolActivityItems).toHaveCount(1);
    await expect(toolActivityItems.first()).toContainText('get_repo_stats');
    await expect(toolActivityItems.first()).toContainText('done');
    await expect(answerText).toHaveText(fallbackText);

    await expect(inspector.getByText('Stream events')).toBeVisible();
    await expect(inspector.getByText('Request (call 1)')).toBeVisible();
  });
});
