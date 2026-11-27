// A workspace action (Apply, Discard, Update, Close) answers at once: 202
// {state: 'queued', event}. The action runs as a job, and its result is on the
// record (workspace.applied, workspace.discarded, workspace.updated,
// workspace.closed, or workspace.failed). GET /api/v0/workspaces/{id}/outcome
// ?event=<that event> says how that one action stands. One rule for all four:
// the button sends, the row waits, and the result shown is the one the outcome
// route gives for that event.

// How one action stands, as the cockpit reads it. state is queued or running
// while it waits, else how it ended: applied, refused, discarded, updated,
// conflict, merged, closed, or failed (error says why, in the API's words).
// The other fields are the result of the action that ended: an apply's files
// and refused conflicts, a discard's dropped turns, an update's conflicting,
// unresolved and unmergeable files.
export interface WorkspaceOutcome {
  state: string;
  // The record's event kind that ended it, when the route names it.
  kind?: string;
  event?: string;
  error?: string;
  already?: boolean;
  turn?: string;
  files?: string[];
  count?: number;
  truncated?: boolean;
  // An apply's refused files, each with why; an update's files changed on both
  // sides (paths only).
  conflicts?: unknown[];
  dropped_turns?: string[];
  unresolved?: string[];
  unmergeable?: string[];
  updated?: boolean;
}

// The reply to the POST, as far as following it goes.
export interface Started {
  state?: string;
  event?: string;
}

export const OUTCOME_POLL_MS = 2000;
// An action not ended this long after it was asked is said to the person as
// not done yet, with the button back, rather than waiting for ever.
export const OUTCOME_GIVE_UP_MS = 3 * 60_000;

export const ongoing = (state: string | undefined) => state === 'queued' || state === 'running';

const KIND_STATE: Record<string, string> = {
  'workspace.applied': 'applied',
  'workspace.discarded': 'discarded',
  'workspace.updated': 'updated',
  'workspace.closed': 'closed',
  'workspace.failed': 'failed',
};
// Where an event keeps its result, under the event's own name.
const NESTS = ['outcome', 'applied', 'discarded', 'updated', 'closed', 'failed'];

const strings = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined;

// One read of the outcome route, made flat: the result's fields at the top,
// and a state named from the event kind when the route gives none. A reply
// with neither is still waiting.
export function readOutcome(raw: unknown): WorkspaceOutcome {
  if (!raw || typeof raw !== 'object') return { state: 'queued' };
  const top = raw as Record<string, unknown>;
  let flat: Record<string, unknown> = {};
  for (const n of NESTS) {
    const v = top[n];
    if (v && typeof v === 'object' && !Array.isArray(v)) flat = { ...flat, ...(v as Record<string, unknown>) };
  }
  flat = { ...flat, ...top };
  const kind = typeof top.kind === 'string' ? top.kind : undefined;
  let state = typeof flat.state === 'string' && flat.state ? flat.state : undefined;
  // An update says how it ended in result (updated, conflict, merged); an
  // apply that wrote nothing because files conflicted says refused.
  if (!state && typeof flat.result === 'string') state = flat.result;
  if (!state && kind) state = KIND_STATE[kind];
  const out: WorkspaceOutcome = { state: state ?? 'queued' };
  if (kind) out.kind = kind;
  if (typeof flat.event === 'string') out.event = flat.event;
  if (typeof flat.error === 'string' && flat.error) out.error = flat.error;
  if (typeof flat.why === 'string' && flat.why && !out.error) out.error = flat.why;
  if (flat.already === true) out.already = true;
  if (typeof flat.turn === 'string') out.turn = flat.turn;
  if (strings(flat.files)) out.files = strings(flat.files);
  if (typeof flat.count === 'number') out.count = flat.count;
  if (flat.truncated === true) out.truncated = true;
  if (Array.isArray(flat.conflicts)) out.conflicts = flat.conflicts;
  if (strings(flat.dropped_turns)) out.dropped_turns = strings(flat.dropped_turns);
  if (strings(flat.unresolved)) out.unresolved = strings(flat.unresolved);
  if (strings(flat.unmergeable)) out.unmergeable = strings(flat.unmergeable);
  if (flat.updated === true) out.updated = true;
  return out;
}

// What an action that failed says to the person: plain words, then the API's.
export function failedWords(action: 'apply' | 'discard' | 'update' | 'close', o: { error?: string }): string {
  return o.error ? `The ${action} did not run: ${o.error.replace(/\.?$/, '.')}` : `The ${action} did not run. AgentBus gave no reason.`;
}

// The words for an action asked a while ago and not ended.
export function stalledWords(action: 'apply' | 'discard' | 'update' | 'close', askedMs: number, now = Date.now()): string {
  const min = Math.max(1, Math.round((now - askedMs) / 60_000));
  return `The ${action} was asked ${min} min ago and has not run yet. It may wait behind a running turn, or the runner may be away. Ask again to retry.`;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Follows one action to its end. A reply that already ended (an older service
// answers 200 with the result) is the outcome; so is one with no event to
// follow. Otherwise the outcome route is read at once and then every pollMs: onWait hears each
// waiting read, a read that fails is tried again, and the follow stops with
// state stalled after giveUpMs, or with state gone once active() is false.
export async function followOutcome(
  started: Started,
  read: ((event: string) => Promise<WorkspaceOutcome>) | undefined,
  opts: { pollMs?: number; giveUpMs?: number; onWait?: (o: WorkspaceOutcome) => void; active?: () => boolean } = {}
): Promise<WorkspaceOutcome> {
  if (!ongoing(started.state) || !started.event || !read) return readOutcome(started);
  const event = started.event;
  const pollMs = opts.pollMs ?? OUTCOME_POLL_MS;
  const giveUpMs = opts.giveUpMs ?? OUTCOME_GIVE_UP_MS;
  const t0 = Date.now();
  // The first read at once (a quick action has often ended), then every pollMs.
  for (let first = true; ; first = false) {
    if (!first) await sleep(pollMs);
    if (opts.active && !opts.active()) return { state: 'gone' };
    try {
      const o = await read(event);
      if (opts.active && !opts.active()) return { state: 'gone' };
      if (!ongoing(o.state)) return o;
      opts.onWait?.(o);
    } catch {
      // A read that fails is tried again on the next tick.
    }
    if (Date.now() - t0 >= giveUpMs) return { state: 'stalled', event };
  }
}
