import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { callModel, type ModelMessage, type ModelToolSpec } from '../model/client.js';
import { planWithChief, listSpecialists } from '../router/chief.js';
import { getAgent, loadRoleInstructions } from './registry.js';
import { appendEvent, getTask, updateTask } from '../storage/db.js';
import { ensureWorkspace } from '../security/workspace.js';
import { runWorkspaceTool, type ToolCall } from '../tools/workspaceTools.js';
import { redactSecrets } from '../security/redact.js';

const TOOL_SPECS: Record<string, ModelToolSpec> = {
  workspace_list: {
    name: 'workspace_list',
    description: 'List files in a relative workspace path',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' } },
    },
  },
  workspace_read: {
    name: 'workspace_read',
    description: 'Read a text file from the workspace',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
  workspace_write: {
    name: 'workspace_write',
    description: 'Write a text file inside the workspace',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' } },
      required: ['path', 'content'],
    },
  },
  workspace_mkdir: {
    name: 'workspace_mkdir',
    description: 'Create a directory inside the workspace',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
  workspace_stat: {
    name: 'workspace_stat',
    description: 'Stat a workspace path',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
  workspace_grep: {
    name: 'workspace_grep',
    description: 'Search workspace files for a regex pattern',
    parameters: {
      type: 'object',
      properties: { pattern: { type: 'string' }, path: { type: 'string' } },
      required: ['pattern'],
    },
  },
  list_specialists: {
    name: 'list_specialists',
    description: 'List specialist agents for routing (chief-of-staff only)',
    parameters: { type: 'object', properties: {} },
  },
  dispatch_agent: {
    name: 'dispatch_agent',
    description: 'Record a routing assignment to a specialist (chief-of-staff only)',
    parameters: {
      type: 'object',
      properties: {
        agent_id: { type: 'string' },
        subtask: { type: 'string' },
      },
      required: ['agent_id', 'subtask'],
    },
  },
};

export async function executeTask(taskId: string, signal: AbortSignal): Promise<void> {
  const task = getTask(taskId);
  if (!task) throw new Error(`missing task ${taskId}`);
  if (task.status === 'cancelled') return;

  const agent = getAgent(task.agent_id);
  if (!agent) {
    updateTask(taskId, {
      status: 'failed',
      error: `unknown agent ${task.agent_id}`,
      finished_at: Date.now(),
      progress: 1,
    });
    return;
  }

  const workspaceRoot = ensureWorkspace(task.workspace_id);
  const role = loadRoleInstructions(agent.id);
  const toolLog: unknown[] = [];
  const artifacts: string[] = [];
  const evidence: string[] = [];
  const messages: ModelMessage[] = [];

  // Chief-of-staff differentiates work before the loop.
  let effectiveTask = task.task;
  let routingNote = '';
  if (agent.id === 'ecc-chief-of-staff' || agent.category === 'orchestrator') {
    const plan = planWithChief(task.task, agent.id);
    routingNote = JSON.stringify(plan, null, 2);
    const planPath = path.join(workspaceRoot, 'artifacts');
    fs.mkdirSync(planPath, { recursive: true });
    const rel = 'artifacts/chief-routing-plan.json';
    fs.writeFileSync(path.join(workspaceRoot, rel), routingNote, 'utf8');
    artifacts.push(rel);
    evidence.push(`chief routed primary=${plan.primary}`);
    appendEvent(taskId, 'routing', plan);
    effectiveTask = [
      'You are the chief-of-staff. Differentiate and assign this work.',
      `Routing plan:\n${routingNote}`,
      `Original task:\n${task.task}`,
      'Write a final assignment brief and use dispatch_agent for each specialist.',
    ].join('\n\n');
  }

  const allowedTools = agent.tools;
  const toolSpecs = allowedTools.map((n) => TOOL_SPECS[n]).filter(Boolean);

  const system = [
    `You are ECC agent ${agent.id} (${agent.category}).`,
    'Follow the role instructions. Use only permitted tools.',
    'Stay inside the assigned workspace. Do not claim success without tool evidence.',
    'Do not spend money, send unauthorized messages, or execute host shell commands.',
    '--- ROLE INSTRUCTIONS ---',
    role.slice(0, 24_000),
  ].join('\n');

  messages.push({ role: 'user', content: effectiveTask });

  const started = Date.now();
  let finalContent = '';

  for (let step = 0; step < config.maxSteps; step++) {
    if (signal.aborted) {
      updateTask(taskId, {
        status: 'cancelled',
        finished_at: Date.now(),
        progress_message: 'cancelled',
        tool_log: JSON.stringify(toolLog),
        artifacts: JSON.stringify(artifacts),
        evidence: JSON.stringify(evidence),
      });
      appendEvent(taskId, 'cancelled', { step });
      return;
    }
    if (Date.now() - started > config.taskTimeoutMs) {
      updateTask(taskId, {
        status: 'failed',
        error: 'task timeout',
        finished_at: Date.now(),
        progress: 1,
        tool_log: JSON.stringify(toolLog),
        artifacts: JSON.stringify(artifacts),
        evidence: JSON.stringify(evidence),
      });
      appendEvent(taskId, 'timeout', {});
      return;
    }

    updateTask(taskId, {
      progress: (step + 1) / (config.maxSteps + 1),
      progress_message: `step ${step + 1}`,
    });
    appendEvent(taskId, 'step_start', { step });

    let response;
    try {
      response = await callModel({
        system,
        messages,
        tools: toolSpecs,
        agentId: agent.id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      updateTask(taskId, {
        status: 'failed',
        error: redactSecrets(msg),
        finished_at: Date.now(),
        progress: 1,
        tool_log: JSON.stringify(toolLog),
        artifacts: JSON.stringify(artifacts),
        evidence: JSON.stringify(evidence),
      });
      appendEvent(taskId, 'model_error', { error: redactSecrets(msg) });
      return;
    }

    evidence.push(`model:${response.provider}:step${step}`);
    appendEvent(taskId, 'model_response', {
      provider: response.provider,
      content: redactSecrets(response.content).slice(0, 2000),
      tool_calls: response.tool_calls.map((t) => t.name),
    });

    if (!response.tool_calls.length) {
      finalContent = response.content || finalContent;
      break;
    }

    messages.push({
      role: 'assistant',
      content: response.content || '',
    });

    for (const tc of response.tool_calls) {
      if (signal.aborted) break;
      const result = await invokeTool(allowedTools, workspaceRoot, taskId, {
        name: tc.name,
        arguments: tc.arguments,
      });
      toolLog.push({ tool: tc.name, args: tc.arguments, result: result.output.slice(0, 2000), ok: result.ok });
      if (result.artifact) artifacts.push(result.artifact);
      evidence.push(`tool:${tc.name}:${result.ok ? 'ok' : 'fail'}`);
      messages.push({
        role: 'tool',
        name: tc.name,
        content: result.output.slice(0, 8000),
      });
    }
  }

  const current = getTask(taskId);
  if (current?.status === 'cancelled') return;

  if (!finalContent) {
    finalContent = JSON.stringify(
      {
        agent_id: agent.id,
        summary: 'Reached step limit with tool evidence',
        artifacts,
        routing: routingNote ? 'see artifacts/chief-routing-plan.json' : undefined,
      },
      null,
      2
    );
  }

  updateTask(taskId, {
    status: 'completed',
    output: redactSecrets(finalContent),
    progress: 1,
    progress_message: 'completed',
    finished_at: Date.now(),
    tool_log: JSON.stringify(toolLog),
    artifacts: JSON.stringify([...new Set(artifacts)]),
    evidence: JSON.stringify(evidence),
  });
  appendEvent(taskId, 'completed', { artifacts });
}

async function invokeTool(
  allowed: string[],
  workspaceRoot: string,
  taskId: string,
  call: ToolCall
): Promise<{ ok: boolean; output: string; artifact?: string }> {
  if (call.name === 'list_specialists') {
    if (!allowed.includes('list_specialists')) {
      return { ok: false, output: 'tool not permitted' };
    }
    return { ok: true, output: JSON.stringify(listSpecialists(), null, 2) };
  }
  if (call.name === 'dispatch_agent') {
    if (!allowed.includes('dispatch_agent')) {
      return { ok: false, output: 'tool not permitted' };
    }
    const agentId = String(call.arguments.agent_id || '');
    const subtask = String(call.arguments.subtask || '');
    const target = getAgent(agentId);
    if (!target) return { ok: false, output: `unknown agent ${agentId}` };
    const assignment = { agent_id: agentId, subtask, at: Date.now() };
    appendEvent(taskId, 'dispatch', assignment);
    const rel = `artifacts/dispatch-${agentId}.json`;
    fs.mkdirSync(path.join(workspaceRoot, 'artifacts'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, rel), JSON.stringify(assignment, null, 2));
    return { ok: true, output: JSON.stringify(assignment), artifact: rel };
  }
  return runWorkspaceTool(allowed, workspaceRoot, call);
}
