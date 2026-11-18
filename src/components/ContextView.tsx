import React, { useEffect, useRef, useState } from 'react';
import { LOADING } from '../words';
import { formatCount } from '../utils/format';
import { ContextPart, SessionContext, TurnContext } from '../types';

// The practical context view, next to the Model calls debugging detail: how
// big this turn's context got, how much came from the prompt cache, and what
// its largest prompt was made of — then where the turn sits on the session's
// context growth. It reads GET /turns/{id}/context and GET /sessions/{id}/context;
// the numbers are the record's, computed on request, not stored.

interface Props {
  session: string;
  turn: string;
  loadTurn: (session: string, turn: string) => Promise<TurnContext>;
  loadSession: (session: string, before?: number) => Promise<SessionContext>;
  // True while the selected turn is still running: the view says it is a
  // snapshot that may be behind, and re-reads once when the turn ends.
  running?: boolean;
}

// Follows a session's context pages (the server pages them; newest first) to
// the end, gathering every turn's growth, so the chart holds the whole history.
// The totals are the same on every page. A guard stops a runaway cursor.
async function wholeSession(load: Props['loadSession'], session: string): Promise<SessionContext> {
  const first = await load(session);
  const growth = [...first.growth];
  let next = first.next_before;
  const seen = new Set<number>();
  while (next != null && !seen.has(next)) {
    seen.add(next);
    const page = await load(session, next);
    growth.push(...page.growth);
    next = page.next_before;
  }
  return { ...first, growth, next_before: null };
}

// A plain name for one part of a prompt, from its piece kind and label.
export function partLabel(p: ContextPart): string {
  if (p.kind === 'system' || p.kind === 'instructions') return 'System prompt';
  if (p.kind === 'tool') return p.count > 1 ? `Tool definitions (${p.count})` : 'Tool definition';
  if (p.kind === 'message' || p.kind === 'input_item') {
    if (p.label === 'user') return 'Your messages & tool results';
    if (p.label === 'assistant') return 'Model replies';
    if (p.label) return `Conversation · ${p.label}`;
    return 'Conversation';
  }
  return p.label ? `${p.kind} · ${p.label}` : p.kind;
}

// A colour class per part, so the same part keeps its colour in the bar and
// the legend. Keyed by kind and role, cycled for anything else.
function partClass(p: ContextPart, i: number): string {
  if (p.kind === 'system' || p.kind === 'instructions') return 'cp-system';
  if (p.kind === 'tool') return 'cp-tool';
  if (p.label === 'user') return 'cp-user';
  if (p.label === 'assistant') return 'cp-assistant';
  return `cp-other${(i % 3) + 1}`;
}

function pct(part: number, whole: number): string {
  if (whole <= 0) return '0%';
  return `${Math.round((part / whole) * 100)}%`;
}

// A two-part bar: how much of the context came from the cache against fresh.
const CacheBar: React.FC<{ cache: number; fresh: number }> = ({ cache, fresh }) => {
  const total = cache + fresh;
  return (
    <div className="ctxv-cache">
      <div className="ctxv-bar" role="img" aria-label={`${pct(cache, total)} from cache, ${pct(fresh, total)} fresh`}>
        <div className="ctxv-seg cp-cache" style={{ width: pct(cache, total) }} title={`Cache read: ${formatCount(cache)}`} />
        <div className="ctxv-seg cp-fresh" style={{ width: pct(fresh, total) }} title={`Fresh: ${formatCount(fresh)}`} />
      </div>
      <div className="ctxv-legend">
        <span><i className="cp-cache" /> From cache {formatCount(cache)} ({pct(cache, total)})</span>
        <span><i className="cp-fresh" /> Fresh {formatCount(fresh)} ({pct(fresh, total)})</span>
      </div>
    </div>
  );
};

