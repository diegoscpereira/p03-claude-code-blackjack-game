import { Table } from './ui/table/Table';

/** T043 — the application shell. */
export default function App() {
  return (
    <div className="min-h-full bg-felt-deep">
      <header className="border-b border-border bg-panel">
        <div className="mx-auto flex w-full max-w-4xl items-baseline justify-between gap-4 px-4 py-3">
          <h1 className="text-lg font-semibold text-accent">Blackjack AI Trainer</h1>
          <p className="text-xs text-ink-muted">6 decks · dealer hits soft 17 · blackjack pays 3:2</p>
        </div>
      </header>

      <main>
        <Table />
      </main>
    </div>
  );
}
