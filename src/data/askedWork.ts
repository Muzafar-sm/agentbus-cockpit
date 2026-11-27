// Work a session asked another agent for (ask_agent, review_turn), while it
// waits and while it runs. Read from what the cockpit already holds: the asked
// session's row (GET /api/v0/sessions: origin asked, open) and its turns on
// the turn list (GET /api/v0/turns, read every few seconds), which carries a
// queued turn before any event of it is recorded. Nothing new is asked of the
// service.
import { CockpitEvent, SessionSummary } from '../types';
import { ApiOn, ApiTurn } from './jobs';
import { pairToolCalls } from './turns';
import { formatElapsed, RUNNER_WAIT_MS, steadyNow } from './liveStatus';

export interface AskedWork {
  // The asked session.
  id: string;
  // The saved agent (or harness) doing the work.
  agent?: string;
  // The turn that asked for it.
  by?: string;
  // The watched turn, when the work is read from an on.
  turn?: string;
  // The watched turn is a review (review_turn), from the turn list.
  review?: boolean;
  state: 'queued' | 'running';
  // When the work started running (ms), when the turn list says.
  sinceMs?: number;
  // The asked session's title, from the sessions list.
  title?: string;
  // Why queued work waits, from the turn's own fields: ahead is how many of
  // the asked session's turns are before it, and behind the one directly
  // before it (its number and state) when the turn list has it.
  ahead?: number;
  behind?: { turn: string; number?: number; state: string };
}

// The turn directly before a queued turn in its own session: the latest asked
// of those still queued or running. Undefined when the list has none.
export function blockerOf(t: ApiTurn, turns: ApiTurn[]): AskedWork['behind'] {
  const when = (x: ApiTurn) => x.asked || x.started || '';
  const before = turns
    .filter((x) => x.id !== t.id && (x.state === 'running' || x.state === 'queued') && (!when(t) || when(x) <= when(t)))
    .sort((a, b) => when(a).localeCompare(when(b)));
  const last = before[before.length - 1];
  return last ? { turn: last.id, number: last.number, state: last.state } : undefined;
}

// Why a queued turn waits, from its fields and its session's turns.
function waitOf(t: ApiTurn | undefined, turns: ApiTurn[]): Pick<AskedWork, 'ahead' | 'behind'> {
  if (!t || t.state !== 'queued') return {};
  const ahead = typeof t.ahead === 'number' && t.ahead > 0 ? t.ahead : undefined;
  return ahead ? { ahead, behind: blockerOf(t, turns) } : {};
}

