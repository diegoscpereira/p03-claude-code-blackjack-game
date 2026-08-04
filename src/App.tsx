import { Table } from './ui/table/Table';
import { TutorialOffer } from './ui/tutorial/TutorialOffer';
import { TutorialPanel } from './ui/tutorial/TutorialPanel';
import { HelpMenu } from './ui/common/HelpMenu';

/** T043 — the application shell. */
export default function App() {
  return (
    <div className="min-h-full bg-felt-deep">
      <header className="border-b border-border bg-panel">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold text-accent">Blackjack AI Trainer</h1>
            <p className="text-xs text-ink-muted">
              6 decks · dealer hits soft 17 · blackjack pays 3:2
            </p>
          </div>
          <HelpMenu />
        </div>
      </header>

      <main className="flex flex-col gap-4 py-4">
        {/* FR-041: the offer sits above the table, in the first viewport, so
            its dismiss control is reachable without scrolling. */}
        <TutorialOffer />
        <TutorialPanel />
        <Table />
      </main>
    </div>
  );
}
