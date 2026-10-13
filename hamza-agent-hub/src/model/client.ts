import { config, modelConfigured } from '../config.js';
import { redactSecrets } from '../security/redact.js';

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
}

export function modelStatus() {
  if (!modelConfigured()) {
    return {
      configured: false,
      readiness: 'blocked' as const,
      reason: 'HAH_MODEL_URL unset — live model BLOCKED; heuristic path available',
      profiles: {
        glm_lab: Boolean(config.modelProfiles.glm_lab),
        headroom_lab: Boolean(config.modelProfiles.headroom_lab),
        free: Boolean(config.modelProfiles.free),
      },
    };
  }
  return {
    configured: true,
    readiness: 'ready' as const,
    reason: 'OpenAI-compatible free endpoint configured',
    profiles: {
      glm_lab: Boolean(config.modelProfiles.glm_lab),
      headroom_lab: Boolean(config.modelProfiles.headroom_lab),
      free: Boolean(config.modelProfiles.free),
    },
  };
}

export async function callModel(opts: {
  system: string;
  messages: ModelMessage[];
  tools: string[];
  agentId: string;
}): Promise<{
  content: string;
  tool_calls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  provider: 'live' | 'heuristic';
}> {
  if (!modelConfigured()) return heuristic(opts);

  const body = {
    model: config.modelName,
    messages: [{ role: 'system', content: opts.system }, ...opts.messages],
    tools: opts.tools.map((name) => ({
      type: 'function',
      function: { name, description: name, parameters: { type: 'object', properties: {} } },
    })),
    temperature: 0.2,
  };
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.modelApiKey) headers.Authorization = `Bearer ${config.modelApiKey}`;
  const res = await fetch(config.modelUrl.replace(/\/$/, '') + '/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`model HTTP ${res.status}: ${redactSecrets(await res.text()).slice(0, 400)}`);
  const json = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
      };
    }>;
  };
  const msg = json.choices?.[0]?.message;
  return {
    provider: 'live',
    content: msg?.content || '',
    tool_calls:
      msg?.tool_calls?.map((tc) => {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || '{}');
        } catch {
          args = { raw: tc.function.arguments };
        }
        return { id: tc.id, name: tc.function.name, arguments: args };
      }) ?? [],
  };
}

function heuristic(opts: {
  messages: ModelMessage[];
  tools: string[];
  agentId: string;
}): {
  content: string;
  tool_calls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  provider: 'heuristic';
} {
  const tools = new Set(opts.tools);
  const step = opts.messages.filter((m) => m.role === 'tool').length;
  const lastUser = [...opts.messages].reverse().find((m) => m.role === 'user')?.content || '';

  if (opts.agentId === 'hub-boss' && step === 0 && tools.has('workspace_write')) {
    return {
      provider: 'heuristic',
      content: '',
      tool_calls: [
        {
          id: 'h1',
          name: 'workspace_write',
          arguments: {
            path: 'artifacts/hub-boss-plan.json',
            content: JSON.stringify({ agent: 'hub-boss', task: lastUser.slice(0, 400) }, null, 2),
          },
        },
      ],
    };
  }

  if (opts.agentId.startsWith('desk-') && step === 0) {
    if (tools.has('clean_leads') && /email|lead|@/i.test(lastUser)) {
      return {
        provider: 'heuristic',
        content: '',
        tool_calls: [{ id: 'h1', name: 'clean_leads', arguments: { text: lastUser } }],
      };
    }
    if (tools.has('sheets_to_json') && /csv|,|\t/i.test(lastUser)) {
      const csvMatch = lastUser.match(/```([\s\S]*?)```/) || lastUser.match(/(?:\n|^)([^\n]+,[^\n]+(?:\n[^\n]+)*)/);
      return {
        provider: 'heuristic',
        content: '',
        tool_calls: [{ id: 'h1', name: 'sheets_to_json', arguments: { csv: csvMatch?.[1] || 'week,value\n1,10\n2,12' } }],
      };
    }
    if (tools.has('extract_contacts')) {
      return {
        provider: 'heuristic',
        content: '',
        tool_calls: [{ id: 'h1', name: 'extract_contacts', arguments: { html: lastUser } }],
      };
    }
  }

  if (opts.agentId.startsWith('forge-') && step === 0) {
    if (tools.has('forge_detect') && /https?:\/\//i.test(lastUser)) {
      const url = lastUser.match(/https?:\/\/[^\s)]+/)?.[0] || '';
      return {
        provider: 'heuristic',
        content: '',
        tool_calls: [{ id: 'h1', name: 'forge_detect', arguments: { url } }],
      };
    }
    if (tools.has('agent_mining_queries')) {
      return { provider: 'heuristic', content: '', tool_calls: [{ id: 'h1', name: 'agent_mining_queries', arguments: {} }] };
    }
  }

  if (step === 0 && tools.has('workspace_list')) {
    return {
      provider: 'heuristic',
      content: '',
      tool_calls: [{ id: 'h1', name: 'workspace_list', arguments: { path: '.' } }],
    };
  }

  if (step >= 1 && tools.has('workspace_write')) {
    return {
      provider: 'heuristic',
      content: '',
      tool_calls: [
        {
          id: 'h2',
          name: 'workspace_write',
          arguments: {
            path: `artifacts/${opts.agentId}-report.json`,
            content: JSON.stringify(
              {
                agent_id: opts.agentId,
                mode: 'heuristic',
                task_excerpt: lastUser.slice(0, 300),
                status: 'completed_offline',
              },
              null,
              2
            ),
          },
        },
      ],
    };
  }

  return {
    provider: 'heuristic',
    content: JSON.stringify({
      agent_id: opts.agentId,
      summary: `Completed ${opts.agentId} via heuristic path`,
      task: lastUser.slice(0, 200),
    }, null, 2),
    tool_calls: [],
  };
}
