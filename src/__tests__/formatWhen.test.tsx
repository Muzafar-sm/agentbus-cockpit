// @vitest-environment jsdom
// A turn's footer says when it ended, in the person's local time: the time of
// day alone for today, with the date for an earlier day, and the year for an
// earlier year.
import { afterEach, describe, expect, it } from 'vitest';
import { ConvoColumn } from '../components/ConvoColumn';
import { createEmptyUsage } from '../data/turns';
import { SessionDetail, Turn } from '../types';
import { formatWhen } from '../utils/format';
import { render, unmountAll } from './helpers';

afterEach(() => unmountAll());

// Local times, so the expectations hold in any time zone.
const NOW = new Date(2026, 10, 26, 18, 0).getTime();
const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

describe('formatWhen', () => {
  it('shows the time of day alone for today', () => {
    const d = new Date(2026, 10, 26, 14, 5);
    expect(formatWhen(d.toISOString(), NOW)).toBe(time(d));
  });

  it('puts the date before the time for an earlier day this year', () => {
    const d = new Date(2026, 10, 24, 9, 30);
    const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    expect(formatWhen(d.toISOString(), NOW)).toBe(`${date}, ${time(d)}`);
    expect(formatWhen(d.toISOString(), NOW)).not.toContain('2026');
  });

  it('adds the year for an earlier year', () => {
    const d = new Date(2025, 11, 31, 23, 59);
    expect(formatWhen(d.toISOString(), NOW)).toContain('2025');
  });

  it('is empty when the time is missing or not a time', () => {
    expect(formatWhen(undefined, NOW)).toBe('');
    expect(formatWhen('not a time', NOW)).toBe('');
  });
});

describe('the turn footer', () => {
  function session(turn: Partial<Turn>): SessionDetail {
    const t: Turn = {
      id: 'T1',
      turnNumber: 1,
      sessionId: 'p',
      startedAt: '2026-11-09T01:00:00Z',
      prompt: 'hi',
      agent: 'claude',
      agentId: 'claude',
      state: 'finished',
      reply: 'done',
      usage: null,
      costUsd: null,
      costComplete: true,
      ...turn,
    };
    return { id: 'p', title: 'p', agent: 'claude', turns: 1, turnsList: [t], usage: createEmptyUsage() } as unknown as SessionDetail;
  }

  it('starts with when the turn ended, before its duration', async () => {
    const ended = '2026-11-09T01:00:34Z';
    const r = await render(<ConvoColumn session={session({ endedAt: ended, durationMs: 33800 })} selectedTurn={null} onSelectTurn={() => {}} />);
    const stat = r.container.querySelector('.tb-stat')!;
    const t = stat.querySelector('time')!;
    expect(t.getAttribute('datetime')).toBe(ended);
    expect(t.textContent).toBe(formatWhen(ended));
    expect(stat.textContent!.startsWith(`${formatWhen(ended)} · 33.8s · `)).toBe(true);
  });

  it('shows no time for a turn that has not ended', async () => {
    const r = await render(<ConvoColumn session={session({ state: 'running', reply: undefined })} selectedTurn={null} onSelectTurn={() => {}} />);
    expect(r.container.querySelector('.tb-stat time')).toBeNull();
  });
});
