import fs from 'node:fs';
import { config } from '../config.js';
import { callModel, type ModelMessage } from '../model/client.js';
import { buildBossDirectory, planWithBoss } from './boss.js';
import { getAgent, loadRoleInstructions } from './registry.js';
import { appendEvent, getTask, updateTask } from '../storage/db.js';
import { ensureWorkspace, resolveSafePath } from '../security/workspace.js';
import { runTool } from '../tools/runner.js';
import { redactSecrets } from '../security/redact.js';

export async function executeTask(taskId: string, signal: AbortSignal): Promise<void> {
  const task = getTask(taskId);
  if (!task) throw new Error(`missing task ${taskId}`);
  if (task.status === 'cancelled') return;

  const agent = getAgent(task.agent_id);
  if (!agent) {
    updateTask(taskId, { status: 'failed', error: `unknown agent ${task.agent_id}`, finished_at: Date.now(), progress: 1 });
    return;
  }

  const workspaceRoot = ensureWorkspace(task.workspace_id);
  const role = loadRoleInstructions(agent.id);
  const toolLog: unknown[] = [];
  const artifacts: string[] = [];
  const evidence: string[] = [];
  const messages: ModelMessage[] = [];

  let effectiveTask = task.task;
  let bossDirectory = '';
  if (agent.id === 'hub-boss' || agent.id === 'ecc-chief-of-staff') {
    const plan = planWithBoss(task.task);
    bossDirectory = buildBossDirectory();
    fs.mkdirSync(resolveSafePath(workspaceRoot, 'artifacts'), { recursive: true });
    const rel = 'artifacts/hub-routing-plan.json';
    fs.writeFileSync(resolveSafePath(workspaceRoot, rel), redactSecrets(plan));
    const rosterRel = 'artifacts/hub-full-roster.md';
    fs.writeFileSync(resolveSafePath(workspaceRoot, rosterRel), bossDirectory);
    artifacts.push(rel, rosterRel);
    evidence.push(
      `boss routed primary=${plan.primary} pack=${plan.pack} roster_size=${plan.roster_size}`
    );
    appendEvent(taskId, 'routing', plan);
    effectiveTask = [
      'You are the Hamza Agent Hub boss with FULL knowledge of every agent.',
      `Roster size: ${plan.roster_size}. Known packs: ${plan.known_packs.join(', ')}.`,
      `Routing plan (scored against the full roster):\n${redactSecrets(plan)}`,
      `Original task:\n${task.task}`,
      'Dispatch specialists using only IDs from the roster. Write an assignment brief.',
    ].join('\n\n');
  }

  const system = [
    `You are Hamza Agent Hub agent ${agent.id} (pack=${agent.pack}, category=${agent.category}).`,
    'Use only permitted tools. Stay inside the workspace. No paid calls, no unauthorized outbound messages.',
    'Do not modify production Hamza Agent Hub or production GLM/Headroom configs — this is the lab plugin.',
    '--- ROLE ---',
    role.slice(0, 16_000),
    agent.id === 'hub-boss' ? `--- FULL ROSTER (you know them all) ---\n${bossDirectory.slice(0, 40_000)}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  messages.push({ role: 'user', content: redactSecrets(effectiveTask) });
  let finalContent = '';
  let finished = false;

  for (let step = 0; step < config.maxSteps; step++) {
    signal.throwIfAborted();
    if (getTask(taskId)?.status === 'cancelled') return;

    updateTask(taskId, { progress: (step + 1) / (config.maxSteps + 1), progress_message: `step ${step + 1}` });
    const response = await callModel({
      system,
      messages,
      tools: agent.tools,
      agentId: agent.id,
      signal,
    });
    signal.throwIfAborted();
    evidence.push(`model:${response.provider}:step${step}`);
    appendEvent(taskId, 'model_response', {
      provider: response.provider,
      tools: response.tool_calls.map((t) => t.name),
    });

    if (!response.tool_calls.length) {
      finished = true;
      finalContent = response.content || finalContent;
      break;
    }

    messages.push({ role: 'assistant', content: response.content || '', tool_calls:response.tool_calls.map(tc=>({id:tc.id,type:'function',function:{name:tc.name,arguments:JSON.stringify(tc.arguments)}})) });
    for (const tc of response.tool_calls) {
      signal.throwIfAborted();
      const result = await runTool(agent.tools, workspaceRoot, {
        name: tc.name,
        arguments: tc.arguments,
      }, signal, {taskId,workspaceId:task.workspace_id});
      toolLog.push({ tool: tc.name, ok: result.ok, output: result.output.slice(0, 1500) });
      if (result.artifact) artifacts.push(result.artifact);
      evidence.push(`tool:${tc.name}:${result.ok ? 'ok' : 'fail'}`);
      messages.push({ role: 'tool', name: tc.name, tool_call_id:tc.id, content: redactSecrets(result.output).slice(0, 8000) });
    }
  }

  if (getTask(taskId)?.status === 'cancelled') return;
  signal.throwIfAborted();
  if (!finished) throw new Error('step budget exhausted / تجاوز حد خطوات المهمة');
  if (!finalContent) {
    finalContent = JSON.stringify({ agent_id: agent.id, pack: agent.pack, artifacts }, null, 2);
  }

  updateTask(taskId, {
    status: 'completed',
    output: redactSecrets(finalContent),
    progress: 1,
    progress_message: 'completed',
    finished_at: Date.now(),
    tool_log: redactSecrets(toolLog),
    artifacts: JSON.stringify([...new Set(artifacts)]),
    evidence: JSON.stringify(evidence),
  });
  appendEvent(taskId, 'completed', { artifacts });
}
