import { useEffect, useRef, useState } from 'react';

/**
 * T044 — deal pacing as a cancellable timer (NFR-001, constitution Principle IV).
 *
 * Two rules govern this hook, and they are the whole reason it exists rather
 * than a CSS animation:
 *
 *  1. Pacing is excluded from the 100ms input-to-render budget — the *state* is
 *     already correct the instant the engine returns; only the reveal lags.
 *  2. Pacing must always be interruptible. Any input reveals everything
 *     immediately, and the outcome is identical either way, because nothing
 *     here touches the engine.
 */
const STEP_MS = 130;

export function useDealPacing(roundKey: number | null, cardCount: number) {
  const [revealed, setRevealed] = useState(cardCount);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setRevealed(Number.MAX_SAFE_INTEGER);
  };

  useEffect(() => {
    if (roundKey === null) return;

    // A new round: start from nothing and reveal one card at a time.
    setRevealed(0);
    let shown = 0;

    const tick = () => {
      shown += 1;
      setRevealed(shown);
      if (shown < cardCount) timer.current = setTimeout(tick, STEP_MS);
      else timer.current = null;
    };

    timer.current = setTimeout(tick, STEP_MS);

    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    };
    // Only a new deal restarts pacing. Cards drawn later appear immediately,
    // because by then `revealed` has already run past the count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundKey]);

  return { revealed, cancelPacing: cancel };
}
