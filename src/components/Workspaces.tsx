import React, { useEffect, useState } from 'react';
import { CloseState, WorkspaceRow } from '../types';
import { FolderInfo, folderLabel } from '../data/folders';
import { formatAgo } from '../utils/format';
import { Button } from './Controls';
import { UnappliedIcon } from './Icons';
import { RUNNERS_POLL_MS } from './RunnersList';

// What the Runners page needs for its workspaces: the list, and Close.
export interface WorkspacesApi {
  list: () => Promise<WorkspaceRow[] | null>;
  close: (workspace: string) => Promise<CloseState>;
}

export const UNAPPLIED = 'Changes not applied yet';

// The workspaces the page shows: sandbox ones whose copy is still there
// (Close is for a copy only), newest first. Undefined before the first read,
// null on a service without the route.
export function useWorkspaces(api?: WorkspacesApi): {
  rows: WorkspaceRow[] | null | undefined;
  error: string | null;
  hide: (workspace: string) => void;
} {
  const [rows, setRows] = useState<WorkspaceRow[] | null | undefined>(api ? undefined : null);
  const [error, setError] = useState<string | null>(null);
  // Closed here: kept out of the list even while a close still waits behind
  // a turn and a re-read lists the workspace as open.
  const [gone, setGone] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (!api) return;
    let live = true;
    const read = () =>
      api.list().then(
        (got) => {
          if (!live) return;
          setRows(got);
          setError(null);
        },
        (e: unknown) => {
          if (live) setError(e instanceof Error ? e.message : String(e));
        }
      );
    read();
    const timer = setInterval(read, RUNNERS_POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [api]);
  const open = rows
    ?.filter((w) => w.sandbox && !w.closed && !gone.has(w.workspace))
    .sort((a, b) => Date.parse(b.created) - Date.parse(a.created));
  return { rows: rows === null ? null : open, error, hide: (id) => setGone((s) => new Set(s).add(id)) };
}

// A workspace has changes not applied when its latest turn with changes is
// not the one its latest apply went up to.
export const hasUnapplied = (w: WorkspaceRow) => !!w.head_turn && w.head_turn !== w.applied_turn;

const lastPart = (path: string) => path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path;

// The folder names of a workspace, as one line, and their full paths for the
// tooltip.
function folderNames(w: WorkspaceRow, known: FolderInfo[]): { names: string; paths: string } {
  const fs = w.folders?.length ? w.folders : [{ folder: w.folder, folder_ref: w.folder_ref }];
  const one = (f: { name?: string; folder?: string; folder_ref?: string }) => {
    const label = folderLabel(f.folder, f.folder_ref, known);
    return f.name || (label ? lastPart(label) : f.folder_ref || 'folder');
  };
  return {
    names: fs.map(one).join(', '),
    paths: fs.map((f) => f.folder || folderLabel(undefined, f.folder_ref, known) || f.folder_ref || '').filter(Boolean).join('\n'),
  };
}

// One machine's open workspaces, under its row on the Runners page: the
// folder names, how long ago it was made, a mark for changes not applied, and
// Close. A closed row goes at once; a refusal stays under the row in the
// API's words.
export const WorkspaceRows: React.FC<{
  rows: WorkspaceRow[];
  label: string;
  folders?: FolderInfo[];
  close?: (workspace: string) => Promise<CloseState>;
  onClosed: (workspace: string) => void;
}> = ({ rows, label, folders = [], close, onClosed }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<{ id: string; text: string } | null>(null);
  if (rows.length === 0) return null;
  const doClose = (id: string) => {
    if (!close) return;
    setBusy(id);
    setErr(null);
    close(id).then(
      (st) => {
        setBusy(null);
        if (st.state === 'failed') setErr({ id, text: st.error || 'Close failed' });
        else onClosed(id);
      },
      (e: unknown) => {
        setBusy(null);
        setErr({ id, text: e instanceof Error ? e.message : String(e) });
      }
    );
  };
  return (
    <div className="ws-list" aria-label={label}>
      {rows.map((w) => {
        const { names, paths } = folderNames(w, folders);
        return (
          <React.Fragment key={w.workspace}>
            <div className="ws-row" data-workspace={w.workspace}>
              <span className="ws-n" title={paths || undefined}>
                {names}
              </span>
              {hasUnapplied(w) && (
                <span className="s-ic ws-unapplied" title={UNAPPLIED} aria-label={UNAPPLIED}>
                  <UnappliedIcon />
                </span>
              )}
              <span className="pr-m2 ws-age">{formatAgo(w.created) || '—'}</span>
              {close && (
                <Button kind="secondary" small className="ws-close" disabled={busy === w.workspace} onClick={() => doClose(w.workspace)}>
                  {busy === w.workspace ? 'Closing…' : 'Close'}
                </Button>
              )}
            </div>
            {err?.id === w.workspace && <p className="empty bad ws-err">{err.text}</p>}
          </React.Fragment>
        );
      })}
    </div>
  );
};
