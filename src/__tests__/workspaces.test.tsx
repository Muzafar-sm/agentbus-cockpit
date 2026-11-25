// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunnersPage } from '../components/RunnersPage';
import { hasUnapplied, UNAPPLIED, WorkspacesApi } from '../components/Workspaces';
import { LiveDataSource } from '../data/LiveDataSource';
import { CloseState, RunnerInfo, WorkspaceRow } from '../types';
import { click, flush, render, unmountAll } from './helpers';

const now = Date.now();
const ago = (min: number) => new Date(now - min * 60_000).toISOString();

const runners: RunnerInfo[] = [
  { id: 'run_a', name: 'mac', role: 'runner', machine: 'con_aaaaaaaaaaaaaaaa', online: true, last_seen: ago(0), labels: [], harnesses: [] },
  { id: 'run_b', name: 'box', role: 'runner', machine: 'con_bbbbbbbbbbbbbbbb', online: false, last_seen: ago(5), labels: [], harnesses: [] },
];

const ws = (w: Partial<WorkspaceRow> & { workspace: string }): WorkspaceRow => ({ sandbox: true, created: ago(10), ...w });

const rows: WorkspaceRow[] = [
  ws({ workspace: 'ws_old', machine: 'con_aaaaaaaaaaaaaaaa', folder: '/Users/p/Sites/old-app', created: ago(3 * 24 * 60) }),
  ws({ workspace: 'ws_new', machine: 'con_aaaaaaaaaaaaaaaa', folder: '/Users/p/Sites/new-app', created: ago(5), head_turn: 't_2', applied_turn: 't_1' }),
  ws({
    workspace: 'ws_two',
    machine: 'con_bbbbbbbbbbbbbbbb',
    folders: [
      { name: 'api', folder: '/srv/api' },
      { name: 'web', folder: '/srv/web' },
    ],
    created: ago(90),
    head_turn: 't_9',
    applied_turn: 't_9',
  }),
  ws({ workspace: 'ws_closed', machine: 'con_aaaaaaaaaaaaaaaa', folder: '/Users/p/gone', closed: ago(1) }),
  ws({ workspace: 'ws_real', machine: 'con_aaaaaaaaaaaaaaaa', folder: '/Users/p/real', sandbox: false }),
  ws({ workspace: 'ws_local', folder: '/home/p/here', created: ago(30) }),
];

const api = (close: WorkspacesApi['close'] = async () => ({ state: 'closed' })): WorkspacesApi & { list: ReturnType<typeof vi.fn> } => ({
  list: vi.fn(async () => rows),
  close,
});

const page = async (a: WorkspacesApi) => {
  const r = await render(<RunnersPage runners={runners} error={null} onBack={() => {}} workspaces={a} />);
  await flush();
  return r;
};

const listOf = (c: HTMLElement, label: string) => c.querySelector(`.ws-list[aria-label="${label}"]`);
const ids = (el: Element | null) => [...(el?.querySelectorAll('.ws-row') ?? [])].map((x) => x.getAttribute('data-workspace'));

afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
});

