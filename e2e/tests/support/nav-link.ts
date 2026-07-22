import type { Locator, Page } from '@playwright/test';

/** The nav `<a>` with the given exact label — nav order beyond Home-first isn't fixed, so lookup is by label, not position. */
export function navLink(page: Page, label: string): Locator {
  return page.getByRole('navigation').getByRole('link', { name: label, exact: true });
}
