// @vitest-environment jsdom
// 0.6.7: asked work shows under every session waiting on it (an on that
// delivers there); every answer of a turn comes from the single turn's
// replies; and a close answers 202 at once, its row staying until the record
// says the workspace closed, and saying so when it never does.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunnersPage } from '../components/RunnersPage';
import { ConvoColumn } from '../components/ConvoColumn';
import { CLOSE_STALL_MS, WorkspacesApi } from '../components/Workspaces';
import { askedWork } from '../data/askedWork';
import { ApiOn, ApiTurn, TurnsClient } from '../data/jobs';
import { LiveDataSource } from '../data/LiveDataSource';
import { createEmptyUsage } from '../data/turns';
import { CloseState, RunnerInfo, SessionDetail, SessionSummary, Turn, WorkspaceRow } from '../types';
import { click, flush, render, unmountAll } from './helpers';

afterEach(() => {
  unmountAll();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const at = (t: ApiTurn) => t;
const apiTurn = (id: string, session: string, state: string, f: Partial<ApiTurn> = {}): ApiTurn =>
  at({ id, session, state, agent: 'codex', agent_id: 'codex', folder: '/f', ...f } as ApiTurn);
const sess = (id: string, f: Partial<SessionSummary> = {}): SessionSummary => ({ id, title: id, ...f }) as SessionSummary;

describe('asked work from the ons', () => {
  // Builder session b1 was asked by the old coordinator c_old; the work was
  // handed to c_new, whose on now waits on b1's turn. A reviewer r1 is waited
  // on by both coordinators.
  const sessions = [
    sess('c_old'),
    sess('c_new'),
    sess('b1', { origin: { kind: 'asked', session: 'c_old', turn: 'T_old' } as SessionSummary['origin'], open: true }),
    sess('r1', { origin: { kind: 'asked', session: 'c_old', turn: 'T_old' } as SessionSummary['origin'] }),
    sess('d1'),
  ];
  const turns = [
    apiTurn('tb1', 'b1', 'running', { started: '2026-11-26T10:00:00Z' }),
    apiTurn('tr1', 'r1', 'queued', { kind: 'review' }),
    apiTurn('td1', 'd1', 'finished'),
  ];
  const byId = (id: string) => turns.find((t) => t.id === id);
  const ofSession = (s: string) => turns.filter((t) => t.session === s);
  const ons: ApiOn[] = [
    { id: 'on_1', event: 'turn.completed', turn: 'tb1', session: 'c_new', by: { session: 'c_new', turn: 'T_new' } },
    { id: 'on_2', event: 'turn.completed', turn: 'tr1', session: 'c_new' },
    { id: 'on_3', event: 'turn.completed', turn: 'tr1', session: 'c_old', by: { session: 'c_old', turn: 'T_old' } },
    { id: 'on_4', event: 'turn.completed', turn: 'tr1', session: 'c_new' },
    { id: 'on_5', event: 'turn.completed', turn: 'td1', session: 'c_new' },
  ];

  it('shows each turn under every session an on delivers it to, once each', () => {
    const forNew = askedWork(sessions, 'c_new', ofSession, ons, byId);
    expect(forNew.map((w) => [w.id, w.turn, w.state])).toEqual([
      ['b1', 'tb1', 'running'],
      ['r1', 'tr1', 'queued'],
    ]);
    expect(forNew[0].by).toBe('T_new');
    expect(forNew[0].sinceMs).toBe(Date.parse('2026-11-26T10:00:00Z'));
    expect(forNew[1].review).toBe(true);
    expect(askedWork(sessions, 'c_old', ofSession, ons, byId).map((w) => w.turn)).toEqual(['tr1']);
  });

  it('the replaced coordinator no longer shows the builder whose result goes to the new one', () => {
    // By origin alone, c_old would show b1 running.
    expect(askedWork(sessions, 'c_old', ofSession).map((w) => w.id)).toContain('b1');
    expect(askedWork(sessions, 'c_old', ofSession, ons, byId).map((w) => w.id)).not.toContain('b1');
  });

  it('leaves out a turn that ended, and falls back to the origin without the route', () => {
    expect(askedWork(sessions, 'c_new', ofSession, ons, byId).map((w) => w.turn)).not.toContain('td1');
    expect(askedWork(sessions, 'c_new', ofSession, null, byId)).toEqual([]);
  });

  it('reads GET /api/v0/ons, and null from a service that has no list', async () => {
    let status = 200;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        expect(new URL(input).pathname).toBe('/api/v0/ons');
        return new Response(JSON.stringify({ ons }), { status, headers: { 'Content-Type': 'application/json' } });
      })
    );
    const c = new TurnsClient('http://x', 'tok');
    expect(await c.listOns()).toEqual(ons);
    status = 405;
    expect(await c.listOns()).toBeNull();
  });
});

