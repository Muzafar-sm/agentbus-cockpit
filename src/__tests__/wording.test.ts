import { describe, expect, it } from 'vitest';

// The cockpit names the service AgentBus. "control" is the framework's own
// word for the side that holds the sign-ins, and it came back into messages
// the person reads ("an older control", "This control cannot list…"). This
// reads every string and JSX text in the sources, comments left out.
const sources = import.meta.glob(['../**/*.ts', '../**/*.tsx', '!../__tests__/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function shown(src: string): string[] {
  const plain = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
  const strings = plain.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`|>[^<>{}();=]+</g) ?? [];
  // An import path names a file, not the service.
  return strings.filter((s) => !/^['"]\.{1,2}\//.test(s));
}

describe('wording', () => {
  it('no message calls the service "control"', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20);
    const found: string[] = [];
    for (const [f, src] of Object.entries(sources)) {
      for (const s of shown(src)) if (/\bcontrol\b/i.test(s)) found.push(`${f}: ${s}`);
    }
    expect(found).toEqual([]);
  });

  it('the scan sees a string that says it', () => {
    expect(shown(`const a = 'This control cannot list'; // control in a comment`)).toEqual(["'This control cannot list'"]);
  });
});
