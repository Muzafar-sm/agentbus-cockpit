import React from 'react';
import { SavedAgent, SubscriptionList } from '../types';
import { harnessName } from '../words';

// A saved agent's sign-in, as one dot: green when its tool is connected,
// yellow when it is not or its sign-in expired. It is read from the one place
// that answers it, the subscriptions control keeps (GET /api/v0/subscriptions):
// its connected sign-ins, the stored keys (api_keys) and the environment
// variables agents name in key_env (env_keys). Nothing is blocked by it; a
// turn whose tool is not connected is refused when it starts.
export interface SignIn {
  ok: boolean;
  title: string;
}

// signInOf is the dot for agent, or undefined when nothing can say yet: the
// subscriptions are not read (or the service keeps none), or the agent's
// access is none of subscription, openrouter or api.
// The key an agent on access "api" uses, by its harness: the label a person
// reads, and the api_keys name it is stored under on subscriptions.
const apiKeyLabel: Record<string, string> = { claude: 'Anthropic API key', codex: 'OpenAI API key', agy: 'Gemini API key' };
const apiKeyName: Record<string, string> = { claude: 'anthropic', codex: 'openai', agy: 'gemini' };

export function signInOf(agent: SavedAgent, subs: SubscriptionList | null | undefined): SignIn | undefined {
  if (agent.access === 'subscription') {
    if (!subs) return undefined;
    const s = subs.subscriptions.find((x) => x.harness === agent.harness);
    const h = harnessName(agent.harness);
    if (s?.expired) return { ok: false, title: `${h}'s sign-in expired — open Settings to connect again` };
    if (s?.connected) return { ok: true, title: `${h} is connected` };
    return { ok: false, title: `${h} is not connected — open Settings to connect` };
  }
  if (!subs) return undefined; // the one source; nothing to say until it is read
  if (agent.access === 'openrouter') {
    // A key set in Settings, or the environment variable the agent names.
    const inSettings = subs.api_keys?.openrouter?.set;
    const inEnv = agent.key_env ? subs.env_keys?.[agent.key_env] : undefined;
    if (inSettings || inEnv) return { ok: true, title: 'OpenRouter key is set' };
    return { ok: false, title: 'OpenRouter key is not set — open Settings to add it' };
  }
  if (agent.access === 'api') {
    // The vendor's key set in Settings, by the name it is stored under.
    const key = apiKeyLabel[agent.harness] ?? `${harnessName(agent.harness)}'s API key`;
    return subs.api_keys?.[apiKeyName[agent.harness]]?.set
      ? { ok: true, title: `${key} is set` }
      : { ok: false, title: `${key} is not set — open Settings to add it` };
  }
  return undefined;
}

// SignInDot is the dot itself, in the Runners page's dot style. With onOpen
// a click opens Settings → Subscriptions, the one place to connect. It is a
// span with a button's role, as it sits inside an agent row that is itself a
// button.
export const SignInDot: React.FC<{ signIn: SignIn | undefined; onOpen?: () => void }> = ({ signIn, onOpen }) => {
  if (!signIn) return null;
  const cls = `rn-dot signin-dot${signIn.ok ? '' : ' pending'}${onOpen ? ' opens' : ''}`;
  if (!onOpen) return <span className={cls} data-signin={signIn.ok ? 'ok' : 'no'} title={signIn.title} aria-label={signIn.title} role="img" />;
  const open = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onOpen();
  };
  return (
    <span
      className={cls}
      data-signin={signIn.ok ? 'ok' : 'no'}
      title={signIn.title}
      aria-label={signIn.title}
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') open(e);
      }}
    />
  );
};
