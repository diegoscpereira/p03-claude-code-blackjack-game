import { expect, test, type Page } from '@playwright/test';

/**
 * T056 — full completion, and resuming mid-tutorial from the help menu (FR-046).
 *
 * User Story 3's payoff is that a beginner leaves able to play unaided, so the
 * test walks the whole sequence rather than sampling a step.
 */
const SEED = 20260804;

/** Advances one step, whichever kind it is. */
async function advance(page: Page): Promise<void> {
  const continueButton = page.getByTestId('lesson-continue');
  if (await continueButton.isVisible()) {
    await continueButton.click();
    return;
  }
  await page.locator('[data-testid^="lesson-action-"][data-highlighted="true"]').click();
}

test.describe('User Story 3 — the guided tutorial', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/?seed=${SEED}`);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('FR-047: each step highlights the action it teaches and says why', async ({ page }) => {
    await page.getByTestId('tutorial-accept').click();

    // Walk to the first guided hand.
    for (let i = 0; i < 4; i++) await advance(page);

    await expect(page.locator('[data-testid^="lesson-action-"][data-highlighted="true"]')).toHaveCount(1);
    await expect(page.getByTestId('lesson-reason')).not.toBeEmpty();
  });

  test('completes the whole sequence and returns to the live table', async ({ page }) => {
    await page.getByTestId('tutorial-accept').click();

    for (let step = 0; step < 8; step++) await advance(page);

    await expect(page.getByTestId('tutorial-panel')).toHaveCount(0);
    await expect(page.getByTestId('deal')).toBeVisible();
  });

  test('FR-043: a completed tutorial is not offered again', async ({ page }) => {
    await page.getByTestId('tutorial-accept').click();
    for (let step = 0; step < 8; step++) await advance(page);

    await page.reload();
    await expect(page.getByTestId('tutorial-offer')).toHaveCount(0);
  });

  test('FR-046: leaving mid-tutorial resumes from the help menu', async ({ page }) => {
    await page.getByTestId('tutorial-accept').click();

    // Complete three of eight steps, then leave (spec Gherkin).
    for (let step = 0; step < 3; step++) await advance(page);
    const leftAt = await page.getByTestId('lesson-progress').textContent();

    await page.getByTestId('tutorial-dismiss').click();
    await expect(page.getByTestId('deal')).toBeVisible();

    await page.getByTestId('help-menu-toggle').click();
    await page.getByTestId('help-open-tutorial').click();

    // Resumes at step four, not at the beginning.
    await expect(page.getByTestId('lesson-progress')).toHaveText(leftAt!);
    await expect(page.getByTestId('lesson-progress')).toContainText('4 of 8');
  });

  test('FR-042: leaving takes one interaction and no confirmation', async ({ page }) => {
    await page.getByTestId('tutorial-accept').click();
    await page.getByTestId('tutorial-dismiss').click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('deal')).toBeVisible();
  });

  test('FR-045: the live table stays fully playable after the tutorial', async ({ page }) => {
    await page.getByTestId('tutorial-accept').click();
    for (let step = 0; step < 8; step++) await advance(page);

    await page.getByTestId('deal').click();
    await expect(page.getByTestId('hand-h1')).toBeVisible();
    await expect(page.getByTestId('action-stand')).toBeEnabled();
  });
});
