// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { AppsPage, AppsApi, whereLabel } from '../components/AppsPage';
import { AppDef } from '../types';
import { click, flush, render, unmountAll } from './helpers';

function def(name: string, extra: Partial<AppDef> = {}): AppDef {
  return {
    name,
    description: `${name} description`,
    where: 'control',
    inputs: { type: 'object', properties: {} },
    run: { kind: 'api', method: 'GET', path: '/api/v0/turns' },
    ...extra,
  };
}

// A fake Apps API in memory, counting reads, that refuses like the service:
// a duplicate name with the API's own words.
function fakeApi(initial: AppDef[]) {
  const store = new Map(initial.map((d) => [d.name, d]));
  const calls = { list: 0, got: [] as string[] };
  const api: AppsApi = {
    listApps: async () => {
      calls.list++;
      return [...store.values()].map(({ name, description, where }) => ({ name, description, where }));
    },
    getApp: async (name) => {
      calls.got.push(name);
      const d = store.get(name);
      if (!d) throw new Error('no such tool');
      return d;
    },
    addApp: async (d) => {
      if (store.has(d.name)) throw new Error('a tool of that name already exists; remove it first');
      store.set(d.name, d);
      return d;
    },
    removeApp: async (name) => {
      store.delete(name);
    },
  };
  return { api, calls, store };
}

