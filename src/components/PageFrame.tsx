import React from 'react';
import { FootNav } from './FootNav';
import type { Page } from '../page';

interface PageFrameProps {
  title: string;
  // current is the page this frame is, so the foot nav leaves its row out.
  // onBack is the Cockpit row, the way back. onRunners and onSettings open the
  // sibling pages, absent when the source does not have them; runnersOnline and
  // version feed the nav's Runners count and its Feedback box.
  current: Page;
  onBack: () => void;
  onRunners?: () => void;
  onSettings?: () => void;
  runnersOnline?: number;
  version?: string;
  // The left column: the list to pick from, and a quiet note at its foot.
  list: React.ReactNode;
  foot?: React.ReactNode;
  // The middle column (what was picked) and the right one (its detail).
  main: React.ReactNode;
  side: React.ReactNode;
}

// PageFrame is a page of its own beside the cockpit, in the mockup's three
// columns: a list with the page's title, then what was picked, then its detail.
// Each column scrolls on its own. The way back to the cockpit is the Cockpit row
// in the one foot nav (FootNav), the same list the cockpit shows.
export const PageFrame: React.FC<PageFrameProps> = ({
  title,
  current,
  onBack,
  onRunners,
  onSettings,
  runnersOnline,
  version,
  list,
  foot,
  main,
  side,
}) => (
  <div id="page" className="page" aria-label={title}>
    <aside className="pg-list">
      <header className="colhead">
        <h1 className="colhead-title">{title}</h1>
      </header>
      <div className="colbody">{list}</div>
      <div className="pg-foot">
        {foot}
        <FootNav
          current={current}
          onCockpit={onBack}
          onRunners={onRunners}
          onSettings={onSettings}
          runnersOnline={runnersOnline}
          version={version}
        />
      </div>
    </aside>
    <main className="pg-main">{main}</main>
    <section className="pg-side">{side}</section>
  </div>
);

// ColHead is a column's 72px header row: a title, a quiet note after it, and
// an action on the right.
export const ColHead: React.FC<{ title: React.ReactNode; sub?: React.ReactNode; action?: React.ReactNode }> = ({
  title,
  sub,
  action,
}) => (
  <header className="colhead">
    <div className="colhead-title">
      {title}
      {sub && <span className="ch-sub">{sub}</span>}
    </div>
    {action}
  </header>
);

