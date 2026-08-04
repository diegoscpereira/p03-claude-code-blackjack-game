import { expect, test } from '@playwright/test';

/**
 * T045 — quickstart V1: play a hand in a real browser.
 *
 * Every hand here is pinned with `?seed=`, so a failure is a real regression
 * rather than an unlucky shoe.
 */

const SEED = 20260804;

test.describe('User Story 1 — play a complete hand', () => {
  test('FR-005: dealing shows two player cards and one dealer upcard', async ({ page }) => {
    await page.goto(`/?seed=${SEED}`);
    await page.getByTestId('deal').click();

    const playerHand = page.getByTestId('hand-h1');
    await expect(playerHand.getByTestId('card')).toHaveCount(2);

    // One dealer card up, one face down (FR-005).
    await expect(page.getByTestId('hand-dealer').getByTestId('card')).toHaveCount(1);
    await expect(page.getByTestId('hand-dealer').getByTestId('card-face-down')).toHaveCount(1);
  });

  test('FR-007, FR-013: standing settles the hand and moves the bankroll', async ({ page }) => {
    await page.goto(`/?seed=${SEED}`);
    const before = Number(await page.getByTestId('bankroll').textContent());

    await page.getByTestId('deal').click();
    await page.getByTestId('action-stand').click();

    await expect(page.getByTestId('outcome')).toBeVisible();
    const after = Number(await page.getByTestId('bankroll').textContent());

    // A push leaves it equal; anything else moves it. Either way the outcome
    // shown and the bankroll must agree.
    const outcome = (await page.getByTestId('outcome').textContent()) ?? '';
    if (outcome.includes('win')) expect(after).toBeGreaterThan(before);
    else if (outcome.includes('lose')) expect(after).toBeLessThan(before);
    else expect(after).toBe(before);
  });

  test('FR-006: hitting deals exactly one more card', async ({ page }) => {
    await page.goto(`/?seed=${SEED}`);
    await page.getByTestId('deal').click();

    const cards = page.getByTestId('hand-h1').getByTestId('card');
    await expect(cards).toHaveCount(2);

    if (await page.getByTestId('action-hit').isEnabled()) {
      await page.getByTestId('action-hit').click();
      await expect(cards).toHaveCount(3);
    }
  });

  test('FR-002: an unavailable action is disabled with a stated reason', async ({ page }) => {
    await page.goto(`/?seed=${SEED}`);
    await page.getByTestId('deal').click();

    const split = page.getByTestId('action-split');
    // Split needs a pair; on most hands it is disabled, and Principle III says
    // a disabled control must say why rather than simply refusing.
    if (!(await split.isEnabled())) {
      const describedBy = await split.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      await expect(page.locator(`#${describedBy}`)).not.toBeEmpty();
    }
  });

  test('SC-008: the same seed deals the same cards on a reload', async ({ page }) => {
    const readCards = async () =>
      page.getByTestId('hand-h1').getByTestId('card').allTextContents();

    await page.goto(`/?seed=${SEED}`);
    await page.getByTestId('deal').click();
    const first = await readCards();

    await page.reload();
    await page.getByTestId('deal').click();
    expect(await readCards()).toEqual(first);
  });

  test('NFR-008: a full hand is playable with the keyboard alone', async ({ page }) => {
    await page.goto(`/?seed=${SEED}`);
    await page.getByTestId('deal').focus();
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('hand-h1')).toBeVisible();
    await page.keyboard.press('s'); // stand
    await expect(page.getByTestId('outcome')).toBeVisible();
  });

  test('NFR-010: no horizontal scrolling at a 360px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 720 });
    await page.goto(`/?seed=${SEED}`);
    await page.getByTestId('deal').click();

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflows).toBe(false);
  });
});
