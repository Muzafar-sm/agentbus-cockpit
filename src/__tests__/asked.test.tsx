// @vitest-environment jsdom
// Agents ask agents. A delivered result shows as such and names the agent that
// did the work; a turn another agent asked for says so. Neither links out: an
// asked session is one-off and the person never opens it. While an asked
// session still runs, the asking conversation shows one plain "Waiting on …"
// line, gone when it ends. The live source reads origin from the turn list.
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { ConvoColumn } from '../components/ConvoColumn';
import { LiveDataSource } from '../data/LiveDataSource';
import { createEmptyUsage } from '../data/turns';
import { SavedAgent, SessionDetail, Turn } from '../types';
import { ApiTurn, QueueSource } from '../data/jobs';
import { ev, liveReplay, render, rowSession, shownSession } from './helpers';

const SAVED: SavedAgent[] = [
  { id: 'claude', name: 'Claude Code', harness: 'claude', access: 'subscription' },
  { id: 'deepseek', name: 'DeepSeek flash', harness: 'claude', access: 'openrouter', model: 'deepseek/deepseek-v4.1-flash' },
];

function turn(id: string, n: number, fields: Partial<Turn> = {}): Turn {
  return {
    id,
    turnNumber: n,
    sessionId: 'p',
    startedAt: '2026-11-09T01:00:00Z',
    prompt: `prompt ${id}`,
    agent: 'claude',
    agentId: 'claude',
    state: 'finished',
    usage: null,
    costUsd: null,
    costComplete: true,
    ...fields,
  };
}

function session(turns: Turn[]): SessionDetail {
  return {
    id: 'p',
    title: 'p',
    agent: 'claude',
    turns: turns.length,
    turnsList: turns,
    usage: createEmptyUsage(),
  } as unknown as SessionDetail;
}

describe('asked work in the conversation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a delivered result says who did the work, as plain text with no link', async () => {
    const s = session([
      turn('T1', 1, { prompt: 'run all two on this' }),
      turn('T2', 2, {
        prompt: '[AgentBus] This message is from AgentBus, not from the person',
        origin: { kind: 'result', session: 'child1', turn: 'tc', turnKind: 'turn', agent: 'deepseek' },
      }),
      turn('T3', 3, { origin: { kind: 'result', session: 'rs', turnKind: 'review', agent: 'codex' } }),
    ]);
    const r = await render(<ConvoColumn session={s} selectedTurn={null} onSelectTurn={() => {}} agents={SAVED} />);
    const lines = Array.from(r.container.querySelectorAll('.m-origin')).map((x) => x.textContent);
    expect(lines).toEqual([
      'Result from DeepSeek flash, sent by AgentBus',
      'Result from Codex, sent by AgentBus',
    ]);
    // No link opens the session that did the work.
    expect(r.container.querySelector('.m-origin .origin-link')).toBeNull();
    const bubbles = r.container.querySelectorAll('.tb .bubble');
    expect(bubbles[0].classList.contains('delivered')).toBe(false);
    expect(bubbles[1].classList.contains('delivered')).toBe(true);
    r.unmount();
  });

  it('an asked turn says so, with no link', async () => {
    const s = session([turn('C1', 1, { origin: { kind: 'asked', session: 'p0', turn: 'T1' } })]);
    const r = await render(<ConvoColumn session={s} selectedTurn={null} onSelectTurn={() => {}} agents={SAVED} />);
    expect(r.container.querySelector('.m-origin')!.textContent).toBe('Asked by another agent');
    expect(r.container.querySelector('.origin-link')).toBeNull();
    r.unmount();
  });

  it('asked work shows at the foot of the conversation: queued, then running, then gone', async () => {
    const s = session([turn('T1', 1, { prompt: 'run codex on this', state: 'running' })]);
    const props = { session: s, selectedTurn: null, onSelectTurn: () => {}, agents: SAVED, live: undefined };
    const asked = (r: { container: HTMLElement }) => r.container.querySelector('.m-asked');
    // Queued behind the asking turn, which still runs.
    const queued = await render(<ConvoColumn {...props} asked={[{ id: 'c', agent: 'codex', by: 'T1', state: 'queued' }]} />);
    expect(asked(queued)!.textContent).toBe('Codex queued · starts when this turn ends');
    // It is the last line of the conversation, not a line above it.
    expect(queued.container.querySelector('#c-msgs .c-in')!.lastElementChild).toBe(asked(queued));
    expect(queued.container.querySelector('#c-waiting')).toBeNull();
    expect(asked(queued)!.querySelector('a, button')).toBeNull();
    queued.unmount();
    // Running, with its time.
    const running = await render(
      <ConvoColumn {...props} asked={[{ id: 'c', agent: 'codex', by: 'T1', state: 'running', sinceMs: Date.now() - 125_000 }]} />
    );
    expect(asked(running)!.textContent).toMatch(/^Codex is working on it · 2m \d+s$/);
    expect(asked(running)!.querySelector('.run-spin')).not.toBeNull();
    running.unmount();
    // Ended: nothing is asked for, the line is gone.
    const ended = await render(<ConvoColumn {...props} asked={[]} />);
    expect(asked(ended)).toBeNull();
    ended.unmount();
  });

  it('says review only when the asking turn called review_turn', async () => {
    const events = [
      ev({ session: 'p', kind: 'turn.started', turn: 'T1', text: 'review it', agent: 'claude' }),
      ev({ session: 'p', kind: 'tool.requested', turn: 'T1', tool_id: 'u1', tool_name: 'mcp__agentbus__review_turn', tool_input: { agent: 'codex' } }),
      ev({ session: 'p', kind: 'tool.completed', turn: 'T1', tool_id: 'u1', tool_output: '{"session":"c","turn":"tc"}' }),
      ev({ session: 'p', kind: 'tool.requested', turn: 'T1', tool_id: 'u2', tool_name: 'mcp__agentbus__ask_agent', tool_input: { agent: 'deepseek' } }),
      ev({ session: 'p', kind: 'tool.completed', turn: 'T1', tool_id: 'u2', tool_output: '{"session":"d","turn":"td"}' }),
    ];
    const t1 = turn('T1', 1, { state: 'finished', detail: { events, modelCalls: [], toolCalls: [] } });
    const r = await render(
      <ConvoColumn
        session={session([t1])}
        selectedTurn={null}
        onSelectTurn={() => {}}
        agents={SAVED}
        asked={[
          { id: 'c', agent: 'codex', by: 'T1', state: 'queued' },
          { id: 'd', agent: 'deepseek', by: 'T1', state: 'running' },
        ]}
      />
    );
    const lines = Array.from(r.container.querySelectorAll('.m-asked')).map((x) => x.textContent);
    // The asking turn has ended, so no turn holds the queued one back.
    expect(lines).toEqual(['Codex review queued · waiting for a runner', 'DeepSeek flash is working on it']);
    r.unmount();
  });

  it('the live source reads origin from GET /api/v0/turns, and leaves out a kind it does not know', async () => {
    const row = (id: string, seq: number, origin?: unknown) => ({
      id,
      session: 'p',
      agent: 'claude',
      folder: '/w',
      prompt: id,
      started_seq: seq,
      started: '2026-11-09T01:00:00Z',
      state: 'finished',
      usage: null,
      cost_usd: 0,
      cost_complete: true,
      origin,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            store: 'st',
            seq: 9,
            turns: [
              row('T3', 3, { kind: 'later' }),
              row('T2', 2, { kind: 'result', session: 'c', turn: 'tc', turn_kind: 'review', agent: 'codex' }),
              row('T1', 1),
            ],
            next_before: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    const list = await new LiveDataSource({ baseUrl: 'http://cockpit.test' }).getTurns('p');
    expect(list.turns.map((t) => t.origin)).toEqual([
      undefined,
      { kind: 'result', session: 'c', turn: 'tc', turnKind: 'review', agent: 'codex' },
      undefined,
    ]);
  });
});

