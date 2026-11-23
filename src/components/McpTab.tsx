import React from 'react';
import { Toolbox, ToolboxTool, toolState } from '../data/toolbox';

interface McpTabProps {
  box: Toolbox | null;
  running: boolean;
}

// The turn's toolbox by source: AgentBus tools with each one's state, and any
// other tool server in the record.
export const McpTab: React.FC<McpTabProps> = ({ box, running }) => {
  if (!box) {
    return (
      <p className="empty mcp-off">
        {running ? 'No AgentBus tools yet.' : 'AgentBus tools are off. Settings › Permissions › AgentBus tools turns them on.'}
      </p>
    );
  }
  return (
    <div className="mcp">
      <div className="sub-h">AgentBus tools</div>
      {!box.listed && <p className="dim mcp-note">No tool list in the record. These are the tools its calls used.</p>}
      {box.agentbus.length ? <Tools tools={box.agentbus} server={box.server} /> : <p className="dim">No AgentBus tools yet.</p>}

      {box.other.map((s) => (
        <React.Fragment key={s.server}>
          <div className="sub-h">Other tool server: {s.server}</div>
          <Tools tools={s.tools} server={s.server} />
        </React.Fragment>
      ))}
    </div>
  );
};

const Tools: React.FC<{ tools: ToolboxTool[]; server: string }> = ({ tools, server }) => (
  <div className="grid-scroll">
  <table className="grid mcp-t">
    <tbody>
      {tools.map((t) => (
        <tr key={t.name}>
          <td title={`mcp__${server}__${t.name}`}>
            <code>{t.name}</code>
          </td>
          <td className={t.uses > 0 ? 'ok' : 'dim'}>{toolState(t)}</td>
        </tr>
      ))}
    </tbody>
  </table>
  </div>
);
