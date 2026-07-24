import { Observable, forkJoin, map, timer } from 'rxjs';

/** Races source$ against a floor timer so its value never resolves before minMs has passed since subscription — keeps a near-instant fake-mode response from flashing a loading skeleton unreadably. */
export function raceWithMinDuration<T>(source$: Observable<T>, minMs: number): Observable<T> {
  return forkJoin([source$, timer(minMs)]).pipe(map(([value]) => value));
}

/** Resolves once at least minMs has passed since startedAt — awaited just before a streaming path's own terminal state transition, for the same reason as raceWithMinDuration above. */
export async function waitOutMinDuration(startedAt: number, minMs: number): Promise<void> {
  const remaining = minMs - (Date.now() - startedAt);
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}
