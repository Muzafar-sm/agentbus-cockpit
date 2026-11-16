import React, { useState } from 'react';
import { HeldApproval, ApprovalGone } from '../types';
import { Notice } from './Notice';

// One card for a command an agent wanted to run that matched an ask entry of
// permissions.toml: the gateway refused it and is waiting for a person. Allow
// means "allow from now on" (it moves to the allow list and the session
// continues so the agent can run it); Refuse records the decision. When another
// answer already took it (409), the card steps aside.
export const ApprovalCard: React.FC<{
  approval: HeldApproval;
  decide: (id: string, allow: boolean) => Promise<void>;
}> = ({ approval, decide }) => {
  const [busy, setBusy] = useState<'' | 'allow' | 'refuse'>('');
  const [gone, setGone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answer = async (allow: boolean) => {
    setBusy(allow ? 'allow' : 'refuse');
    setError(null);
    try {
      await decide(approval.id, allow);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === ApprovalGone) setGone(true);
      else setError(msg);
    } finally {
      setBusy('');
    }
  };

  if (gone) {
    return (
      <div className="ask-card ask-card-gone" role="status">
        This command is already being answered.
      </div>
    );
  }

  return (
    <div className="ask-card" role="group" aria-label="A command to approve">
      <div className="ask-card-head">{approval.agent || 'An agent'} wants to run:</div>
      <ul className="ask-card-cmds">
        {approval.commands.map((c, i) => (
          <li key={i}>
            <code>{c}</code>
          </li>
        ))}
      </ul>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="ask-card-actions">
        <button type="button" className="ask-allow" disabled={busy !== ''} onClick={() => answer(true)}>
          {busy === 'allow' ? '…' : 'Allow'}
        </button>
        <button type="button" className="ask-refuse" disabled={busy !== ''} onClick={() => answer(false)}>
          {busy === 'refuse' ? '…' : 'Refuse'}
        </button>
      </div>
      <div className="ask-card-note">Allow runs it and allows it from now on. Refuse records the decision.</div>
    </div>
  );
};
