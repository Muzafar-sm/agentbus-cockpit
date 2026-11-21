import React, { useEffect, useRef, useState } from 'react';
import { ApplyPreview, ApplyState, TurnChangesPage, TurnDiff, TurnDiffFile } from '../types';
import { PanelHead } from './PanelHead';
import { Button, Select } from './Controls';
import { Loading, Notice } from './Notice';
import { SESSION } from '../words';

// A file as a turn's diff or the apply preview lists it. The preview counts
// its lines; a turn's diff is counted here.
interface ChangedFile {
  path: string;
  change: string;
  added?: number;
  removed?: number;
  diff?: string;
  diff_left_out?: boolean;
}

// Files changed by a conversation or a turn, each with its diff: added lines
// green, removed lines red, hunk headers quiet.

// Past this many files, each file starts folded to its name and counts.
const FOLD_OVER = 3;

const CONFLICT = 'you changed this file since; it would be refused';

// A copy past the framework's 200,000 files (MaxSnapshotFiles) gets cut-off
// checkpoints: its changes are not real and cannot be applied.
export const TOO_BIG = 'This folder is too big to track changes (over 200,000 files)';

// The preview, or an apply, refused because the copy had more files than a
// checkpoint holds (the framework's connector.ErrTruncated).
export function refusedTooBig(msg?: string | null): boolean {
  return !!msg && msg.includes('more files than a checkpoint holds');
}

// A turn's changes list is incomplete (truncated) for two reasons: the copy
// was too big to read, or the record simply kept at most its finish bound.
// Only the first warrants the "too big" notice, and the session's preview is
// what tells them apart, so the notice shows only when the preview said so.
export function turnTooBig(truncated: boolean | undefined, sessionTooBig?: boolean): boolean {
  return !!truncated && !!sessionTooBig;
}

// One changed file: its path, kind and line counts, and its diff, which
// scrolls sideways in its own box. A file the person changed since is
// marked: an apply would refuse it.
export const FileChange: React.FC<{ file: ChangedFile; open: boolean; conflict?: string }> = ({ file: f, open, conflict }) => {
  const lines = f.diff ? f.diff.replace(/\n$/, '').split('\n') : [];
  const added = f.added ?? lines.filter((l) => l.startsWith('+') && !l.startsWith('+++')).length;
  const removed = f.removed ?? lines.filter((l) => l.startsWith('-') && !l.startsWith('---')).length;
  const counted = !!f.diff || (f.added ?? 0) + (f.removed ?? 0) > 0;
  return (
    <details className={`ch-file${conflict ? ' conflict' : ''}`} open={open}>
      <summary className="ch-path">
        <code>{f.path}</code> <span className={`ch-kind ${f.change}`}>{f.change}</span>
        {counted && (
          <span className="ch-count">
            <span className="ch-add">+{added}</span> <span className="ch-del">−{removed}</span>
          </span>
        )}
        {conflict && (
          <span className="ch-conflict" title={conflict}>
            {CONFLICT}
          </span>
        )}
      </summary>
      {f.diff ? (
        <pre className="ch-diff">
          <span className="ch-lines">
            {lines.map((l, i) => (
              <span key={i} className={`dl ${lineKind(l)}`}>
                {l === '' ? ' ' : l}
              </span>
            ))}
          </span>
        </pre>
      ) : f.diff_left_out ? (
        <div className="nd-note">No diff here: binary, too big, or its earlier content is not kept.</div>
      ) : null}
    </details>
  );
};

const FileList: React.FC<{ files: ChangedFile[]; truncated?: boolean; diffsCut?: boolean; conflicts?: Map<string, string> }> = ({
  files,
  truncated,
  diffsCut,
  conflicts,
}) => (
  <div className="ch-files">
    {files.map((f) => (
      <FileChange key={f.path} file={f} open={files.length <= FOLD_OVER} conflict={conflicts?.get(f.path)} />
    ))}
    {truncated && <div className="nd-note">More files changed than are listed.</div>}
    {diffsCut && <div className="nd-note">Some diffs are left out: the changes are too big to show in full.</div>}
  </div>
);

