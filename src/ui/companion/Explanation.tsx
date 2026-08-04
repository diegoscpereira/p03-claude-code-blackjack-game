import { explain } from '../../strategy/explanations';
import { useGameStore } from '../../store/gameStore';

/**
 * T075 — the explanation (FR-023, FR-027).
 *
 * Renders nothing at all when `explain` returns null. FR-027 is explicit that a
 * decision point with no library entry shows the recommendation and its
 * expected value *alone* — not placeholder text, and not an empty box that
 * looks like something failed to load.
 */
export function Explanation() {
  const round = useGameStore((s) => s.round);
  const recommendation = useGameStore((s) => s.recommendation());

  if (!round || !recommendation) return null;

  const text = explain(round, recommendation);
  if (text === null) return null;

  return (
    <p data-testid="companion-explanation" className="text-sm leading-relaxed text-ink-muted">
      {text}
    </p>
  );
}