// The work `session` waits on that is queued or running, oldest first.
//
// With the ons (GET /api/v0/ons), that is every turn an on delivers to this
// session, whoever registered it: several sessions may wait on one turn, and a
// coordinator that took over another's work shows it, while the one it replaced
// does not. One line per watched turn. A turn the list does not have, or one
// that ended (its result is on its way), is left out, and so is the session's
// own turn.
//
// Without them (an older service, or before the first read), it is the work
// the session started: the asked sessions whose origin names it. A session that
// ended (its turn finished, failed or stopped, or ran and closed) is left out:
// its result comes back as a turn of the asking session.
export function askedWork(
  sessions: SessionSummary[],
  session: string,
  turnsOf?: (session: string) => ApiTurn[],
  ons?: ApiOn[] | null,
  turnById?: (turn: string) => ApiTurn | undefined
): AskedWork[] {
  if (ons && turnById) return waitedOn(sessions, session, ons, turnById, turnsOf);
  const out: AskedWork[] = [];
  for (const s of sessions) {
    if (s.origin?.kind !== 'asked' || s.origin.session !== session) continue;
    const turns = turnsOf?.(s.id) ?? [];
    const running = turns.find((t) => t.state === 'running');
    const base = { id: s.id, agent: s.first_agent_id ?? running?.agent_id ?? turns[0]?.agent_id ?? s.agent, by: s.origin.turn, title: s.title || undefined };
    if (running || s.open) {
      const at = running?.started ? Date.parse(running.started) : NaN;
      out.push({ ...base, state: 'running', sinceMs: isNaN(at) ? undefined : at });
    } else if (turns.some((t) => t.state === 'queued')) {
      out.push({ ...base, state: 'queued', ...waitOf(turns.find((t) => t.state === 'queued'), turns) });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

// The turns the ons say `session` waits on: see askedWork.
function waitedOn(
  sessions: SessionSummary[],
  session: string,
  ons: ApiOn[],
  turnById: (turn: string) => ApiTurn | undefined,
  turnsOf?: (session: string) => ApiTurn[]
): AskedWork[] {
  const out: AskedWork[] = [];
  const seen = new Set<string>();
  for (const on of ons) {
    if (on.event !== 'turn.completed' || on.session !== session || seen.has(on.turn)) continue;
    seen.add(on.turn);
    const t = turnById(on.turn);
    if (!t || t.session === session || (t.state !== 'queued' && t.state !== 'running')) continue;
    const row = sessions.find((s) => s.id === t.session);
    const at = t.state === 'running' && t.started ? Date.parse(t.started) : NaN;
    out.push({
      id: t.session,
      agent: t.agent_id ?? row?.first_agent_id ?? t.agent,
      by: on.by?.session === session ? on.by.turn : undefined,
      turn: t.id,
      review: t.kind === 'review' || undefined,
      state: t.state === 'running' ? 'running' : 'queued',
      sinceMs: isNaN(at) ? undefined : at,
      title: row?.title || undefined,
      ...waitOf(t, turnsOf?.(t.session) ?? []),
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id) || (a.turn ?? '').localeCompare(b.turn ?? ''));
}

// True when the asking turn's events show the ask as a review: the tool call
// whose result names the asked session is review_turn (the agentbus app; a
// harness may prefix it, as claude's mcp__agentbus__review_turn).
export function askedReview(events: CockpitEvent[] | undefined, asked: string): boolean {
  if (!events) return false;
  for (const p of pairToolCalls(events, events)) {
    const out = p.completed?.tool_output;
    const text = typeof out === 'string' ? out : out === undefined ? '' : JSON.stringify(out);
    if (text.includes(asked)) return /review_turn$/.test(p.requested.tool_name ?? '');
  }
  return false;
}

// When the cockpit first saw each piece of asked work queued, on the steady
// local clock. Kept for the page's life, so a switch away and back does not
// start the wait over.
const firstQueued = new Map<string, number>();

// Forgets every wait counted so far (tests).
export function resetQueuedWaits(): void {
  firstQueued.clear();
}

// How long the cockpit has seen asked work `id` queued (ms). The first call
// starts the count.
export function queuedWaitMs(id: string, at = steadyNow()): number {
  let since = firstQueued.get(id);
  if (since === undefined) {
    since = at;
    firstQueued.set(id, since);
  }
  return at - since;
}

// The status line for one piece of asked work, in plain words:
// "Codex review queued · starts when this turn ends",
// "Codex is reviewing · 2m 5s", "Codex is working on it · 40s".
// Queued behind nothing, it waits like a sent message: "Waiting for Codex"
// until it has been queued RUNNER_WAIT_MS (waitedMs), then "Codex queued ·
// waiting for a runner". With no waitedMs it names the runner at once.
export function askedLine(w: AskedWork, name: string, review: boolean, askerRunning: boolean, now: number, waitedMs?: number): string {
  if (w.state === 'queued') {
    if (askerRunning) return `${name}${review ? ' review' : ''} queued · starts when this turn ends`;
    // Behind its own session's earlier turns: says which, from the turn list.
    if (w.ahead) {
      const b = w.behind;
      const which = b ? `behind ${b.number ? `turn ${b.number}` : 'its earlier turn'}${b.state === 'running' ? ', running' : ', queued'}` : `behind ${w.ahead === 1 ? '1 earlier turn' : `${w.ahead} earlier turns`}`;
      return `${name}${review ? ' review' : ''} queued · ${which}`;
    }
    if (waitedMs !== undefined && waitedMs < RUNNER_WAIT_MS) return review ? `Waiting for the ${name} review` : `Waiting for ${name}`;
    return `${name}${review ? ' review' : ''} queued · waiting for a runner`;
  }
  const what = `${name} ${review ? 'is reviewing' : 'is working on it'}`;
  return w.sinceMs !== undefined ? `${what} · ${formatElapsed(now - w.sinceMs)}` : what;
}
