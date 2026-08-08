import { expect, test, type Page } from '@playwright/test';

/**
 * T125 — the performance budgets, measured rather than asserted.
 *
 * Constitution Principle IV: *"Performance budgets MUST be verified by
 * measurement, not asserted: any change claiming to affect performance MUST
 * cite before/after numbers."* This file produces those numbers, prints them,
 * and fails if a budget is exceeded. The recorded figures live in
 * `docs/architecture.md`.
 *
 * One budget cannot be measured here and says so out loud: NFR-003's 300 ms
 * background write round trip is a property of a deployed edge region, not of a
 * local preview server. What *is* measured locally is the client-side cost of
 * the write path, which is the part this repository controls.
 */

const SEED = 20260804;

function percentile(samples: number[], p: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index]!;
}

function report(name: string, samples: number[], budget: number): void {
  const p95 = percentile(samples, 95);
  const median = percentile(samples, 50);
  console.log(
    `${name}: n=${samples.length} median=${median.toFixed(1)}ms p95=${p95.toFixed(1)}ms ` +
      `max=${Math.max(...samples).toFixed(1)}ms budget=${budget}ms`,
  );
}

async function dismissIfOffered(page: Page): Promise<void> {
  const dismiss = page.getByTestId('tutorial-dismiss');
  if ((await dismiss.count()) > 0) await dismiss.click();
}

test.describe('performance budgets (Principle IV)', () => {
  test('NFR-001: p95 input→render stays under 100ms', async ({ page }) => {
    await page.goto(`/?seed=${SEED}`);
    await dismissIfOffered(page);

    const samples: number[] = [];

    for (let hand = 0; hand < 25; hand += 1) {
      await page.getByTestId('deal').click();
      await page.keyboard.press('s'); // collapse bot pacing

      // Measure entirely in-page: a Playwright round trip per sample would
      // measure the test harness rather than the application.
      for (let action = 0; action < 3; action += 1) {
        const hit = page.getByTestId('action-hit');
        if (!(await hit.isEnabled().catch(() => false))) break;

        const elapsed = await page.evaluate(
          () =>
            new Promise<number>((resolve) => {
              const cards = () =>
                document.querySelectorAll('[data-testid="hand-h1"] [data-testid="card"]').length;
              const before = cards();
              const target = document.querySelector<HTMLElement>('[data-testid="action-hit"]');
              if (!target) return resolve(-1);

              const start = performance.now();
              const check = (): void => {
                // Painted, not merely dispatched: rAF fires after layout.
                if (cards() > before) return resolve(performance.now() - start);
                requestAnimationFrame(check);
              };
              target.click();
              requestAnimationFrame(check);
            }),
        );

        if (elapsed >= 0) samples.push(elapsed);
        if ((await page.getByTestId('outcome').count()) > 0) break;
      }

      if ((await page.getByTestId('action-stand').count()) > 0) {
        await page.getByTestId('action-stand').click();
      }
    }

    report('NFR-001 input→render', samples, 100);
    expect(samples.length).toBeGreaterThan(20);
    expect(percentile(samples, 95)).toBeLessThan(100);
  });

  test('NFR-004: first load to an interactive table stays under 2s', async ({ page }) => {
    const samples: number[] = [];

    for (let run = 0; run < 5; run += 1) {
      await page.context().clearCookies();
      await page.goto('about:blank');
      await page.goto(`/?seed=${SEED}`);
      await page.getByTestId('deal').waitFor({ state: 'attached' });

      // From navigation start to the moment the table is operable, read from
      // the browser's own navigation timing rather than the test's clock.
      const elapsed = await page.evaluate(() => performance.now());
      samples.push(elapsed);
    }

    report('NFR-004 first load → interactive', samples, 2000);
    expect(percentile(samples, 95)).toBeLessThan(2000);
  });

  test('SC-005: a settled hand reaches post-game analysis well inside 5s', async ({ page }) => {
    await page.goto(`/?seed=${SEED}`);
    await dismissIfOffered(page);

    // The analysis view unlocks at level 2 (50 XP), so five hands reach it.
    for (let i = 0; i < 5; i += 1) {
      await page.getByTestId('deal').click();
      await page.keyboard.press('s');
      await page.getByTestId('action-stand').click();
      await expect(page.getByTestId('outcome')).toBeVisible();
    }

    await page.getByTestId('open-guides').click();
    await expect(page.getByTestId('post-game-analysis')).toBeVisible();

    const samples: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      await page.getByTestId('deal').click();
      await page.keyboard.press('s');

      const elapsed = await page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            const count = () =>
              document.querySelectorAll('[data-testid="post-game-analysis"] li').length;
            const before = count();
            const stand = document.querySelector<HTMLElement>('[data-testid="action-stand"]');
            if (!stand) return resolve(-1);

            const start = performance.now();
            const check = (): void => {
              if (count() > before) return resolve(performance.now() - start);
              requestAnimationFrame(check);
            };
            stand.click();
            requestAnimationFrame(check);
          }),
      );

      if (elapsed >= 0) samples.push(elapsed);
    }

    report('SC-005 settlement → visible in analysis', samples, 5000);
    expect(samples.length).toBeGreaterThan(5);
    // The record is local by the time it is queued, so this is a render, not a
    // round trip — the 5s budget has three orders of magnitude of headroom.
    expect(percentile(samples, 95)).toBeLessThan(5000);
  });

  test('NFR-003: the client-side cost of a background write is negligible', async ({ page }) => {
    // NFR-003's 300ms is a round trip from an edge region and needs a real
    // deployment (T130). What is measurable here is the part this code owns:
    // enqueueing on the settlement path, which must not block the interface.
    await page.route('**/api/**', (route) => route.fulfill({ status: 200, json: {} }));
    await page.goto(`/?seed=${SEED}`);
    await dismissIfOffered(page);

    const samples: number[] = [];
    for (let i = 0; i < 15; i += 1) {
      await page.getByTestId('deal').click();
      await page.keyboard.press('s');

      const elapsed = await page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            const stand = document.querySelector<HTMLElement>('[data-testid="action-stand"]');
            if (!stand) return resolve(-1);
            const start = performance.now();
            stand.click();
            // Synchronous by contract: settlement, progression, and the
            // localStorage enqueue have all completed by the time click returns.
            resolve(performance.now() - start);
          }),
      );

      if (elapsed >= 0) samples.push(elapsed);
      await expect(page.getByTestId('outcome')).toBeVisible();
    }

    report('NFR-001 settle + enqueue (synchronous)', samples, 100);
    expect(percentile(samples, 95)).toBeLessThan(100);
  });
});
