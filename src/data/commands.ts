// The commands agents handed to AgentBus (run_command), for the asking
// session's chat and the Runners page.
//
// The API has no list of commands. A command's result reaches its session
// through an on control registers for it, over the command's id (an on whose
// turn is c_...), so the ons the cockpit already reads (GET /api/v0/ons) name
// every command still queued or running. Each is read by id
// (GET /api/v0/commands/{id}) until it ends, then kept as it ended: the on is
// gone by then. A command that ended before this page read the ons is not
// found; its result shows as the turn it was delivered as.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiCommand, ApiOn, QueueSource } from './jobs';

// How often a queued or running command is read again.
export const COMMAND_POLL_MS = 5000;

export function isCommandId(id: string | undefined): id is string {
  return !!id && id.startsWith('c_');
}

export function commandEnded(c: Pick<ApiCommand, 'state'>): boolean {
  return c.state !== 'queued' && c.state !== 'running';
}

// The command ids the ons name, in their order, once each.
export function commandIds(ons: ApiOn[] | null | undefined): string[] {
  const out: string[] = [];
  for (const on of ons ?? []) if (isCommandId(on.turn) && !out.includes(on.turn)) out.push(on.turn);
  return out;
}

export interface CommandsView {
  // Every command found, oldest asked first.
  all: ApiCommand[];
  // The commands a session asked for.
  ofSession(session: string): ApiCommand[];
  // Stops one; read again at once.
  stop?(id: string): Promise<'stopping' | 'not-running'>;
}

export function useCommands(src: QueueSource | undefined, ons: ApiOn[] | null | undefined): CommandsView | undefined {
  const can = !!src?.getCommand;
  const [byId, setById] = useState<ReadonlyMap<string, ApiCommand>>(new Map());
  const known = useRef<Set<string>>(new Set());
  const [kick, setKick] = useState(0);
  const ids = commandIds(ons).join(',');
  useEffect(() => {
    let added = false;
    for (const id of ids.split(',')) if (id && !known.current.has(id)) {
      known.current.add(id);
      added = true;
    }
    if (added) setKick((k) => k + 1);
  }, [ids]);
  const latest = useRef(byId);
  latest.current = byId;
  useEffect(() => {
    if (!can || !src) return;
    // Only a command not known to have ended is read.
    const open = () => [...known.current].filter((id) => {
      const c = latest.current.get(id);
      return !c || !commandEnded(c);
    });
    if (open().length === 0) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const read = async () => {
      const got = await Promise.all(open().map((id) => src.getCommand!(id).then((c) => [id, c] as const, () => [id, undefined] as const)));
      if (!active) return;
      setById((cur) => {
        const next = new Map(cur);
        for (const [id, c] of got) {
          if (c === null) {
            // No such command: forget it.
            known.current.delete(id);
            next.delete(id);
          } else if (c) next.set(id, c);
        }
        latest.current = next;
        return next;
      });
      if (open().length > 0) timer = setTimeout(read, src.pollMs ? Math.min(src.pollMs, COMMAND_POLL_MS) : COMMAND_POLL_MS);
    };
    void read();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [src, can, kick]);
  const stop = useCallback(
    async (id: string) => {
      const r = await src!.stopCommand!(id);
      setKick((k) => k + 1);
      return r;
    },
    [src]
  );
  return useMemo(() => {
    if (!can) return undefined;
    const all = [...byId.values()].sort((a, b) => a.created.localeCompare(b.created));
    return { all, ofSession: (s) => all.filter((c) => c.session === s), stop: src?.stopCommand ? stop : undefined };
  }, [can, byId, stop, src]);
}

// A command line on one line, cut to max characters, for a label; the whole
// line goes on hover.
export function shortLine(line: string, max = 72): string {
  const first = line.split('\n')[0];
  const cut = first.length > max ? `${first.slice(0, max - 1).trimEnd()}…` : first;
  return cut !== line && !cut.endsWith('…') ? `${cut} …` : cut;
}

// How a command ended, in a few words.
export function commandEnd(c: ApiCommand): string {
  if (c.state === 'finished') return 'exit 0';
  if (c.state === 'stopped') return 'stopped';
  if (c.timed_out || c.reason === 'timeout') return c.timeout_minutes ? `timed out after ${c.timeout_minutes} min` : 'timed out';
  if (c.reason === 'runner_lost') return 'its runner was lost';
  if (c.reason === 'runner_stopped') return 'its runner stopped';
  if (c.reason === 'setup') return 'did not start';
  return c.exit_code !== undefined ? `exit ${c.exit_code}` : 'failed';
}
