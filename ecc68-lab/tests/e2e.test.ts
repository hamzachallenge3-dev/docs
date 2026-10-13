import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTempLabEnv, seedWorkspace, waitForTask } from './helpers.js';
import { modelStatus } from '../src/model/client.js';

describe('end-to-end + readiness classes', () => {
  beforeEach(() => {
    makeTempLabEnv();
  });

  afterEach(async () => {
    const { stopQueue } = await import('../src/runtime/queue.js');
    const { closeDb } = await import('../src/storage/db.js');
    stopQueue();
    closeDb();
  });

  it('profile-load PASS already covered by registry; mocked orchestration PASS here', async () => {
    const env = makeTempLabEnv();
    const { startQueue, enqueueAgentTask } = await import('../src/runtime/queue.js');
    const { getTask } = await import('../src/storage/db.js');
    startQueue();
    seedWorkspace(env.workspacesDir, 'e2e-ws', {
      'app.py': 'print("hello")\n',
    });
    const { task_id } = enqueueAgentTask({
      agent_id: 'ecc-code-simplifier',
      task: 'Simplify app.py and write a findings artifact',
      workspace_id: 'e2e-ws',
      idempotency_key: 'e2e-1',
    });
    await waitForTask(() => getTask(task_id)!);
    const task = getTask(task_id)!;
    expect(task.status).toBe('completed');
    const toolLog = JSON.parse(task.tool_log || '[]') as unknown[];
    expect(toolLog.length).toBeGreaterThan(0);
    const artifacts = JSON.parse(task.artifacts || '[]') as string[];
    expect(artifacts.length).toBeGreaterThan(0);
    const artifactPath = path.join(env.workspacesDir, 'e2e-ws', artifacts[0]!);
    expect(fs.existsSync(artifactPath)).toBe(true);
  });

  it('live model PASS is BLOCKED when ECC68_MODEL_URL unset', () => {
    delete process.env.ECC68_MODEL_URL;
    const status = modelStatus();
    expect(status.readiness).toBe('blocked');
    expect(status.configured).toBe(false);
  });

  it('specialist-tool PASS: chief produces routing artifact and dispatch evidence', async () => {
    const env = makeTempLabEnv();
    const { startQueue, enqueueAgentTask } = await import('../src/runtime/queue.js');
    const { getTask, listEvents } = await import('../src/storage/db.js');
    startQueue();
    seedWorkspace(env.workspacesDir, 'chief-ws', {
      'login.py': 'def login(u):\n  return f"SELECT {u}"\n',
    });
    const { task_id } = enqueueAgentTask({
      agent_id: 'ecc-chief-of-staff',
      task: 'Security review of login.py for SQL injection — differentiate and assign',
      workspace_id: 'chief-ws',
      idempotency_key: 'chief-e2e',
    });
    await waitForTask(() => getTask(task_id)!);
    const task = getTask(task_id)!;
    expect(task.status).toBe('completed');
    const plan = path.join(env.workspacesDir, 'chief-ws', 'artifacts', 'chief-routing-plan.json');
    expect(fs.existsSync(plan)).toBe(true);
    const planJson = JSON.parse(fs.readFileSync(plan, 'utf8'));
    expect(planJson.primary).toBe('ecc-security-reviewer');
    const events = listEvents(task_id);
    expect(events.some((e) => e.kind === 'routing')).toBe(true);
  });
});
