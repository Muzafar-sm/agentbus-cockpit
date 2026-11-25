// @vitest-environment jsdom
// Selecting text in a turn, to copy it, does not open the turn's panel. A
// plain click on the turn still does.
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConvoColumn, PICK_WAIT_MS } from '../components/ConvoColumn';
import { createEmptyUsage } from '../data/turns';
import { SessionDetail, Turn } from '../types';
import { render } from './helpers';

const TURN: Turn = {
  id: 'T1',
  turnNumber: 1,
  sessionId: 'p',
  startedAt: '2026-11-25T01:00:00Z',
  prompt: 'what is in the folder',
  agentResponse: 'Two files: a.txt and b.txt.',
  agent: 'claude',
  agentId: 'claude',
  state: 'finished',
  usage: null,
  costUsd: null,
  costComplete: true,
} as Turn;

const SESSION = {
  id: 'p',
  title: 'p',
  agent: 'claude',
  turns: 1,
  turnsList: [TURN],
  usage: createEmptyUsage(),
} as unknown as SessionDetail;

function click(el: Element, detail = 1) {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail }));
}

// What a browser sends for one press of a pointer click number `detail`.
function press(el: Element, detail: number) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, detail }));
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, detail }));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail }));
}

// Lets a waiting click open its turn, or not.
async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(PICK_WAIT_MS + 50);
  });
}

describe('selecting text in a turn', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    window.getSelection()?.removeAllRanges();
    vi.useRealTimers();
  });

  it('a click that ends a selection in the turn does not open it; a plain click does', async () => {
    const picked: string[] = [];
    const r = await render(<ConvoColumn session={SESSION} selectedTurn={null} onSelectTurn={(t) => picked.push(t.id)} />);
    const block = r.container.querySelector('.tb')!;
    const reply = block.querySelector('.m-agent, .bubble')!;
    // The person drags across the text: the click that ends it finds a selection.
    const range = document.createRange();
    range.selectNodeContents(reply);
    window.getSelection()!.addRange(range);
    expect(window.getSelection()!.toString()).not.toBe('');
    await act(async () => click(block));
    await settle();
    expect(picked).toEqual([]);
    // A double or triple click selects a word or a line: not a pick either,
    // its first click included, though nothing is selected when it lands.
    window.getSelection()!.removeAllRanges();
    await act(async () => {
      press(block, 1);
      press(block, 2);
    });
    await settle();
    expect(picked).toEqual([]);
    await act(async () => {
      press(block, 1);
      press(block, 2);
      press(block, 3);
    });
    await settle();
    expect(picked).toEqual([]);
    // A plain click, nothing selected: the turn opens once no second click came.
    await act(async () => press(block, 1));
    expect(picked).toEqual([]);
    await settle();
    expect(picked).toEqual(['T1']);
    // A click with no count (a key, a script) opens it at once.
    await act(async () => click(block, 0));
    expect(picked).toEqual(['T1', 'T1']);
    r.unmount();
  });

  it('a selection made while the click waits does not open the turn', async () => {
    const picked: string[] = [];
    const r = await render(<ConvoColumn session={SESSION} selectedTurn={null} onSelectTurn={(t) => picked.push(t.id)} />);
    const block = r.container.querySelector('.tb')!;
    await act(async () => press(block, 1));
    const range = document.createRange();
    range.selectNodeContents(block.querySelector('.m-agent, .bubble')!);
    window.getSelection()!.addRange(range);
    await settle();
    expect(picked).toEqual([]);
    r.unmount();
  });

  it('a selection somewhere else on the page does not stop a click on the turn', async () => {
    const picked: string[] = [];
    const outside = document.createElement('p');
    outside.textContent = 'text outside the conversation';
    document.body.appendChild(outside);
    const r = await render(<ConvoColumn session={SESSION} selectedTurn={null} onSelectTurn={(t) => picked.push(t.id)} />);
    const range = document.createRange();
    range.selectNodeContents(outside);
    window.getSelection()!.addRange(range);
    await act(async () => click(r.container.querySelector('.tb')!));
    await settle();
    expect(picked).toEqual(['T1']);
    r.unmount();
    outside.remove();
  });
});
