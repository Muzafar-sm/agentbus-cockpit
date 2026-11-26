import { TurnState, Usage, VersionInfo } from '../types';
import { STATE, TOOL_STATE } from '../words';

// Colour only for status: a failed turn is red, a finished one green.
export function stateClass(state: TurnState): string {
  if (state === 'failed') return 'bad';
  if (state === 'finished') return 'ok';
  return 'dim';
}

// How a turn's state reads, in the one lowercase word of each state
// (words.ts STATE): a stopped turn as stopped, a finished turn by its
// outcome, when it has one.
export function stateLabel(turn: { state: TurnState; outcome?: string; stopped?: boolean }): string {
  if (turn.stopped) return STATE.stopped;
  if (turn.state === 'finished') return turn.outcome || STATE.finished;
  return STATE[turn.state as keyof typeof STATE] ?? turn.state;
}

// A tool call's state from its result event (tool.completed), the same word
// in every view: ok, failed, or, with no result, running while its turn
// runs and "no result" after.
export function toolStateLabel(done?: { tool_error?: boolean } | null, running = false): string {
  if (!done) return running ? TOOL_STATE.running : TOOL_STATE.none;
  return done.tool_error ? TOOL_STATE.failed : TOOL_STATE.ok;
}
export function toolStateClass(done?: { tool_error?: boolean } | null, running = false): string {
  if (!done) return running ? 'run' : 'dim';
  return done.tool_error ? 'bad' : 'ok';
}

// The colour of a turn's state. A turn the person stopped did not fail on its
// own, so it is not red.
export function turnStateClass(turn: { state: TurnState; stopped?: boolean }): string {
  return turn.stopped ? 'dim' : stateClass(turn.state);
}

// Tokens in all. Unknown usage (null: no reply carried any) is a dash, never 0.
export function formatTokens(usage?: Usage | null): string {
  if (usage === null) return '—';
  if (!usage) return '0';
  const total =
    (usage.input_tokens || 0) +
    (usage.output_tokens || 0) +
    (usage.cache_read_tokens || 0) +
    (usage.cache_write_tokens || 0);
  if (total >= 1000) {
    return (total / 1000).toFixed(1) + 'k';
  }
  return total.toLocaleString();
}

export const COST_INCOMPLETE_TITLE = 'some calls could not be fully priced';

// Money in USD. null or undefined means no cost is known: show nothing, never
// "$0.00". An incomplete cost is a lower bound: a leading "≥", rounded down so
// the bound stays true.
export function formatCost(usd: number | null | undefined, complete = true): string {
  if (usd === null || usd === undefined || isNaN(usd)) return '';
  // Exactly nothing spent is shown as such, not as "<$0.01".
  if (usd === 0) return complete ? '$0' : '≥$0';
  if (!complete) {
    // The epsilon absorbs float error: 1.15 * 100 is 114.99999999999999.
    if (usd >= 100) return `≥$${Math.floor(usd + 1e-6)}`;
    return `≥$${(Math.floor(usd * 100 + 1e-6) / 100).toFixed(2)}`;
  }
  if (usd < 0.01) return '<$0.01';
  if (usd >= 100) return `$${Math.round(usd)}`;
  return `$${usd.toFixed(2)}`;
}

export function formatCount(val: number): string {
  if (val >= 1000) {
    return (val / 1000).toFixed(1) + 'k';
  }
  return val.toString();
}

export function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toTimeString().split(' ')[0];
  } catch {
    return isoString;
  }
}

// When something happened, in the person's local time and words: the time of
// day ("14:32", or "2:32 PM" where that is the custom), with the date before it
// when it is not today ("Nov 24, 14:32"), and the year too when it is not this
// year. Empty when the time is not known or not a time.
export function formatWhen(isoString: string | undefined, now: number = Date.now()): string {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  const today = new Date(now);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return time;
  const date = d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}),
  });
  return `${date}, ${time}`;
}

// Every duration and latency on screen, one rule: whole ms under a second,
// else seconds with one decimal ("640ms", "1.7s", "11.2s").
export function formatDuration(ms?: number): string {
  if (ms === undefined || ms === null || isNaN(ms)) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function toolInputSummary(input: unknown): string {
  if (!input) return '';
  if (typeof input === 'string') return input;
  if (typeof input === 'object' && input !== null) {
    const obj = input as Record<string, unknown>;
    if (typeof obj.command === 'string') return obj.command;
    if (typeof obj.file_path === 'string') {
      return `${obj.file_path} ${obj.new_string ? '(edit)' : ''}`;
    }
    return JSON.stringify(input);
  }
  return String(input);
}

// How long ago an ISO time was, in the session list's words: "just now",
// "3 min ago", "2 hours ago", "4 days ago". Empty when the time is not known.
export function formatAgo(isoString: string | undefined, now: number = Date.now()): string {
  if (!isoString) return '';
  const t = Date.parse(isoString);
  if (isNaN(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ${h === 1 ? 'hour' : 'hours'} ago`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? 'day' : 'days'} ago`;
}

// versionLabel is the service's build in one short word: a release by its
// version ("0.5.0"); a dev build by its short commit ("12874bd"), with "+"
// when the tree had changes; a dev build with no commit by nothing.
export function versionLabel(v: VersionInfo): string {
  if (!v.version) return '';
  if (!/dev/.test(v.version)) return v.version;
  return v.commit ? `${v.commit.slice(0, 7)}${v.modified ? '+' : ''}` : '';
}
