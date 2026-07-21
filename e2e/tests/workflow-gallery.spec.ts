import { test, expect } from '@playwright/test';
import { navLinkAfter } from './support/nav-link-after';

test('is reachable as the nav entry right after Document Research Assistant, loads its docs, and runs the full routing/chaining/parallelization/evaluator-optimizer pipeline', async ({
  page,
}) => {
  await page.goto('/document-research-assistant');

  await test.step('Workflow Gallery is the nav entry right after Document Research Assistant', async () => {
    const link = await navLinkAfter(page, 'Document Research Assistant');
    await expect(link).toHaveText('Workflow Gallery');
    await link.click();
    await expect(page).toHaveURL(/\/workflow-gallery$/);
    await expect(link).toHaveClass(/nav-link-active/);
  });

  await test.step('in-app docs panel renders non-empty content', async () => {
    const docsContent = page.locator('app-docs-panel .docs-panel-content');
    await expect(docsContent).toBeVisible();
    expect((await docsContent.innerText()).trim().length).toBeGreaterThan(0);
  });

  await test.step('running the one fake-mode issue completes the full pipeline', async () => {
    // FakeGithubClient's canned default issue is always #1 — the only option the picker offers.
    await page.getByLabel('Select an issue').selectOption('1');
    await page.getByRole('button', { name: 'Run' }).click();

    // Routing and grading are unqueued fake-mode calls: routing always falls back to its
    // schema's first enum value, and every grading call always fails, so this pipeline
    // always runs all 3 attempts and never passes.
    await expect(page.getByTestId('route')).toHaveText('bug');
    await expect(page.getByTestId('draft-text')).toContainText(
      'This is a fabricated fake-mode response',
    );

    const gradingItems = page.getByTestId('grading-list').locator('li');
    await expect(gradingItems).toHaveCount(3);
    await expect(gradingItems.first()).toContainText('tone');
    await expect(gradingItems.first()).toContainText('Fail');
    await expect(gradingItems.first()).toContainText(
      'fake mode — no response was queued for this call',
    );

    await expect(page.getByTestId('iteration-summary')).toContainText('Did not pass after 3 attempts');
  });

  await test.step('the inspector shows the full multi-call pipeline trace', async () => {
    const inspector = page.locator('app-inspector-panel');
    // 1 routing + 3 attempts x (draft + refine + 3 grading) = 16 calls; the last becomes the
    // envelope's own top-level request/response, so the trace lists 15 numbered prior calls.
    await expect(inspector.getByText('Request (call 1)')).toBeVisible();
    await expect(inspector.getByText('Request (call 15)')).toBeVisible();
    await expect(inspector.getByText('stop_reason: end_turn')).toBeVisible();
  });
});
