import React from 'react';
import { formatCount } from '../utils/format';
import { ContextWindow } from '../types';

// The practical number of the context view: how full the context is against
// the model's window, and where this vendor's harness compacts. A reusable
// element in the cockpit's theme — a track as wide as the window, a fill as
// wide as what is used, and a mark where compaction begins. It never invents a
// number: an assumed window says so, and a compaction point the vendor does
// not publish is labelled a stated default. It does not compact anything.

// How the fill reads: fine below the compaction mark, close once it reaches it,
// over once it passes the window.
function fillState(percentFull: number, compactionPct?: number): 'ok' | 'near' | 'over' {
  if (percentFull >= 100) return 'over';
  if (compactionPct != null && percentFull >= compactionPct) return 'near';
  return 'ok';
}

// A plain line for where the compaction point comes from, so a stated default
// is never shown as the vendor's own number.
export function compactionNote(w: ContextWindow): string {
  if (w.compaction_pct == null) return 'This harness publishes no compaction point.';
  const harness = w.harness || 'the harness';
  if (w.compaction_source === 'vendor') {
    return w.compaction_is_default
      ? `${harness}'s own compaction point, from its open source.`
      : `A point you set (${harness} compacts near here).`;
  }
  // default: the vendor publishes none.
  return w.compaction_is_default
    ? `A stated default — ${harness} publishes no compaction point. Change it in settings.`
    : `A point you set — ${harness} publishes no compaction point.`;
}

export const ContextMeter: React.FC<{ window: ContextWindow }> = ({ window: w }) => {
  const state = fillState(w.percent_full, w.compaction_pct);
  const fillWidth = Math.min(100, Math.max(0, w.percent_full));
  const windowLabel = `${formatCount(w.window_tokens)} token window${w.window_known ? '' : ' (assumed)'}`;
  return (
    <div className="ctxm">
      <div className="ctxm-head">
        <div className="ctxm-big">
          <b className={`ctxm-pct ${state}`}>{w.percent_full}%</b>
          <span>full</span>
        </div>
        <div className="ctxm-sub">
          <div>{formatCount(w.used_tokens)} of {windowLabel}</div>
          {w.compaction_pct != null && (
            <div className="dim">
              compacts at ~{w.compaction_pct}%
              {w.compaction_source === 'default' && w.compaction_is_default ? ' (a default)' : ''}
            </div>
          )}
        </div>
      </div>
      <div
        className={`ctxm-track ${state}`}
        role="img"
        aria-label={`${w.percent_full}% of the ${windowLabel} used${w.compaction_pct != null ? `, compacts at about ${w.compaction_pct}%` : ''}`}
      >
        <div className="ctxm-fill" style={{ width: `${fillWidth}%` }} />
        {w.compaction_pct != null && w.compaction_pct <= 100 && (
          <div className="ctxm-mark" style={{ left: `${w.compaction_pct}%` }} title={`compacts at ~${w.compaction_pct}%`} />
        )}
      </div>
      {w.compaction_pct != null && (
        <p className="ctxm-note dim">{compactionNote(w)}</p>
      )}
    </div>
  );
};