describe('workspaces on the Runners page', () => {
  it('lists each machine’s open sandbox workspaces under its row, newest first', async () => {
    const r = await page(api());
    const mac = listOf(r.container, 'Workspaces on mac');
    // Closed ones, and those in the real folder (nothing to close), are left out.
    expect(ids(mac)).toEqual(['ws_new', 'ws_old']);
    // Right under the machine's own row.
    expect(mac!.previousElementSibling!.getAttribute('data-runner')).toBe('run_a');
    expect(ids(listOf(r.container, 'Workspaces on box'))).toEqual(['ws_two']);
    // The folder name and the age, nothing else.
    const row = (id: string) => r.container.querySelector(`.ws-row[data-workspace="${id}"]`)!;
    expect(row('ws_old').querySelector('.ws-n')!.textContent).toBe('old-app');
    expect(row('ws_old').querySelector('.ws-n')!.getAttribute('title')).toBe('/Users/p/Sites/old-app');
    expect(row('ws_old').querySelector('.ws-age')!.textContent).toBe('3 days ago');
    expect(row('ws_two').querySelector('.ws-n')!.textContent).toBe('api, web');
    expect(row('ws_two').querySelector('.ws-age')!.textContent).toBe('1 hour ago');
    // The service's own machine (no machine id) gets a group of its own.
    expect(ids(listOf(r.container, 'Workspaces on this service\'s machine'))).toEqual(['ws_local']);
  });

  it('marks a workspace with changes not applied, with a tooltip that says so', async () => {
    const r = await page(api());
    const mark = (id: string) => r.container.querySelector(`.ws-row[data-workspace="${id}"] .ws-unapplied`);
    expect(mark('ws_new')!.getAttribute('title')).toBe(UNAPPLIED);
    expect(mark('ws_new')!.querySelector('svg')).not.toBeNull();
    expect(mark('ws_old')).toBeNull();
    // Everything applied up to its latest turn: no mark.
    expect(mark('ws_two')).toBeNull();
    expect(hasUnapplied(ws({ workspace: 'x' }))).toBe(false);
  });

  it('closes a workspace with no confirm, and the row goes', async () => {
    const close = vi.fn(async (): Promise<CloseState> => ({ state: 'closed' }));
    const r = await page(api(close));
    await click(r.container.querySelector('.ws-row[data-workspace="ws_old"] .ws-close'));
    await flush();
    expect(close).toHaveBeenCalledWith('ws_old');
    expect(r.container.querySelector('[role="dialog"]')).toBeNull();
    expect(ids(listOf(r.container, 'Workspaces on mac'))).toEqual(['ws_new']);
  });

  it('keeps a row whose close is still waiting out of the list on the next read', async () => {
    const a = api(async () => ({ state: 'queued' }));
    vi.useFakeTimers({ toFake: ['setInterval'] });
    try {
      const r = await page(a);
      await click(r.container.querySelector('.ws-row[data-workspace="ws_new"] .ws-close'));
      await flush();
      expect(ids(listOf(r.container, 'Workspaces on mac'))).toEqual(['ws_old']);
      // The service still lists it open until the turn ahead ends.
      vi.advanceTimersByTime(30_000);
      await flush();
      expect(a.list).toHaveBeenCalledTimes(2);
      expect(ids(listOf(r.container, 'Workspaces on mac'))).toEqual(['ws_old']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the row and shows the API’s words when Close is refused', async () => {
    const r = await page(api(async () => Promise.reject(new Error('an apply of this workspace is still running'))));
    await click(r.container.querySelector('.ws-row[data-workspace="ws_old"] .ws-close'));
    await flush();
    expect(ids(listOf(r.container, 'Workspaces on mac'))).toEqual(['ws_new', 'ws_old']);
    expect(r.container.querySelector('.ws-err')!.textContent).toBe('an apply of this workspace is still running');
  });

  it('shows no workspaces for a source without them', async () => {
    const r = await render(<RunnersPage runners={runners} error={null} onBack={() => {}} />);
    expect(r.container.querySelector('.ws-list')).toBeNull();
  });
});

describe('the live source’s workspaces', () => {
  const src = () => new LiveDataSource({ baseUrl: 'http://svc', token: 'tok' });

  it('lists them from GET /api/v0/workspaces, and null without the route', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ workspaces: rows }), { status: 200 }));
    expect(await src().listWorkspaces()).toHaveLength(rows.length);
    expect(String(f.mock.calls[0][0])).toBe('http://svc/api/v0/workspaces');
    f.mockResolvedValueOnce(new Response('not found', { status: 404 }));
    expect(await src().listWorkspaces()).toBeNull();
  });

  it('closes with POST /api/v0/workspaces/{id}/close and rejects a refusal in the API’s words', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ state: 'closed' }), { status: 200 }));
    expect(await src().closeWorkspace('ws_1')).toEqual({ state: 'closed' });
    expect(String(f.mock.calls[0][0])).toBe('http://svc/api/v0/workspaces/ws_1/close');
    expect((f.mock.calls[0][1] as RequestInit).method).toBe('POST');
    f.mockResolvedValueOnce(new Response(JSON.stringify({ state: 'failed', error: 'still running or waiting' }), { status: 409 }));
    await expect(src().closeWorkspace('ws_1')).rejects.toThrow('still running or waiting');
  });
});
