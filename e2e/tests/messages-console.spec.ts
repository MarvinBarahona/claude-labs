import { test, expect } from '@playwright/test';
import { navLink } from './support/nav-link';

test('is reachable from the nav, nav/docs/banner render, and a non-streamed then streamed turn complete', async ({
  page,
}) => {
  await page.goto('/home');

  await test.step('Messages Console is reachable from the nav', async () => {
    const link = navLink(page, 'Messages Console');
    await link.click();
    await expect(page).toHaveURL(/\/messages-console$/);
    await expect(link).toHaveClass(/nav-link-active/);
  });

  await test.step('fake-mode banner is visible on page load', async () => {
    await expect(
      page.getByText('This is a demo instance running on fabricated data'),
    ).toBeVisible();
  });

  await test.step('in-app docs panel renders non-empty content', async () => {
    const docsContent = page.locator('app-docs-panel .docs-panel-content');
    await expect(docsContent).toBeVisible();
    expect((await docsContent.innerText()).trim().length).toBeGreaterThan(0);
  });

  const transcriptItems = page.locator('[data-testid="transcript-list"] li');
  const inspector = page.locator('app-inspector-panel');

  await test.step('a non-streamed send renders the user message right-aligned, the reply left-aligned, and the inspector', async () => {
    await page.getByRole('radio', { name: 'Haiku' }).check();
    await page.getByLabel('System prompt').fill('You are a terse assistant.');
    await page.getByLabel('Message').fill('Hello there');
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(transcriptItems).toHaveCount(2);
    await expect(transcriptItems.nth(0)).toHaveClass(/justify-end/);
    await expect(transcriptItems.nth(0)).toContainText('Hello there');
    await expect(transcriptItems.nth(1)).not.toHaveClass(/justify-end/);
    await expect(transcriptItems.nth(1)).toContainText('fabricated fake-mode response');

    await expect(inspector.getByText('stop_reason: end_turn')).toBeVisible();
    await expect(inspector.getByText('in 10 / out 10')).toBeVisible();
    await expect(inspector).toContainText('Hello there');
  });

  await test.step('toggling streaming on renders the reply incrementally, ending in the same state, with matching usage/stopReason', async () => {
    await page.getByLabel('Stream response').check();
    await page.getByLabel('Message').fill('Second message');
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(transcriptItems).toHaveCount(4);
    await expect(transcriptItems.nth(2)).toHaveClass(/justify-end/);
    await expect(transcriptItems.nth(2)).toContainText('Second message');
    await expect(transcriptItems.nth(3)).not.toHaveClass(/justify-end/);
    await expect(transcriptItems.nth(3)).toContainText('fabricated fake-mode response');

    await expect(inspector.getByText('Stream events')).toBeVisible();
    await expect(inspector.locator('ol li')).not.toHaveCount(0);

    // Same fallback fixture backs both the non-streamed and streamed unqueued calls, so usage/stopReason match.
    await expect(inspector.getByText('stop_reason: end_turn')).toBeVisible();
    await expect(inspector.getByText('in 10 / out 10')).toBeVisible();
  });

  await test.step("the inspector reflects the streamed turn — the most recently completed send", async () => {
    await expect(inspector).toContainText('Second message');
  });
});
