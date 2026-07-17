import type { Locator, Page } from '@playwright/test';

/**
 * The nav `<a>` immediately after the one labeled `label`, found by content rather than a
 * hard-coded index — survives a new entry being inserted earlier in nav order (see
 * docs/shared/frontend-browser-e2e-tests.md's "Specs").
 */
export async function navLinkAfter(page: Page, label: string): Promise<Locator> {
  const navLinks = page.locator('nav a');
  const labels = await navLinks.allTextContents();
  const index = labels.findIndex((text) => text.trim() === label);
  if (index === -1) {
    throw new Error(`No nav link found with text "${label}"`);
  }
  return navLinks.nth(index + 1);
}
