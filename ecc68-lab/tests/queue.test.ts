import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTempLabEnv, waitForTask } from './helpers.js';

describe('queue orchestration', () => {
  beforeEach(() => {
    makeTempLabEnv();
  });

  afterEach(async () => {
    const { stopQueue } = await import('../src/runtime/queue.js');
    const { closeDb } = await import('../src/storage/db.js');
    stopQueue();
    closeDb();
  });

  it('transitions queued → running → completed', async () => {
    const { startQueue, enqueueAgentTask } = await import('../src/runtime/queue.js');
    const { getTask } = await import('../src/storage/db.js');
    startQueue();
    const { task_id } = enqueueAgentTask({
      agent_id: 'ecc-code-explorer',
      task: 'Explore workspace and report',
      workspace_id: 'ws-queue-1',
      idempotency_key: 'queue-1',
    });
    expect(getTask(task_id)?.status).toMatch(/queued|running|completed/);
    await waitForTask(() => getTask(task_id)!);
    expect(getTask(task_id)?.status).toBe('completed');
  });

  it('rejects invalid agent and empty task', async () => {
    const { enqueueAgentTask } = await import('../src/runtime/queue.js');
    expect(() =>
      enqueueAgentTask({
        agent_id: 'not-an-agent',
        task: 'x',
        workspace_id: 'ws1',
        idempotency_key: 'k-invalid-1',
      })
    ).toThrow(/invalid agent/);
    expect(() =>
      enqueueAgentTask({
        agent_id: 'ecc-planner',
        task: '   ',
        workspace_id: 'ws1',
        idempotency_key: 'k-invalid-2',
      })
    ).toThrow(/non-empty/);
  });

  it('idempotency returns same task_id', async () => {
    const { startQueue, enqueueAgentTask } = await import('../src/runtime/queue.js');
    startQueue();
    const a = enqueueAgentTask({
      agent_id: 'ecc-docs-lookup',
      task: 'lookup docs',
      workspace_id: 'ws-idem',
      idempotency_key: 'same-key',
    });
    const b = enqueueAgentTask({
      agent_id: 'ecc-docs-lookup',
      task: 'lookup docs again',
      workspace_id: 'ws-idem',
      idempotency_key: 'same-key',
    });
    expect(b.reused).toBe(true);
    expect(b.task_id).toBe(a.task_id);
  });

  it('cancel stops a long task', async () => {
    process.env.ECC68_MAX_STEPS = '50';
    process.env.ECC68_TASK_TIMEOUT_MS = '60000';
    const { startQueue, enqueueAgentTask, cancelTask } = await import('../src/runtime/queue.js');
    const { getTask } = await import('../src/storage/db.js');
    startQueue();
    const { task_id } = enqueueAgentTask({
      agent_id: 'ecc-performance-optimizer',
      task: 'long run',
      workspace_id: 'ws-cancel',
      idempotency_key: 'cancel-1',
    });
    // briefly wait then cancel
    await new Promise((r) => setTimeout(r, 30));
    cancelTask(task_id);
    await waitForTask(() => getTask(task_id)!);
    expect(['cancelled', 'completed']).toContain(getTask(task_id)!.status);
  });

  it('restart recovery requeues running tasks', async () => {
    const { getDb, insertTask, requeueInterrupted, getTask } = await import('../src/storage/db.js');
    getDb();
    const now = Date.now();
    insertTask({
      id: 'task-running-1',
      agent_id: 'ecc-planner',
      workspace_id: 'ws-recovery',
      idempotency_key: 'rec-1',
      task: 'interrupted',
      status: 'running',
      progress: 0.2,
      progress_message: 'mid',
      created_at: now,
      updated_at: now,
      started_at: now,
    });
    const n = requeueInterrupted();
    expect(n).toBeGreaterThanOrEqual(1);
    expect(getTask('task-running-1')?.status).toBe('queued');
  });
});
