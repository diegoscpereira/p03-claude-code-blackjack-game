import { expect, test, type Page } from '@playwright/test';

/**
 * T097 — quickstart V5, SC-006, NFR-007: losing connectivity mid-hand.
 *
 * The preview server has no `api/` routes, so *every* run of this suite is
 * already an offline run as far as persistence is concerned — which is a
 * genuinely useful default rather than a limitation. Where a successful sync is
 * needed, the route is fulfilled here instead of being reached over a network.
 */

const SEED = 20260804;

/**
 * Stands in for a working `api/` deployment.
 *
 * The GET is answered 404 on purpose: that is a player with no stored row, which
 * FR-066 makes the ordinary first-visit path rather than an error. The PUT and
 * the hand batch succeed, so a reconnect actually drains.
 */
async function serveApi(page: Page): Promise<void> {
  await page.route('**/api/hands', (route) =>
    route.fulfill({ status: 200, json: { inserted: 1, skipped: 0 } }),
  );
  await page.route('**/api/progress**', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 404, json: { error: 'not found' } })
      : route.fulfill({ status: 200, json: {} }),
  );
}

/** Plays one hand to settlement, skipping bot pacing. */
async function playAHand(page: Page): Promise<void> {
  await page.getByTestId('deal').click();
  await page.keyboard.press('s');
  await page.getByTestId('action-stand').click({ timeout: 10_000 });
  await expect(page.getByTestId('outcome')).toBeVisible();
}

test.describe('User Story 6 — offline play (SC-006, NFR-007)', () => {
  test('SC-006: a hand started online completes after connectivity is lost', async ({ page, context }) => {
    await serveApi(page);
    await page.goto(`/?seed=${SEED}`);
    await page.getByTestId('deal').click();

    await context.setOffline(true);

    await page.keyboard.press('s');
    await page.getByTestId('action-stand').click({ timeout: 10_000 });

    // NFR-007: the engine is local, so the hand settles with no network at all.
    await expect(page.getByTestId('outcome')).toBeVisible();
  });

  test('FR-062: no error and no modal appears while offline', async ({ page, context }) => {
    await page.goto(`/?seed=${SEED}`);
    await context.setOffline(true);
    await playAHand(page);

    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('FR-063: an unobtrusive sync indicator appears while records are queued', async ({ page, context }) => {
    await page.goto(`/?seed=${SEED}`);
    await context.setOffline(true);
    await playAHand(page);

    const indicator = page.getByTestId('sync-indicator');
    await expect(indicator).toBeVisible();

    // Principle III: passive means passive — it announces politely and never
    // takes focus or blocks a control.
    await expect(indicator).toHaveAttribute('aria-live', 'polite');
    await expect(page.getByTestId('deal')).toBeEnabled();
  });

  test('FR-062: play continues across several offline hands', async ({ page, context }) => {
    await page.goto(`/?seed=${SEED}`);
    await context.setOffline(true);

    for (let i = 0; i < 3; i += 1) await playAHand(page);

    await expect(page.getByTestId('sync-indicator')).toBeVisible();
    await expect(page.getByTestId('outcome')).toBeVisible();
  });

  test('SC-006: queued results survive a reload and are not lost', async ({ page, context }) => {
    await page.goto(`/?seed=${SEED}`);
    await context.setOffline(true);
    await playAHand(page);

    await context.setOffline(false);
    await page.reload();

    // FR-062: the queue lives in localStorage, so a reload finds it waiting.
    const queued = await page.evaluate(() => localStorage.getItem('bj.outbox'));
    expect(queued).not.toBeNull();
  });

  test('SC-006: results sync once connectivity returns, and the indicator clears', async ({ page, context }) => {
    await page.goto(`/?seed=${SEED}`);
    await context.setOffline(true);
    await playAHand(page);
    await expect(page.getByTestId('sync-indicator')).toBeVisible();

    await serveApi(page);
    await context.setOffline(false);

    // The drain runs on the `online` event as well as on its interval, so this
    // should clear promptly rather than on the next scheduled tick.
    await expect(page.getByTestId('sync-indicator')).toBeHidden({ timeout: 20_000 });
  });

  test('FR-052: progression accrues offline and is not rolled back on reconnect', async ({ page, context }) => {
    await page.goto(`/?seed=${SEED}`);
    await context.setOffline(true);
    await playAHand(page);

    const xp = await page.getByTestId('xp').textContent();
    expect(Number(xp)).toBeGreaterThan(0);

    await serveApi(page);
    await context.setOffline(false);

    // Local state is authoritative during play (FR-060); a 404 from the server
    // is a new player, not an instruction to reset.
    await expect(page.getByTestId('xp')).toHaveText(String(xp));
  });

  test('SC-005, FR-051: settled hands appear in post-game analysis once it unlocks', async ({ page }) => {
    await page.goto(`/?seed=${SEED}`);

    // The analysis view is the level-2 unlock at 50 XP, and a hand is worth at
    // least 10 — so five hands reach it without depending on decision matches.
    for (let i = 0; i < 5; i += 1) await playAHand(page);

    await expect(page.getByTestId('level-up')).toBeVisible();
    await page.getByTestId('open-guides').click();

    await expect(page.getByTestId('post-game-analysis')).toContainText('Hand 5');
  });
});
