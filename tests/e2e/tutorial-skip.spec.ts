import { expect, test } from '@playwright/test';

/**
 * T048 — SC-002, SC-009, and the FR-045 gating audit.
 *
 * The story this proves: an experienced player lands, dismisses in one action,
 * and is playing within seconds with nothing locked. T053's audit is the last
 * test in this file — it is recorded here rather than in a checklist, because a
 * checklist cannot fail a build.
 */

const SEED = 20260804;

test.describe('User Story 2 — skip the tutorial', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/?seed=${SEED}`);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('FR-040, FR-041: the offer appears with a dismiss control visible without scrolling', async ({
    page,
  }) => {
    const dismiss = page.getByTestId('tutorial-dismiss');
    await expect(dismiss).toBeVisible();
    await expect(dismiss).toBeInViewport();
  });

  test('SC-002: dismiss reaches a live table in one interaction', async ({ page }) => {
    await page.getByTestId('tutorial-dismiss').click();

    await expect(page.getByTestId('tutorial-offer')).toHaveCount(0);
    // No confirmation prompt, no intermediate screen (FR-042).
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('deal')).toBeVisible();
  });

  test('SC-002: first load to a played hand takes at most two interactions', async ({ page }) => {
    await page.getByTestId('tutorial-dismiss').click(); // 1
    await page.getByTestId('deal').click(); // 2
    await expect(page.getByTestId('hand-h1')).toBeVisible();
  });

  test('FR-043: the offer does not return after a reload', async ({ page }) => {
    await page.getByTestId('tutorial-dismiss').click();
    await page.reload();
    await expect(page.getByTestId('tutorial-offer')).toHaveCount(0);
  });

  test('FR-044: the tutorial stays available from the help menu', async ({ page }) => {
    await page.getByTestId('tutorial-dismiss').click();
    await page.getByTestId('help-menu-toggle').click();
    await expect(page.getByTestId('help-open-tutorial')).toBeVisible();
  });

  test('SC-009: every tutorial surface can be dismissed in one interaction', async ({ page }) => {
    await page.getByTestId('tutorial-accept').click();
    // Inside the tutorial itself, the dismiss control is still one click away.
    await expect(page.getByTestId('tutorial-dismiss')).toBeVisible();
    await page.getByTestId('tutorial-dismiss').click();
    await expect(page.getByTestId('deal')).toBeVisible();
  });

  /**
   * T053 — FR-045: no capability is gated behind tutorial completion.
   *
   * Audited by exercising each surface as a player who never opened the
   * tutorial, rather than by reading the code and asserting it in prose.
   */
  test('FR-045: nothing is locked for a player who skipped the tutorial', async ({ page }) => {
    await page.getByTestId('tutorial-dismiss').click();
    await page.getByTestId('deal').click();

    // Table play works.
    await expect(page.getByTestId('hand-h1')).toBeVisible();
    await expect(page.getByTestId('action-stand')).toBeEnabled();

    // Nothing anywhere claims to need the tutorial.
    await expect(page.getByText(/complete the tutorial/i)).toHaveCount(0);
    await expect(page.locator('[data-locked="tutorial"]')).toHaveCount(0);
  });
});