// The made_of parts as a stacked bar and a legend, largest first.
const MadeOf: React.FC<{ ctx: TurnContext }> = ({ ctx }) => {
  const made = ctx.made_of;
  if (!made) {
    return <p className="dim">No request body is kept for this turn's largest call, so its parts cannot be shown.</p>;
  }
  const whole = made.approx_tokens;
  return (
    <div className="ctxv-made">
      <div className="ctxv-bar tall" role="img" aria-label="What the largest prompt is made of">
        {made.parts.map((p, i) => (
          <div
            key={`${p.kind}-${p.label ?? ''}`}
            className={`ctxv-seg ${partClass(p, i)}`}
            style={{ width: pct(p.approx_tokens, whole) }}
            title={`${partLabel(p)}: ~${formatCount(p.approx_tokens)} tokens`}
          />
        ))}
      </div>
      <table className="ctxv-parts">
        <tbody>
          {made.parts.map((p, i) => (
            <tr key={`${p.kind}-${p.label ?? ''}-row`}>
              <td className="ctxv-sw"><i className={partClass(p, i)} /></td>
              <td>{partLabel(p)}</td>
              <td className="r">~{formatCount(p.approx_tokens)}</td>
              <td className="r dim">{pct(p.approx_tokens, whole)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="ctxv-note dim">
        ~{formatCount(whole)} approx tokens in {formatCount(made.bytes)} bytes · {made.vendor}. {made.note}
      </p>
    </div>
  );
};

// The session's growth: one bar per turn, oldest first, each as tall as its
// context, the current turn marked. Reads the first page (newest turns).
const Growth: React.FC<{ sc: SessionContext; turn: string }> = ({ sc, turn }) => {
  const turns = [...sc.growth].reverse(); // oldest first, left to right
  const peak = sc.peak_context_tokens || 1;
  return (
    <div className="ctxv-growth">
      <div className="ctxv-cols" role="img" aria-label="Context size per turn, oldest to newest">
        {turns.map((t) => (
          <div
            key={t.turn}
            className={`ctxv-col ${t.turn === turn ? 'here' : ''}`}
            style={{ height: `${Math.max(3, Math.round((t.context_tokens / peak) * 100))}%` }}
            title={`${t.turn}: ${formatCount(t.context_tokens)} tokens${t.turn === turn ? ' (this turn)' : ''}`}
          />
        ))}
      </div>
      <div className="ctxv-growth-foot dim">
        <span>{sc.turns} turns</span>
        <span>peak {formatCount(sc.peak_context_tokens)}</span>
        <span>cache {pct(sc.cache_read_tokens, sc.cache_read_tokens + sc.fresh_tokens)}</span>
      </div>
    </div>
  );
};

export const ContextView: React.FC<Props> = ({ session, turn, loadTurn, loadSession, running }) => {
  const [tc, setTc] = useState<TurnContext | undefined>();
  const [sc, setSc] = useState<SessionContext | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  // The tab reads when it opens (and on a new turn/session), and once more when
  // the turn finishes — the person does not need per-second accuracy. Each read
  // guards its own state writes with a per-effect `live` flag (not a shared
  // ref), which React StrictMode's double mount handles correctly — so a stale
  // read can never overwrite a newer one.
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.all([loadTurn(session, turn), wholeSession(loadSession, session)])
      .then(([t, s]) => {
        if (!live) return;
        setTc(t);
        setSc(s);
        setError(undefined);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [session, turn, loadTurn, loadSession, nonce]);

  // The selected turn ending reads once more, so a settled turn is current
  // without the viewer pressing Refresh.
  const wasRunning = useRef(running);
  useEffect(() => {
    if (wasRunning.current && !running) setNonce((n) => n + 1);
    wasRunning.current = running;
  }, [running]);

  if (loading && !tc) return <p className="dim">{LOADING}</p>;
  if (error) return <p className="bad">{error}</p>;
  if (!tc) return <p className="dim">No context for this turn.</p>;

  const noCalls = tc.calls === 0;
  return (
    <div className="ctxv">
      {noCalls ? (
        <p className="dim">This turn made no model call that reported usage.</p>
      ) : (
        <>
          <div className="ctxv-top">
            <div className="ctxv-big">
              <span>Context</span>
              <b>{formatCount(tc.context_tokens)}</b>
              <small className="dim">tokens, this turn's largest prompt</small>
            </div>
            <div className="ctxv-facts">
              <div><span>Calls</span><b>{tc.calls}</b></div>
              <div><span>Output</span><b>{formatCount(tc.output_tokens)}</b></div>
            </div>
          </div>

          <h4 className="ctxv-h">Cache vs fresh <small className="dim">summed over {tc.calls} call{tc.calls === 1 ? '' : 's'}</small></h4>
          <CacheBar cache={tc.cache_read_tokens} fresh={tc.fresh_tokens} />

          <h4 className="ctxv-h">What the largest prompt is made of</h4>
          <MadeOf ctx={tc} />
        </>
      )}

      <h4 className="ctxv-h">Context across the {`session`}</h4>
      {sc ? <Growth sc={sc} turn={turn} /> : <p className="dim">{LOADING}</p>}
    </div>
  );
};
