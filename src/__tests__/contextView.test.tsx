// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ContextView, partLabel } from '../components/ContextView';
import { SessionContext, TurnContext } from '../types';
import { render, flush, unmountAll } from './helpers';

const turnCtx: TurnContext = {
  store: 'st',
  seq: 10,
  turn: 'T2',
  session: 's1',
  model: 'claude',
  calls: 2,
  context_tokens: 250,
  cache_read_tokens: 200,
  fresh_tokens: 50,
  output_tokens: 15,
  made_of: {
    exchange: 'x2',
    vendor: 'anthropic',
    bytes: 1000,
    approx_tokens: 376,
    parts: [
      { kind: 'message', label: 'user', approx_tokens: 200, bytes: 532, count: 1 },
      { kind: 'tool', approx_tokens: 100, bytes: 266, count: 2 },
      { kind: 'system', approx_tokens: 76, bytes: 202, count: 1 },
    ],
    note: 'A user message holds your text and the tool results.',
  },
};

const sessionCtx: SessionContext = {
  store: 'st',
  seq: 10,
  session: 's1',
  turns: 2,
  peak_context_tokens: 250,
  cache_read_tokens: 300,
  fresh_tokens: 200,
  output_tokens: 23,
  growth: [
    { turn: 'T2', started: '2026-11-18T09:01:00Z', calls: 2, context_tokens: 250, cache_read_tokens: 200, fresh_tokens: 50, output_tokens: 15 },
    { turn: 'T1', started: '2026-11-18T09:00:00Z', calls: 2, context_tokens: 150, cache_read_tokens: 100, fresh_tokens: 150, output_tokens: 8 },
  ],
  next_before: null,
};

describe('partLabel', () => {
  it('names each piece kind in plain words', () => {
    expect(partLabel({ kind: 'system', approx_tokens: 1, bytes: 1, count: 1 })).toBe('System prompt');
    expect(partLabel({ kind: 'instructions', approx_tokens: 1, bytes: 1, count: 1 })).toBe('System prompt');
    expect(partLabel({ kind: 'tool', approx_tokens: 1, bytes: 1, count: 3 })).toBe('Tool definitions (3)');
    expect(partLabel({ kind: 'message', label: 'user', approx_tokens: 1, bytes: 1, count: 1 })).toBe('Your messages & tool results');
    expect(partLabel({ kind: 'message', label: 'assistant', approx_tokens: 1, bytes: 1, count: 1 })).toBe('Model replies');
    expect(partLabel({ kind: 'input_item', label: 'reasoning', approx_tokens: 1, bytes: 1, count: 1 })).toBe('Conversation · reasoning');
  });
});

