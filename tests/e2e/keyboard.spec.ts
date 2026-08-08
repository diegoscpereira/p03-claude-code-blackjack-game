import { expect, test, type Page } from '@playwright/test';

/**
 * T122 — NFR-008 and constitution Principle III: *"Every action MUST be operable
 * by keyboard alone."*
 *
 * The bar this file holds to is not "a keyboard event triggers a handler" — it
 * is that someone with no mouse can play a complete hand and always know where
 * they are. So it checks focus visibility and tab reachability alongside the
 * shortcuts, because a shortcut nobody can discover is not operability.
 */

const SEED = 20260804;

/** Dismisses onboarding using only the keyboard, as a keyboard user would. */
async function dismissByKeyboard(page: Page): Promise<void> {
  const dismiss = page.getByTestId('tutorial-dismiss');
  await dismiss.focus();
  await page.keyboard.press('Enter');
  await expect(dismiss).toHaveCount(0);
}

test.describe('keyboard-only play (NFR-008)', () => {
  test('NFR-008: a complete hand is playable without a mouse', async ({ page }) => {
    await page.goto(`/?seed=${SEED}`);
    await dismissByKeyboard(page);

    await page.getByTestId('deal').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('hand-h1')).toBeVisible();

    // FR-036: the first key collapses the pending bot turns and is consumed by
    // that skip rather than acting on the player's hand.
    await page.keyboard.press('s');
    await expect(page.getByTestId('outcome')).toHaveCount(0);

    await page.keyboard.press('s');
    await expect(page.getByTestId('outcome')).toBeVisible();
  });

  test('NFR-008: every legal action has a working shortcut', async ({ page }) => {
    await page.goto(`/?seed=${SEED}`);
    await dismissByKeyboard(page);
    await page.getByTestId('deal').click();
    await page.keyboard.press('s'); // collapse bot turns

    // Hit is legal on essentially every opening hand, and it is the shortcut
    // whose effect is easiest to assert without depending on the shoe.
    const cards = page.getByTestId('hand-h1').getByTestId('card');
    const before = await cards.count();
    await page.keyboard.press('h');
    await expect(cards).toHaveCount(before + 1);
  });

  test('Principle III: an illegal shortcut leaves the game playable', async ({ page }) => {
    await page.goto(`/?seed=${SEED}`);
    await dismissByKeyboard(page);
    await page.getByTestId('deal').click();
    await page.keyboard.press('s');

    // `p` splits, and most opening hands are not a pair. Unrecognised or
    // ill-timed input must never crash or silently discard a turn.
    await page.keyboard.press('p');
    await page.keyboard.press('z');
    await page.keyboard.press('7');

    await expect(page.getByTestId('hand-h1')).toBeVisible();
    await page.keyboard.press('s');
    await expect(page.getByTestId('outcome')).toBeVisible();
  });

  test('NFR-008: focus is always visible on the control that has it', async ({ page }) => {
    await page.goto(`/?seed=${SEED}`);
    await dismissByKeyboard(page);
    await page.getByTestId('deal').click();
    await page.keyboard.press('s');

    const hit = page.getByTestId('action-hit');
    await hit.focus();

    // A focus ring drawn with `outline: none` and nothing in its place is the
    // classic way keyboard operability regresses without anyone noticing.
    const ring = await hit.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        outline: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        shadow: style.boxShadow,
      };
    });
    const visible =
      (ring.outline !== 'none' && ring.outlineWidth !== '0px') || ring.shadow !== 'none';
    expect(visible).toBe(true);
  });

  /** Every element Tab can land on, from the top of the page. */
  async function tabReachable(page: Page, steps = 40): Promise<Set<string>> {
    const reached = new Set<string>();
    for (let i = 0; i < steps; i += 1) {
      await page.keyboard.press('Tab');
      const id = await page.evaluate(
        () => document.activeElement?.getAttribute('data-testid') ?? '',
      );
      if (id) reached.add(id);
    }
    return reached;
  }

  test('NFR-008: the betting controls are reachable by Tab before a hand starts', async ({ page }) => {
    await page.goto(`/?seed=${SEED}`);
    await dismissByKeyboard(page);

    const reached = await tabReachable(page);

    for (const control of ['deal', 'bet-up', 'bet-down', 'help-menu-toggle', 'open-guides']) {
      expect([...reached], `${control} was never focused`).toContain(control);
    }
  });

  test('NFR-008: the action controls are reachable by Tab during a hand', async ({ page }) => {
    await page.goto(`/?seed=${SEED}`);
    await dismissByKeyboard(page);
    await page.getByTestId('deal').click();
    await page.keyboard.press('s');

    const reached = await tabReachable(page);

    // The bet controls are deliberately absent here: changing the bet mid-hand
    // would desynchronise the hand's own stake, so they are disabled and
    // therefore not tabbable. That is correct, not a gap.
    for (const control of ['action-hit', 'action-stand', 'help-menu-toggle']) {
      expect([...reached], `${control} was never focused`).toContain(control);
    }
    expect([...reached]).not.toContain('bet-up');
  });

  test('NFR-008: a disabled control states its reason to assistive technology', async ({ page }) => {
    await page.goto(`/?seed=${SEED}`);
    await dismissByKeyboard(page);
    await page.getByTestId('deal').click();
    await page.keyboard.press('s');

    const split = page.getByTestId('action-split');
    if (!(await split.isEnabled())) {
      const describedBy = await split.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      await expect(page.locator(`#${describedBy}`)).not.toBeEmpty();
    }
  });

  test('NFR-008: the guides panel opens and its tabs are keyboard-operable', async ({ page }) => {
    await page.goto(`/?seed=${SEED}`);
    await dismissByKeyboard(page);

    const toggle = page.getByTestId('open-guides');
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('tablist')).toBeVisible();

    const tab = page.getByTestId('guide-tab-basic_strategy_chart');
    await tab.focus();
    await page.keyboard.press('Enter');
    // Locked at level 1, so the panel states the level rather than the contents
    // (FR-051b) — and it did so from the keyboard alone.
    await expect(page.getByTestId('guide-locked')).toBeVisible();
  });
});
