// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { ApprovalCard } from '../components/ApprovalCard';
import { ApprovalsPanel } from '../components/ApprovalsPanel';
import { ApprovalGone, ApprovalDecision, DataSource, HeldApproval } from '../types';
import { click, flush, render, unmountAll } from './helpers';

afterEach(() => unmountAll());

const ap = (over: Partial<HeldApproval> = {}): HeldApproval => ({
  id: 'ap1',
  session: 's1',
  turn: 't_1',
  agent: 'claude',
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
  it('lists every command and offers the three answers', async () => {
    const calls: Array<[string, ApprovalDecision]> = [];
    const { container } = await render(
      <ApprovalCard approval={ap({ commands: ['git push', 'npm publish'] })} decide={async (id, d) => void calls.push([id, d])} />
    );
    expect(container.textContent).toContain('git push');
    expect(container.textContent).toContain('npm publish');
    // The header shows the agent's product name, not the harness id or the tool.
    expect(container.textContent).toContain('Claude Code wants to run');
    await click(findBtn(container, 'Allow once'));
    await flush();
    expect(calls).toEqual([['ap1', 'once']]);
  });

  it('always allows', async () => {
    const calls: Array<[string, ApprovalDecision]> = [];
    const { container } = await render(<ApprovalCard approval={ap()} decide={async (id, d) => void calls.push([id, d])} />);
    await click(findBtn(container, 'Always allow'));
    await flush();
    expect(calls).toEqual([['ap1', 'always']]);
  });

  it('refuses', async () => {
    const calls: Array<[string, ApprovalDecision]> = [];
    const { container } = await render(<ApprovalCard approval={ap()} decide={async (id, d) => void calls.push([id, d])} />);
    await click(findBtn(container, 'Refuse'));
    await flush();
    expect(calls).toEqual([['ap1', 'refuse']]);
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
    await click(findBtn(container, 'Allow once'));
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
      decideApproval: async (id, decision) => {
        decided.push(`${id}:${decision}`);
        list = list.filter((a) => a.id !== id);
      },
    };
    const { container } = await render(<ApprovalsPanel dataSource={ds as DataSource} sessionId="s1" />);
    await flush();
    expect(container.textContent).toContain('git push');
    expect(container.textContent).not.toContain('rm -rf /');
    await click(findBtn(container, 'Always allow'));
    await flush();
    expect(decided).toEqual(['ap1:always']);
  });

  it('shows nothing when the source has no approvals routes', async () => {
    const { container } = await render(<ApprovalsPanel dataSource={{} as DataSource} sessionId="s1" />);
    await flush();
    expect(container.querySelector('.ask-panel')).toBeNull();
  });
});
