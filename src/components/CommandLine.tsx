import React, { useEffect, useState } from 'react';
import { ApiCommand } from '../data/jobs';
import { commandEnd, commandEnded, shortLine } from '../data/commands';
import { formatElapsed } from '../data/liveStatus';
import { Button } from './Controls';
import { Notice } from './Notice';

// The words under a command that ran past the end the API keeps.
export const OUTPUT_KEPT = (bytes: number) => `The last 16 KiB of ${bytes.toLocaleString()} bytes.`;
// A Stop that came after the command ended.
export const COMMAND_ENDED = 'It had already ended.';
// The running time counts from when it was asked: the API gives no start time.
const SINCE_ASKED = 'Since it was asked. The API gives no start time, so a wait in the queue counts too.';

// A command an agent handed to AgentBus (run_command), in the chat of the
// session that asked: the line, shortened (whole on hover), then while it runs
// how long, and Stop; once it ended, how it ended, and the end of its output,
// folded.
export const CommandLine: React.FC<{ c: ApiCommand; onStop?: (id: string) => Promise<'stopping' | 'not-running'> }> = ({ c, onStop }) => {
  const ended = commandEnded(c);
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (c.state !== 'running') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [c.state]);
  useEffect(() => {
    if (ended) setStopping(false);
  }, [ended]);
  const stop = async () => {
    if (!onStop) return;
    setStopping(true);
    setErr(null);
    try {
      if ((await onStop(c.id)) === 'not-running') setErr(COMMAND_ENDED);
    } catch (e) {
      setStopping(false);
      setErr((e as Error).message);
    }
  };
  const out = (c.output ?? '').replace(/\n$/, '');
  const lines = out === '' ? 0 : out.split('\n').length;
  const ok = c.state === 'finished';
  const asked = Date.parse(c.created);
  return (
    <div className={`shell cmd${c.state === 'failed' ? ' failed' : ''}`} data-command={c.id} data-state={c.state}>
      <div className="sh-h">
        <code className="sh-line" title={c.line}>
          {c.state === 'running' && <i className="spin run-spin" aria-hidden />}$ {shortLine(c.line)}
        </code>
        {c.state === 'queued' && <span className="sh-exit run">queued</span>}
        {c.state === 'running' && (
          <span className="sh-exit run cmd-time" title={SINCE_ASKED}>
            running · {isNaN(asked) ? '' : formatElapsed(now - asked)}
          </span>
        )}
        {ended && (
          <span className={`sh-exit ${ok ? 'ok' : 'bad'}`}>
            {ok ? '✓' : c.state === 'stopped' ? '■' : '✕'} {commandEnd(c)}
          </span>
        )}
        {ended && c.duration_ms !== undefined && (
          <span className="sh-meta dim" title={c.ended ? new Date(c.ended).toLocaleString() : undefined}>
            ran {formatElapsed(c.duration_ms)}
          </span>
        )}
        {!ended && onStop && (
          <Button kind="link" className="cmd-stop sh-meta" disabled={stopping} onClick={stop}>
            {stopping ? 'Stopping…' : 'Stop'}
          </Button>
        )}
      </div>
      {ended && lines > 0 && (
        <button type="button" className="sh-fold" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Hide output' : `Show the end of its output (${lines} ${lines === 1 ? 'line' : 'lines'})`}
        </button>
      )}
      {open && <pre className="sh-out">{out}</pre>}
      {open && c.output_bytes !== undefined && c.output_bytes > (c.output?.length ?? 0) && <div className="sh-note dim">{OUTPUT_KEPT(c.output_bytes)}</div>}
      {c.error && (
        <div className="tb-foot">
          <Notice kind="error" inline>
            {c.error}
          </Notice>
        </div>
      )}
      {err && (
        <Notice kind="error" inline>
          {err}
        </Notice>
      )}
    </div>
  );
};

// How long a running command has run, ticking each second.
const RunTime: React.FC<{ since: string }> = ({ since }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const at = Date.parse(since);
  return <>{isNaN(at) ? '' : formatElapsed(now - at)}</>;
};

// A machine's queued and running commands on the Runners page, beside its
// workspaces: the line (whole on hover), the task it runs for, how long, and
// Stop.
export const CommandsTable: React.FC<{
  commands: ApiCommand[];
  taskOf?: (workspace: string) => string | undefined;
  onStop?: (id: string) => Promise<'stopping' | 'not-running'>;
}> = ({ commands, taskOf, onStop }) => {
  const [stopping, setStopping] = useState<ReadonlySet<string>>(new Set());
  const [err, setErr] = useState<{ id: string; text: string } | null>(null);
  if (commands.length === 0) return null;
  const stop = async (id: string) => {
    if (!onStop) return;
    setStopping((s) => new Set(s).add(id));
    setErr(null);
    try {
      if ((await onStop(id)) === 'not-running') setErr({ id, text: COMMAND_ENDED });
    } catch (e) {
      setStopping((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      setErr({ id, text: (e as Error).message });
    }
  };
  const cols = onStop ? 4 : 3;
  return (
    <>
      <div className="sub-h">Commands</div>
      <table className="grid rn-commands" aria-label="Commands">
        <thead>
          <tr>
            <th>Command</th>
            <th>Task</th>
            <th>State</th>
            {onStop && <th aria-label="Stop" />}
          </tr>
        </thead>
        <tbody>
          {commands.map((c) => (
            <React.Fragment key={c.id}>
              <tr data-command={c.id} data-state={c.state}>
                <td className="cmd-n">
                  <code className="cmd-line" title={c.line}>
                    $ {shortLine(c.line, 56)}
                  </code>
                </td>
                <td className={`cmd-task${taskOf?.(c.workspace) ? '' : ' dim'}`}>{taskOf?.(c.workspace) ?? c.session}</td>
                <td className="cmd-state" title={c.state === 'running' ? SINCE_ASKED : undefined}>
                  {c.state === 'running' ? (
                    <>
                      <i className="spin run-spin" aria-hidden /> running · <RunTime since={c.created} />
                    </>
                  ) : (
                    c.state
                  )}
                </td>
                {onStop && (
                  <td className="ws-act">
                    <Button kind="link" className="cmd-stop" disabled={stopping.has(c.id)} onClick={() => stop(c.id)}>
                      {stopping.has(c.id) ? 'Stopping…' : 'Stop'}
                    </Button>
                  </td>
                )}
              </tr>
              {err?.id === c.id && (
                <tr className="ws-err-row">
                  <td colSpan={cols} className="bad ws-err">
                    {err.text}
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </>
  );
};
