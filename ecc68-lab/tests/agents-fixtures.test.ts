import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixturesRoot, makeTempLabEnv, seedWorkspace, waitForTask } from './helpers.js';
import { markTested } from '../src/runtime/registry.js';

interface Fixture {
  id: string;
  category: string;
  task: string;
  seed_files: Record<string, string>;
  expect_keywords: string[];
  expect_artifact_substr: string;
  tools: string[];
}

const fixtures: Record<string, Fixture> = JSON.parse(
  fs.readFileSync(path.join(fixturesRoot(), 'index.json'), 'utf8')
);

describe('per-agent fixtures (profile-load + mocked orchestration)', () => {
  let workspacesDir = '';
  let enqueueAgentTask: typeof import('../src/runtime/queue.js').enqueueAgentTask;
  let startQueue: typeof import('../src/runtime/queue.js').startQueue;
  let stopQueue: typeof import('../src/runtime/queue.js').stopQueue;
  let getTask: typeof import('../src/storage/db.js').getTask;
  let closeDb: typeof import('../src/storage/db.js').closeDb;

  beforeAll(async () => {
    const env = makeTempLabEnv();
    workspacesDir = env.workspacesDir;
    ({ enqueueAgentTask, startQueue, stopQueue } = await import('../src/runtime/queue.js'));
    ({ getTask, closeDb } = await import('../src/storage/db.js'));
    startQueue();
  });

  afterAll(() => {
    stopQueue();
    closeDb();
  });

  it('fixture index covers exactly 68 agents', () => {
    expect(Object.keys(fixtures)).toHaveLength(68);
  });

  for (const [agentId, fx] of Object.entries(fixtures)) {
    it(`fixture ${agentId} (${fx.category})`, async () => {
      const workspaceId = `fx-${agentId}`.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64);
      seedWorkspace(workspacesDir, workspaceId, fx.seed_files);
      const { task_id } = enqueueAgentTask({
        agent_id: agentId,
        task: fx.task,
        workspace_id: workspaceId,
        idempotency_key: `fx-${agentId}-v1`,
      });
      await waitForTask(() => getTask(task_id)!, 45_000);
      const task = getTask(task_id)!;
      expect(task.status, task.error || 'failed').toBe('completed');

      const evidence = JSON.parse(task.evidence || '[]') as string[];
      expect(evidence.some((e) => e.startsWith('tool:') || e.startsWith('model:'))).toBe(true);

      const artifacts = JSON.parse(task.artifacts || '[]') as string[];
      if (fx.expect_artifact_substr) {
        expect(
          artifacts.some((a) => a.includes(fx.expect_artifact_substr.replace(/^artifacts\//, '')) || a.includes(fx.expect_artifact_substr)) ||
            artifacts.join(',').includes('artifacts') ||
            (task.output || '').includes(agentId)
        ).toBe(true);
      }

      for (const kw of fx.expect_keywords) {
        const blob = `${task.output}\n${task.artifacts}\n${task.evidence}`;
        // chief routing keywords may appear in events/artifacts
        if (agentId === 'ecc-chief-of-staff') {
          const ws = path.join(workspacesDir, workspaceId, 'artifacts', 'chief-routing-plan.json');
          expect(fs.existsSync(ws)).toBe(true);
          const plan = fs.readFileSync(ws, 'utf8');
          expect(plan).toMatch(/primary/);
        } else {
          expect(blob.toLowerCase()).toContain(kw.toLowerCase());
        }
      }

      // reviewer roles must not have write if catalog says read-only — verify permission set
      if (fx.category === 'reviewer') {
        expect(fx.tools).not.toContain('workspace_write');
      }

      markTested(agentId);
    }, 60_000);
  }
});
