// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ContextMeter } from '../components/ContextMeter';
import { ContextWindow } from '../types';
import { render, flush, unmountAll } from './helpers';

const base: ContextWindow = {
  model: 'claude-opus-5-5',
  harness: 'claude',
  window_tokens: 200000,
  window_known: true,
  used_tokens: 100000,
  percent_full: 50,
  compaction_point: 0.8,
  compaction_pct: 80,
  compaction_source: 'default',
  compaction_is_default: true,
};

describe('ContextMeter', () => {
  it('shows percent full, the window and the compaction point', async () => {
    const r = await render(<ContextMeter window={base} />);
    await flush();
    const text = r.container.textContent ?? '';
    expect(text).toContain('50%');
    expect(text).toMatch(/200\.0k token window/); // formatCount of the window
    expect(text).toMatch(/compacts ~80%/);
    // A stated default is marked as a default, not shown as the vendor's own.
    expect(text).toMatch(/\(default\)/);
    // The meter is below the window: no over state, and the mark is drawn.
    const meter = r.container.querySelector('.ctx-meter');
    expect(meter).not.toBeNull();
    expect(meter!.classList.contains('over')).toBe(false);
    expect(r.container.querySelector('.ctx-meter .mk')).not.toBeNull();
    r.unmount();
  });

  it('reads over once the window is full', async () => {
    const w: ContextWindow = { ...base, used_tokens: 205000, percent_full: 103 };
    const r = await render(<ContextMeter window={w} />);
    await flush();
    expect(r.container.querySelector('.ctx-meter.over')).not.toBeNull();
    // The fill never overflows the track.
    const fill = r.container.querySelector('.ctx-meter > i') as HTMLElement | null;
    expect(fill?.style.width).toBe('100%');
    r.unmount();
  });

  it('says a window is assumed when it is not pinned', async () => {
    const w: ContextWindow = { ...base, window_known: false };
    const r = await render(<ContextMeter window={w} />);
    await flush();
    expect(r.container.textContent).toMatch(/assumed/i);
    r.unmount();
  });

  it('shows no compaction clause when the harness publishes no point', async () => {
    const w: ContextWindow = { ...base, compaction_pct: undefined, compaction_point: undefined };
    const r = await render(<ContextMeter window={w} />);
    await flush();
    expect(r.container.textContent).not.toMatch(/compacts/);
    expect(r.container.querySelector('.ctx-meter .mk')).toBeNull();
    r.unmount();
  });
});

unmountAll();
