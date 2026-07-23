import { test, expect } from '@playwright/test';
import { navLink } from './support/nav-link';

test('is reachable from the nav, loads its docs, and runs a vision request non-streamed then streamed', async ({
  page,
}) => {
  await page.goto('/home');

  await test.step('Vision Lab is reachable from the nav', async () => {
    const link = navLink(page, 'Vision Lab');
    await link.click();
    await expect(page).toHaveURL(/\/vision-lab$/);
    await expect(link).toHaveClass(/nav-link-active/);
  });

  await test.step('in-app docs panel renders non-empty content', async () => {
    const docsContent = page.locator('app-docs-panel .docs-panel-content');
    await expect(docsContent).toBeVisible();
    expect((await docsContent.innerText()).trim().length).toBeGreaterThan(0);
  });

  const result = page.getByTestId('vision-result');
  const gallery = page.getByTestId('image-gallery');
  const answerText = page.getByTestId('answer-text');
  const capBanner = page.getByTestId('dimension-cap-banner');
  const inspector = page.locator('app-inspector-panel');
  const fallbackText =
    'This is a fabricated fake-mode response — no real Claude API call was made, and no response was queued for this call.';

  await test.step('a single-image, non-streamed run renders the gallery and answer with no dimension-cap banner', async () => {
    await page.getByLabel('Search query').fill('red panda');
    await page.getByRole('radio', { name: '1 images' }).check();
    await page.getByLabel('Instruction').fill('Describe this image.');
    await page.getByRole('button', { name: 'Run' }).click();

    await expect(result).toBeVisible();
    await expect(gallery.locator('img')).toHaveCount(1);
    await expect(answerText).toHaveText(fallbackText);
    await expect(capBanner).toHaveCount(0);

    await expect(inspector.getByText('stop_reason: end_turn')).toBeVisible();
    await expect(inspector.getByText('in 10 / out 10')).toBeVisible();
  });

  await test.step('a multi-image, streamed run shows the dimension-cap banner and streams the answer', async () => {
    await page.getByRole('radio', { name: '2 images' }).check();
    await page.getByLabel('Stream response').check();
    await page.getByRole('button', { name: 'Run' }).click();

    await expect(gallery.locator('img')).toHaveCount(2);
    await expect(answerText).toHaveText(fallbackText);
    await expect(capBanner).toBeVisible();

    await expect(inspector.getByText('Stream events')).toBeVisible();
    await expect(inspector.getByText('stop_reason: end_turn')).toBeVisible();
  });
});