describe('ContextView', () => {
  it('shows the turn size, the cache split, the parts and the session growth', async () => {
    const r = await render(
      <ContextView session="s1" turn="T2" loadTurn={async () => turnCtx} loadSession={async () => sessionCtx} />
    );
    await flush();
    const text = r.container.textContent ?? '';
    // The headline context size.
    expect(text).toContain('250');
    // The cache split is shown.
    expect(text).toMatch(/From cache/);
    expect(text).toMatch(/Fresh/);
    // The made_of parts, largest first, in plain names.
    expect(text).toContain('Your messages & tool results');
    expect(text).toContain('Tool definitions (2)');
    expect(text).toContain('System prompt');
    expect(text).toContain(turnCtx.made_of!.note);
    // The growth strip: one column per turn, the current one marked.
    const cols = r.container.querySelectorAll('.ctxv-col');
    expect(cols.length).toBe(2);
    expect(r.container.querySelectorAll('.ctxv-col.here').length).toBe(1);
    r.unmount();
  });

  it('says plainly when the turn made no model call', async () => {
    const empty: TurnContext = { ...turnCtx, calls: 0, context_tokens: 0, made_of: null };
    const r = await render(
      <ContextView session="s1" turn="T2" loadTurn={async () => empty} loadSession={async () => sessionCtx} />
    );
    await flush();
    expect(r.container.textContent).toMatch(/no model call/i);
    r.unmount();
  });

  it('follows the session pages so the growth chart is whole', async () => {
    const page1: SessionContext = { ...sessionCtx, growth: [sessionCtx.growth[0]], next_before: 5 };
    const page2: SessionContext = { ...sessionCtx, growth: [sessionCtx.growth[1]], next_before: null };
    const calls: (number | undefined)[] = [];
    const loadSession = async (_s: string, before?: number) => {
      calls.push(before);
      return before === 5 ? page2 : page1;
    };
    const r = await render(<ContextView session="s1" turn="T2" loadTurn={async () => turnCtx} loadSession={loadSession} />);
    await flush();
    // Both pages were fetched (undefined, then the cursor), and both turns drawn.
    expect(calls).toEqual([undefined, 5]);
    expect(r.container.querySelectorAll('.ctxv-col').length).toBe(2);
    r.unmount();
  });

  // It reads once on open and does not read again on its own while running.
  it('reads once on open', async () => {
    let n = 0;
    const loadTurn = async () => {
      n += 1;
      return turnCtx;
    };
    const r = await render(
      <ContextView session="s1" turn="T2" loadTurn={loadTurn} loadSession={async () => sessionCtx} running />
    );
    await flush();
    expect(n).toBe(1);
    // No Refresh control and no re-read while it simply stays open.
    expect(r.container.querySelector('.ctxv-refresh')).toBeNull();
    r.unmount();
  });

  // The turn ending re-reads once on its own, so a settled turn is current.
  it('re-reads once when the turn ends', async () => {
    let n = 0;
    const loadTurn = async () => {
      n += 1;
      return turnCtx;
    };
    const loadSession = async () => sessionCtx;
    const el = (running: boolean) => (
      <ContextView session="s1" turn="T2" loadTurn={loadTurn} loadSession={loadSession} running={running} />
    );
    const r = await render(el(true));
    await flush();
    expect(n).toBe(1);
    const { act } = await import('react');
    await act(async () => {
      r.root.render(el(false));
    });
    await flush();
    expect(n).toBe(2);
    r.unmount();
  });

  // A slow earlier read must not overwrite a newer one (the StrictMode race):
  // each read guards its writes with its own `live` flag.
  it('a superseded read does not overwrite a newer result', async () => {
    const { act } = await import('react');
    const resolvers: Array<(t: TurnContext) => void> = [];
    const loadTurn = () => new Promise<TurnContext>((res) => resolvers.push(res));
    const loadSession = async () => sessionCtx;
    const el = (nonceKey: number) => (
      <ContextView key="x" session="s1" turn="T2" loadTurn={loadTurn} loadSession={loadSession} running={nonceKey > 0} />
    );
    const r = await render(el(1)); // read #1 in flight
    // End the turn -> a second read starts; read #1 is now superseded.
    await act(async () => {
      r.root.render(el(0));
    });
    // Resolve the NEWER read first (333), then the OLDER one (111).
    await act(async () => {
      resolvers[1]?.({ ...turnCtx, context_tokens: 333 });
      await Promise.resolve();
    });
    await act(async () => {
      resolvers[0]?.({ ...turnCtx, context_tokens: 111 });
      await Promise.resolve();
    });
    await flush();
    // The newer result stands; the stale 111 was discarded.
    expect(r.container.textContent).toContain('333');
    expect(r.container.textContent).not.toContain('111');
    r.unmount();
  });

  // The 429 cost case is moot: the view shows no cost at all (it owns tokens).
  it('shows no cost (cost lives on the turn, not here)', async () => {
    const r = await render(
      <ContextView session="s1" turn="T2" loadTurn={async () => turnCtx} loadSession={async () => sessionCtx} />
    );
    await flush();
    expect(r.container.textContent).not.toMatch(/\$|cost/i);
    r.unmount();
  });

  // React StrictMode mounts twice (setup, cleanup, setup). The view must
  // re-arm its mounted flag in setup, or it strands on Loading forever.
  it('renders under StrictMode, not stuck on Loading', async () => {
    const { StrictMode } = await import('react');
    const r = await render(
      <StrictMode>
        <ContextView session="s1" turn="T2" loadTurn={async () => turnCtx} loadSession={async () => sessionCtx} />
      </StrictMode>
    );
    await flush();
    expect(r.container.textContent).toContain('250');
    expect(r.container.textContent).not.toMatch(/^Loading/);
    r.unmount();
  });

  it('shows the API error wording', async () => {
    const r = await render(
      <ContextView
        session="s1"
        turn="T2"
        loadTurn={async () => {
          throw new Error('the roof fell in');
        }}
        loadSession={async () => sessionCtx}
      />
    );
    await flush();
    expect(r.container.textContent).toContain('the roof fell in');
    r.unmount();
  });
});

unmountAll();
