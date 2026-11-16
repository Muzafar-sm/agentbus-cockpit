import React, { useState } from 'react';
import { follow, PAGE_PATHS } from '../page';
import { SavedAgent, SubscriptionList } from '../types';
import { FeedbackDialog } from './FeedbackDialog';
import { PlusIcon } from './Icons';
import { PlanUsage, usageOf } from './PlanUsage';
import { SignInDot, signInOf } from './SignInDot';
import { Button } from './Controls';
import { ConfirmDialog } from './Dialog';
import { PRODUCT } from '../words';

interface AgentsColumnProps {
  agents: SavedAgent[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
  sourceLabel?: string;
  // The live stream: true while it is up, false while it reconnects,
  // undefined for a source with no stream (recorded data): no dot then.
  streamUp?: boolean;
  onDisconnect?: () => void;
  disconnectLabel?: string;
  // Given only when the source keeps saved agents: "+ Agent" opens the form,
  // and a saved agent's row can be edited and removed. A remove answers
  // with the API's words when it is refused.
  onAddAgent?: () => void;
  onEditAgent?: (agent: SavedAgent) => void;
  onRemoveAgent?: (agentId: string) => Promise<void>;
  // Given only when the source lists runners (GET /api/v0/runners): opens
  // the Runners page. runnersOnline is how many are online; undefined
  // before the first read.
  onRunners?: () => void;
  runnersOnline?: number;
  // Given only when the source keeps settings: opens the Settings page.
  onSettings?: () => void;
  // The service's build, from GET /api/v0/version, shown on the AgentBus card.
  version?: string;
  // The subscriptions control keeps (GET /api/v0/subscriptions), for each
  // agent's sign-in dot and how much of its plan is left; undefined before
  // the first read, null when the service keeps none. onOpenSignIn opens
  // Settings → Subscriptions.
  subscriptions?: SubscriptionList | null;
  onOpenSignIn?: () => void;
}

// The Agents column: the saved agents, in the order the service lists them,
// each with its access and model. A session is a list of turns and each turn
// names its own agent, so no session is listed under an agent here: the
// Sessions column lists them all. Selecting an agent marks it for "+ Session".
export const AgentsColumn: React.FC<AgentsColumnProps> = ({
  agents,
  selectedAgentId,
  onSelectAgent,
  sourceLabel = '',
  streamUp,
  onDisconnect,
  disconnectLabel = 'Disconnect',
  onAddAgent,
  onEditAgent,
  onRemoveAgent,
  onRunners,
  runnersOnline,
  onSettings,
  version,
  subscriptions,
  onOpenSignIn,
}) => {
  // The agent whose Remove asks first, as every remove does; its answer and
  // any refusal show in the confirm.
  const [removing, setRemoving] = useState<SavedAgent | null>(null);
  const [feedback, setFeedback] = useState(false);

  return (
    <aside id="agents">
      <header className="colhead">
        <div className="colhead-title">Agents</div>
        {onAddAgent && (
          <Button kind="quiet" className="add-agent" onClick={onAddAgent} aria-label="Add agent" title="Add agent">
            <PlusIcon />
            Agent
          </Button>
        )}
      </header>
      <div className="colbody">
        {agents.length === 0 && (
          <p className="empty agents-empty">No agents yet.</p>
        )}
        {agents.map((a) => {
          const isSelected = selectedAgentId === a.id;
          const body = (
            <>
              <span className={`mark ${a.harness}`}>
                {agentMark(a)}
                <SignInDot signIn={signInOf(a, subscriptions)} onOpen={onOpenSignIn} />
              </span>
              <span className="ag-t">
                <b>{a.name}</b>
                <span className="q-l">{savedLine(a)}</span>
                <PlanUsage usage={usageOf(a, subscriptions)} />
              </span>
            </>
          );
          const canChange = !!(onEditAgent || onRemoveAgent);
          // The selected saved agent's row carries Edit and Remove, so it is
          // not a button itself.
          if (isSelected && canChange) {
            return (
              <div key={a.id} className="side-chat agent pick on" data-agent={a.id}>
                {body}
                <span className="ag-act">
                  {onEditAgent && (
                    <Button kind="secondary" small className="ag-edit" onClick={() => onEditAgent(a)}>
                      Edit
                    </Button>
                  )}
                  {onRemoveAgent && (
                    <Button kind="secondary" small className="ag-remove" onClick={() => setRemoving(a)}>
                      Remove
                    </Button>
                  )}
                </span>
              </div>
            );
          }
          return (
            <button
              key={a.id}
              className={`side-chat agent pick${isSelected ? ' on' : ''}`}
              data-agent={a.id}
              onClick={() => onSelectAgent(a.id)}
            >
              {body}
            </button>
          );
        })}
      </div>
      {removing && onRemoveAgent && (
        <ConfirmDialog
          className="ag-remove-ask"
          title={`Remove ${removing.name}?`}
          line="Its sessions stay. You can add the agent again."
          action="Remove"
          busyAction="Removing…"
          onConfirm={() => onRemoveAgent(removing.id)}
          onClose={() => setRemoving(null)}
        />
      )}

      {/* The foot stays put while the list above it scrolls: the links to
          the cockpit's own pages, then the AgentBus this cockpit reads, as one
          card: its name, its build, a live dot and where the data comes from. */}
      <div className="brand-foot">
        {/* Quiet links to the cockpit's own pages, each at its address, and
            Feedback, which opens a small box rather than a page. */}
        <nav className="side-links" aria-label="Pages">
          {onRunners && (
            <a className="side-link" href={PAGE_PATHS.runners} onClick={follow(onRunners)}>
              <span>Runners</span>
              {runnersOnline !== undefined && (
                <span className="sl-n" title="online">
                  {runnersOnline}
                </span>
              )}
            </a>
          )}
          {onSettings && (
            <a className="side-link" href={PAGE_PATHS.settings} onClick={follow(onSettings)}>
              <span>Settings</span>
            </a>
          )}
          <button type="button" className="side-link feedback-link" onClick={() => setFeedback(true)}>
            <span>Feedback</span>
          </button>
        </nav>
        {feedback && <FeedbackDialog version={version} onClose={() => setFeedback(false)} />}
        <div className="bus-card">
          <span className="bc-row">
            <b className="brand">
              {PRODUCT}
              {version && " "}
              {version && (
                <span className="bc-v" title="its build">
                  {version}
                </span>
              )}
            </b>
          </span>
          <span className="bc-a gw">
            {streamUp !== undefined && (
              <i
                className={`live${streamUp ? '' : ' down'}`}
                title={streamUp ? 'Live' : 'Reconnecting'}
                aria-label={streamUp ? 'Live' : 'Reconnecting'}
              />
            )}
            <span className="bc-addr">{sourceLabel}</span>
            {onDisconnect && (
              <Button kind="link" className="disconnect" onClick={onDisconnect}>
                {disconnectLabel}
              </Button>
            )}
          </span>
        </div>
      </div>
    </aside>
  );
};

// The letter on an agent's mark: its harness's, else its name's first.
function agentMark(a: SavedAgent): string {
  if (a.harness === 'claude') return 'C';
  if (a.harness === 'codex') return 'X';
  return a.name.charAt(0).toUpperCase();
}

// A saved agent's access and model, in a few words, such as "subscription · haiku".
function savedLine(a: SavedAgent): string {
  const access = a.access === 'subscription' ? 'subscription' : a.access === 'openrouter' ? 'OpenRouter' : a.access;
  return a.model ? `${access} · ${a.model}` : access;
}
