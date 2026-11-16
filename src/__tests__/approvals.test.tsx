// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { ApprovalCard } from '../components/ApprovalCard';
import { ApprovalsPanel } from '../components/ApprovalsPanel';
import { ApprovalGone, DataSource, HeldApproval } from '../types';
import { click, flush, render, unmountAll } from './helpers';

afterEach(() => unmountAll());

const ap = (over: Partial<HeldApproval> = {}): HeldApproval => ({
  id: 'ap1',
  session: 's1',
  turn: 't_1',
  agent: 'Bash',
  commands: ['git push'],
  rule: 'git push',
  requested: '2026-11-16T00:00:00Z',
  ...over,
});

function findBtn(c: HTMLElement, text: string): HTMLButtonElement {
  const b = [...c.querySelectorAll('button')].find((x) => x.textContent?.trim() === text);
  if (!b) throw new Error(`no ${text} button`);
  return b as HTMLButtonElement;
}

describe('the approval card', () => {
  it('lists every command and allows them', async () => {
    const calls: Array<[string, boolean]> = [];
    const { container } = await render(
      <ApprovalCard approval={ap({ commands: ['git push', 'npm publish'] })} decide={async (id, allow) => void calls.push([id, allow])} />
    );
    expect(container.textContent).toContain('git push');
    expect(container.textContent).toContain('npm publish');
    await click(findBtn(container, 'Allow'));
    await flush();
    expect(calls).toEqual([['ap1', true]]);
  });

  it('refuses', async () => {
    const calls: Array<[string, boolean]> = [];
    const { container } = await render(<ApprovalCard approval={ap()} decide={async (id, allow) => void calls.push([id, allow])} />);
    await click(findBtn(container, 'Refuse'));
    await flush();
    expect(calls).toEqual([['ap1', false]]);
  });

  it('steps aside when another answer already took it (409)', async () => {
    const { container } = await render(
      <ApprovalCard
        approval={ap()}
        decide={async () => {
          throw new Error(ApprovalGone);
        }}
      />
    );
    await click(findBtn(container, 'Allow'));
    await flush();
    expect(container.textContent).toContain('already being answered');
  });
});

describe('the approvals panel', () => {
  it('shows this session’s commands, hides others, and reloads after an answer', async () => {
    let list: HeldApproval[] = [ap(), ap({ id: 'ap2', session: 'other', commands: ['rm -rf /'] })];
    const decided: string[] = [];
    const ds: Partial<DataSource> = {
      listApprovals: async () => list,
      decideApproval: async (id, allow) => {
        decided.push(`${id}:${allow}`);
        list = list.filter((a) => a.id !== id);
      },
    };
    const { container } = await render(<ApprovalsPanel dataSource={ds as DataSource} sessionId="s1" />);
    await flush();
    expect(container.textContent).toContain('git push');
    expect(container.textContent).not.toContain('rm -rf /');
    await click(findBtn(container, 'Allow'));
    await flush();
    expect(decided).toEqual(['ap1:true']);
  });

  it('shows nothing when the source has no approvals routes', async () => {
    const { container } = await render(<ApprovalsPanel dataSource={{} as DataSource} sessionId="s1" />);
    await flush();
    expect(container.querySelector('.ask-panel')).toBeNull();
  });
});
