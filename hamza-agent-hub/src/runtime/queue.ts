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
  taskQueueSummary,
  getDb,
  type TaskRow,
} from '../storage/db.js';
import { getAgent } from './registry.js';
import { ensureWorkspace } from '../security/workspace.js';
import { redactSecrets } from '../security/redact.js';
import { executeTask } from './executor.js';

const abortControllers = new Map<string, AbortController>();
const active = new Set<Promise<void>>();
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

export async function stopQueue(): Promise<void> {
  if (pumpTimer) clearInterval(pumpTimer);
  pumpTimer = null;
  started = false;
  for (const ac of abortControllers.values()) ac.abort();
  await Promise.allSettled([...active]);
}

export function enqueueAgentTask(input: {
  agent_id: string;
  task: string;
  workspace_id: string;
  idempotency_key: string;
}): { task_id: string; reused: boolean; task: TaskRow } {
  const agent = getAgent(input.agent_id);
  if (!agent) throw new Error(`invalid agent_id: ${input.agent_id}`);
  if (input.task.length > 100_000) throw new Error('task too large / المهمة طويلة جداً');
  if (!input.task?.trim()) throw new Error('task must be a non-empty string');
  if (!input.idempotency_key || input.idempotency_key.length < 4) {
    throw new Error('idempotency_key must be at least 4 characters');
  }
  ensureWorkspace(input.workspace_id);
  const existing = findByIdempotency(input.agent_id, input.workspace_id, input.idempotency_key);
  if (existing) {
    if (existing.task !== input.task) throw new Error('idempotency key already used for another task');
    return { task_id: existing.id, reused: true, task: existing };
  }

  const pending = getDb().prepare("SELECT count(*) AS count FROM tasks WHERE status IN ('queued','running')").get() as {count:number};
  if (pending.count >= config.maxPending) throw new Error('queue full / قائمة الانتظار ممتلئة');
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
  if (['completed', 'failed', 'cancelled', 'dead_letter'].includes(task.status)) return task;
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
  while (started && running < config.concurrency) {
    const next = claimNextQueued();
    if (!next) return;
    running += 1;
    const ac = new AbortController();
    abortControllers.set(next.id, ac);
    const timeout = setTimeout(() => ac.abort(new Error('task timeout')), config.taskTimeoutMs);
    const job = executeTask(next.id, ac.signal)
      .catch((err) => {
        if (getTask(next.id)?.status === 'cancelled') return;
        const retry = (!ac.signal.aborted || !started) && (next.attempts ?? 0) < config.maxAttempts;
        updateTask(next.id, {
          status: retry ? 'queued' : 'dead_letter',
          error: redactSecrets(err instanceof Error ? err.message : String(err)),
          progress_message: retry ? 'retry scheduled' : 'dead letter: attempts exhausted or timeout',
          available_at: Date.now() + Math.min(30_000, 500 * 2 ** (next.attempts ?? 1)),
          finished_at: retry ? null : Date.now(),
          progress: retry ? 0 : 1,
        });
        appendEvent(next.id, retry ? 'retry' : 'dead_letter', { attempts: next.attempts });
      })
      .finally(() => {
        clearTimeout(timeout);
        abortControllers.delete(next.id);
        running -= 1;
        active.delete(job);
        void pump();
      });
    active.add(job);
  }
}

export function queueStats() {
  return { running, concurrency: config.concurrency, max_attempts: config.maxAttempts, statuses: taskQueueSummary() };
}
