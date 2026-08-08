import { expect, test, type Page } from '@playwright/test';

/**
 * T124 — NFR-010: usable from 360px to 1920px with no horizontal scrolling.
 *
 * Horizontal scroll on a phone is the failure this guards against, and it is
 * almost always caused by one element rather than by the layout: a wide table,
 * a long unbroken string, a fixed pixel width. So when the page does overflow,
 * this reports *which* element did it — a bare "scrollWidth > clientWidth" tells
 * you there is a bug and nothing about where.
 *
 * The strategy charts are the deliberate exception. They are wider than a phone
 * and must be, so they scroll inside their own container; the page body still
 * must not.
 */

const SEED = 20260804;

const VIEWPORTS = [
  { name: '360px — small phone', width: 360, height: 720 },
  { name: '390px — modern phone', width: 390, height: 844 },
  { name: '768px — tablet', width: 768, height: 1024 },
  { name: '1024px — small laptop', width: 1024, height: 768 },
  { name: '1440px — desktop', width: 1440, height: 900 },
  { name: '1920px — large desktop', width: 1920, height: 1080 },
];

/** Names the elements sticking out past the viewport, if any. */
async function overflowing(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    const offenders: string[] = [];

    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      // An element allowed to scroll internally is doing exactly what it should.
      if (style.overflowX === 'auto' || style.overflowX === 'scroll') continue;

      const box = el.getBoundingClientRect();
      if (box.width === 0) continue;
      if (box.right > limit + 1 || box.left < -1) {
        const id = el.getAttribute('data-testid');
        offenders.push(
          `${el.tagName.toLowerCase()}${id ? `[${id}]` : ''} spans ${Math.round(box.left)}–${Math.round(box.right)} of ${limit}`,
        );
      }
    }
    return offenders;
  });
}

/**
 * Dismisses the tutorial only when it is actually offered. A second `goto` in
 * the same context keeps `localStorage`, so the offer is gone — FR-043 working
 * exactly as specified, which a test looping over viewports has to expect.
 */
async function dismissIfOffered(page: Page): Promise<void> {
  const dismiss = page.getByTestId('tutorial-dismiss');
  if ((await dismiss.count()) > 0) await dismiss.click();
}

const bodyScrolls = (page: Page) =>
  page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );

test.describe('responsive layout (NFR-010)', () => {
  for (const viewport of VIEWPORTS) {
    test(`NFR-010: ${viewport.name} — a live hand fits without horizontal scrolling`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`/?seed=${SEED}`);
      await page.getByTestId('tutorial-dismiss').click();
      await page.getByTestId('deal').click();
      await page.keyboard.press('s');

      expect(await overflowing(page)).toEqual([]);
      expect(await bodyScrolls(page)).toBe(false);
    });
  }

  test('NFR-010: the tutorial offer fits a 360px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 720 });
    await page.goto(`/?seed=${SEED}`);
    await expect(page.getByTestId('tutorial-offer')).toBeVisible();

    expect(await overflowing(page)).toEqual([]);
    expect(await bodyScrolls(page)).toBe(false);
  });

  test('NFR-010: a wide strategy chart scrolls inside itself, not the page', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 720 });
    await page.goto(`/?seed=${SEED}`);
    await page.getByTestId('tutorial-dismiss').click();
    await page.getByTestId('open-guides').click();
    await expect(page.getByRole('tablist')).toBeVisible();

    expect(await bodyScrolls(page)).toBe(false);
  });

  test('FR-055, Principle III: board state is visible without scrolling at 360px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 720 });
    await page.goto(`/?seed=${SEED}`);
    await page.getByTestId('tutorial-dismiss').click();
    await page.getByTestId('deal').click();
    await page.keyboard.press('s');

    // Principle III names exactly these: dealer upcard, player hand, hand
    // total, bankroll, and current bet.
    for (const id of ['hand-dealer', 'hand-h1', 'bankroll', 'bet']) {
      await expect(page.getByTestId(id).first()).toBeInViewport();
    }
  });

  test('NFR-010: settled state fits every viewport', async ({ page }) => {
    for (const viewport of [VIEWPORTS[0]!, VIEWPORTS.at(-1)!]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`/?seed=${SEED}`);
      await dismissIfOffered(page);
      await page.getByTestId('deal').click();
      await page.keyboard.press('s');
      await page.getByTestId('action-stand').click();
      await expect(page.getByTestId('outcome')).toBeVisible();

      expect(await bodyScrolls(page), `body scrolls at ${viewport.name}`).toBe(false);
    }
  });
});