async function setTextarea(el: Element | null, value: string) {
  if (!el) throw new Error('no field');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const rows = (c: HTMLElement) => [...c.querySelectorAll('.apps-row')] as HTMLElement[];
const button = (c: HTMLElement, text: string) =>
  [...c.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;

afterEach(() => {
  unmountAll();
  document.body.innerHTML = '';
  window.history.replaceState(null, '', '/');
});

describe('the Apps page', () => {
  it('lists the apps by name, read once (no effect column)', async () => {
    const { api, calls } = fakeApi([def('list_turns'), def('apply_turn')]);
    const r = await render(<AppsPage api={api} onBack={() => {}} />);
    await flush();
    const list = rows(r.container);
    expect(list.map((x) => x.querySelector('.apps-row-name')!.textContent)).toEqual(['list_turns', 'apply_turn']);
    // An app carries no effect, so the row shows none.
    expect(r.container.querySelector('.apps-tag')).toBeNull();
    expect(calls.list).toBe(1);
  });

  it('loads the full definition from the single app on a pick', async () => {
    const withInputs = def('apply_turn', {
      run: { kind: 'api', method: 'POST', path: '/api/v0/turns/{id}/apply' },
      inputs: { type: 'object', properties: { turn: { type: 'string', description: 'the turn' } }, required: ['turn'] },
    });
    const { api, calls } = fakeApi([def('list_turns'), withInputs]);
    const r = await render(<AppsPage api={api} onBack={() => {}} />);
    await flush();
    await click(rows(r.container)[1]);
    await flush();
    // The middle column: the app's facts.
    expect(r.container.querySelector('.apps-desc')!.textContent).toContain('apply_turn');
    expect(r.container.querySelector('.apps-facts')!.textContent).toContain('AgentBus');
    // The right column: what it runs and its inputs, from getApp.
    expect(calls.got).toEqual(['apply_turn']);
    expect(r.container.querySelector('.apps-run')!.textContent).toContain('POST');
    expect(r.container.querySelector('.apps-run-p')!.textContent).toBe('/api/v0/turns/{id}/apply');
    const input = r.container.querySelector('.apps-inputs dt')!;
    expect(input.textContent).toContain('turn');
    expect(input.textContent).toContain('required');
  });

  it('shows a crafted app whose input type and description are not strings, without crashing', async () => {
    // The registry's schema check does not pin a property's type or description
    // to a string. A bare render of an object throws and clears the page.
    const crafted = def('odd_tool', {
      inputs: {
        type: 'object',
        properties: { q: { type: { nested: true }, description: { text: 'a filter' } } },
      },
    });
    const { api } = fakeApi([crafted]);
    const r = await render(<AppsPage api={api} onBack={() => {}} />);
    await flush();
    await click(rows(r.container)[0]);
    await flush();
    const input = r.container.querySelector('.apps-inputs dt');
    expect(input).not.toBeNull();
    expect(input!.textContent).toContain('q');
    // The object values show as their JSON, not as a thrown render.
    expect(r.container.querySelector('.apps-in-t')!.textContent).toContain('nested');
    expect(r.container.querySelector('.apps-inputs dd')!.textContent).toContain('a filter');
  });

  it('adds a custom app and selects it', async () => {
    const { api, store } = fakeApi([def('list_turns')]);
    const r = await render(<AppsPage api={api} onBack={() => {}} />);
    await flush();
    await click(button(r.container, '+ App'));
    const ta = r.container.querySelector('textarea.apps-text');
    expect(ta).not.toBeNull();
    await setTextarea(ta, JSON.stringify(def('my_tool')));
    await click(button(r.container, 'Add app'));
    await flush();
    expect(store.has('my_tool')).toBe(true);
    // It is now listed and picked.
    expect(rows(r.container).map((x) => x.querySelector('.apps-row-name')!.textContent)).toContain('my_tool');
    expect(r.container.querySelector('.apps-row.on .apps-row-name')!.textContent).toBe('my_tool');
  });

  it('keeps a just-added app when a slow initial list returns after the refresh', async () => {
    // The first list read is held open so it returns after the post-add
    // refresh. A stale result must not overwrite the fresh list.
    let releaseFirst: (v: ReturnType<typeof listOf>) => void = () => {};
    const store = new Map<string, AppDef>();
    const listOf = () =>
      [...store.values()].map(({ name, description, where }) => ({ name, description, where }));
    let calls = 0;
    const api: AppsApi = {
      listApps: async () => {
        calls++;
        if (calls === 1) return new Promise<ReturnType<typeof listOf>>((res) => (releaseFirst = res));
        return listOf();
      },
      getApp: async (n) => store.get(n)!,
      addApp: async (d) => {
        store.set(d.name, d);
        return d;
      },
      removeApp: async () => {},
    };
    const r = await render(<AppsPage api={api} onBack={() => {}} />);
    await flush();
    // The initial list is still pending; add an app (its refresh is read #2).
    await click(button(r.container, '+ App'));
    await setTextarea(r.container.querySelector('textarea.apps-text'), JSON.stringify(def('my_tool')));
    await click(button(r.container, 'Add app'));
    await flush();
    expect(rows(r.container).map((x) => x.querySelector('.apps-row-name')!.textContent)).toContain('my_tool');
    // The slow first read returns an empty list last; it must be ignored.
    await act(async () => releaseFirst([]));
    await flush();
    expect(rows(r.container).map((x) => x.querySelector('.apps-row-name')!.textContent)).toContain('my_tool');
  });

  it('runs one operation at a time: while an add is in flight the other controls are held', async () => {
    // The single mechanism for the completion races: no second action can
    // start, and no pick can override, while an add and its refresh run.
    let releaseAdd: () => void = () => {};
    const store = new Map<string, AppDef>([['list_turns', def('list_turns')]]);
    const listOf = () =>
      [...store.values()].map(({ name, description, where }) => ({ name, description, where }));
    const api: AppsApi = {
      listApps: async () => listOf(),
      getApp: async (n) => store.get(n)!,
      addApp: (d) =>
        new Promise<AppDef>((res) => {
          releaseAdd = () => {
            store.set(d.name, d);
            res(d);
          };
        }),
      removeApp: async () => {},
    };
    const r = await render(<AppsPage api={api} onBack={() => {}} />);
    await flush();
    await click(button(r.container, '+ App'));
    await setTextarea(r.container.querySelector('textarea.apps-text'), JSON.stringify(def('my_tool')));
    await click(button(r.container, 'Add app'));
    await flush();
    // The add is pending: the controls that would start another action or
    // change the view are all disabled.
    expect((r.container.querySelector('textarea.apps-text') as HTMLTextAreaElement).disabled).toBe(true);
    expect(button(r.container, 'Adding…')!.disabled).toBe(true);
    expect(button(r.container, 'Cancel')!.disabled).toBe(true);
    expect(button(r.container, '+ App')!.disabled).toBe(true);
    for (const row of rows(r.container)) expect((row as HTMLButtonElement).disabled).toBe(true);
    // It lands: the list refreshes, the form closes and the new app is picked.
    await act(async () => releaseAdd());
    await flush();
    expect(rows(r.container).map((x) => x.querySelector('.apps-row-name')!.textContent)).toContain('my_tool');
    expect(r.container.querySelector('.apps-row.on .apps-row-name')!.textContent).toBe('my_tool');
  });

  it('holds the API’s words when an add is refused, without adding', async () => {
    const { api, store } = fakeApi([def('list_turns')]);
    const r = await render(<AppsPage api={api} onBack={() => {}} />);
    await flush();
    await click(button(r.container, '+ App'));
    // A name already served: the fake refuses with the service's words.
    await setTextarea(r.container.querySelector('textarea.apps-text'), JSON.stringify(def('list_turns')));
    await click(button(r.container, 'Add app'));
    await flush();
    expect(r.container.querySelector('.apps-add-err')!.textContent).toContain('already exists');
    expect(store.size).toBe(1);
  });

  it('says plainly when the definition is not JSON, and never calls the API', async () => {
    const { api, store } = fakeApi([]);
    const r = await render(<AppsPage api={api} onBack={() => {}} />);
    await flush();
    await click(button(r.container, '+ App'));
    await setTextarea(r.container.querySelector('textarea.apps-text'), '{ not json');
    await click(button(r.container, 'Add app'));
    await flush();
    expect(r.container.querySelector('.apps-add-err')!.textContent).toContain('not valid JSON');
    expect(store.size).toBe(0);
  });

  it('removes an app after a confirm', async () => {
    const { api, store } = fakeApi([def('list_turns'), def('apply_turn')]);
    const r = await render(<AppsPage api={api} onBack={() => {}} />);
    await flush();
    await click(rows(r.container)[1]);
    await flush();
    await click(button(r.container, 'Remove'));
    // The confirm dialog opens; its Remove button does the delete.
    const confirm = [...document.querySelectorAll('.confirm button')].find((b) => b.textContent?.trim() === 'Remove');
    await click(confirm);
    await flush();
    expect(store.has('apply_turn')).toBe(false);
    expect(rows(r.container).map((x) => x.querySelector('.apps-row-name')!.textContent)).toEqual(['list_turns']);
  });

  it('shows the Apps row as current, with the sibling pages as links', async () => {
    const { api } = fakeApi([def('list_turns')]);
    const r = await render(<AppsPage api={api} onBack={() => {}} onRunners={() => {}} onSettings={() => {}} />);
    await flush();
    const current = r.container.querySelector('.side-link.pick.on');
    expect(current!.textContent).toContain('Apps');
    const links = [...r.container.querySelectorAll('a.side-link')].map((a) => a.textContent?.trim());
    expect(links).toEqual(['Cockpit', 'Runners', 'Settings']);
  });
});

describe('the plain labels', () => {
  it('name the API side AgentBus and a runner by its name', () => {
    expect(whereLabel('control')).toBe('AgentBus');
    expect(whereLabel('')).toBe('AgentBus');
    expect(whereLabel('runner:mac')).toBe('mac');
  });
});