describe('every answer from the single turn', () => {
  it('getTurnText carries the replies', async () => {
    const replies = [
      { text: 'the table', time: '2026-11-26T14:56:49Z' },
      { text: 'the build finished', time: '2026-11-26T15:00:56Z' },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ turn: { id: 'T1', session: 's', prompt: 'p', reply: 'the build finished', replies } }), { status: 200 }))
    );
    const t = await new LiveDataSource({ baseUrl: 'http://x' }).getTurnText('s', 'T1');
    expect(t.replies).toEqual(replies);
    expect(t.reply).toBe('the build finished');
  });

  it('the chat shows each answer without the turn being opened', async () => {
    const t = {
      id: 'T1', turnNumber: 1, sessionId: 's', startedAt: '2026-11-26T14:50:00Z', prompt: 'pick', agent: 'claude', state: 'finished',
      usage: null, costUsd: null, costComplete: true, reply: 'the build finished',
      answers: [
        { text: 'the table', time: '2026-11-26T14:56:49Z' },
        { text: 'the build finished', time: '2026-11-26T15:00:56Z' },
      ],
    } as Turn;
    const s = { id: 's', title: 's', agent: 'claude', turns: 1, turnsList: [t], usage: createEmptyUsage() } as unknown as SessionDetail;
    const r = await render(<ConvoColumn session={s} selectedTurn={null} onSelectTurn={() => {}} />);
    expect([...r.container.querySelectorAll('.tb .m-agent')].map((e) => e.textContent?.trim())).toEqual(['the table', 'the build finished']);
  });
});

describe('Close with a 202 reply', () => {
  const runners: RunnerInfo[] = [
    { id: 'run_a', name: 'mac', role: 'runner', machine: 'con_a', online: true, last_seen: new Date().toISOString(), labels: [], harnesses: [] },
  ];
  const open: WorkspaceRow[] = [{ workspace: 'ws_1', sandbox: true, machine: 'con_a', folder: '/p/app', created: new Date().toISOString() }];

  it('keeps the row Closing… and reads again soon, then goes once the record says closed', async () => {
    vi.useFakeTimers({ toFake: ['setInterval'] });
    let rows = open;
    const a: WorkspacesApi = { list: vi.fn(async () => rows), close: vi.fn(async (): Promise<CloseState> => ({ state: 'queued' })) };
    const r = await render(<RunnersPage runners={runners} error={null} onBack={() => {}} workspaces={a} />);
    await flush();
    await click(r.container.querySelector('.ws-close'));
    await flush();
    expect(r.container.querySelector('.ws-close')!.textContent).toBe('Closing…');
    const reads = (a.list as ReturnType<typeof vi.fn>).mock.calls.length;
    rows = [{ ...open[0], closed: new Date().toISOString() }];
    // Read again within seconds, not at the 30 s page poll.
    vi.advanceTimersByTime(3000);
    await flush();
    expect((a.list as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(reads);
    expect(r.container.querySelector('tr[data-workspace="ws_1"]')).toBeNull();
  });

  it('a close that never runs is said, with Close to ask again, not Closing… for ever', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'Date'] });
    const a: WorkspacesApi = { list: vi.fn(async () => open), close: vi.fn(async (): Promise<CloseState> => ({ state: 'queued' })) };
    const r = await render(<RunnersPage runners={runners} error={null} onBack={() => {}} workspaces={a} />);
    await flush();
    await click(r.container.querySelector('.ws-close'));
    await flush();
    expect(r.container.querySelector('.ws-stalled')).toBeNull();
    vi.advanceTimersByTime(CLOSE_STALL_MS + 3000);
    await flush();
    expect(r.container.querySelector('tr[data-workspace="ws_1"]')).not.toBeNull();
    expect(r.container.querySelector('.ws-close')!.textContent).toBe('Close');
    expect(r.container.querySelector('.ws-stalled')!.textContent).toMatch(/not closed yet/);
    // Asking again starts the wait over.
    await click(r.container.querySelector('.ws-close'));
    await flush();
    expect(r.container.querySelector('.ws-close')!.textContent).toBe('Closing…');
    expect(r.container.querySelector('.ws-stalled')).toBeNull();
  });
});
