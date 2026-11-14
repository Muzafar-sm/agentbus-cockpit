import React from 'react';
import { LOADING } from '../words';

// One look for every message that is not data: an error is red, a warning
// amber. An error is something that did not happen (a refusal, a failed
// read); a warning is something to know before acting (files not applied, a
// folder too big to track). inline sits inside a line of text.
export type NoticeKind = 'error' | 'warn';

export const Notice: React.FC<{
  kind: NoticeKind;
  inline?: boolean;
  className?: string;
  role?: string;
  title?: string;
  children: React.ReactNode;
}> = ({ kind, inline, className, role, title, children }) => {
  const cls = `${kind === 'error' ? 'form-error' : 'form-warn'}${className ? ` ${className}` : ''}`;
  const r = role;
  return inline ? (
    <span className={cls} role={r} title={title}>
      {children}
    </span>
  ) : (
    <div className={cls} role={r} title={title}>
      {children}
    </div>
  );
};

// Text with `code` spans, for the cockpit's own messages that name a
// command: each backticked part is shown as code, never as backticks.
export const WithCode: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split(/(`[^`]+`)/).map((part, i) =>
      part.startsWith('`') && part.endsWith('`') && part.length > 1 ? <code key={i}>{part.slice(1, -1)}</code> : part,
    )}
  </>
);

// The one loading line: one word, with its ellipsis.
export const Loading: React.FC<{ className?: string }> = ({ className }) => (
  <p className={`dim loading${className ? ` ${className}` : ''}`}>{LOADING}</p>
);