function lineKind(l: string): string {
  if (l.startsWith('+++') || l.startsWith('---')) return 'meta';
  if (l.startsWith('@@')) return 'hunk';
  if (l.startsWith('+')) return 'add';
  if (l.startsWith('-')) return 'del';
  if (l.startsWith('\\')) return 'meta';
  return 'ctx';
}

const files = (n: number) => `${n} ${n === 1 ? 'file' : 'files'}`;

// The turn panel's Changes tab: what this one turn changed, read-only. The
// summary is GET /api/v0/turns/<id>/diff; the files page from
// GET /api/v0/turns/<id>/changes, with Load more. Applying is done for the
// whole conversation, from the bar above the message box.
type loaded = {
  turn: string;
  files: TurnDiffFile[];
  nextBefore: number | null;
  truncated: boolean;
  diffsCut: boolean;
};
export const TurnChangesTab: React.FC<{
  turnId: string;
  loadDiff: () => Promise<TurnDiff>;
  loadChanges?: (before?: number) => Promise<TurnChangesPage>;
  tooBig?: boolean;
}> = ({ turnId, loadDiff, loadChanges, tooBig }) => {
  const [diff, setDiff] = useState<{ turn: string; d: TurnDiff } | null>(null);
  const [changes, setChanges] = useState<loaded | null>(null);
  const [error, setError] = useState<{ turn: string; msg: string } | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const diffRef = useRef(loadDiff);
  diffRef.current = loadDiff;
  const changesRef = useRef(loadChanges);
  changesRef.current = loadChanges;
  // A generation guards every async read: it is bumped on each turn change,
  // so a response for an earlier turn (an in-flight Load more, say) is ignored.
  const gen = useRef(0);
  useEffect(() => {
    const mine = ++gen.current;
    setChanges(null);
    setError(null);
    setMoreError(null);
    setLoadingMore(false);
    Promise.all([diffRef.current(), changesRef.current ? changesRef.current() : Promise.resolve(null)]).then(
      ([d, page]) => {
        if (mine !== gen.current) return;
        setDiff({ turn: turnId, d });
        if (page) setChanges({ turn: turnId, files: page.changes, nextBefore: page.next_before, truncated: !!page.truncated, diffsCut: !!page.diffs_cut });
      },
      (err) => mine === gen.current && setError({ turn: turnId, msg: (err as Error).message })
    );
  }, [turnId]);
  const d = diff?.turn === turnId ? diff.d : null;
  const ch = changes?.turn === turnId ? changes : null;
  const err = error?.turn === turnId ? error.msg : null;
  if (err) return <Notice kind="error">{err}</Notice>;
  if (!d) return <Loading />;
  const f = d.files;
  if (turnTooBig(ch?.truncated, tooBig)) {
    return (
      <div className="turn-changes">
        <Notice kind="warn" className="too-big">
          {TOO_BIG}
        </Notice>
      </div>
    );
  }
  const loadMore = () => {
    if (!ch || ch.nextBefore == null || !changesRef.current || loadingMore) return;
    const mine = gen.current;
    setLoadingMore(true);
    setMoreError(null);
    changesRef.current(ch.nextBefore).then(
      (page) => {
        if (mine !== gen.current) return;
        setChanges((c) =>
          c && c.turn === turnId
            ? { turn: turnId, files: [...c.files, ...page.changes], nextBefore: page.next_before, truncated: c.truncated || !!page.truncated, diffsCut: c.diffsCut || !!page.diffs_cut }
            : c
        );
        setLoadingMore(false);
      },
      (e) => {
        if (mine !== gen.current) return;
        setMoreError((e as Error).message);
        setLoadingMore(false);
      }
    );
  };
  // The route pages the path-sorted list from the end, so sort what is loaded
  // back into path order for the screen.
  const shown = ch ? [...ch.files].sort((a, b) => a.path.localeCompare(b.path)) : [];
  return (
    <div className="turn-changes">
      <div className="tab-sum">
        <b>{f && f.count > 0 ? files(f.count) : 'No files'}</b>
        <span className="sep"> · </span>
        {f && f.count > 0 ? 'changed by this turn' : 'this turn changed no files'}
      </div>
      {f && f.count > 0 && ch && <FileList files={shown} truncated={ch.truncated} diffsCut={ch.diffsCut} />}
      {moreError && <Notice kind="error">{moreError}</Notice>}
      {ch && ch.nextBefore != null && (
        <Button kind="quiet" small onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </div>
  );
};

interface ApplyPanelProps {
  // The conversation's preview: null while it is read the first time.
  preview: ApplyPreview | null;
  error?: string | null;
  // POST /api/v0/turns/<turn>/apply, and a read of that apply's state while
  // it is queued or running. Absent when the source cannot apply.
  apply?: (turn: string) => Promise<ApplyState>;
  readApply?: (turn: string) => Promise<ApplyState>;
  // Told when an apply ends, applied or not, so the preview is read again.
  onApplyEnded?: () => void;
  // Take a fresh preview (the folder may have changed outside a turn).
  onRefresh?: () => void;
  onClose?: () => void;
  pollMs?: number;
  // When set, a Review button beside Apply. It fills the message box with a
  // plain request to a reviewer -- an agent of a different vendor by default,
  // chosen from options -- and switches the picker beside Send to it; the
  // person presses Send. A shortcut, not a separate action: nothing is sent
  // here. options are the agents to offer, defaultAgent the one shown first.
  review?: {
    options: { id: string; name: string }[];
    defaultAgent: string;
    onReview: (agentId: string) => void;
  };
}

// The right panel's apply preview for the conversation on screen: every
// file applying would write, its diff against the person's folder now, any
// file the person changed since (which the apply would refuse), and one
// "Apply to my folder" for the turn the preview names.
export const ApplyPanel: React.FC<ApplyPanelProps> = ({ preview, error, apply, readApply, onApplyEnded, onRefresh, onClose, pollMs = 2000, review }) => {
  // The apply this panel asked for: its turn, and its state as last read.
  const [asked, setAsked] = useState<{ turn: string; state: ApplyState | null } | null>(null);
  // The reviewer the small picker shows; empty follows review.defaultAgent.
  const [reviewer, setReviewer] = useState('');
  const [applyError, setApplyError] = useState<string | null>(null);
  const endedRef = useRef(onApplyEnded);
  endedRef.current = onApplyEnded;

  const state = asked?.state;
  const pending = !!asked && (!state || state.state === 'queued' || state.state === 'running');

  const doApply = async () => {
    if (!apply || !preview?.turn) return;
    const turn = preview.turn;
    setAsked({ turn, state: null });
    setApplyError(null);
    try {
      const s = await apply(turn);
      setAsked({ turn, state: s });
      if (s.state !== 'queued' && s.state !== 'running') endedRef.current?.();
    } catch (err) {
      setAsked(null);
      setApplyError((err as Error).message);
    }
  };

  // An apply the API answered as queued or running ends later: read its
  // state again until it says how it ended.
  const polling = !!asked && !!state && (state.state === 'queued' || state.state === 'running') && !!readApply;
  useEffect(() => {
    if (!polling || !asked) return;
    let active = true;
    const turn = asked.turn;
    const id = setInterval(() => {
      readApply!(turn).then(
        (s) => {
          if (!active || s.state === 'queued' || s.state === 'running') return;
          setAsked({ turn, state: s });
          endedRef.current?.();
        },
        () => {
          // A read that fails is tried again on the next tick.
        }
      );
    }, pollMs);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [polling, asked, readApply, pollMs]);

  // After an apply, the panel says so until a later turn has new work. A stale
  // preview is never "applied, folder matches": it is out of date (the session
  // changed and the runner is offline), so the panel shows that, its time and
  // Refresh, whatever the last apply was.
  const applied =
    state?.state === 'applied' && !preview?.stale && (!preview || !preview.unapplied || preview.turn === asked!.turn);
  const refused = state && (state.state === 'refused' || state.state === 'failed') ? state : null;
  // The copy is too big to track: no count, no files, no apply.
  const tooBig = refusedTooBig(error) || refusedTooBig(refused?.error);
  // Each file an apply would refuse, by path.
  const conflicts = preview?.conflicts ?? [];
  const conflictOf = new Map(conflicts.map((c) => [c.path, c.why]));
  const conflicted = conflicts.length > 0;
  const has = !!preview && preview.unapplied && (preview.count > 0 || preview.files.length > 0 || conflicted);
  const canApply = !!apply && !!preview?.turn && has && !pending && !conflicted && !tooBig;
  // The reviewer offered beside Apply: the small picker's choice, or the
  // default (an agent of a different vendor). Review stays available even
  // when an apply would be refused -- a person can ask about it regardless.
  const reviewers = review?.options ?? [];
  const reviewerId = reviewers.some((o) => o.id === reviewer) ? reviewer : review?.defaultAgent ?? '';
  const canReview = reviewers.length > 0 && has && !tooBig;

  return (
    <section id="right" className="apply-panel">
      <PanelHead up={[]} onClose={onClose}>
        {has && !applied ? 'Changes not applied' : 'Changes'}
      </PanelHead>
      <div id="d-body">
        {tooBig ? (
          <Notice kind="warn" className="too-big">
            {TOO_BIG}
          </Notice>
        ) : (
          <>
            {error && <Notice kind="error">{error}</Notice>}
            {!preview && !error && <Loading />}
            {applied ? (
              <p className="nd-note ok" role="status">Applied. Your folder matches this {SESSION}.</p>
            ) : (
              preview && (
                <>
                  <div className="tab-sum">
                    <b>{has ? files(preview.count || preview.files.length) : 'Nothing to apply'}</b>
                    <span className="sep"> · </span>
                    {has
                      ? 'would be written to your folder, each against what it holds now'
                      : preview.why || `your folder matches this ${SESSION}`}
                  </div>
                  {preview.previewed_at && (
                    <div className="nd-note ap-asof">
                      As of {new Date(preview.previewed_at).toLocaleString()}
                      {onRefresh && (
                        <>
                          {' · '}
                          <Button kind="link" small onClick={onRefresh}>
                            Refresh
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                  {preview.stale && (
                    <Notice kind="warn" className="ap-stale">
                      <b>Out of date.</b>{' '}
                      {preview.why || `The ${SESSION} changed after this preview was taken.`}
                    </Notice>
                  )}
                  {conflicted && (
                    <Notice kind="warn" className="ap-conflicts">
                      <b>{files(conflicts.length)} would be refused.</b> You changed{' '}
                      {conflicts.length === 1 ? 'this file' : 'these files'} in your folder since this {SESSION} copied it:
                      <ul className="ch-conflicts">
                        {conflicts.map((c) => (
                          <li key={c.path}>
                            <code>{c.path}</code>: {c.why}
                          </li>
                        ))}
                      </ul>
                    </Notice>
                  )}
                  {has && (
                    <FileList files={preview.files} truncated={preview.truncated} diffsCut={preview.diffs_cut} conflicts={conflictOf} />
                  )}
                  {preview.count > preview.files.length && (
                    <div className="nd-note ap-more">
                      {preview.count - preview.files.length} more files not listed{preview.truncated ? ': too many to send' : ''}
                    </div>
                  )}
                </>
              )
            )}
            {refused && (
              <Notice kind="error">
                {refused.error || 'The apply was refused.'}
                {refused.conflicts && refused.conflicts.length > 0 && (
                  <ul className="ch-conflicts">
                    {refused.conflicts.map((c) => (
                      <li key={c.path}>
                        <code>{c.path}</code>: {c.why}
                      </li>
                    ))}
                  </ul>
                )}
              </Notice>
            )}
            {applyError && <Notice kind="error">{applyError}</Notice>}
            {!applied && has && (apply || canReview) && (
              <div className="ap-actions">
                {canReview && (
                  <span className="ap-review">
                    <Select
                      name="reviewer"
                      variant="quiet"
                      label="Agent to review these changes"
                      title="Agent to review these changes"
                      value={reviewerId}
                      options={reviewers.map((o) => ({ value: o.id, label: o.name }))}
                      onChange={setReviewer}
                      align="right"
                    />
                    <Button kind="secondary" onClick={() => review?.onReview(reviewerId)}>
                      Review
                    </Button>
                  </span>
                )}
                {apply && (
                  <Button kind="primary" className="ap-apply" disabled={!canApply} onClick={doApply}>
                    {pending ? 'Applying…' : 'Apply to my folder'}
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
};
