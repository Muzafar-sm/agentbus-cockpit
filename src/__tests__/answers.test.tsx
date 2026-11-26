// @vitest-environment jsdom
// A turn can answer more than once: Claude Code resumes after its own
// background command ends, so one turn has several turn.completed. The turn
// shows every answer in order, not only the last.
import { afterEach, describe, expect, it } from 'vitest';
import { ConvoColumn } from '../components/ConvoColumn';
import { buildTurns, createEmptyUsage, turnDetail } from '../data/turns';
import { CockpitEvent, SessionDetail } from '../types';
import { render, unmountAll } from './helpers';

afterEach(() => unmountAll());

let seq = 0;
const ev = (kind: string, time: string, f: Partial<CockpitEvent> = {}): CockpitEvent =>
  ({ id: `e${++seq}`, seq, kind, time, session: 's', turn: 'T1', ...f }) as CockpitEvent;

// One turn: a first answer (a table for the person), a background command
// ends, the agent resumes and answers again.
const events = (): CockpitEvent[] => [
  ev('turn.started', '2026-11-26T14:50:00Z', { text: 'pick one' }),
  ev('model.requested', '2026-11-26T14:56:40Z', { exchange: 'x1' }),
  ev('model.responded', '2026-11-26T14:56:48Z', { exchange: 'x1', text: '| a | b |\n|---|---|\n| 1 | 2 |' }),
  ev('turn.completed', '2026-11-26T14:56:49Z', { exchange: 'x1' }),
  ev('model.requested', '2026-11-26T15:00:50Z', { exchange: 'x2' }),
  ev('model.responded', '2026-11-26T15:00:55Z', { exchange: 'x2', text: 'The build finished.' }),
  ev('turn.completed', '2026-11-26T15:00:56Z', { exchange: 'x2' }),
];

describe('a turn that answered twice', () => {
  it('keeps both answers, in order, each with its time', () => {
    expect(turnDetail(events()).answers).toEqual([
      { text: '| a | b |\n|---|---|\n| 1 | 2 |', time: '2026-11-26T14:56:49Z' },
      { text: 'The build finished.', time: '2026-11-26T15:00:56Z' },
    ]);
  });

  it('a turn that answered once has one answer', () => {
    expect(turnDetail(events().slice(0, 4)).answers).toHaveLength(1);
  });

  it('shows the first answer above the last in the conversation', async () => {
    const evs = events();
    const [t] = buildTurns('s', evs);
    const detail = turnDetail(evs);
    const s = { id: 's', title: 's', agent: 'claude', turns: 1, turnsList: [{ ...t, detail }], usage: createEmptyUsage() } as unknown as SessionDetail;
    const r = await render(<ConvoColumn session={s} selectedTurn={null} onSelectTurn={() => {}} />);
    const replies = [...r.container.querySelectorAll('.tb .m-agent')];
    expect(replies).toHaveLength(2);
    expect(replies[0].querySelector('table')).not.toBeNull();
    expect(replies[1].textContent).toContain('The build finished.');
    expect(r.container.querySelector('.m-agent.earlier + .tb-foot time')?.getAttribute('datetime')).toBe('2026-11-26T14:56:49Z');
  });
});
