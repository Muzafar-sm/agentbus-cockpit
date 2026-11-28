// @vitest-environment jsdom
// Commands agents handed to AgentBus (run_command): found through their ons,
// read by id until they end, shown in the asking session and on the Runners page.
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMMAND_ENDED, CommandLine, OUTPUT_KEPT } from '../components/CommandLine';
import { ConvoColumn } from '../components/ConvoColumn';
import { RunnersPage } from '../components/RunnersPage';
import { WorkspacesApi } from '../components/Workspaces';
import { commandEnd, commandIds, CommandsView, shortLine, useCommands } from '../data/commands';
import { ApiCommand, ApiOn, QueueSource, TurnsClient } from '../data/jobs';
import { buildTurns, createEmptyUsage } from '../data/turns';
import { RunnerInfo, SessionDetail, WorkspaceRow } from '../types';
import { click, ev, flush, render, unmountAll } from './helpers';

const now = Date.now();
const ago = (s: number) => new Date(now - s * 1000).toISOString();
const cmd = (id: string, f: Partial<ApiCommand> = {}): ApiCommand => ({
  id,
  line: 'make gate',
  state: 'running',
  session: 's1',
  turn: 'T1',
  workspace: 'ws_a',
  timeout_minutes: 30,
  created: ago(125),
  ...f,
});
const LONG = 'npx vitest run --no-file-parallelism && npx tsc --noEmit && npm run build && ./scripts/check-everything-twice.sh';

afterEach(() => {
  unmountAll();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('finding commands', () => {
  it('takes the ids of command ons (turn c_...), once each, and leaves turn and session ons out', () => {
    const ons: ApiOn[] = [
      { id: 'on_1', event: 'turn.completed', turn: 'c_1', session: 's1' },
      { id: 'on_2', event: 'turn.completed', turn: 't_9', session: 's1' },
      { id: 'on_3', event: 'turn.completed', filter: { session: 'b1' }, session: 's1' },
      { id: 'on_4', event: 'turn.completed', turn: 'c_1', session: 's2' },
      { id: 'on_5', event: 'turn.completed', turn: 'c_2', session: 's2' },
    ];
    expect(commandIds(ons)).toEqual(['c_1', 'c_2']);
    expect(commandIds(null)).toEqual([]);
  });

  it('reads each command until it ends, then keeps it as it ended, after its on is gone', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let state: ApiCommand = cmd('c_1');
    const src: QueueSource = { address: 'x', listTurns: async () => [], stop: async () => {}, getCommand: vi.fn(async () => state) };
    let view: CommandsView | undefined;
    const Probe = ({ ons }: { ons: ApiOn[] }) => {
      view = useCommands(src, ons);
      return null;
    };
    const on: ApiOn = { id: 'on_1', event: 'turn.completed', turn: 'c_1', session: 's1' };
    const r = await render(<Probe ons={[on]} />);
    await flush();
    expect(view!.ofSession('s1').map((c) => c.state)).toEqual(['running']);
    state = cmd('c_1', { state: 'finished', exit_code: 0, output: 'ok\n', duration_ms: 240_000 });
    // The on goes when it delivers; the command is still read till it ends.
    await act(async () => r.root.render(<Probe ons={[]} />));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5100);
    });
    expect(view!.ofSession('s1').map((c) => c.state)).toEqual(['finished']);
    const reads = (src.getCommand as ReturnType<typeof vi.fn>).mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    // Ended: never read again.
    expect((src.getCommand as ReturnType<typeof vi.fn>).mock.calls.length).toBe(reads);
    expect(view!.ofSession('s2')).toEqual([]);
  });

  it('the client reads GET /api/v0/commands/{id} and stops with POST .../stop; 404 is no command, 409 has ended', async () => {
    const calls: string[] = [];
    let status = 200;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push(`${init?.method ?? 'GET'} ${new URL(url).pathname}`);
        return new Response(JSON.stringify(status === 200 ? cmd('c_1') : { error: 'x' }), { status });
      })
    );
    const c = new TurnsClient('http://svc', 't');
    expect((await c.getCommand('c_1'))!.line).toBe('make gate');
    status = 404;
    expect(await c.getCommand('c_1')).toBeNull();
    status = 202;
    expect(await c.stopCommand('c_1')).toBe('stopping');
    status = 409;
    expect(await c.stopCommand('c_1')).toBe('not-running');
    expect(calls).toEqual(['GET /api/v0/commands/c_1', 'GET /api/v0/commands/c_1', 'POST /api/v0/commands/c_1/stop', 'POST /api/v0/commands/c_1/stop']);
  });
});

