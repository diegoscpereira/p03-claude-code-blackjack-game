import { useEffect } from 'react';
import { Table } from './ui/table/Table';
import { TutorialOffer } from './ui/tutorial/TutorialOffer';
import { TutorialRunner } from './ui/tutorial/TutorialRunner';
import { HelpMenu } from './ui/common/HelpMenu';
import { ProgressHud } from './ui/common/ProgressHud';
import { LevelUp } from './ui/common/LevelUp';
import { Guides } from './ui/guides/Guides';
import { useGameStore } from './store/gameStore';

/** T043 — the application shell. */
export default function App() {
  useSession();

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
        <TutorialRunner />

        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4">
          <ProgressHud />
          <LevelUp />
        </div>

        <Table />

        <div className="mx-auto w-full max-w-4xl px-4">
          <Guides />
        </div>
      </main>
    </div>
  );
}

/**
 * T107 — FR-064, FR-066: session start.
 *
 * Deliberately fire-and-forget. The table is already rendered and playable by
 * the time this effect runs; restoring progression is something that happens
 * *to* a live session, never something a player waits for. Nothing here is
 * awaited and nothing gates a render.
 */
function useSession() {
  const startSession = useGameStore((s) => s.startSession);

  useEffect(() => {
    const stop = startSession();
    return stop;
  }, [startSession]);
}
