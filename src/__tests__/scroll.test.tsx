// @vitest-environment jsdom
// The conversation view follows a running turn's end, stops following when the
// person scrolls up, and brings the reply to the top when the turn ends. The
// scroll is driven by the newest turn's running state alone: these tests pin
// that, and guard that reply text, a stream reset, and growth after the turn
// ended never move the view. jsdom has no layout, so the metrics the component
// reads off the scroll container are stubbed; the arithmetic is covered in
// autoscroll.test.
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConvoColumn } from '../components/ConvoColumn';
import { createEmptyUsage } from '../data/turns';
import { LiveTurn } from '../data/liveStatus';
import { SessionDetail, Turn } from '../types';
import { render, unmountAll } from './helpers';

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

const LIVE: LiveTurn = { turn: 'T1', events: [] };

// A fake ResizeObserver that records each observer and its target, so a test
// can fire the one watching the chat's content (.c-in).
interface Obs {
  cb: () => void;
  el?: Element;
}
function fakeResizeObserver(): { fireContent: () => void } {
  const observers: Obs[] = [];
  class FakeRO {
    private i: number;
    constructor(cb: () => void) {
      this.i = observers.push({ cb }) - 1;
    }
    observe(el: Element) {
      observers[this.i].el = el;
    }
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', FakeRO);
  const fireContent = () => {
    const o = observers.find((x) => x.el?.classList.contains('c-in'));
    if (!o) throw new Error('no observer on .c-in');
    act(() => o.cb());
  };
  return { fireContent };
}

// Give an element a fixed scroll geometry with a writable scrollTop.
function stubScroll(el: HTMLElement, scrollHeight: number, clientHeight: number, scrollTop = 0): { get: () => number } {
  let top = scrollTop;
  Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => top, set: (v) => void (top = v) });
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => scrollHeight });
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => clientHeight });
  return { get: () => top };
}

function pretendScroll(el: HTMLElement, top: number): void {
  act(() => {
    (el as unknown as { scrollTop: number }).scrollTop = top;
    el.dispatchEvent(new Event('scroll'));
  });
}

// Render ConvoColumn with the common props, returning the scroll container too.
async function mount(s: SessionDetail, live: LiveTurn | undefined = LIVE) {
  const r = await render(<ConvoColumn session={s} selectedTurn={null} onSelectTurn={() => {}} live={live} />);
  const msgs = r.container.querySelector('#c-msgs') as HTMLElement;
  return { ...r, msgs };
}
async function rerender(r: { root: { render: (n: React.ReactNode) => void } }, s: SessionDetail, live: LiveTurn | undefined = LIVE) {
  await act(async () => {
    r.root.render(<ConvoColumn session={s} selectedTurn={null} onSelectTurn={() => {}} live={live} />);
  });
}

afterEach(() => {
  unmountAll();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the conversation follows a running turn', () => {
  it('pins the view to the end as the content grows', async () => {
    const { fireContent } = fakeResizeObserver();
    const { msgs } = await mount(session([turn('T1', 1, { state: 'running', reply: undefined })]));
    // 1000 of content, a 400 view: the end is at 600.
    const pos = stubScroll(msgs, 1000, 400, 600);
    fireContent();
    expect(pos.get()).toBe(600);
  });

  it('stops following once the person scrolls up, and follows again at the end', async () => {
    const { fireContent } = fakeResizeObserver();
    const { msgs } = await mount(session([turn('T1', 1, { state: 'running', reply: undefined })]));
    const pos = stubScroll(msgs, 1000, 400, 600);

    // The person scrolls well up: the next growth does not yank the view down.
    pretendScroll(msgs, 100);
    fireContent();
    expect(pos.get()).toBe(100);

    // Scrolled back to the end: the follow resumes.
    pretendScroll(msgs, 595);
    fireContent();
    expect(pos.get()).toBe(600);
  });

  it('does not reposition or yank when an intermediate call returns text mid-turn', async () => {
    const { fireContent } = fakeResizeObserver();
    const r = await mount(session([turn('T1', 1, { state: 'running', reply: undefined })]));
    const pos = stubScroll(r.msgs, 1000, 400, 600);

    // A model call returns preamble text while the turn runs on: the turn is
    // still running, so nothing about the scroll changes.
    await rerender(r, session([turn('T1', 1, { state: 'running', reply: 'working on it' })]));
    expect(pos.get()).toBe(600);
    fireContent();
    expect(pos.get()).toBe(600);
  });
});

describe('the conversation repositions when the turn ends', () => {
  it('brings the reply to the top, its start first, and no later growth pins it to the bottom', async () => {
    const { fireContent } = fakeResizeObserver();
    const r = await mount(session([turn('T1', 1, { state: 'running', reply: undefined })]));
    const pos = stubScroll(r.msgs, 1000, 400, 600);
    // The reply sits 200 above the view's top (the view is scrolled into it).
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const top = this.classList.contains('m-agent') ? -200 : 0;
      return { top, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON() {} } as DOMRect;
    });

    await rerender(r, session([turn('T1', 1, { state: 'finished', reply: 'the answer' })]));
    expect(r.container.querySelector('#convo .m-agent')).not.toBeNull();
    // replyTop = 600 + (-200 - 0) = 400; its start goes to the top, less 8 of padding.
    expect(pos.get()).toBe(392);

    // The turn has ended, so a later growth does not pull the reply down.
    fireContent();
    expect(pos.get()).toBe(392);
  });

  it('leaves the person where they are when they had scrolled up to read', async () => {
    fakeResizeObserver();
    const r = await mount(session([turn('T1', 1, { state: 'running', reply: undefined })]));
    const pos = stubScroll(r.msgs, 1000, 400, 600);

    // They scroll up during the turn; when it ends, the view is not yanked.
    pretendScroll(r.msgs, 120);
    await rerender(r, session([turn('T1', 1, { state: 'finished', reply: 'the answer' })]));
    expect(pos.get()).toBe(120);
  });
});

describe('signals other than running state never move the view', () => {
  it('a stream reset mid-run is not read as a turn end', async () => {
    const { fireContent } = fakeResizeObserver();
    const r = await mount(session([turn('T1', 1, { state: 'running', reply: undefined })]));
    const pos = stubScroll(r.msgs, 1000, 400, 600);

    // The stream resets (live clears) while the turn runs on. The turn did not
    // end, so the view does not reposition, and it keeps following.
    await rerender(r, session([turn('T1', 1, { state: 'running', reply: undefined })]), undefined);
    expect(pos.get()).toBe(600);
    fireContent();
    expect(pos.get()).toBe(600);
  });

  it('a reply that grows after its turn ended is not pinned to the bottom', async () => {
    const { fireContent } = fakeResizeObserver();
    // A session whose newest turn has already ended (its detail not yet loaded).
    const { msgs } = await mount(session([turn('T1', 1, { state: 'finished', reply: 'a short preview' })]));
    const pos = stubScroll(msgs, 1000, 400, 300);

    // Opening the turn expands the preview to the full long reply: the content
    // grows, but the turn is not running, so the view stays put.
    fireContent();
    expect(pos.get()).toBe(300);
  });
});
