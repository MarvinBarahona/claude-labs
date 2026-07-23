import { test, expect } from '@playwright/test';
import { navLink } from './support/nav-link';

test('is reachable from the nav, loads its docs, and runs a code-execution round trip with an output file', async ({
  page,
}) => {
  await page.goto('/home');

  await test.step('Data & Code Sandbox is reachable from the nav', async () => {
    const link = navLink(page, 'Data & Code Sandbox');
    await link.click();
    await expect(page).toHaveURL(/\/data-code-sandbox$/);
  });

  await test.step('in-app docs panel renders non-empty content', async () => {
    const docsContent = page.locator('app-docs-panel .docs-panel-content');
    await expect(docsContent).toBeVisible();
    expect((await docsContent.innerText()).trim().length).toBeGreaterThan(0);
  });

  await test.step('submitting a prompt with the skill off renders the executed-code view and an output file preview', async () => {
    await page.getByLabel('Analysis prompt').fill('Chart commit frequency by month.');
    await page.getByRole('button', { name: 'Run' }).click();

    const codeList = page.getByTestId('executed-code-list');
    await expect(codeList.getByTestId('executed-command')).toHaveText('python analyze.py');
    const fallbackText = 'This is a fabricated fake-mode response';
    await expect(codeList.getByTestId('executed-stdout')).toContainText(fallbackText);

    const fileList = page.getByTestId('output-file-list');
    await expect(fileList.getByRole('link')).toBeVisible();

    await expect(page.getByTestId('skill-used-badge')).toContainText('No');

    const inspector = page.locator('app-inspector-panel');
    await expect(inspector.getByText('stop_reason: end_turn')).toBeVisible();
  });
});
