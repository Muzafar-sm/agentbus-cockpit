import React, { useState } from 'react';
import { follow, PAGE_PATHS, type Page } from '../page';
import { FeedbackDialog } from './FeedbackDialog';

interface FootNavProps {
  // The page on screen; its own row is left out.
  current: Page;
  // Each target opens its page; absent means the source does not have it, so
  // the row is not shown. onCockpit is the way back from a page.
  onCockpit?: () => void;
  onRunners?: () => void;
  onSettings?: () => void;
  // How many runners are online, shown by the Runners row; undefined before
  // the first read.
  runnersOnline?: number;
  // The AgentBus build, for the Feedback box.
  version?: string;
}

// FootNav is the one foot nav list, shown the same way on the cockpit and on
// every page: the cockpit and the pages as equal rows, each at its own address,
// with the row of the page you are on left out. Feedback opens a small box
// rather than a page, so it is always shown; this owns that box, so the cockpit
// and the pages both open it the same way.
export const FootNav: React.FC<FootNavProps> = ({
  current,
  onCockpit,
  onRunners,
  onSettings,
  runnersOnline,
  version,
}) => {
  const [feedback, setFeedback] = useState(false);
  return (
    <>
      <nav className="side-links" aria-label="Pages">
        {current !== 'cockpit' && onCockpit && (
          <a className="side-link" href={PAGE_PATHS.cockpit} onClick={follow(onCockpit)}>
            <span>Cockpit</span>
          </a>
        )}
        {current !== 'runners' && onRunners && (
          <a className="side-link" href={PAGE_PATHS.runners} onClick={follow(onRunners)}>
            <span>Runners</span>
            {runnersOnline !== undefined && (
              <span className="sl-n" title="online">
                {runnersOnline}
              </span>
            )}
          </a>
        )}
        {current !== 'settings' && onSettings && (
          <a className="side-link" href={PAGE_PATHS.settings} onClick={follow(onSettings)}>
            <span>Settings</span>
          </a>
        )}
        <button type="button" className="side-link feedback-link" onClick={() => setFeedback(true)}>
          <span>Feedback</span>
        </button>
      </nav>
      {feedback && <FeedbackDialog version={version} onClose={() => setFeedback(false)} />}
    </>
  );
};
