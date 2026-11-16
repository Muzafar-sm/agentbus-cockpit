import React, { useState } from 'react';
import { HeldApproval, ApprovalGone, ApprovalDecision } from '../types';
import { harnessName } from '../words';
import { Notice } from './Notice';

// One card for a command an agent wanted to run that the gateway held for a
// person: a command on the ask list, or one on none of the lists under the ask
// default. Allow once lets exactly these commands run for the continuation turn
// only, writing nothing to the settings; Always allow moves the matched command
// to the allow list, from now on; Refuse records the decision. When another
// answer already took it (409), the card steps aside.
export const ApprovalCard: React.FC<{
  approval: HeldApproval;
  decide: (id: string, decision: ApprovalDecision) => Promise<void>;
}> = ({ approval, decide }) => {
  const [busy, setBusy] = useState<'' | ApprovalDecision>('');
  const [gone, setGone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answer = async (decision: ApprovalDecision) => {
    setBusy(decision);
    setError(null);
    try {
      await decide(approval.id, decision);
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
      <div className="ask-card-head">{approval.agent ? harnessName(approval.agent) : 'An agent'} wants to run:</div>
      <ul className="ask-card-cmds">
        {approval.commands.map((c, i) => (
          <li key={i}>
            <code>{c}</code>
          </li>
        ))}
      </ul>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="ask-card-actions">
        <button type="button" className="ask-allow" disabled={busy !== ''} onClick={() => answer('once')}>
          {busy === 'once' ? '…' : 'Allow once'}
        </button>
        <button type="button" className="ask-always" disabled={busy !== ''} onClick={() => answer('always')}>
          {busy === 'always' ? '…' : 'Always allow'}
        </button>
        <button type="button" className="ask-refuse" disabled={busy !== ''} onClick={() => answer('refuse')}>
          {busy === 'refuse' ? '…' : 'Refuse'}
        </button>
      </div>
      <div className="ask-card-note">
        Allow once runs it this turn only. Always allow adds it to the allow list, from now on. Refuse records the
        decision.
      </div>
    </div>
  );
};
