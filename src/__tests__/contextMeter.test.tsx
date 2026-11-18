// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ContextMeter, compactionNote } from '../components/ContextMeter';
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

describe('compactionNote', () => {
  it('says a vendor point is the vendor’s own', () => {
    const w: ContextWindow = { ...base, harness: 'opencode', compaction_source: 'vendor', compaction_pct: 85 };
    expect(compactionNote(w)).toMatch(/opencode.*own compaction point/i);
  });
  it('marks a stated default as the vendor publishing none', () => {
    expect(compactionNote(base)).toMatch(/stated default.*publishes no compaction point/i);
  });
  it('says plainly when a harness publishes no point', () => {
    const w: ContextWindow = { ...base, compaction_pct: undefined, compaction_point: undefined };
    expect(compactionNote(w)).toMatch(/no compaction point/i);
  });
});

describe('ContextMeter', () => {
  it('shows percent full, the window and the compaction point', async () => {
    const r = await render(<ContextMeter window={base} />);
    await flush();
    const text = r.container.textContent ?? '';
    expect(text).toContain('50%');
    expect(text).toMatch(/200\.0k token window/); // formatCount of the window
    expect(text).toMatch(/compacts at ~80%/);
    // The fill is below the compaction mark: the ok state.
    expect(r.container.querySelector('.ctxm-track.ok')).not.toBeNull();
    expect(r.container.querySelector('.ctxm-mark')).not.toBeNull();
    r.unmount();
  });

  it('turns amber once the context reaches the compaction point', async () => {
    const w: ContextWindow = { ...base, used_tokens: 170000, percent_full: 85 };
    const r = await render(<ContextMeter window={w} />);
    await flush();
    expect(r.container.querySelector('.ctxm-track.near')).not.toBeNull();
    expect(r.container.querySelector('.ctxm-pct.near')).not.toBeNull();
    r.unmount();
  });

  it('reads over once the window is full', async () => {
    const w: ContextWindow = { ...base, used_tokens: 205000, percent_full: 103 };
    const r = await render(<ContextMeter window={w} />);
    await flush();
    expect(r.container.querySelector('.ctxm-track.over')).not.toBeNull();
    // The fill never overflows the track.
    const fill = r.container.querySelector('.ctxm-fill') as HTMLElement | null;
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
});

unmountAll();
