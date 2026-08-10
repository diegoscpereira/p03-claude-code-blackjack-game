/**
 * The shared disclosure arrow.
 *
 * `aria-hidden` in every use: each caller already carries its expanded state in
 * the accessibility tree — `<details>` natively, the guides toggle through
 * `aria-expanded` — so an announced arrow would state it a second time.
 */
export function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`text-[0.7rem] text-accent transition-transform ${expanded ? 'rotate-90' : ''}`}
    >
      ▶
    </span>
  );
}
