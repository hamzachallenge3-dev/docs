import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import {
  appendEvent,
  claimNextQueued,
  findByIdempotency,
  getTask,
  insertTask,
  requeueInterrupted,
  updateTask,
  type TaskRow,
} from '../storage/db.js';
import { getAgent } from './registry.js';
import { ensureWorkspace } from '../security/workspace.js';
import { executeTask } from './executor.js';

const abortControllers = new Map<string, AbortController>();
let running = 0;
let pumpTimer: NodeJS.Timeout | null = null;
let started = false;

export function startQueue(): void {
  if (started) return;
  started = true;
  requeueInterrupted();
  pumpTimer = setInterval(() => void pump(), 200);
  void pump();
}

export function stopQueue(): void {
  if (pumpTimer) clearInterval(pumpTimer);
  pumpTimer = null;
  started = false;
  for (const [, ac] of abortControllers) ac.abort();
  abortControllers.clear();
}

export function enqueueAgentTask(input: {
  agent_id: string;
  task: string;
  workspace_id: string;
  idempotency_key: string;
}): { task_id: string; reused: boolean; task: TaskRow } {
  const agent = getAgent(input.agent_id);
  if (!agent) throw new Error(`invalid agent_id: ${input.agent_id}`);
  if (!input.task?.trim()) throw new Error('task must be a non-empty string');
  if (!input.idempotency_key || input.idempotency_key.length < 4) {
    throw new Error('idempotency_key must be at least 4 characters');
  }
  ensureWorkspace(input.workspace_id);
  const existing = findByIdempotency(input.agent_id, input.workspace_id, input.idempotency_key);
  if (existing) return { task_id: existing.id, reused: true, task: existing };

  const id = randomUUID();
  const now = Date.now();
  const task = insertTask({
    id,
    agent_id: input.agent_id,
    workspace_id: input.workspace_id,
    idempotency_key: input.idempotency_key,
    task: input.task,
    status: 'queued',
    progress: 0,
    progress_message: 'queued',
    output: null,
    error: null,
    evidence: null,
    tool_log: null,
    artifacts: null,
    created_at: now,
    updated_at: now,
    started_at: null,
    finished_at: null,
  });
  appendEvent(id, 'queued', { agent_id: input.agent_id, pack: agent.pack });
  void pump();
  return { task_id: id, reused: false, task };
}

export function cancelTask(taskId: string): TaskRow {
  const task = getTask(taskId);
  if (!task) throw new Error(`task not found: ${taskId}`);
  if (['completed', 'failed', 'cancelled'].includes(task.status)) return task;
  abortControllers.get(taskId)?.abort();
  const updated = updateTask(taskId, {
    status: 'cancelled',
    progress_message: 'cancelled',
    finished_at: Date.now(),
  });
  appendEvent(taskId, 'cancel_requested', {});
  return updated;
}

async function pump(): Promise<void> {
  while (running < config.concurrency) {
    const next = claimNextQueued();
    if (!next) return;
    running += 1;
    const ac = new AbortController();
    abortControllers.set(next.id, ac);
    void executeTask(next.id, ac.signal)
      .catch((err) => {
        updateTask(next.id, {
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
          finished_at: Date.now(),
          progress: 1,
        });
      })
      .finally(() => {
        abortControllers.delete(next.id);
        running -= 1;
        void pump();
      });
  }
}

export function queueStats() {
  return { running, concurrency: config.concurrency };
}
