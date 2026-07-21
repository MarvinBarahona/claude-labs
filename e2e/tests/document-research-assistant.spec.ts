import { test, expect } from '@playwright/test';
import { navLinkAfter } from './support/nav-link-after';

test('is reachable as the nav entry right after Live Tool-Use Console, loads its docs, and completes a document research turn non-streamed then streamed', async ({
  page,
}) => {
  await page.goto('/live-tool-use-console');

  await test.step('Document Research Assistant is the nav entry right after Live Tool-Use Console', async () => {
    const link = await navLinkAfter(page, 'Live Tool-Use Console');
    await expect(link).toHaveText('Document Research Assistant');
    await link.click();
    await expect(page).toHaveURL(/\/document-research-assistant$/);
    await expect(link).toHaveClass(/nav-link-active/);
  });

  await test.step('in-app docs panel renders non-empty content', async () => {
    const docsContent = page.locator('app-docs-panel .docs-panel-content');
    await expect(docsContent).toBeVisible();
    expect((await docsContent.innerText()).trim().length).toBeGreaterThan(0);
  });

  const answerText = page.getByTestId('answer-text').last();
  const notesPanel = page.getByTestId('notes-panel');
  const citationMarkers = page.getByTestId('citation-marker');
  const inspector = page.locator('app-inspector-panel');
  const fallbackText =
    'This is a fabricated fake-mode response — no real Claude API call was made, and no response was queued for this call.';

  await test.step('starting a session against a real (fake-mode) arXiv paper renders its metadata', async () => {
    await page.getByLabel('arXiv ID or URL').fill('2301.00234');
    await page.getByRole('button', { name: 'Start' }).click();

    await expect(page.getByTestId('paper-summary')).toBeVisible();
    await expect(page.getByLabel('Question')).toBeVisible();
  });

  await test.step('a non-streamed question runs the text-editor tool, renders a cited answer, and updates the notes panel', async () => {
    await page.getByLabel('Question').fill('What is this paper about?');
    await page.getByRole('button', { name: 'Ask' }).click();

    await expect(answerText).toHaveText(fallbackText);
    await expect(citationMarkers.first()).toBeVisible();
    await expect(notesPanel).toContainText('Fake-mode notes');

    await expect(inspector.getByText('stop_reason: end_turn')).toBeVisible();
  });

  await test.step('toggling streaming on and asking a follow-up question runs the tool loop live', async () => {
    await page.getByLabel('Stream response').check();
    await page.getByLabel('Question').fill('Note anything else important.');
    await page.getByRole('button', { name: 'Ask' }).click();

    await expect(answerText).toHaveText(fallbackText);
    await expect(notesPanel).toContainText('Fake-mode notes');

    await expect(inspector.getByText('Stream events')).toBeVisible();
  });
});
