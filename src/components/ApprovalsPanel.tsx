import React, { useCallback, useEffect, useState } from 'react';
import { DataSource, HeldApproval, ApprovalDecision } from '../types';
import { ApprovalCard } from './ApprovalCard';

// How often to re-read the commands waiting for a person.
const POLL_MS = 2000;

// The commands waiting for a person, as cards. It polls GET /api/v0/approvals
// and shows one card per held reply; after an answer it reads again (the
// answered one leaves, and after Allow the continuation turn appears in the
// session). A source without the approvals routes shows nothing.
export const ApprovalsPanel: React.FC<{
  dataSource: DataSource;
  sessionId?: string;
}> = ({ dataSource, sessionId }) => {
  const [approvals, setApprovals] = useState<HeldApproval[]>([]);
  const list = dataSource.listApprovals;
  const decideFn = dataSource.decideApproval;

  const reload = useCallback(async () => {
    if (!dataSource.listApprovals) return;
    try {
      const got = await dataSource.listApprovals();
      if (got) setApprovals(got);
    } catch {
      // Keep the last list; the next poll retries.
    }
  }, [dataSource]);

  useEffect(() => {
    if (!list) return;
    reload();
    const id = setInterval(reload, POLL_MS);
    return () => clearInterval(id);
  }, [list, reload]);

  if (!list || !decideFn) return null;
  const shown = sessionId ? approvals.filter((a) => a.session === sessionId) : approvals;
  if (shown.length === 0) return null;

  const answer = async (id: string, decision: ApprovalDecision) => {
    await dataSource.decideApproval!(id, decision);
    reload();
  };

  return (
    <div className="ask-panel" aria-label="Commands to approve">
      {shown.map((a) => (
        <ApprovalCard key={a.id} approval={a} decide={answer} />
      ))}
    </div>
  );
};
