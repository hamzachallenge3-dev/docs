import { config, modelConfigured } from '../config.js';
import { redactSecrets } from '../security/redact.js';

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
}

export interface ModelToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ModelResponse {
  content: string;
  tool_calls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  provider: 'live' | 'heuristic' | 'blocked';
  raw?: unknown;
}

export function modelStatus(): {
  configured: boolean;
  url: string | null;
  name: string;
  readiness: 'ready' | 'blocked';
  reason: string;
} {
  if (!modelConfigured()) {
    return {
      configured: false,
      url: null,
      name: config.modelName,
      readiness: 'blocked',
      reason: 'ECC68_MODEL_URL not set — live model execution blocked; heuristic executor available for tests',
    };
  }
  return {
    configured: true,
    url: config.modelUrl,
    name: config.modelName,
    readiness: 'ready',
    reason: 'OpenAI-compatible free endpoint configured',
  };
}

export async function callModel(opts: {
  system: string;
  messages: ModelMessage[];
  tools: ModelToolSpec[];
  agentId: string;
}): Promise<ModelResponse> {
  const status = modelStatus();
  if (status.readiness === 'blocked') {
    return heuristicRespond(opts);
  }

  const body = {
    model: config.modelName,
    messages: [{ role: 'system', content: opts.system }, ...opts.messages],
    tools: opts.tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    })),
    tool_choice: 'auto',
    temperature: 0.2,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.modelApiKey) headers.Authorization = `Bearer ${config.modelApiKey}`;

  const url = config.modelUrl.replace(/\/$/, '') + '/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`model HTTP ${res.status}: ${redactSecrets(text).slice(0, 500)}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
      };
    }>;
  };
  const msg = json.choices?.[0]?.message;
  const tool_calls =
    msg?.tool_calls?.map((tc) => {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments || '{}');
      } catch {
        args = { raw: tc.function.arguments };
      }
      return { id: tc.id, name: tc.function.name, arguments: args };
    }) ?? [];
  return {
    content: msg?.content || '',
    tool_calls,
    provider: 'live',
    raw: json,
  };
}

/** Deterministic offline executor for tests when no free model endpoint exists. */
function heuristicRespond(opts: {
  system: string;
  messages: ModelMessage[];
  tools: ModelToolSpec[];
  agentId: string;
}): ModelResponse {
  const lastUser = [...opts.messages].reverse().find((m) => m.role === 'user')?.content || '';
  const toolNames = new Set(opts.tools.map((t) => t.name));
  const stepHint = opts.messages.filter((m) => m.role === 'tool').length;

  // Chief: emit a routing plan artifact then stop.
  if (opts.agentId === 'ecc-chief-of-staff' && stepHint === 0 && toolNames.has('workspace_write')) {
    return {
      provider: 'heuristic',
      content: '',
      tool_calls: [
        {
          id: 'h1',
          name: 'workspace_write',
          arguments: {
            path: 'artifacts/routing-plan.json',
            content: JSON.stringify(
              {
                agent: opts.agentId,
                task: lastUser.slice(0, 500),
                note: 'heuristic chief routing artifact',
              },
              null,
              2
            ),
          },
        },
      ],
    };
  }

  // First step: inspect workspace
  if (stepHint === 0 && toolNames.has('workspace_list')) {
    return {
      provider: 'heuristic',
      content: '',
      tool_calls: [{ id: 'h1', name: 'workspace_list', arguments: { path: '.' } }],
    };
  }

  // Second step: write agent-specific deliverable
  if (stepHint === 1 && toolNames.has('workspace_write')) {
    const report = {
      agent_id: opts.agentId,
      mode: 'heuristic',
      task_excerpt: lastUser.slice(0, 300),
      findings: [
        `${opts.agentId} inspected the workspace and produced a role-specific report.`,
        'Live model blocked or unavailable; heuristic path used.',
      ],
      evidence: ['workspace_list executed'],
      status: 'completed_offline',
    };
    return {
      provider: 'heuristic',
      content: '',
      tool_calls: [
        {
          id: 'h2',
          name: 'workspace_write',
          arguments: {
            path: `artifacts/${opts.agentId}-report.json`,
            content: JSON.stringify(report, null, 2),
          },
        },
      ],
    };
  }

  // Final answer
  return {
    provider: 'heuristic',
    content: JSON.stringify(
      {
        agent_id: opts.agentId,
        summary: `Completed ${opts.agentId} task via ${modelConfigured() ? 'model' : 'heuristic'} path.`,
        task: lastUser.slice(0, 200),
      },
      null,
      2
    ),
    tool_calls: [],
  };
}
