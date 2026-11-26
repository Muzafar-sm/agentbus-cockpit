import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiOn, ApiTurn, QueueSource } from './jobs';

// How often the turns are read again. The turn list has no stream of its
// own, so it stays live by reading the list every POLL_MS.
export const POLL_MS = 2000;

// The turns of the queue, tied together.
export interface QueueView {
  turns: ApiTurn[];
  // The listed row of one turn, when the last read had it.
  turnOf(session: string, turn: string): ApiTurn | undefined;
  // A session's turns, oldest first.
  ofSession(session: string): ApiTurn[];
  // A listed turn by its id alone (turn ids are unique).
  turnById(turn: string): ApiTurn | undefined;
  // The ons still waiting; null when the service has no list of them, and
  // undefined before the first read.
  ons?: ApiOn[] | null;
  // The last read's failure, in the API's words; null after a good read.
  error: string | null;
  // Read again now (after a click asked for a turn).
  refresh(): void;
}

// Asked, else started: a queued turn has only asked.
const when = (t: ApiTurn) => t.asked || t.started || '';
const byAsked = (a: ApiTurn, b: ApiTurn) => when(a).localeCompare(when(b)) || a.id.localeCompare(b.id);

// Builds the view from one read of the list.
export function queueView(turns: ApiTurn[], error: string | null, refresh: () => void, ons?: ApiOn[] | null): QueueView {
  const rows = new Map<string, ApiTurn>();
  const byId = new Map<string, ApiTurn>();
  const sessions = new Map<string, ApiTurn[]>();
  const push = <K>(m: Map<K, ApiTurn[]>, k: K, t: ApiTurn) => {
    const list = m.get(k);
    if (list) list.push(t);
    else m.set(k, [t]);
  };
  for (const t of turns) {
    rows.set(`${t.session}/${t.id}`, t);
    byId.set(t.id, t);
    push(sessions, t.session, t);
  }
  for (const l of sessions.values()) l.sort(byAsked);
  return {
    turns,
    turnOf: (session, turn) => rows.get(`${session}/${turn}`),
    ofSession: (s) => sessions.get(s) ?? [],
    turnById: (id) => byId.get(id),
    ons,
    error,
    refresh,
  };
}

// Reads the turns every POLL_MS while mounted.
export function useQueue(src: QueueSource | undefined): QueueView | undefined {
  const pollMs = src?.pollMs ?? POLL_MS;
  const [turns, setTurns] = useState<ApiTurn[]>([]);
  const [ons, setOns] = useState<ApiOn[] | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!src) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const read = async () => {
      try {
        // The ons are read with the turns; a failed ons read keeps the last
        // ones and never hides the turn list.
        const [list, onList] = await Promise.all([
          src.listTurns(),
          src.listOns ? src.listOns().catch(() => undefined) : Promise.resolve(null),
        ]);
        if (!active) return;
        setTurns(list);
        if (onList !== undefined) setOns(onList);
        setError(null);
      } catch (err) {
        if (active) setError((err as Error).message);
      } finally {
        if (active) timer = setTimeout(read, pollMs);
      }
    };
    read();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [src, pollMs, tick]);

  return useMemo(() => (src ? queueView(turns, error, refresh, ons) : undefined), [src, turns, error, refresh, ons]);
}