describe('a command in the chat', () => {
  it('while it runs: the line shortened (whole on hover), how long it has run, and Stop', async () => {
    const onStop = vi.fn(async () => 'stopping' as const);
    const r = await render(<CommandLine c={cmd('c_1', { line: LONG })} onStop={onStop} />);
    const line = r.container.querySelector('.sh-line')!;
    expect(line.getAttribute('title')).toBe(LONG);
    expect(line.textContent).toBe(`$ ${shortLine(LONG)}`);
    expect(line.textContent!.endsWith('…')).toBe(true);
    expect(r.container.querySelector('.cmd-time')!.textContent).toMatch(/^running · 2m 5s$/);
    expect(r.container.querySelector('.spin')).not.toBeNull();
    await click(r.container.querySelector('.cmd-stop'));
    expect(onStop).toHaveBeenCalledWith('c_1');
    expect(r.container.querySelector('.cmd-stop')!.textContent).toBe('Stopping…');
  });

  it('a Stop after it ended says so', async () => {
    const r = await render(<CommandLine c={cmd('c_1')} onStop={async () => 'not-running'} />);
    await click(r.container.querySelector('.cmd-stop'));
    expect(r.container.textContent).toContain(COMMAND_ENDED);
  });

  it('once it ended: its exit code and how long it ran, and the end of its output folded', async () => {
    const out = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join('\n');
    const r = await render(
      <CommandLine c={cmd('c_1', { state: 'failed', reason: 'exit', exit_code: 2, output: out, output_bytes: 90_000, duration_ms: 242_000 })} onStop={async () => 'stopping'} />
    );
    expect(r.container.querySelector('.sh-exit')!.textContent).toBe('✕ exit 2');
    expect(r.container.querySelector('.sh-meta')!.textContent).toBe('ran 4m 2s');
    expect(r.container.querySelector('.cmd-stop')).toBeNull();
    expect(r.container.querySelector('.sh-out')).toBeNull();
    const fold = r.container.querySelector('.sh-fold')!;
    expect(fold.textContent).toBe('Show the end of its output (12 lines)');
    await click(fold);
    expect(r.container.querySelector('.sh-out')!.textContent).toBe(out);
    expect(r.container.querySelector('.sh-note')!.textContent).toBe(OUTPUT_KEPT(90_000));
  });

  it('says how it ended in plain words', () => {
    expect(commandEnd(cmd('c', { state: 'finished', exit_code: 0 }))).toBe('exit 0');
    expect(commandEnd(cmd('c', { state: 'failed', reason: 'timeout', timed_out: true }))).toBe('timed out after 30 min');
    expect(commandEnd(cmd('c', { state: 'failed', reason: 'runner_lost' }))).toBe('its runner was lost');
    expect(commandEnd(cmd('c', { state: 'stopped' }))).toBe('stopped');
  });

  it('shows under the turn that asked for it, or at the foot when that turn is not on screen', async () => {
    const events = [
      ev({ session: 's1', kind: 'turn.started', turn: 'T1', exchange: 'x1', text: 'run the gate' }),
      ev({ session: 's1', kind: 'turn.completed', turn: 'T1', exchange: 'x1', outcome: 'finished' }),
    ];
    const turns = buildTurns('s1', events);
    const s = { id: 's1', title: 'S', agent: 'claude', turns: 1, turnsList: turns, usage: createEmptyUsage() } as unknown as SessionDetail;
    const r = await render(
      <ConvoColumn session={s} selectedTurn={null} onSelectTurn={() => {}} agentCommands={[cmd('c_1'), cmd('c_2', { turn: 'T_old', line: 'make deploy' })]} onStopCommand={async () => 'stopping'} />
    );
    const msgs = [...r.container.querySelectorAll('#c-msgs .tb.pick, #c-msgs [data-command]')].map((e) => e.getAttribute('data-command') ?? 'turn');
    expect(msgs).toEqual(['turn', 'c_1', 'c_2']);
    expect(r.container.querySelector('.tb.pick + [data-command="c_1"], .tb.pick ~ [data-command="c_1"]')).not.toBeNull();
  });
});

describe('a machine’s commands on the Runners page', () => {
  const runners: RunnerInfo[] = [
    { id: 'run_a', name: 'mac', role: 'runner', machine: 'con_a', online: true, last_seen: ago(0), labels: [], harnesses: [] },
    { id: 'run_b', name: 'box', role: 'runner', machine: 'con_b', online: true, last_seen: ago(0), labels: [], harnesses: [] },
  ];
  const rows: WorkspaceRow[] = [
    { workspace: 'ws_a', sandbox: true, machine: 'con_a', folder: '/a', created: ago(600) },
    { workspace: 'ws_b', sandbox: true, machine: 'con_b', folder: '/b', created: ago(600) },
  ];
  const api: WorkspacesApi = { list: async () => rows, close: async () => ({ state: 'queued' }) };

  it('lists each machine’s queued and running commands with their task, and Stop', async () => {
    const commands = [
      cmd('c_1', { line: LONG }),
      cmd('c_2', { state: 'queued', line: 'make e2e' }),
      cmd('c_3', { state: 'finished', exit_code: 0 }),
      cmd('c_4', { workspace: 'ws_b', line: 'make other' }),
    ];
    const onStop = vi.fn(async () => 'stopping' as const);
    const r = await render(
      <RunnersPage runners={runners} error={null} onBack={() => {}} workspaces={api} taskOf={(w) => (w === 'ws_a' ? 'Fix the gate' : undefined)} commands={commands} onStopCommand={onStop} />
    );
    await flush();
    const ids = () => [...r.container.querySelectorAll('table.rn-commands tr[data-command]')].map((x) => x.getAttribute('data-command'));
    expect(ids()).toEqual(['c_1', 'c_2']);
    const row1 = r.container.querySelector('tr[data-command="c_1"]')!;
    expect(row1.querySelector('.cmd-line')!.getAttribute('title')).toBe(LONG);
    expect(row1.querySelector('.cmd-task')!.textContent).toBe('Fix the gate');
    expect(row1.querySelector('.cmd-state')!.textContent).toMatch(/running · 2m \d+s/);
    expect(r.container.querySelector('tr[data-command="c_2"] .cmd-state')!.textContent).toBe('queued');
    await click(row1.querySelector('.cmd-stop'));
    expect(onStop).toHaveBeenCalledWith('c_1');
    await click(r.container.querySelector('[data-runner="run_b"]'));
    await flush();
    expect(ids()).toEqual(['c_4']);
  });
});
