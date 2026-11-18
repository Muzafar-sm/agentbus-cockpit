import React, { useState } from 'react';
import { follow, PAGE_PATHS, type Page } from '../page';
import { FeedbackDialog } from './FeedbackDialog';

interface FootNavProps {
  // The page on screen; its row is shown as the current one.
  current: Page;
  // Each target opens its page; absent means the source does not have it, so
  // the row is not shown. onCockpit is the way back from a page.
  onCockpit?: () => void;
  onApps?: () => void;
  onRunners?: () => void;
  onSettings?: () => void;
  // How many runners are online, shown by the Runners row; undefined before
  // the first read.
  runnersOnline?: number;
  // The AgentBus build, for the Feedback box.
  version?: string;
}

// FootNav is the one foot nav list, the same rows in the same order on the
// cockpit and on every page: Cockpit, Apps, Runners, Settings, Feedback. The page you
// are on stays in its place, marked as current rather than left out, so nothing
// moves. A page the source does not have is the only row not shown. Feedback
// opens a small box rather than a page; this owns that box, so the cockpit and
// the pages both open it the same way.
export const FootNav: React.FC<FootNavProps> = ({
  current,
  onCockpit,
  onApps,
  onRunners,
  onSettings,
  runnersOnline,
  version,
}) => {
  const [feedback, setFeedback] = useState(false);
  // One row: the current page as plain marked text, any other as a link.
  const row = (page: Page, label: string, go: (() => void) | undefined, extra?: React.ReactNode) => {
    if (page === current) {
      return (
        <span className="side-link pick on" aria-current="page">
          <span>{label}</span>
          {extra}
        </span>
      );
    }
    if (!go) return null;
    return (
      <a className="side-link" href={PAGE_PATHS[page]} onClick={follow(go)}>
        <span>{label}</span>
        {extra}
      </a>
    );
  };
  const online =
    runnersOnline !== undefined ? (
      <span className="sl-n" title="online">
        {runnersOnline}
      </span>
    ) : undefined;
  return (
    <>
      <nav className="side-links" aria-label="Pages">
        {row('cockpit', 'Cockpit', onCockpit)}
        {row('apps', 'Apps', onApps)}
        {row('runners', 'Runners', onRunners, online)}
        {row('settings', 'Settings', onSettings)}
        <button type="button" className="side-link feedback-link" onClick={() => setFeedback(true)}>
          <span>Feedback</span>
        </button>
      </nav>
      {feedback && <FeedbackDialog version={version} onClose={() => setFeedback(false)} />}
    </>
  );
};
