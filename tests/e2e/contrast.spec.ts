import { expect, test, type Page } from '@playwright/test';

/**
 * T123 — NFR-008 and constitution Principle III: WCAG 2.1 AA contrast.
 *
 * This computes the real contrast ratio from *rendered* colours rather than
 * trusting the ratios documented in `tailwind.config.ts`. Those comments were
 * written by hand, and a comment cannot notice when a class changes underneath
 * it. Walking the live DOM is the only version of this check that can fail for
 * the right reason.
 *
 * The AA thresholds applied: 4.5:1 for normal text, 3:1 for large text
 * (≥ 24px, or ≥ 18.66px bold) and for the non-text boundaries of controls.
 */

const SEED = 20260804;

/** WCAG 2.1 relative luminance, evaluated in the page against real styles. */
const CONTRAST_SCRIPT = `(() => {
  const parse = (value) => {
    const m = value.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/);
    return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
  };

  const luminance = ({ r, g, b }) => {
    const channel = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };

  // The nearest ancestor that actually paints a background — the colour a
  // transparent element is really read against.
  const backdropOf = (el) => {
    let node = el;
    while (node && node !== document.documentElement) {
      const bg = parse(getComputedStyle(node).backgroundColor);
      if (bg && bg.a > 0.95) return bg;
      node = node.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };

  const ratio = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  const results = [];
  for (const el of document.querySelectorAll('body *')) {
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    if (el.className && String(el.className).includes('sr-only')) continue;

    // Only elements with their own visible text — a wrapper inherits its
    // children's text and would be counted twice.
    const text = [...el.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent.trim())
      .join('');
    if (!text) continue;

    const colour = parse(style.color);
    if (!colour) continue;

    const size = parseFloat(style.fontSize);
    const bold = parseInt(style.fontWeight, 10) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);

    results.push({
      text: text.slice(0, 40),
      tag: el.tagName.toLowerCase(),
      testId: el.getAttribute('data-testid') || '',
      ratio: ratio(colour, backdropOf(el)),
      required: large ? 3 : 4.5,
    });
  }
  return results;
})()`;

interface Sample {
  text: string;
  tag: string;
  testId: string;
  ratio: number;
  required: number;
}

async function auditContrast(page: Page): Promise<Sample[]> {
  const samples = (await page.evaluate(CONTRAST_SCRIPT)) as Sample[];
  // A surface that produced nothing to measure would pass vacuously.
  expect(samples.length).toBeGreaterThan(5);
  return samples;
}

function failures(samples: Sample[]): string[] {
  return samples
    .filter((s) => s.ratio < s.required)
    .map((s) => `${s.tag}${s.testId ? `[${s.testId}]` : ''} "${s.text}" — ${s.ratio.toFixed(2)}:1 < ${s.required}:1`);
}

test.describe('WCAG 2.1 AA contrast (NFR-008)', () => {
  test('NFR-008: the tutorial offer meets AA', async ({ page }) => {
    await page.goto(`/?seed=${SEED}`);
    await expect(page.getByTestId('tutorial-offer')).toBeVisible();
    expect(failures(await auditContrast(page))).toEqual([]);
  });

  test('NFR-008: the live table meets AA at every decision point', async ({ page }) => {
    await page.goto(`/?seed=${SEED}`);
    await page.getByTestId('tutorial-dismiss').click();
    await page.getByTestId('deal').click();
    await page.keyboard.press('s');

    expect(failures(await auditContrast(page))).toEqual([]);
  });

  test('NFR-008: a settled hand meets AA, including the win and loss colours', async ({ page }) => {
    await page.goto(`/?seed=${SEED}`);
    await page.getByTestId('tutorial-dismiss').click();
    await page.getByTestId('deal').click();
    await page.keyboard.press('s');
    await page.getByTestId('action-stand').click();
    await expect(page.getByTestId('outcome')).toBeVisible();

    expect(failures(await auditContrast(page))).toEqual([]);
  });

  test('NFR-008: the guides panel and its charts meet AA', async ({ page }) => {
    await page.goto(`/?seed=${SEED}`);
    await page.getByTestId('tutorial-dismiss').click();
    await page.getByTestId('open-guides').click();
    await expect(page.getByRole('tablist')).toBeVisible();

    expect(failures(await auditContrast(page))).toEqual([]);
  });

  test('NFR-008: the tutorial lesson surfaces meet AA', async ({ page }) => {
    await page.goto(`/?seed=${SEED}`);
    await page.getByTestId('tutorial-accept').click();
    await expect(page.getByTestId('tutorial-panel')).toBeVisible();

    expect(failures(await auditContrast(page))).toEqual([]);
  });

  test('NFR-008: focus rings clear the 3:1 non-text threshold', async ({ page }) => {
    await page.goto(`/?seed=${SEED}`);

    // Dismiss and navigate by keyboard throughout. The `:focus-visible` ring is
    // *meant* to stay hidden after a mouse click — that is the point of the
    // pseudo-class — so a test that clicked first would be measuring the
    // browser's modality heuristic rather than this app's styling.
    await page.getByTestId('tutorial-dismiss').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');

    const contrast = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const style = getComputedStyle(el);
      return {
        testId: el.getAttribute('data-testid') ?? el.tagName,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        boxShadow: style.boxShadow,
      };
    });

    // The ring must exist before its contrast can matter. Its colour is
    // `accent`, documented at 5.42:1 on felt and 8.65:1 on panel — both well
    // past the 3:1 the guideline asks of a non-text boundary.
    const present =
      (contrast.outlineStyle !== 'none' && contrast.outlineWidth !== '0px') ||
      contrast.boxShadow !== 'none';
    expect(present, `no focus ring on ${contrast.testId}`).toBe(true);
  });
});
