import { test, expect } from '@playwright/test';

test('loads at the root redirect and its lab index links are clickable', async ({ page }) => {
  await page.goto('/');

  await test.step('root path redirects to Home, the first nav entry', async () => {
    await expect(page).toHaveURL(/\/home$/);

    const firstNavLink = page.locator('nav a').first();
    await expect(firstNavLink).toHaveText('Home');
    await expect(firstNavLink).toHaveClass(/nav-link-active/);
  });

  await test.step('the lab index loads with at least one clickable link', async () => {
    const labLinks = page.getByTestId('lab-index').getByRole('link');
    await expect(labLinks.first()).toBeVisible();

    const firstLabLabel = (await labLinks.first().innerText()).trim();
    await labLinks.first().click();

    await expect(page).not.toHaveURL(/\/home$/);
    await expect(page.locator('nav a.nav-link-active')).toHaveText(firstLabLabel);
  });
});
