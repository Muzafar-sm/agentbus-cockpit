// The cockpit's own words for the things it names, in one place, so a rename
// is one edit here. The nouns match the API (/api/v0/sessions, /agents,
// /runners, /subscriptions). Text the API sends is shown in its own words and
// is not here.

// The product, as the person meets it. Never "control" or "the service" on
// screen: that is the framework's word for its own part.
export const PRODUCT = 'AgentBus';

// One name for a list of turns: the API's "session". Never "conversation" or
// "chat" on screen.
export const SESSION = 'session';
export const SESSIONS = 'sessions';
export const Session = 'Session';
export const Sessions = 'Sessions';

// Where a key or a sign-in is kept, said the same way everywhere.
export const KEPT = `It stays in ${PRODUCT} and is never shown.`;

// Who reads Feedback.
export const FEEDBACK_TEAM = `the ${PRODUCT} team`;

// The one word for loading, with its ellipsis, wherever something is read.
export const LOADING = 'Loading…';

// The one word for leaving a dialog without acting.
export const CANCEL = 'Cancel';

// A harness by its product name, for text on screen. Its id (claude, codex,
// agy) is shown only where it is a literal id or command. The service's own
// label (GET /api/v0/harnesses) wins where the screen has it.
const HARNESS_NAMES: Record<string, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  agy: 'Antigravity',
  opencode: 'OpenCode',
};

export function harnessName(harness: string, label?: string): string {
  return label || HARNESS_NAMES[harness] || harness;
}

// The state words: one lowercase word per state, the same on the session
// card, the chat, the panel, the queue and the runners.
export const STATE = {
  sending: 'sending…',
  queued: 'queued',
  starting: 'starting',
  running: 'running',
  finishing: 'finishing',
  stopping: 'stopping…',
  finished: 'finished',
  stopped: 'stopped',
  failed: 'failed',
  waiting: 'waiting',
  online: 'online',
  offline: 'offline',
} as const;

// A tool call's state, in the Events, Tools and Call views alike.
export const TOOL_STATE = {
  ok: 'ok',
  failed: 'failed',
  running: 'running',
  none: 'no result',
} as const;
