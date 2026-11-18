import React from 'react';
import { formatCount } from '../utils/format';
import { ContextWindow } from '../types';

// How full the context is against the model's window, and where this vendor's
// harness compacts: the practical number of the context view. A thin track as
// wide as the window, a fill as wide as what is used, a mark where compaction
// begins. It never invents a number — an assumed window and a stated-default
// compaction point both say so, in a word. It does not compact anything.

// The fill reads red once it passes the window; below that it stays in the
// cockpit's own ink, as the other tabs do. There is no third colour.
function over(percentFull: number): boolean {
  return percentFull >= 100;
}

export const ContextMeter: React.FC<{ window: ContextWindow }> = ({ window: w }) => {
  const fillWidth = Math.min(100, Math.max(0, w.percent_full));
  const windowLabel = `${formatCount(w.window_tokens)} token window${w.window_known ? '' : ' (assumed)'}`;
  const showMark = w.compaction_pct != null && w.compaction_pct <= 100;
  const defaulted = w.compaction_source === 'default' && w.compaction_is_default;
  return (
    <>
      <div className="tab-sum">
        <b className={over(w.percent_full) ? 'bad' : undefined}>{w.percent_full}% full</b>
        <span className="sep"> · </span>
        {formatCount(w.used_tokens)} of {windowLabel}
        {w.compaction_pct != null && (
          <>
            <span className="sep"> · </span>
            compacts ~{w.compaction_pct}%{defaulted ? <span className="dim"> (default)</span> : null}
          </>
        )}
      </div>
      <div
        className={`ctx-meter${over(w.percent_full) ? ' over' : ''}`}
        role="img"
        aria-label={`${w.percent_full}% of the ${windowLabel} used${w.compaction_pct != null ? `, compacts at about ${w.compaction_pct}%` : ''}`}
      >
        <i style={{ width: `${fillWidth}%` }} />
        {showMark && <span className="mk" style={{ left: `${w.compaction_pct}%` }} title={`compacts ~${w.compaction_pct}%`} />}
      </div>
    </>
  );
};