describe('asked work across sessions', () => {
  const started = (session: string, turn: string, text: string, agent: string, origin?: unknown) => [
    ev({ session, kind: 'turn.started', turn, text, agent, agent_id: agent, folder: '/w', ...(origin ? { origin } : {}) }),
    ev({ session, kind: 'model.requested', turn, exchange: `x-${turn}`, model: 'm' }),
    ev({ session, kind: 'model.responded', turn, exchange: `x-${turn}`, status: 200, text: 'ok', stop_reason: 'end_turn' }),
    ev({ session, kind: 'turn.completed', turn, exchange: `x-${turn}`, outcome: 'finished' }),
  ];
  const parent = [
    ...started('p', 'T1', 'run codex on this', 'claude'),
    ...started('p', 'T2', '[AgentBus] result', 'claude', { kind: 'result', session: 'c', turn: 'C1', turn_kind: 'turn', agent: 'codex' }),
    ...started('p', 'T3', '[AgentBus] result', 'claude', { kind: 'result', session: 'n', turn: 'N1', job_kind: 'turn', agent: 'codex' }),
  ];
  const child = (id: string, turn: string) => started(id, turn, 'do it', 'codex', { kind: 'asked', session: 'p', turn: 'T1' });

  it('the replay source reads origin from turn.started', async () => {
    const lr = liveReplay([...parent, ...child('c', 'C1')]);
    const turns = (await lr.source.getTurns('p')).turns;
    expect(turns.map((t) => t.origin?.kind)).toEqual([undefined, 'result', 'result']);
    expect((await lr.source.getTurns('c')).turns[0].origin).toEqual({ kind: 'asked', session: 'p', turn: 'T1', turnKind: undefined, agent: undefined });
  });

  it('the list shows only the person session; an asked child stays off it, with no result link', async () => {
    const lr = liveReplay([...parent, ...child('c', 'C1')], { listAgents: async () => SAVED });
    const r = await render(<App dataSource={lr.source} />);
    // The person's session is shown, with its two delivered results as text.
    await waitFor(() => shownSession(r.container) === 'p' && r.container.querySelectorAll('.m-origin').length === 2, 'the parent');
    const listed = () => Array.from(r.container.querySelectorAll('#sessions [data-session]')).map((x) => rowSession(x));
    expect(listed()).toContain('p');
    expect(listed()).not.toContain('c');
    // No link opens the asked child; the finished child shows no waiting line.
    expect(r.container.querySelector('.m-origin .origin-link')).toBeNull();
    expect(r.container.querySelector('.m-asked')).toBeNull();
    r.unmount();
  });

  it('a running asked session shows a plain waiting line in the asking session, gone when it ends', async () => {
    // The parent's own turn is idle; a child it asked is still running: its
    // run holds it open (run.started, no run.ended yet).
    const runningParent = [...started('p', 'T1', 'run codex on this', 'claude')];
    const runningChild = [
      ev({ session: 'c', kind: 'run.started', hold: 'h-c', agent: 'codex', agent_id: 'codex', folder: '/w' }),
      ev({ session: 'c', kind: 'turn.started', turn: 'C1', text: 'do it', agent: 'codex', agent_id: 'codex', folder: '/w', origin: { kind: 'asked', session: 'p', turn: 'T1' } }),
      ev({ session: 'c', kind: 'model.requested', turn: 'C1', exchange: 'x-C1', model: 'm' }),
    ];
    const lr = liveReplay([...runningParent, ...runningChild], { listAgents: async () => SAVED });
    const r = await render(<App dataSource={lr.source} />);
    await waitFor(
      () => shownSession(r.container) === 'p' && r.container.querySelector('.m-asked')?.textContent === 'Codex is working on it',
      'the asking session with a waiting line'
    );
    const listed = () => Array.from(r.container.querySelectorAll('#sessions [data-session]')).map((x) => rowSession(x));
    expect(listed()).not.toContain('c'); // the asked child stays off the list
    expect(r.container.querySelector('.m-asked a, .m-asked button')).toBeNull(); // no link
    expect(r.container.querySelector('#c-waiting')).toBeNull(); // no line above the conversation
    expect(r.container.querySelectorAll('.m-origin').length).toBe(0); // no result delivered yet
    // The child's run ends: the waiting line goes.
    lr.push(ev({ session: 'c', kind: 'run.ended', hold: 'h-c' }));
    await waitFor(() => r.container.querySelector('.m-asked') === null, 'the waiting line gone');
    r.unmount();
  });

  it('queued asked work shows at the foot and dots its asking row, then runs, then goes', async () => {
    const parentIdle = [...started('p', 'T1', 'review my changes', 'claude')];
    // The child is recorded (its asked origin), but no run holds it: the turn
    // list is what says it waits, then runs.
    const childRow = [
      ev({ session: 'c', kind: 'turn.started', turn: 'C1', text: 'review', agent: 'codex', agent_id: 'codex', folder: '/w', origin: { kind: 'asked', session: 'p', turn: 'T1' } }),
    ];
    let rows: ApiTurn[] = [{ id: 'C1', session: 'c', agent: 'codex', agent_id: 'codex', folder: '/w', state: 'queued', asked: '2026-11-24T14:50:50Z' }];
    const queue: QueueSource = { address: 'http://cockpit.test', pollMs: 10, listTurns: async () => rows, stop: async () => {} };
    const lr = liveReplay([...parentIdle, ...childRow], { listAgents: async () => SAVED });
    const r = await render(<App dataSource={lr.source} queue={queue} />);
    const line = () => r.container.querySelector('.m-asked')?.textContent ?? null;
    const dotted = () =>
      Array.from(r.container.querySelectorAll('#sessions [data-session]')).some((x) => rowSession(x) === 'p' && x.querySelector('.s-icons .live'));
    await waitFor(() => shownSession(r.container) === 'p' && line() === 'Codex queued · waiting for a runner', 'the queued line');
    expect(dotted()).toBe(true);
    // A runner starts it.
    rows = [{ ...rows[0], state: 'running', started: new Date(Date.now() - 3000).toISOString() }];
    await waitFor(() => /^Codex is working on it · \d+s$/.test(line() ?? ''), 'the running line');
    expect(dotted()).toBe(true);
    // It ends: the line and the dot go.
    rows = [{ ...rows[0], state: 'finished', ended: new Date().toISOString() }];
    await waitFor(() => line() === null, 'the line gone');
    expect(dotted()).toBe(false);
    r.unmount();
  });
});

async function waitFor(check: () => boolean, what: string) {
  for (let i = 0; i < 200; i++) {
    if (check()) return;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  }
  throw new Error('timed out waiting for ' + what);
}
